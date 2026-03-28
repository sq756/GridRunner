package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"sync"
	"syscall"
	"time"
	stdnet "net"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
)

type Stats struct {
	CPUUsage  float64       `json:"cpu_usage"`
	MemTotal  uint64        `json:"mem_total"`
	MemUsed   uint64        `json:"mem_used"`
	DiskTotal uint64        `json:"disk_total"`
	DiskUsed  uint64        `json:"disk_used"`
	NetSent   uint64        `json:"net_sent"`
	NetRecv   uint64        `json:"net_recv"`
	Processes []ProcessInfo `json:"processes"`
	Uptime    uint64        `json:"uptime"`
	Timestamp int64         `json:"timestamp"`
	GPUInfo   string        `json:"gpu_info"`
	IP        string        `json:"ip"`
}

type ProcessInfo struct {
	PID      int32   `json:"pid"`
	Name     string  `json:"name"`
	CPUUsage float64 `json:"cpu_usage"`
	MemUsage float32 `json:"mem_usage"`
	Status   string  `json:"status"`
}

type ManagedTask struct {
	ID        string    `json:"id"`
	Command   string    `json:"command"`
	Args      []string  `json:"args"`
	PID       int       `json:"pid"`
	Status    string    `json:"status"` // "running", "stopped", "failed"
	StartTime time.Time `json:"start_time"`
	LogPath   string    `json:"log_path"`
	cmd       *exec.Cmd
}

var (
	port      = flag.Int("port", 34567, "Agent listen port")
	token     = flag.String("token", "", "Security token for authentication")
	tasks     = make(map[string]*ManagedTask)
	tasksMu   sync.RWMutex
	logDir    string
	stateFile string
)

func init() {
	home, _ := os.UserHomeDir()
	terDir := filepath.Join(home, ".ter")
	logDir = filepath.Join(terDir, "logs")
	stateFile = filepath.Join(terDir, "tasks_state.json")
	_ = os.MkdirAll(logDir, 0755)
}

func saveState() {
	tasksMu.RLock()
	defer tasksMu.RUnlock()
	data, _ := json.Marshal(tasks)
	os.WriteFile(stateFile, data, 0644)
}

func loadState() {
	data, err := os.ReadFile(stateFile)
	if err != nil {
		return
	}
	tasksMu.Lock()
	defer tasksMu.Unlock()
	json.Unmarshal(data, &tasks)

	// Re-verify process health
	for _, t := range tasks {
		if t.Status == "running" {
			p, err := os.FindProcess(t.PID)
			// Signal 0 is used to check if process exists
			if err != nil || p.Signal(syscall.Signal(0)) != nil {
				t.Status = "stopped"
			}
		}
	}
}

func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Ter-Token")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		if *token != "" {
			clientToken := r.Header.Get("X-Ter-Token")
			if clientToken != *token {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
		}
		next(w, r)
	}
}

func getGPUInfo() string {
	out, err := exec.Command("nvidia-smi", "--query-gpu=name,memory.used,memory.total", "--format=csv,noheader,nounits").Output()
	if err != nil {
		return "N/A"
	}
	return string(out)
}

func getLocalIP() string {
	ifaces, err := stdnet.Interfaces()
	if err != nil {
		return "127.0.0.1"
	}
	for _, i := range ifaces {
		addrs, err := i.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip stdnet.IP
			switch v := addr.(type) {
			case *stdnet.IPNet:
				ip = v.IP
			case *stdnet.IPAddr:
				ip = v.IP
			}
			if ip != nil && !ip.IsLoopback() {
				if ip.To4() != nil {
					return ip.String()
				}
			}
		}
	}
	return "127.0.0.1"
}

func getStats() (*Stats, error) {
	cpuPercent, err := cpu.Percent(0, false)
	if err != nil {
		return nil, err
	}
	vm, err := mem.VirtualMemory()
	if err != nil {
		return nil, err
	}
	d, err := disk.Usage("/")
	if err != nil {
		d = &disk.UsageStat{}
	}
	netIO, err := net.IOCounters(false)
	var sent, recv uint64
	if err == nil && len(netIO) > 0 {
		sent = netIO[0].BytesSent
		recv = netIO[0].BytesRecv
	}
	
	// Uptime
	hostInfo, _ := os.Open("/proc/uptime")
	var uptime float64
	if hostInfo != nil {
		fmt.Fscanf(hostInfo, "%f", &uptime)
		hostInfo.Close()
	}

	procs, err := process.Processes()
	if err != nil {
		return nil, err
	}
	var procInfos []ProcessInfo
	for _, p := range procs {
		name, _ := p.Name()
		cpuP, _ := p.CPUPercent()
		memP, _ := p.MemoryPercent()
		status, _ := p.Status()
		st := "R"
		if len(status) > 0 {
			st = status[0]
		}
		procInfos = append(procInfos, ProcessInfo{
			PID:      p.Pid,
			Name:     name,
			CPUUsage: cpuP,
			MemUsage: memP,
			Status:   st,
		})
	}
	sort.Slice(procInfos, func(i, j int) bool {
		return procInfos[i].CPUUsage > procInfos[j].CPUUsage
	})
	if len(procInfos) > 10 {
		procInfos = procInfos[:10]
	}
	return &Stats{
		CPUUsage:  cpuPercent[0],
		MemTotal:  vm.Total,
		MemUsed:   vm.Used,
		DiskTotal: d.Total,
		DiskUsed:  d.Used,
		NetSent:   sent,
		NetRecv:   recv,
		Processes: procInfos,
		Uptime:    uint64(uptime),
		Timestamp: time.Now().Unix(),
		GPUInfo:   getGPUInfo(),
		IP:        getLocalIP(),
	}, nil
}

func statsHandler(w http.ResponseWriter, r *http.Request) {
	stats, err := getStats()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func killHandler(w http.ResponseWriter, r *http.Request) {
	pidStr := r.URL.Query().Get("pid")
	pid, _ := strconv.Atoi(pidStr)
	p, err := process.NewProcess(int32(pid))
	if err != nil {
		http.Error(w, "Process not found", http.StatusNotFound)
		return
	}
	if err := p.Kill(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	fmt.Fprintf(w, "Process %d killed", pid)
}

func startTaskHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID      string   `json:"id"`
		Command string   `json:"command"`
		Args    []string `json:"args"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	tasksMu.Lock()
	defer tasksMu.Unlock()
	if _, exists := tasks[req.ID]; exists {
		http.Error(w, "Task ID already exists", http.StatusConflict)
		return
	}
	logFile := filepath.Join(logDir, req.ID+".log")
	f, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		http.Error(w, "Failed to create log file", http.StatusInternalServerError)
		return
	}
	cmd := exec.Command(req.Command, req.Args...)
	cmd.Stdout = f
	cmd.Stderr = f
	if err := cmd.Start(); err != nil {
		f.Close()
		http.Error(w, "Failed to start command: "+err.Error(), http.StatusInternalServerError)
		return
	}
	task := &ManagedTask{
		ID:        req.ID,
		Command:   req.Command,
		Args:      req.Args,
		PID:       cmd.Process.Pid,
		Status:    "running",
		StartTime: time.Now(),
		LogPath:   logFile,
		cmd:       cmd,
	}
	tasks[req.ID] = task
	saveState() // Save state immediately

	go func() {
		err := cmd.Wait()
		f.Close()
		tasksMu.Lock()
		defer tasksMu.Unlock()
		if err != nil {
			task.Status = "failed"
		} else {
			task.Status = "stopped"
		}
		saveState() // Save state on completion
	}()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(task)
}

func listTasksHandler(w http.ResponseWriter, r *http.Request) {
	tasksMu.RLock()
	defer tasksMu.RUnlock()
	var list []*ManagedTask
	for _, t := range tasks {
		list = append(list, t)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

func stopTaskHandler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	tasksMu.Lock()
	task, exists := tasks[id]
	tasksMu.Unlock()
	if !exists {
		http.Error(w, "Task not found", http.StatusNotFound)
		return
	}
	if task.cmd != nil && task.cmd.Process != nil {
		task.cmd.Process.Kill()
	}
	fmt.Fprintf(w, "Task %s stopped", id)
	saveState()
}

func taskLogsHandler(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	tasksMu.RLock()
	task, exists := tasks[id]
	tasksMu.RUnlock()
	if !exists {
		http.Error(w, "Task not found", http.StatusNotFound)
		return
	}
	f, err := os.Open(task.LogPath)
	if err != nil {
		http.Error(w, "Failed to open log file", http.StatusInternalServerError)
		return
	}
	defer f.Close()
	lines := make([]string, 0, 1000)
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
		if len(lines) > 1000 {
			lines = lines[1:]
		}
	}
	for _, line := range lines {
		fmt.Fprintln(w, line)
	}
}

func guiStatusHandler(w http.ResponseWriter, r *http.Request) {
	_, err := exec.LookPath("vncserver")
	installed := err == nil
	_, err = os.Stat(filepath.Join(os.TempDir(), ".X11-unix/X1"))
	running := err == nil
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{
		"installed": installed,
		"running":   running,
	})
}

func guiInitHandler(w http.ResponseWriter, r *http.Request) {
	exec.Command("sh", "-c", "sudo apt-get update && sudo apt-get install -y tigervnc-standalone-server fluxbox xterm").Run()
	exec.Command("sh", "-c", "vncserver :1 -localhost yes -SecurityTypes None").Run()
	go exec.Command("sh", "-c", "DISPLAY=:1 fluxbox").Start()
	fmt.Fprintf(w, "GUI initialized")
}

func main() {
	flag.Parse()
	if *token == "" {
		*token = os.Getenv("TER_AGENT_TOKEN")
	}

	loadState() // Load saved tasks on startup

	http.HandleFunc("/stats", authMiddleware(statsHandler))
	http.HandleFunc("/proc/kill", authMiddleware(killHandler))
	http.HandleFunc("/task/start", authMiddleware(startTaskHandler))
	http.HandleFunc("/task/list", authMiddleware(listTasksHandler))
	http.HandleFunc("/task/stop", authMiddleware(stopTaskHandler))
	http.HandleFunc("/task/logs", authMiddleware(taskLogsHandler))
	http.HandleFunc("/gui/status", authMiddleware(guiStatusHandler))
	http.HandleFunc("/gui/init", authMiddleware(guiInitHandler))

	addr := fmt.Sprintf("0.0.0.0:%d", *port)
	fmt.Printf("Ter Agent starting on %s (Auth: %v)\n", addr, *token != "")
	server := &http.Server{
		Addr:         addr,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}
	log.Fatal(server.ListenAndServe())
}
