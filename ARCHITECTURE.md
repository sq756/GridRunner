# Ter (⚡) Architecture & Developer Guidelines

Welcome to the internal developer manual for **Ter**, the AI-Native Visual SSH Workstation. This document outlines the architectural philosophy, state management rules, and the standard operating procedure (SOP) for incrementally adding new features and components.

## 1. Core Architectural Philosophy

### State-Driven UI (No Event Spaghetti)
Ter has outgrown the traditional "emit events up, pass props down" model. With deeply nested components and dynamic layouts, event bubbling becomes fragile and unmaintainable. 
**Rule:** All UI components are **pure rendering functions**. They must read from and write to a centralized state (`src/store.ts` or specific composable states) rather than communicating directly with parent/sibling components.

### The Matrix Allocator (Zone-based Layout)
The application is structurally divided into logical "Zones" (Left, Main, Right, etc.) managed by `MatrixAllocator.vue`. 
Widgets (like Terminal, SFTP Explorer, Cyber HUD) are injected dynamically into these Zones based on the `globalState.workspaceMatrix` configuration.

## 2. Component Taxonomy

### A. Widgets (The Building Blocks)
A Widget is a self-contained feature panel (e.g., `SftpExplorer.vue`, `SidebarPanel.vue`).
- **Must be registered** in `src/WidgetRegistry.ts`.
- **Must NOT rely on specific parent containers.** A Widget should function perfectly whether it's placed in `ZONE_LEFT` or `ZONE_MAIN`.
- **Must import state directly.** Example: `import { globalState } from '../store';`

### B. Core Atoms
Low-level wrappers (e.g., `TerminalView.vue`, `CyberWebview.vue`) that handle heavy third-party libraries (xterm.js, Tauri Webview). They receive data via props from their parent Widgets and emit primitive interaction events.

### C. System Containers
Files like `App.vue`, `MatrixAllocator.vue`, and `TileContainer.vue`. They handle the window frame, global shortcuts, and layout rendering. You should rarely need to modify these when adding a new feature.

## 3. Standard Operating Procedure: Adding a New Widget

Let's say you want to add a `DatabaseMonitor` widget. Follow these linear steps:

### Step 1: Create the Component
Create `src/components/DatabaseMonitor.vue`.
*   DO NOT use `$emit` to talk to `App.vue`.
*   Import any necessary state or actions from `store.ts`.

### Step 2: Register the Widget
Open `src/WidgetRegistry.ts` and add your component:
```typescript
export const WIDGET_REGISTRY: Record<string, any> = {
  // ... existing widgets
  DB_MONITOR: markRaw(defineAsyncComponent(() => import('./components/DatabaseMonitor.vue'))),
};
```

### Step 3: Add to Settings Allocator
To allow users to place your widget on the screen, add its ID to the dropdowns in `src/components/SettingsPanel.vue` under the "WORKSPACE MATRIX" section.
```html
<option value="DB_MONITOR">DATABASE MONITOR</option>
```

## 4. State Management Rules

*   **UI State & Preferences:** Store in `globalState` within `src/store.ts`. Persist using `localStorage` if necessary.
*   **High-Frequency Data (Logs, PTY output):** Must be throttled. Never push directly to a reactive array inside a fast loop. Use the `storeActions.pushLog` Ring Buffer implementation to ensure 60fps UI performance without blocking the main thread.
*   **Backend Communication (Tauri RPC):** Call `invoke` directly from the Composables (e.g., `useExplorer.ts`), update the global state, and let Vue's reactivity handle the UI updates.

## 6. The Cyber-RPC & AutoPilot Engine (AI Integration)

Ter is an "AI-Native" workstation. It bridges the text-based Terminal and the graphical Webview through a seamless interception layer located in `usePtyListener.ts`.

### TER_RPC Protocol
If a background script or AI agent prints a specific JSON string to the terminal (e.g., `[TER_RPC] {"action": "navigate", "url": "https://github.com"}`), the interceptor will:
1.  Parse the JSON.
2.  Strip the raw JSON string from the terminal output so the user never sees the ugly code.
3.  Execute the action globally (e.g., automatically redirecting the `CYBER_HUD` webview).

### AUTO_SYNC (AutoPilot)
When `AUTO_SYNC` is enabled:
*   **Port Sniffing:** If the terminal prints a local URL like `http://localhost:3000`, the system automatically captures the port and redirects the visual webview to that address.
*   **Visual DOM Control:** If an AI agent prints `[TER_ACTION: click(12)]`, the interceptor instantly injects JavaScript into the running Webview to click the DOM element with ID 12. 
*   **Auto-Confirm:** Matches terminal prompts against `activeTriggers` and automatically sends carriage returns (`\r`) to bypass repetitive confirmations.

**Developer Rule:** When building new tools (like a Python or Go CLI script meant to be run inside Ter), you can control the entire Ter GUI simply by printing `[TER_RPC]` or `[TER_ACTION]` strings to standard output (`stdout`).