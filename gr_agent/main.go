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

	"github.com/gorilla/websocket"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
)

// ... (Previous Stats/ProcessInfo structs remain same)
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
	Status    string    `json:"status"`
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
	upgrader  = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
)

func init() {
	home, _ := os.UserHomeDir()
	terDir := filepath.Join(home, ".gridrunner")
	logDir = filepath.Join(terDir, "logs")
	stateFile = filepath.Join(terDir, "tasks_state.json")
	_ = os.MkdirAll(logDir, 0755)
}

// ... (saveState, loadState, authMiddleware remain same)
func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Ter-Token")
		if r.Method == "OPTIONS" { w.WriteHeader(http.StatusOK); return }
		if *token != "" {
			clientToken := r.Header.Get("X-Ter-Token")
			if clientToken == "" { clientToken = r.URL.Query().Get("token") }
			if clientToken != *token { http.Error(w, "Unauthorized", http.StatusUnauthorized); return }
		}
		next(w, r)
	}
}

// v2.18.0: WebSocket PTY Handler
func wsPtyHandler(w http.ResponseWriter, r *http.Request) {
	tabID := r.URL.Query().Get("tab_id")
	if tabID == "" { http.Error(w, "Missing tab_id", 400); return }

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil { log.Printf("WS Upgrade Fail: %v", err); return }
	defer conn.Close()

	// Launch tmux attach or new session
	// Using "script" command to wrap tmux can sometimes help with PTY allocation if needed
	cmd := exec.Command("tmux", "new-session", "-A", "-s", tabID, "-F", "status off")
	
	// Create PTY
	// Note: For simplicity, we'll use os/exec piped mode. 
	// For production, "github.com/creack/pty" is highly recommended.
	stdin, _ := cmd.StdinPipe()
	stdout, _ := cmd.StdoutPipe()
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte("\r\n[AGENT_ERROR] Failed to start tmux session\r\n"))
		return
	}

	// Output Relay (Tmux -> WebSocket)
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			if err := conn.WriteMessage(websocket.BinaryMessage, append(scanner.Bytes(), '\n')); err != nil {
				break
			}
		}
		cmd.Process.Kill()
	}()

	// Input Relay (WebSocket -> Tmux)
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil { break }
		stdin.Write(msg)
	}
	cmd.Wait()
}

// ... (statsHandler, getStats, getLocalIP, getGPUInfo, etc. remain same)
func statsHandler(w http.ResponseWriter, r *http.Request) {
	stats, err := getStats()
	if err != nil { http.Error(w, err.Error(), http.StatusInternalServerError); return }
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func getStats() (*Stats, error) {
	cpuPercent, _ := cpu.Percent(0, false)
	vm, _ := mem.VirtualMemory()
	d, _ := disk.Usage("/")
	netIO, _ := net.IOCounters(false)
	var sent, recv uint64
	if len(netIO) > 0 { sent = netIO[0].BytesSent; recv = netIO[0].BytesRecv }
	hostInfo, _ := os.Open("/proc/uptime")
	var uptime float64
	if hostInfo != nil { fmt.Fscanf(hostInfo, "%f", &uptime); hostInfo.Close() }
	procs, _ := process.Processes()
	var procInfos []ProcessInfo
	for _, p := range procs {
		name, _ := p.Name(); cpuP, _ := p.CPUPercent(); memP, _ := p.MemoryPercent(); status, _ := p.Status()
		st := "R"; if len(status) > 0 { st = status[0] }
		procInfos = append(procInfos, ProcessInfo{PID: p.Pid, Name: name, CPUUsage: cpuP, MemUsage: memP, Status: st})
	}
	sort.Slice(procInfos, func(i, j int) bool { return procInfos[i].CPUUsage > procInfos[j].CPUUsage })
	if len(procInfos) > 10 { procInfos = procInfos[:10] }
	return &Stats{
		CPUUsage: cpuPercent[0], MemTotal: vm.Total, MemUsed: vm.Used, DiskTotal: d.Total, DiskUsed: d.Used,
		NetSent: sent, NetRecv: recv, Processes: procInfos, Uptime: uint64(uptime), Timestamp: time.Now().Unix(),
		GPUInfo: "N/A", IP: "127.0.0.1",
	}, nil
}

func main() {
	flag.Parse()
	if *token == "" { *token = os.Getenv("GR_AGENT_TOKEN") }

	http.HandleFunc("/stats", authMiddleware(statsHandler))
	http.HandleFunc("/ws/pty", authMiddleware(wsPtyHandler))
	// ... (other handlers can be added back if needed)

	addr := fmt.Sprintf("0.0.0.0:%d", *port)
	fmt.Printf("GridRunner Agent starting on %s\n", addr)
	server := &http.Server{ Addr: addr, ReadTimeout: 30 * time.Second, WriteTimeout: 30 * time.Second }
	log.Fatal(server.ListenAndServe())
}
