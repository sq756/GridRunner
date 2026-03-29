/**
 * GRIDRUNNER GLOBAL STATE CENTER
 * v3.1.9: Recursive Layout Loops & Neural Bus Protection
 */

import { reactive, computed, shallowRef, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { terminalManager } from './TerminalManager';
import { webviewManager } from './WebviewManager';

const APP_VERSION = '3.1.9';
const lastVersion = localStorage.getItem('ter_version');
if (lastVersion !== APP_VERSION) {
    localStorage.removeItem('ter_workspace_tree'); // Clear potentially corrupted layout
    localStorage.setItem('ter_version', APP_VERSION);
}

// --- Agent Orchestrator Types ---
export type AgentRoleType = 'ACTOR' | 'CRITIC' | 'SANDBOX' | 'AUDITOR' | 'SYSTEM';

export interface RoleBinding {
  role: AgentRoleType;
  tabId: string | null;
  status: 'IDLE' | 'BUSY' | 'DISCONNECTED';
  label: string;
  icon: string;
}

export interface RPCEvent {
  id: string;
  timestamp: number;
  fromRole: AgentRoleType | 'HUMAN';
  toRole: AgentRoleType | 'BROADCAST' | 'HUMAN' | 'SYSTEM';
  action: string;
  payload: any;
  status: 'SENT' | 'CONSUMED' | 'FAILED';
}

// v2.19.0: Recursive Tiling Engine Types
export type LayoutNode = {
  id: string; // Unique instance ID
  type: 'split-h' | 'split-v' | 'widget';
  widgetId?: string; // Referring to WIDGET_REGISTRY
  ratio?: number; // 0.0 to 100.0
  children?: LayoutNode[];
};

/**
 * TER_CORE GLOBAL STATE CENTER
 */
export const globalState = reactive({
  // Connection State
  isConnected: false,
  host: 'REMOTE_NODE',
  activeServerId: null as string | null,
  connectionStatus: 'disconnected' as 'connected' | 'busy' | 'disconnected',

  // UI State
  gridLayout: { rows: 2, cols: 3 }, 
  isSafeMode: localStorage.getItem('ter_safe_mode') === 'true',
  useNativeWebview: localStorage.getItem('ter_use_native_webview') !== 'false', 
  showSettings: false,
  showNetworkMatrix: false,
  showQuantumAudit: false,
  showNexus: false, // v3.0: Neural Bus Console
  isSidebarOpen: true,
  isLocked: false,
  cyberMode: 0,
  sftpHeight: Number(localStorage.getItem('ter_sftp_height')) || 200,
  gridMode: localStorage.getItem('ter_grid_mode') === 'true',
  activeClipMode: (localStorage.getItem('ter_clip_mode') || 'terminal') as 'terminal' | 'editor' | 'webview' | 'bundle',
  terminalFontSize: Number(localStorage.getItem('ter_terminal_font_size')) || 14,

  // Explorer State
  currentPath: '/',
  currentAgentPort: null as number | null,

  // v2.18.0: Connection Metrics
  connectionMetrics: {
    protocol: 'SSH/TCP',
    relay: null as string | null,
    isDirect: false,
    latency: 0,
    timestamp: ''
  },

  // v2.19.0: Recursive Workspace Tree
  workspaceTree: (() => {
    try {
      const saved = JSON.parse(localStorage.getItem('ter_workspace_tree') || 'null');
      if (saved) return saved;
    } catch { }
    // Default: Simple split with Sidebar and Main Terminal
    return {
      id: 'root',
      type: 'split-h',
      ratio: 25,
      children: [
        { id: 'side-node', type: 'widget', widgetId: 'SIDEBAR_PANEL' },
        { id: 'main-node', type: 'widget', widgetId: 'TERMINAL_MAIN' }
      ]
    } as LayoutNode;
  })(),

  focusedPane: 'primary' as 'primary' | 'secondary',

  // --- AutoPilot / Multi-Agent State ---
  autoPilot: {
    isActive: false,
    isPaused: false,
    objective: "",
    currentIteration: 0,
    maxIterations: 15,
    currentScore: 0,
    targetScore: 90,
    lastCriticFeedback: "",
    roles: {
      ACTOR: { role: 'ACTOR', tabId: null, status: 'DISCONNECTED', label: '执行者', icon: '👷' },
      CRITIC: { role: 'CRITIC', tabId: null, status: 'DISCONNECTED', label: '评价者', icon: '🧐' },
      SANDBOX: { role: 'SANDBOX', tabId: null, status: 'DISCONNECTED', label: '沙盒', icon: '🖥️' }
    } as Record<string, RoleBinding>,
    controlLogs: [] as RPCEvent[]
  },

  // Cursor State
  cursorConfig: (() => {
    try {
      const saved = JSON.parse(localStorage.getItem('ter_cursor') || 'null');
      return saved || {
        enabled: true,
        size: 8,
        glow: 15,
        color: '#ffffff',
        breathing: true
      };
    } catch { return { enabled: true, size: 8, glow: 15, color: '#ffffff', breathing: true }; }
  })(),
});

export const backendLogs = shallowRef<string[]>([]);
export const terminalTabs = ref<any[]>([]);
export const activeTabId = ref<string | null>(null);
export const activeTabIdSecondary = ref<string | null>(null);
export const splitMode = ref(false);
export const webviewInstances = ref<any[]>([]);
export const activeWebviewId = ref<string | null>(null);

export const hostId = computed(() => globalState.isConnected ? globalState.host : 'GLOBAL');

// --- Log Ring Buffer & Throttling System ---
const LOG_MAX_LINES = 2000;
let logBuffer: string[] = [];
let logThrottleId: any = null;

const flushLogBuffer = () => {
  if (logBuffer.length > 0) {
    const current = backendLogs.value;
    let next = current.concat(logBuffer);
    if (next.length > LOG_MAX_LINES) {
      next = next.slice(next.length - LOG_MAX_LINES);
    }
    backendLogs.value = next;
    logBuffer = [];
  }
  logThrottleId = null;
};

// v3.0.1: Retry Circuit Breaker
export const retryCountMap: Record<string, number> = {};
export const reconnectingIds = reactive(new Set<string>());

export const storeActions = {
  pushLog(log: string) {
    logBuffer.push(log);
    if (!logThrottleId) {
      logThrottleId = setTimeout(flushLogBuffer, 50);
    }
  },

  setConnected(status: boolean, label?: string, id?: string) {
    globalState.isConnected = status;
    if (label) globalState.host = label;
    if (id) globalState.activeServerId = id;
    globalState.connectionStatus = status ? 'connected' : 'disconnected';
  },

  syncLogs(logs: string[]) {
    backendLogs.value = logs;
  },

  updatePath(path: string) {
    globalState.currentPath = path;
  },

  updateMetrics(m: any) {
    globalState.connectionMetrics.protocol = m.protocol;
    globalState.connectionMetrics.relay = m.relay;
    globalState.connectionMetrics.isDirect = m.is_direct;
    globalState.connectionMetrics.latency = m.latency || 0;
    globalState.connectionMetrics.timestamp = m.timestamp;
  },

  toggleSafeMode(val: boolean) {
    globalState.isSafeMode = val;
    localStorage.setItem('ter_safe_mode', val.toString());
  },

  async setNativeWebview(val: boolean) {
    globalState.useNativeWebview = val;
    localStorage.setItem('ter_use_native_webview', val.toString());
    if (!val) {
      try { await webviewManager.destroyAll(); } catch (e) {}
    }
  },

  // Tab Actions
  bringToForeground(id: string) {
    const t = terminalTabs.value.find(t => t.id === id);
    if (t) {
      t.isBackground = false;
      activeTabId.value = id;
      globalState.isSidebarOpen = true;
      window.dispatchEvent(new CustomEvent('switch-sidebar-view', { detail: 'OPS' }));
    }
  },

  async createNewTab(title = "SHELL", viewType: any = 'terminal', data: any = {}, skipPty = false, existingId?: string, isUserAction = false) {
    const id = existingId || 'tab-' + Math.random().toString(36).substr(2, 9);
    
    const alreadyExists = terminalTabs.value.find(t => t.id === id);
    if (alreadyExists) {
      alreadyExists.isBackground = false;
      if (splitMode.value && activeTabId.value) { activeTabIdSecondary.value = id; } 
      else { activeTabId.value = id; }
      
      if (isUserAction) {
        globalState.isSidebarOpen = true;
        window.dispatchEvent(new CustomEvent('switch-sidebar-view', { detail: 'OPS' }));
      }
      window.dispatchEvent(new CustomEvent('ter-tab-activity', { detail: { id, timestamp: Date.now() } }));
      return id;
    }

    if (viewType === 'terminal') {
      terminalManager.setOnDataCallback(id, (tid, d) => {
        if (!skipPty && globalState.isConnected) {
          invoke('write_pty', { tabId: tid, data: d }).catch(() => { });
        }
      });
      await terminalManager.getOrCreate(id);
      if (!skipPty && globalState.isConnected) {
        if (globalState.host === 'LOCAL') {
          try {
            await invoke('spawn_local_pty', { tabId: id });
            setTimeout(() => invoke('write_pty', { tabId: id, data: "\n\r" }), 500);
          } catch (e) { this.pushLog(`[ERROR] PTY Spawn fail for ${id}: ${e}`); }
        } else {
          try {
            await invoke('spawn_new_pty', { tabId: id, initialRows: 30, initialCols: 100 });
            setTimeout(() => invoke('write_pty', { tabId: id, data: "\n\r" }), 500);
          } catch (e) { this.pushLog(`[ERROR] PTY Spawn fail for ${id}: ${e}`); }
        }
      }
    }

    terminalTabs.value.push({ id, title, viewType, data, isBackground: false });
    if (splitMode.value && activeTabId.value) { activeTabIdSecondary.value = id; } 
    else { activeTabId.value = id; }

    if (isUserAction) {
        globalState.isSidebarOpen = true;
        window.dispatchEvent(new CustomEvent('switch-sidebar-view', { detail: 'OPS' }));
    }
    window.dispatchEvent(new CustomEvent('ter-tab-activity', { detail: { id, timestamp: Date.now() } }));
    return id;
  },

  closeTab(id: string) {
    const idx = terminalTabs.value.findIndex(t => t.id === id);
    if (idx !== -1) {
      terminalTabs.value.splice(idx, 1);
      terminalManager.remove(id);
      if (activeTabId.value === id) {
        activeTabId.value = terminalTabs.value.find(t => !t.isBackground)?.id || null;
      }
      if (activeTabIdSecondary.value === id) {
        activeTabIdSecondary.value = terminalTabs.value.find(t => !t.isBackground && t.id !== activeTabId.value)?.id || null;
      }
    }
  },

  async reconnectTab(id: string) {
    const tab = terminalTabs.value.find(t => t.id === id);
    if (!tab || tab.viewType !== 'terminal' || reconnectingIds.has(id)) return;
    
    // v3.0.1: Smart Circuit Breaker with Exponential Backoff
    const currentRetries = retryCountMap[id] || 0;
    if (currentRetries >= 3) {
      this.pushLog(`[FATAL] Session ${id} reached retry limit. Stopping auto-recovery.`);
      reconnectingIds.delete(id);
      return;
    }
    
    reconnectingIds.add(id);
    const waitTime = Math.pow(2, currentRetries) * 1000;
    retryCountMap[id] = currentRetries + 1;
    this.pushLog(`[SYSTEM] Connection loss on ${id}. Auto-recovery in ${waitTime/1000}s...`);
    
    setTimeout(async () => {
      if (!globalState.isConnected) {
        reconnectingIds.delete(id);
        return;
      }
      this.pushLog(`[SYSTEM] Attempting recovery for ${id} (Attempt ${retryCountMap[id]}/3)...`);
      try {
        if (globalState.host === 'LOCAL') { 
          await invoke('spawn_local_pty', { tabId: id }); 
        } else { 
          await invoke('spawn_new_pty', { tabId: id }); 
        }
        
        setTimeout(() => {
          if (terminalTabs.value.find(t => t.id === id)) { 
            retryCountMap[id] = 0; 
            reconnectingIds.delete(id);
          }
        }, 5000);
        setTimeout(() => {
            if (globalState.isConnected) invoke('write_pty', { tabId: id, data: "\n\r" });
        }, 500);
      } catch (e) {
        this.pushLog(`[ERROR] Session recovery failed: ${e}`);
        reconnectingIds.delete(id);
      }
    }, waitTime);
  },

  async renameTab(id: string, newName: string) {
    const tab = terminalTabs.value.find(t => t.id === id);
    if (tab) {
      tab.title = newName;
      if (globalState.isConnected && globalState.host !== 'LOCAL' && tab.viewType === 'terminal') {
        try { await invoke('write_pty', { tabId: id, data: `tmux rename-session -t ${id} "${newName.replace(/"/g, '_')}"\r` }); } catch (e) { }
      }
    }
  },

  // v2.19.0: Workspace Layout Control
  updateLayout(newTree: LayoutNode) {
    globalState.workspaceTree = newTree;
    localStorage.setItem('ter_workspace_tree', JSON.stringify(newTree));
    setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 100);
  },

  setPreset(name: 'RESEARCH' | 'DEV' | 'SIMULATION') {
    if (globalState.workspaceTree.id === (name === 'RESEARCH' ? 'res-root' : name === 'DEV' ? 'dev-root' : 'root')) return;
    let tree: LayoutNode;
    if (name === 'RESEARCH') {
      tree = {
        id: 'res-root', type: 'split-h', ratio: 20, children: [
          { id: 'side-node', type: 'widget', widgetId: 'SIDEBAR_PANEL' },
          { id: 'res-right-split', type: 'split-h', ratio: 60, children: [
              { id: 'res-mid-v', type: 'split-v', ratio: 70, children: [
                  { id: '@actor', type: 'widget', widgetId: 'TERMINAL_MAIN' }, 
                  { id: '@gemini', type: 'widget', widgetId: 'RUNNING_PROCESSES' } 
              ]},
              { id: 'res-paper-v', type: 'split-v', ratio: 50, children: [
                  { id: '@plot', type: 'widget', widgetId: 'IMAGE_VIEWER' }, 
                  { id: '@scholar', type: 'widget', widgetId: 'CYBER_HUD' } 
              ]}
          ]}
        ]
      };
    } else if (name === 'DEV') {
      tree = {
        id: 'dev-root', type: 'split-h', ratio: 70, children: [
          { id: '@editor', type: 'widget', widgetId: 'TERMINAL_MAIN' },
          { id: 'dev-right-v', type: 'split-v', ratio: 50, children: [
            { id: '@terminal', type: 'widget', widgetId: 'TERMINAL_MAIN' },
            { id: '@ai', type: 'widget', widgetId: 'SIDEBAR_PANEL' }
          ]}
        ]
      };
    } else {
       tree = { id: 'root', type: 'split-h', ratio: 25, children: [
         { id: 'side', type: 'widget', widgetId: 'SIDEBAR_PANEL' },
         { id: 'main', type: 'widget', widgetId: 'TERMINAL_MAIN' }
       ]};
    }
    this.updateLayout(tree);
  },

  dispatchRPC(from: AgentRoleType, rawMessage: any) {
    const ap = globalState.autoPilot;
    const { target, action, payload } = rawMessage;
    const event: any = { id: Math.random().toString(36).substring(2, 9), timestamp: Date.now(), fromRole: from, toRole: (target || 'BROADCAST').replace('@', ''), action, payload, status: 'SENT' };
    ap.controlLogs.unshift(event);
    if (ap.controlLogs.length > 100) ap.controlLogs.pop();
    if (ap.isPaused && action !== 'abort' && action !== 'terminate') { event.status = 'FAILED'; return; }
    const routeTo = (role: string, data: string) => {
      const binding = ap.roles[role];
      if (binding && binding.tabId) { invoke('write_pty', { tabId: binding.tabId, data }); return true; }
      return false;
    };
    try {
      switch (action) {
        case 'input': if (target && target.startsWith('@')) { const role = target.substring(1); if (routeTo(role, payload + '\r')) event.status = 'CONSUMED'; } break;
        case 'terminate': this.pushLog(`[🎉] TASK_COMPLETED: ${payload || 'Goal reached.'}`); ap.isActive = false; event.status = 'CONSUMED'; break;
        case 'abort': this.pushLog(`[⚠️] TASK_ABORTED: ${payload}`); ap.isPaused = true; event.status = 'CONSUMED'; break;
        case 'evaluate_result': ap.currentScore = payload.score || 0; ap.lastCriticFeedback = payload.feedback || "";
          if (ap.currentScore >= ap.targetScore) { this.dispatchRPC('SYSTEM', { target: '@ACTOR', action: 'terminate', payload: 'Score threshold reached.' }); } 
          else { this.dispatchRPC('SYSTEM', { target: '@ACTOR', action: 'input', payload: `Score: ${ap.currentScore}. Feedback: ${ap.lastCriticFeedback}` }); }
          event.status = 'CONSUMED'; break;
      }
    } catch (e) { event.status = 'FAILED'; console.error("[Orchestrator] Dispatch error:", e); }
  },

  bindRole(role: string, tabId: string | null) {
    const r = globalState.autoPilot.roles[role];
    if (r) { r.tabId = tabId; r.status = tabId ? 'IDLE' : 'DISCONNECTED'; }
  }
};

// Auto-register Listeners
listen('connection-metrics', (event: any) => {
  storeActions.updateMetrics(event.payload);
});

listen('connection-lost', (event: any) => {
  console.error("[GR_CORE] Connection lost:", event.payload);
  storeActions.setConnected(false);
  globalState.currentAgentPort = null;
  storeActions.pushLog(`[ERROR] Critical Link Failure: ${event.payload.reason || 'Unknown'}`);
});
