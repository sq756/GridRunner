# Ter (⚡) Development Log & Memory Core
**Last Update:** March 15, 2026 (v2.15.0)

## 1. Project Status Summary
Ter has evolved into a **Local-First & AI-Native Visual SSH Workstation**. v2.15 introduces native local terminal support and advanced PTY interception protocols.

## 2. Solved Issues (v2.14.18 -> v2.15.0)
- **Local Integration**:
    - **Spawn Local PTY**: Implemented native shell spawning using `portable-pty` (Zsh/PowerShell/Sh).
    - **Guest Mode**: Added "LOCAL SHELL" option in `CyberGate.vue` for quick local access without SSH.
    - **Unified PTY Logic**: Frontend `createNewTab` now intelligently routes between `spawn_local_pty` and `spawn_new_pty`.
- **Security & Orchestration**:
    - **Auth Interceptor**: Implemented a Rust-level PTY reader that scans for `[TER_AUTH]` to trigger the Master Password vault mid-session.
    - **SFTP Safety**: Refactored `App.vue` to skip remote SFTP/Skill calls when in Local mode.
- **Bug Fixes**:
    - **SFTP Restoration**: Fixed a regression in `SftpExplorer.vue` where breadcrumbs and file sorting were accidentally removed during refactoring.

## 3. Core Architecture Guide (Quick Start)
- **Entry Point**: `src/App.vue` - Orchestrates the entire shell, modals, and context menus.
- **State Management**: `src/store.ts` - Contains `globalState` (reactive) and `storeActions`.
- **Layout Engine**: `src/components/MatrixAllocator.vue` -> `TileContainer.vue` -> `WidgetRegistry.ts`.
- **Terminal Logic**: `src/components/TerminalView.vue` (UI) and `src/TerminalManager.ts` (xterm.js instances).
- **Backend**: `src-tauri/src/lib.rs` - Rust PTY handling, SSH session management, and SQLite storage.

## 4. Known Challenges & Pending Tasks
- **Challenge**: `data-tauri-drag-region` on Windows is aggressive and can block clicks if not precisely placed.
- **Pending**:
    - **Cursor Expansion**: Support for custom SVG/Pixel-art cursor imports.
    - **State Migrator**: A robust system to handle LocalStorage schema updates without clearing user data.

## 5. Lessons Learned & Error Experience
- **Vue 3 Nesting**: When nesting components >2 levels deep (App -> Allocator -> Container -> Plugin), **Explicit Event Tunneling** is safer than relying on `v-on="$attrs"`.
- **Animation Conflict**: NEVER use `transform` in CSS `@keyframes` if the element's position is also being updated via JavaScript `transform` styles. Use `opacity` or `filter` for breathing effects instead.
- **Tauri Drag Regions**: In Windows, a drag region element must be a sibling or a specific background layer to avoid "eating" clicks intended for foreground buttons.

## 6. v2.15 Roadmap (COMPLETED)
1. [DONE] Implement `spawn_local_pty` in Rust using `portable-pty`.
2. [DONE] Update `CyberGate.vue` to allow "Guest Mode" (Local Shell only).
3. [DONE] Implement the `[TER_AUTH]` PTY interceptor to trigger the Master Password vault mid-session.

## 7. v2.16 Roadmap (Next Steps)
1. **Local Explorer**: Implement `ls_local` in Rust and update `SftpExplorer.vue` to support local file browsing.
2. **Dynamic Theming**: Support for user-defined CSS variables for the Cyber UI via the Settings panel.
3. **Agent Local Memory**: Enable the Agent to read/write local project files for better context.

## [2026-03-29] UI Status Update (v2.18.3-stable)

### Solved Major Issues:
1. **Network Health Fixed**: Corrected the backend rate divisor (3 -> 5) and simplified frontend stats logic in `useStats.ts`.
2. **Process Navigation Restored**: Clicking a process in `RunningProcesses` now correctly expands the sidebar and switches to the "OPS" view for immediate feedback.
3. **Terminal DA Noise Suppression**: Reinforced `deviceAttributes: ''` in `TerminalManager.ts` to eliminate `^[[?1;2c` handshake leakage.
4. **Web Engine Size Uniformity**: Introduced `hideHeader` prop to `CyberWebview` and updated `CyberHUD` to eliminate redundant address bars in standalone mode, ensuring parity with the Iframe renderer.
5. **Cursor Occlusion Fixed**: Elevated `CyberCursor` z-index to `2147483647` to ensure visibility over all UI layers, including the System Settings drawer.

### Strategy for Next Session:
- Investigate Local Explorer implementation (ls_local) as per the roadmap.
- Further refine multi-pane terminal stability.
- Support for custom SVG cursor imports.
