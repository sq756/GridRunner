# GridRunner (⚡) - AI-Native Cyber SSH Workstation

**"Designed for Humans, Interfaced for AI"**

GridRunner is a high-performance visual SSH platform built with Tauri v2, Vue 3, and Rust. It evolves the traditional terminal into a "Physical Body" for AI agents (like Gemini CLI), enabling autonomous remote server operations through visual perception and structured RPC.

![Version](https://img.shields.io/badge/version-0.2.2-blueviolet)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)

---

## 🌟 Key Features (v0.2.2+)

### 👁️ Visual Audit Loop
*   **AI Sight**: Integrated Headless Chrome capturing real-time UI snapshots.
*   **SFTP Sync**: Captured snapshots are instantly uploaded to the remote Linux host at `/tmp/current_ui.png` via an encrypted SSH tunnel.
*   **Visual Verification**: Allows AI to "see" CSS changes, layout alignment, and component rendering for immediate feedback.

### 🤖 Auto-Pilot Mode
*   **RPC Interceptor**: A built-in terminal stream interceptor that identifies `[GR_RPC]` dark signals.
*   **Autonomous Workflow**: When enabled, AI can self-trigger screenshots and analyze them to fix UI bugs in a continuous loop: **Modify -> Compile -> Capture -> Analyze -> Fix**.

### 🧩 Plugin Ecosystem (MCP Inspired)
*   **UI Injection (Flow B)**: Supports third-party plugins that inject native Vue components via structured JSON output.
*   **Language Agnostic**: Write plugins in Python, Node.js, Go, or Rust. Simply output JSON to render charts, forms, or notifications.
*   **Dynamic Capabilities**: Ter dynamically declares available "Skills" to the AI, enabling a modular expansion of the agent's power.

### 🔒 Security & Foundation
*   **Secure Vault**: Credentials protected by a Master Password using AES-256-GCM and Argon2.
*   **Cyber Transparency**: A unique frosted-glass UI mode for real-time monitoring of backend log streams.
*   **Lightweight Agent**: A Go-based static binary (<10MB) automatically deployed for advanced process management and task persistence.

---

## 🛠️ AI Interaction Protocol ([GR_RPC])

Commands can be printed to the terminal (manually or by AI) to trigger system-level actions:

| Command (JSON) | Action | Result |
| :--- | :--- | :--- |
| `[GR_RPC] {"action": "screenshot"}` | **Visual Capture** | Snapshots the UI and uploads to `/tmp/current_ui.png` |
| `[GR_RPC] {"action": "notify", "msg": "..."}` | **System Toast** | Displays a frosted-glass notification in the Ter UI |

---

## 🧩 Developer Guide: Writing Plugins

Create a `manifest.yaml` in `~/.ter/plugins/your-plugin-name/`:

```yaml
name: "Server Traffic"
description: "Visualize network traffic using ECharts"
command: "python traffic_analyser.py"
parameters: []
```

Make your script output JSON for UI injection:
```bash
# Output an ECharts bar chart directly into the Ter UI
echo '{"type": "chart", "message": [400, 300, 500, 100, 200]}'
```

---

## 🚀 Quick Start

1.  **Download**: Get the latest installer from the [Releases](https://github.com/sq756/ter/releases) page.
2.  **Unlock**: Set your master password on the first launch.
3.  **Add Server**: Save your SSH credentials; Ter will automatically deploy the Go Agent.
4.  **Engage Auto-Pilot**: Toggle the **Auto-Pilot** switch in the sidebar to enable AI visual feedback.

---

## 🏗️ Architecture
*   **Frontend**: Vue 3 + Vite + ECharts + xterm.js + html2canvas
*   **Backend**: Rust (Tauri v2) + russh (SSH2) + tiny_http (Local Control API)
*   **Agent**: Go (Static Compilation)
*   **Control Plane**: Internal API listening on `127.0.0.1:1414` for AI-driven "Shutter" control.

---

Built with ❤️ by [sq756](https://github.com/sq756)
