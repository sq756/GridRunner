package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"flag"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"sync"
	"time"
	stdnet "net"

	"github.com/gorilla/websocket"
	"github.com/quic-go/quic-go"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
)

// --- Types & Globals ---
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

var (
	port     = flag.Int("port", 34567, "Agent listen port (HTTP/WS)")
	quicPort = flag.Int("quic-port", 34568, "Agent QUIC listen port (UDP)")
	token    = flag.String("token", "", "Security token for authentication")
	upgrader = websocket.Upgrader{ CheckOrigin: func(r *http.Request) bool { return true } }
)

// --- QUIC Certificate Generator ---
func generateSelfSignedCert() tls.Certificate {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	template := x509.Certificate{
		SerialNumber: big.NewInt(1),
		NotBefore:    time.Now(),
		NotAfter:     time.Now().Add(time.Hour * 24 * 365),
		KeyUsage:     x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	certBytes, _ := x509.CreateCertificate(rand.Reader, &template, &template, &key.PublicKey, key)
	return tls.Certificate{
		Certificate: [][]byte{certBytes},
		PrivateKey:  key,
	}
}

// --- WebSocket PTY Handler ---
func wsPtyHandler(w http.ResponseWriter, r *http.Request) {
	tabID := r.URL.Query().Get("tab_id")
	if tabID == "" { http.Error(w, "Missing tab_id", 400); return }
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil { return }
	defer conn.Close()

	cmd := exec.Command("tmux", "new-session", "-A", "-s", tabID, "-F", "status off")
	stdin, _ := cmd.StdinPipe(); stdout, _ := cmd.StdoutPipe(); cmd.Stderr = cmd.Stdout
	if err := cmd.Start(); err != nil { return }

	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			if err := conn.WriteMessage(websocket.BinaryMessage, append(scanner.Bytes(), '\n')); err != nil { break }
		}
		cmd.Process.Kill()
	}()

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil { break }
		stdin.Write(msg)
	}
	cmd.Wait()
}

// --- QUIC PTY Server ---
func startQuicServer() {
	cert := generateSelfSignedCert()
	config := &tls.Config{ Certificates: []tls.Certificate{cert}, NextProtos: []string{"gridrunner-pty"} }
	listener, err := quic.ListenAddr(fmt.Sprintf("0.0.0.0:%d", *quicPort), config, nil)
	if err != nil { log.Fatalf("QUIC Listen Fail: %v", err) }

	fmt.Printf("QUIC PTY Server active on UDP:%d\n", *quicPort)
	for {
		conn, err := listener.Accept(context.Background())
		if err != nil { continue }
		go handleQuicConn(conn)
	}
}

func handleQuicConn(conn quic.Connection) {
	defer conn.CloseWithError(0, "")
	for {
		stream, err := conn.AcceptStream(context.Background())
		if err != nil { return }
		go handleQuicStream(stream)
	}
}

func handleQuicStream(stream quic.Stream) {
	defer stream.Close()
	// First 64 bytes for TabID (Handshake)
	buf := make([]byte, 64)
	n, err := stream.Read(buf)
	if err != nil { return }
	tabID := string(buf[:n])

	cmd := exec.Command("tmux", "new-session", "-A", "-s", tabID, "-F", "status off")
	stdin, _ := cmd.StdinPipe(); stdout, _ := cmd.StdoutPipe(); cmd.Stderr = cmd.Stdout
	if err := cmd.Start(); err != nil { return }

	// Relay Tmux -> QUIC
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			if _, err := stream.Write(append(scanner.Bytes(), '\n')); err != nil { break }
		}
		cmd.Process.Kill()
	}()

	// Relay QUIC -> Tmux
	ioBuf := make([]byte, 4096)
	for {
		n, err := stream.Read(ioBuf)
		if err != nil { break }
		stdin.Write(ioBuf[:n])
	}
	cmd.Wait()
}

// --- Stats Helpers ---
func statsHandler(w http.ResponseWriter, r *http.Request) {
	stats, _ := getStats()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func getStats() (*Stats, error) {
	cpuP, _ := cpu.Percent(0, false); vm, _ := mem.VirtualMemory(); d, _ := disk.Usage("/")
	netIO, _ := net.IOCounters(false)
	var sent, recv uint64
	if len(netIO) > 0 { sent = netIO[0].BytesSent; recv = netIO[0].BytesRecv }
	procs, _ := process.Processes()
	var procInfos []ProcessInfo
	for _, p := range procs {
		name, _ := p.Name(); cp, _ := p.CPUPercent(); mp, _ := p.MemoryPercent(); status, _ := p.Status()
		st := "R"; if len(status) > 0 { st = status[0] }
		procInfos = append(procInfos, ProcessInfo{PID: p.Pid, Name: name, CPUUsage: cp, MemUsage: float32(mp), Status: st})
	}
	sort.Slice(procInfos, func(i, j int) bool { return procInfos[i].CPUUsage > procInfos[j].CPUUsage })
	if len(procInfos) > 10 { procInfos = procInfos[:10] }
	return &Stats{
		CPUUsage: cpuP[0], MemTotal: vm.Total, MemUsed: vm.Used, DiskTotal: d.Total, DiskUsed: d.Used,
		NetSent: sent, NetRecv: recv, Processes: procInfos, Timestamp: time.Now().Unix(),
	}, nil
}

func main() {
	flag.Parse()
	if *token == "" { *token = os.Getenv("GR_AGENT_TOKEN") }

	// Start QUIC in background
	go startQuicServer()

	// HTTP & WebSocket
	http.HandleFunc("/stats", statsHandler)
	http.HandleFunc("/ws/pty", wsPtyHandler)

	addr := fmt.Sprintf("0.0.0.0:%d", *port)
	fmt.Printf("GridRunner HTTP/WS Agent starting on %s\n", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}
