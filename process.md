# Ter Project Progress Archive (process.md)

## 1. 当前版本与核心逻辑 (Current Version & Core Logic)
- **当前版本**: v2.11.60
- **基础架构**: 前端采用 Vue 3 + TypeScript + Vite 构建，利用 Tauri (v2) 作为桥梁连接底层的 Rust 后端。
- **核心功能**:
  - 深度集成的 SSH 终端会话管理与监控 (基于 `russh` & `xterm.js`)。
  - 内置 SFTP 资源管理器，具备文件预览、快速编辑、下载上传以及 Webview 直连能力。
  - 实时系统性能监控面板与 Tactical Logs 矩阵。
- **核心状态管理 (Rust)**: 
  - 通过 `AppState` 维护全局 SSH Session、PTY 通道 (`DashMap`) 和相关配置（如密码学加密 `crypto`、端口管理等）。
- **最新核心变更**:
  - 完成了 SFTP 可视化组件与后层的路径彻底解耦 (`sanitizeSftpPath`)。
  - 修复了因为前端面包屑 UI（如 `ROOT`，`[Node IP]`）导致后端路径解析失败，进而引发状态 101 错误与通道异常断开的连环崩溃。

## 2. 存疑与未解决问题 (Doubts & Unresolved Issues)
- **SFTP 实例存活期探测**: 当 SFTP 底层数据流 `stream ended` 或 `channel_close` 时，目前缺乏主动探活和无感重连机制，可能导致后续指令在失效通道上反复超时。
- **Vite 生产环境构建超限**: 在前端编译期间出现 `[plugin builtin:vite-reporter] Some chunks are larger than 500 kB` 和动态导入解析失效的问题，应用体积与加载性能仍有优化空间。
- **并发状态竞争 (Race Conditions)**: Node 界面的状态刷新与用户侧的交互偶发卡死，高度疑似因为某些读写操作尚未完全从全局大锁模式中解脱。

## 3. 高危代码警示 (High-Risk Code Warnings)
- **文件路径**: `src-tauri/src/lib.rs` -> 全局状态结构 `AppState` 与各个 Command。
  - **警示原因**: 虽然目前大多使用了 `tokio::sync::Mutex`，但在复杂网路 I/O（如 `session.channel_open_session().await` 和文件读写操作）前后，需要严格检查是否存在长时间占有锁不释放的情况（尤其是发生 `Error` 直接 `return` 时，需要确保上游机制不会死锁）。
- **文件路径**: `src/composables/useExplorer.ts` & `src/composables/useExplorerContextMenu.ts`
  - **警示原因**: 路径拼接逻辑脆弱。如果 `sanitizeSftpPath` 不能覆盖所有畸形输入场景，可能会导致意外操作或跨目录操作，必须在后端再次做严格的 `canonicalize` 和权限沙盒兜底。

## 4. 历史解决思路 (Historical Problem-Solving Ideas)
- **前端输入防毒 (Path Sanitization)**: 
  - **病因**: UI 展示用的 `ROOT` 被带入了后端文件查询逻辑，导致非法的 `/ROOT/etc` 请求。
  - **解法**: 坚持“表现层与数据层严格分离”。利用 `sanitizeSftpPath` 拦截所有包含 UI 标签的路径。
- **锁僵死与通道早泄诊断**:
  - **病因**: 异常的网络状态反馈（如权限不足的 101 报错）直接致使上游报错并回收实例，而全局状态锁未能及时响应这种异常终止。
  - **解法**: 计划降低锁的颗粒度（Lock Granularity），克隆 Handle 操作而不是包裹整个 Session；针对错误状态做细粒度 `match` 匹配，而非通过 `unwrap()` 或 `?` 粗暴阻断。

## 5. 待办任务与规划 (Todo Tasks & Planning)
- [ ] **重构 Rust 并发模型**: 梳理全局的 `AppState`，将包裹在同一互斥锁下的组件按需拆分为读写锁（`RwLock`），防止单一慢速 I/O 拖垮整个终端面板。
- [ ] **SFTP 断线重连机制**: 在后端封装一套具有 Retry 逻辑的 `SftpSession` 获取层，当探针发现通道关闭时自动后台重置 Channel。
- [ ] **前端资源按需加载 (Code Splitting)**: 修复 Vite 构建报警，利用 `defineAsyncComponent` 按需加载复杂的 Webview 和 Echarts 图表模块。
- [ ] **错误日志的结构化抛出**: 将后端原先用 `e.to_string()` 一股脑返回的文本报错，改造为包含 `code`、`message` 的标准 Error Object，以便前端做差异化 UI 反馈。
- [ ] **完善 Android 端能力构建**: 随着 `release.yml` 中的 NDK 编译已激活，需要针对移动端补充手势适配以及特定系统权限处理。