# AI 原生远程工作站 (Ter) 深度开发计划 [v2.0 演进版]

## 0. 产品核心哲学：Agentic & Stealth
**“不仅仅是工具，而是与你共生的数字副官”**
*   **物理共生**：通过「潜行模式」彻底消除系统边框，使应用与桌面环境无缝融合。
*   **思维显化**：拒绝“黑盒 AI”，通过 [LOGS] 视窗显化 Agent 的推理过程与决策链。

---

## 1. 架构演进：分布式与隔离协议

### 1.1 数据治理模型 (Distributed Data Strategy)
| 存储层级 | 存储位置 | 核心职责 |
| :--- | :--- | :--- |
| **Global Registry** | 本机 SQLite | 存储 Master 密码、全局插件、个人偏好配置。 |
| **Host-Bound Data** | 远程服务器 `.ter/` | [新] 隔离存储特定主机的书签、历史记录、Agent 记忆。 |
| **Ghost Archive** | `~/.ter/archives/` | [新] 自动捕获终端 AI CLI (Gemini/Claude) 的对话并固化为 Markdown。 |

---

## 2. 交互协议规范 (Interface Protocols)

### 2.1 潜行模式与窗口控制 (Stealth & Control)
*   **无边框规范**: `decorations: false`，`transparent: true`。
*   **动静分离拖拽**:
    *   **拖拽区**: 仅限顶部 Tab 栏的中间空白区域 (`data-tauri-drag-region`)。
    *   **死区隔离**: 所有的 Tab 标签、`[ — ][ ⬜ ][ ✕ ]` 按钮必须显式排除拖拽属性，确保点击有效。
*   **窗口控制**: 按钮采用赛博绿 (`#00ff9d`)，集成 `getCurrentWindow()` 的原生 API 调用。

### 2.2 侧边栏「三席位」动态协议 (3-Slot Sidebar Protocol)
*   **常驻席位**: 用户从 `[OPS][ARS][NAV][LOGS][WEB]` 中任选 3 个固定显示。
*   **AGENT 覆盖逻辑**:
    *   点击底部 **AGENT: ACTIVE** 时，若 `LOGS` 不在常驻位，则临时覆盖并替换 Slot 3。
*   **回溯机制**: 退出 Agent 视图时，Slot 3 必须自动恢复为用户原定的常驻组件。

### 2.3 摩斯/宏输入协议 (Morse Macro Protocol)
*   **交互迁移**: 摩斯密码录入入口从底部状态栏迁移至顶部 Tab 栏的『呼吸灯/状态指示灯』图标。
*   **执行逻辑**: 通过 `mousedown`/`mouseup` 捕获长短序列，由 Agent 实时解析并向 PTY 注入预设命令。

---

## 3. 核心功能模块补全 (v2.11.x 系列)

### 3.1 终端与 Tmux「木偶协议」
*   **右键同化**: 通过前端菜单发送 `\x02` (Ctrl+B) 等控制序列，实现 UI 化的 Tmux 分屏、缩放与销毁。
*   **事件捕获**: 在根容器使用 `@mousedown.capture` 解决 `xterm.js` 吞噬事件导致的菜单无法关闭问题。

### 3.2 SFTP 实战化 (Actionable SFTP)
*   **Delete**: 强制触发「确认删除」对话框。
*   **Preview**: 支持 Markdown 渲染与代码高亮，限制读取大文件的前 4KB。
*   **Download**: 调用 `tauri-plugin-dialog` 的原生保存路径选择器。

### 3.3 拓扑矩阵 (Network Topology Matrix)
*   **可视化代理链**: 实现 `Local -> Jump Proxy -> Target` 的动态连线。
*   **链路诊断**: 线条支持 `Testing (Yellow Pulse)`、`Success (Green Glow)`、`Failed (Red Flash)` 三种状态。

---

## 4. Agent 显化与认知层 (Agent Cognition Layer)

### 4.1 [LOGS] 战术视窗
*   **角色**: Agent 的“思想流”展示区。
*   **内容**: 记录 `Observation` (观察到终端变化)、`Reasoning` (思考下一步)、`Action` (执行 PTY 注入或 API 调用)。

### 4.2 介入级别控制 (Brain Config)
*   **Minimal**: 仅在用户手动触发时响应。
*   **Active**: 自动纠错，主动在右下角弹出操作建议。
*   **Aggressive**: 自动处理已知环境配置、自动接受 SSH 密钥等。

---

## 5. 安全与稳定性协议 (2.0 增补)

### 5.1 事件穿透与拦截
*   **Capture First**: 所有的全局 UI 组件（右键菜单、设置面板）关闭逻辑必须使用事件捕获模式，以对抗 PTY 画布的 `stopPropagation`。

### 5.2 移动端安全
*   **APK 签名流**: 在 GitHub Actions 中强制集成 `sign-android-release`，确保生成的 APK 包含有效证书，绕过手机系统的恶意软件误报。
