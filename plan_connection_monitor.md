# 实时内核连接监控 (RKCM) 开发方案

## 1. 目标 (Objectives)
- **实时显示协议**: 区分当前物理链路是 `SSH/TCP` (标准) 还是经过 Tailscale 优化的 `UDP/P2P`。
- **稳定性指标**: 实时显示 RTT (延迟) 毫秒数。
- **断联预警**: 探测到高延迟或丢包时，UI 产生视觉反馈（呼吸灯变色）。

## 2. 后端实现 (Rust / Tauri)
### 2.1 探测引擎 (Monitoring Engine)
- 在 `src-tauri/src/lib.rs` 的 `setup` 块中，新增一个 `connection_monitor` 任务。
- **探测逻辑**:
  - 获取当前活跃连接的 `host`。
  - **延迟测量**: 使用简单的 TCP 连接时间或异步 Ping 测量 RTT。
  - **路径检测**: 执行 `tailscale status --json`，解析 JSON 数据中该 IP 的 `CurAddr` 和 `Relay` 字段。
    - 如果 `Relay` 为空且有公网 IP，标记为 `UDP/Direct`。
    - 如果存在 `Relay` 节点名称，标记为 `TCP/Relay`。
- **数据结构**:
  ```json
  {
    "latency": 45,
    "protocol": "UDP/Direct",
    "stability": "STABLE",
    "is_tailscale": true
  }
  ```

### 2.2 事件推送
- 每 3-5 秒向前端 `emit("connection-metrics")`。

## 3. 前端实现 (Vue / Store)
### 3.1 状态扩展 (`src/store.ts`)
- 增加 `connectionMetrics`: `{ latency: number, protocol: string, stability: string }`。

### 3.2 UI 组件 (`src/components/CyberHUD.vue`)
- 在地址栏左侧或右侧新增一个 `ConnectionBadge`。
- **视觉映射**:
  - **绿色 (Stable)**: 延迟 < 80ms，协议为 Direct。
  - **黄色 (Warning)**: 延迟 > 150ms，或者处于 Relay 模式。
  - **红色 (Critical)**: 探测失败或延迟 > 500ms。

## 4. 交互增强
- 点击 `ConnectionBadge` 弹出小气泡，显示详细的 Tailscale 节点信息（如 DERP 节点位置）。

---

## 5. 待确认事项
- [ ] 是否需要支持手动在 SSH 和 某些 UDP 代理（如 Mosh 占位）之间切换？
- [ ] 是否允许用户自定义探测频率？
