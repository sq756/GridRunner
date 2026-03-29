<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch, computed, shallowRef, provide } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

const appWindow = getCurrentWindow();

// Components
import { terminalManager } from './TerminalManager';
import MatrixScreen from './components/MatrixScreen.vue';
import SidebarPanel from './components/SidebarPanel.vue';
import TerminalTabs from './components/TerminalTabs.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import QuantumInspector from './components/QuantumInspector.vue';
import CyberGate from './components/CyberGate.vue';
import NetworkMatrix from './components/NetworkMatrix.vue';
import MatrixAllocator from './components/MatrixAllocator.vue';
import CyberCursor from './components/CyberCursor.vue';
import CyberNexus from './components/CyberNexus.vue';

// Composables
import { useMorse } from './composables/useMorse';
import { useTabs } from './composables/useTabs';
import { useStats } from './composables/useStats';
import { useExplorer, sanitizeSftpPath } from './composables/useExplorer';
import { useExplorerContextMenu } from './composables/useExplorerContextMenu';
import { useCyber } from './composables/useCyber';
import { useContextMenu } from './composables/useContextMenu';
import { usePtyListener } from './composables/usePtyListener';
import { useWebviews } from './composables/useWebviews';
import { useBookmarks } from './composables/useBookmarks';
import { useUIPreferences } from './composables/useUIPreferences';

// v2.14.0: TER_CORE State Center Integration
import { 
  globalState, backendLogs, terminalTabs, activeTabId, activeTabIdSecondary, 
  splitMode, webviewInstances, activeWebviewId, hostId, storeActions 
} from './store';

// ==========================================
// --- GLOBAL STATE (REFACTORED) ---
// ==========================================
const isAutoPilot = ref(false);
const lastAutoPilotTime = ref(0);
const activeTriggers = ref<string[]>(['Allow execution of:', '1. Allow once']);
const activeMacros = ref<{name: string, cmd: string}[]>([]);

const isLogsPaused = ref(false);
const skills = ref<any[]>([]);

const tacticalLogs = computed(() => backendLogs.value.slice(-50));
const isTrafficFlashing = ref(false);
let trafficTimeout: any = null;

const getLogColor = (log: string) => {
  if (log.includes('[ERROR]')) return '#ef4444';
  if (log.includes('[SYSTEM]') || log.includes('[STATUS]')) return '#22c55e';
  if (log.includes('[DEBUG]') || log.includes('[INFO]')) return '#888888';
  if (log.includes('AI') || log.includes('Reasoning')) return '#a855f7';
  return '#a1a1aa';
};

const isResizingSFTP = ref(false);

const handleResizeSFTP = (newHeight: number) => {
  globalState.sftpHeight = Math.max(100, Math.min(600, newHeight));
};

const handleGlobalMouseMove = (e: MouseEvent) => {
  if (isResizingSFTP.value) {
    globalState.sftpHeight = Math.max(100, Math.min(600, globalState.sftpHeight + e.movementY));
  }
};

const showPrivilegeMenu = ref(false);
const privilegeModule = ref('');
const privilegeMenuX = ref(0);
const privilegeMenuY = ref(0);

const onHeaderContextMenu = (p: { event: MouseEvent, module: string }) => {
  privilegeModule.value = p.module;
  privilegeMenuX.value = p.event.clientX;
  privilegeMenuY.value = p.event.clientY;
  showPrivilegeMenu.value = true;
};

const storageKey = (h: string) => `ter_tabs_${h.replace(/\s+/g, '_')}`;
let statsIntervalId: any = null;

const sharedProps = computed(() => ({
  // Sidebar Props
  hostName: globalState.host,
  bgTabs: backgroundTabs.value,
  skills: skills.value,
  webviewInstances: webviewInstances.value,
  activeWebviewId: activeWebviewId.value,
  lastActivityMap: lastActivityMap.value,
  cpuChartRef: cpuChartRef.value,
  memChartRef: memChartRef.value,
  netChartRef: netChartRef.value,
  healthMode: healthMode.value,
  currentNetSpeed: currentNetSpeed.value,
  extraStats: extraStats.value,
  isAutoPilot: isAutoPilot.value,
  isSafeMode: globalState.isSafeMode,
  sftpHeight: globalState.sftpHeight,
  slots: sidebarSlots.value,
  isLogsOverlay: !!previousSlot3.value,
  
  // Terminal Props
  tabs: terminalTabs.value,
  activeTabId: activeTabId.value,
  connectionStatus: globalState.connectionStatus,
  isMorsePressed: isMorsePressed.value,
  morseSequence: morseSequence.value,
  uiScale: debouncedUIScale.value,
  activeTabIdSecondary: activeTabIdSecondary.value,
  splitMode: splitMode.value,
  isSidebarOpen: globalState.isSidebarOpen,
}));

const handleUpdateLayout = (layoutType: string) => {
  if (layoutType === 'classic') {
    storeActions.setPreset('DEV');
  } else if (layoutType === 'developer') {
    storeActions.setPreset('DEV');
  } else if (layoutType === 'ops') {
    storeActions.setPreset('RESEARCH');
  }
};

// ==========================================
// --- DECOUPLED LOGIC (UPDATED) ---
// ==========================================
const { 
  backgroundTabs, lastActivityMap,
  createNewTab: _createNewTab, closeTab: _closeTab, sendToBackground, bringToForeground: _bringToForeground, renameTab, toggleSplit: _toggleSplit 
} = useTabs();

const createNewTab = (t?: string, v?: any, d?: any, b?: boolean, f?: string) => {
  console.log('[App] createNewTab', { t, v });
  return _createNewTab(t, v, d, b, f);
};
const closeTab = (id: string) => {
  console.log('[App] closeTab', id);
  return _closeTab(id);
};
const bringToForeground = (id: string) => {
  console.log('[App] bringToForeground', id);
  return _bringToForeground(id);
};
const toggleSplit = () => {
  console.log('[App] toggleSplit');
  return _toggleSplit();
};

const {
  realFiles, refreshExplorer, changeDir, onFastAccess
} = useExplorer();

// v2.14.21: Global Action Provider
const globalActions = {
  openTerminalContext: (p: { e: MouseEvent, id: string }) => onTerminalContextMenu(p),
  openExplorerContext: (p: { e: MouseEvent, file: any }) => onExplorerContextMenu(p),
  openWebContext: (p: { e: MouseEvent, id: string }) => onWebContextMenu(p),
  switchTab: (id: string) => bringToForeground(id),
};
provide('TER_ACTIONS', globalActions);

const showPreviewModal = ref(false);
const previewFileName = ref('');
const previewContent = ref('');

const closePreview = () => {
  showPreviewModal.value = false;
  previewContent.value = '';
};

const handleVaultEntry = (entry: any) => {
  previewFileName.value = entry.title || 'Vault Entry';
  previewContent.value = entry.content || JSON.stringify(entry, null, 2);
  showPreviewModal.value = true;
};

const handlePreviewAction = async () => {
  if (selectedFile.value) {
    previewFileName.value = selectedFile.value.name;
    const content = await explorerActionPreview();
    if (content !== null) {
      previewContent.value = content;
      showPreviewModal.value = true;
    }
  }
};

const {
  showContextMenu, menuX, menuY, contextMenuTabId, hasErrorSelection, contextMenuType,
  onTerminalContextMenu: _onTerminalContextMenu, copySelectedText, pasteFromClipboard,
  renameTabAction, copyTabIdAction, copyRuntimeEnv, generateRunReport, diagnoseSelection, calculateMenuPosition
} = useContextMenu(activeTabId, renameTab, computed(() => globalState.host), computed(() => globalState.currentPath), computed(() => globalState.currentAgentPort), terminalTabs);
const onTerminalContextMenu = (p: any) => {
  console.log('[App] onTerminalContextMenu', p?.id);
  return _onTerminalContextMenu(p);
};

const isClipFlashing = ref(false);

const setClipMode = (mode: 'terminal' | 'editor' | 'webview' | 'bundle') => {
  globalState.activeClipMode = mode;
  localStorage.setItem('ter_clip_mode', mode);
  showContextMenu.value = false;
  storeActions.pushLog(`[SYSTEM] CLIP_MODE set to: ${mode.toUpperCase()}`);
};

const copyLatestAI = async () => {
  if (isClipFlashing.value || !activeTabId.value) return;

  try {
    const mode = globalState.activeClipMode;
    let dataToCopy = "";

    if (mode === 'terminal') {
      await invoke('copy_latest_to_clipboard', { tabId: activeTabId.value });
    } else if (mode === 'editor') {
      const activeTab = terminalTabs.value.find(t => t.id === activeTabId.value);
      if (activeTab && activeTab.viewType === 'editor') {
        dataToCopy = activeTab.data?.content || "";
        await navigator.clipboard.writeText(dataToCopy);
      } else {
        throw new Error("ACTIVE_TAB_IS_NOT_AN_EDITOR");
      }
    } else if (mode === 'webview') {
      const activeTab = terminalTabs.value.find(t => t.id === activeTabId.value);
      dataToCopy = `[WEBVIEW_URL]: ${activeTab?.data?.url || 'unknown'}`;
      await navigator.clipboard.writeText(dataToCopy);
    } else if (mode === 'bundle') {
      // Smart bundle: Capture both if available
      const activeTab = terminalTabs.value.find(t => t.id === activeTabId.value);
      let bundle = "";
      if (activeTab && activeTab.viewType === 'editor') {
        bundle += `--- EDITOR_CONTENT (${activeTab.data?.path}) ---\n${activeTab.data?.content}\n\n`;
      }
      // Add terminal anyway as context
      try {
        await invoke('copy_latest_to_clipboard', { tabId: activeTabId.value });
        // Since it copies to native clipboard, we don't manually append here for now
      } catch(e){}

      if (bundle) await navigator.clipboard.writeText(bundle);
    }

    isClipFlashing.value = true;
    setTimeout(() => isClipFlashing.value = false, 500);
    storeActions.pushLog(`[CLIP] Captured data from ${mode.toUpperCase()}`);
  } catch (e) {
    console.error("CLIP failed:", e);
    storeActions.pushLog(`[ERROR] CLIP failed: ${e}`);
  }
};
const updateStatus = (msg: string) => {
  storeActions.pushLog(`[STATUS] ${msg}`);
};

const {
  createWebview, closeWebview, switchWebview, updateWebviewUrl
} = useWebviews();

const {
  bookmarks, addBookmark, removeBookmark
} = useBookmarks(hostId);

const {
  uiPrefs, loadUIPreferences, autoDetectScale
} = useUIPreferences();

const debouncedUIScale = ref(uiPrefs.value.ui_scale);
let scaleDebounceTimer: any = null;

watch(() => uiPrefs.value.ui_scale, (newScale) => {
  if (scaleDebounceTimer) clearTimeout(scaleDebounceTimer);
  scaleDebounceTimer = setTimeout(() => {
    debouncedUIScale.value = newScale;
  }, 150);
});

const {
  previewUrl, isWebviewLoading, refreshWebview, handleExtractDOM, handleScrapeData, onDomExtracted, captureAndUpload, useNativeWebview, disableTunnel
} = useCyber(activeTabId, backendLogs, activeWebviewId, updateWebviewUrl, storeActions);

watch(activeWebviewId, (newId) => {
  if (newId) {
    const inst = webviewInstances.value.find(w => w.id === newId);
    if (inst) previewUrl.value = inst.url;
  }
});

const showWebMenu = ref(false);
const webMenuX = ref(0);
const webMenuY = ref(0);
const contextWebId = ref<string | null>(null);

const onWebContextMenu = (p: { event: MouseEvent, web: any }) => {
  console.log('[App] onWebContextMenu', p.web?.id);
  webMenuX.value = p.event.clientX;
  webMenuY.value = p.event.clientY;
  contextWebId.value = p.web.id;
  showWebMenu.value = true;
};

listen('web-context-menu', (ev: any) => {
  const { x, y, id } = ev.payload;
  webMenuX.value = x; 
  webMenuY.value = y;
  contextWebId.value = id;
  showWebMenu.value = true;
});

const { 
  cpuChartRef, memChartRef, netChartRef, currentCpuUsage, 
  healthMode, currentNetSpeed, extraStats,
  initCharts, resizeCharts: _resizeCharts, setHealthMode
} = useStats(computed(() => globalState.currentAgentPort), computed(() => globalState.agentToken));

const resizeCharts = () => {
  console.log('[App] resizeCharts');
  return _resizeCharts();
};

const { 
  morseSequence, morseText, showMorseMacro, isMorsePressed, possibleLetters,
  handleMorseMouse, handleMorseWheel, onMorseMacro
} = useMorse(activeTabId, calculateMenuPosition);

usePtyListener(
  isAutoPilot, lastAutoPilotTime, 
  activeTriggers, captureAndUpload, refreshWebview, handleExtractDOM, lastActivityMap, toggleSplit
);

const {
  showExplorerMenu, explorerMenuX, explorerMenuY, selectedFile,
  onExplorerContextMenu: _onExplorerContextMenu, explorerActionCd, explorerActionCat, explorerActionVim, explorerActionCopyPath, explorerActionRun,
  explorerActionDownload, explorerActionUpload, explorerActionDelete, explorerActionPreview,
  explorerActionDump, explorerActionWrite
} = useExplorerContextMenu(activeTabId, computed(() => globalState.currentPath), refreshExplorer);

const onExplorerContextMenu = (p: any) => {
  console.log('[App] onExplorerContextMenu triggered for:', p?.file?.name);
  return _onExplorerContextMenu(p);
};

const handleQuickEdit = async () => {
  if (selectedFile.value) {
    const path = sanitizeSftpPath(selectedFile.value.path || (globalState.currentPath + '/' + selectedFile.value.name));
    try {
      const content = await invoke<string>('read_remote_file', { remotePath: path });
      await createNewTab(selectedFile.value.name, 'editor', { path, content });
    } catch (e) {
      storeActions.pushLog(`[ERROR] Failed to open editor: ${e}`);
    }
  }
  showExplorerMenu.value = false;
};

const handleEditorPathUpdate = (p: { id: string, path: string }) => {
  const tab = terminalTabs.value.find(t => t.id === p.id);
  if (tab) {
    tab.data.path = p.path;
    // Extract filename for title
    const filename = p.path.split('/').pop() || p.path;
    tab.title = filename;
    storeActions.pushLog(`[SYSTEM] Editor path updated to: ${p.path}`);
  }
};

const onSaveComplete = () => updateStatus("[FILE_SYNC_COMPLETE] Remote instance updated.");

const handleOpenInWebview = async () => {
  if (selectedFile.value) {
    const path = sanitizeSftpPath(selectedFile.value.path || (globalState.currentPath + '/' + selectedFile.value.name));
    const url = path.toLowerCase().endsWith('.pdf') ? `pdf://viewer?file=${encodeURIComponent(path)}` : `file://${path}`;
    await createNewTab(selectedFile.value.name, 'webview', { url, path });
  }
  showExplorerMenu.value = false;
};

const handleExplorerDownload = async () => {
  onAgentZoneClick(); 
  nextTick(() => {
    const sidebar = document.querySelector('.side-bar');
    if (sidebar) {
      const netBtn = Array.from(sidebar.querySelectorAll('.tactical-logs-matrix button'))
        .find(b => b.textContent?.includes('NET')) as HTMLButtonElement;
      if (netBtn) netBtn.click();
    }
  });
  await explorerActionDownload(updateStatus);
};

const cycleHealthMode = () => {
  const modes: any[] = ['resource', 'network', 'detail'];
  const next = modes[(modes.indexOf(healthMode.value) + 1) % modes.length];
  setHealthMode(next);
};

const sidebarSlots = ref(['OPS', 'ARS', 'NAV']);
const previousSlot3 = ref<string | null>(null);

const onAgentZoneClick = () => {
  if (sidebarSlots.value.includes('LOGS')) {
    window.dispatchEvent(new CustomEvent('switch-sidebar-view', { detail: 'LOGS' }));
  } else {
    previousSlot3.value = sidebarSlots.value[2];
    sidebarSlots.value[2] = 'LOGS';
    window.dispatchEvent(new CustomEvent('switch-sidebar-view', { detail: 'LOGS' }));
  }
};

const handleSidebarViewRevert = (newView: string) => {
  if (newView !== 'LOGS' && previousSlot3.value) {
    sidebarSlots.value[2] = previousSlot3.value;
    previousSlot3.value = null;
  }
};

const onConnected = async (data: { label: string, id: string }) => {
  const hostLabel = data.label;
  const hostIdValue = data.id;
  
  if (globalState.isConnected && globalState.host === hostLabel) return; 
  
  storeActions.setConnected(true, hostLabel, hostIdValue);
  
  if (webviewInstances.value.length === 0) {
    // v2.15.27: Using production-safe URL for initial load
    createWebview('https://cstimer.net', `${globalState.host}_DECK`);
  }
  
  const saved = localStorage.getItem(storageKey(globalState.host));
  terminalTabs.value = [];
  
  if (saved) {
    try {
      const ts = JSON.parse(saved); 
      if (Array.isArray(ts) && ts.length > 0) {
        const restoreList = ts.slice(0, 5);
        for (const t of restoreList) {
          await createNewTab(t.title, 'terminal', {}, false, t.id);
        }
        activeTabId.value = restoreList.find((t: any) => !t.isBackground)?.id || restoreList[0]?.id;
      } else {
        await createNewTab(`${globalState.host}_CORE`, 'terminal', {}, false, "tab-1");
      }
    } catch (e) { 
      console.error("Restore failed:", e);
      await createNewTab(`${globalState.host}_CORE`, 'terminal', {}, false, "tab-1"); 
    }
  } else {
    await createNewTab(`${globalState.host}_CORE`, 'terminal', {}, false, "tab-1");
  }

  setTimeout(() => {
    if (globalState.host !== 'LOCAL') {
      refreshExplorer();
      invoke('load_remote_skills').then((s: any) => {
        skills.value = Array.isArray(s) ? s : [];
      });
    } else {
      skills.value = [];
      // v2.14.22: In local mode, we might want to show local explorer or just stay empty
    }
  }, 1000);
};

const runMacro = async (cmd: string) => {
  if (activeTabId.value) {
    await invoke('write_pty', { tabId: activeTabId.value, data: cmd + '\r' });
    activeMenu.value = null;
  }
};

const runSkill = async (skill: any) => {
  const tid = activeTabId.value;
  if (!tid) return;
  const ctx = skill.context_file ? ` --context "${skill.context_file.path}"` : "";
  await invoke('write_pty', { tabId: tid, data: `${skill.rpc}${ctx}\r` });
};

const showSkillSettings = ref(false);
const selectedSkill = ref<any>(null);

const onSkillContextMenu = (p: { event: MouseEvent, skill: any }) => {
  selectedSkill.value = p.skill;
  showSkillSettings.value = true;
};

const handleGlobalKeyDown = (e: KeyboardEvent) => { 
  if (e.altKey && e.key.toLowerCase() === 'l') globalState.isLocked = !globalState.isLocked; 
  if (e.ctrlKey && e.key.toLowerCase() === 't') {
    e.preventDefault();
    if (globalState.isConnected) createNewTab();
  }
  // v2.19.0: Layout Presets Shortcuts
  if (e.ctrlKey && e.shiftKey && e.key === '1') { e.preventDefault(); storeActions.setPreset('DEV'); }
  if (e.ctrlKey && e.shiftKey && e.key === '2') { e.preventDefault(); storeActions.setPreset('RESEARCH'); }

  // v2.17.20: Terminal Font Scaling
  if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
    e.preventDefault();
    terminalManager.setFontSize(Math.min(32, globalState.terminalFontSize + 1));
  }
  if (e.ctrlKey && (e.key === '-' || e.key === '_')) {
    e.preventDefault();
    terminalManager.setFontSize(Math.max(6, globalState.terminalFontSize - 1));
  }
  if (e.ctrlKey && e.key === '0') {
    e.preventDefault();
    terminalManager.setFontSize(14);
  }
};

const isCtrlPressed = ref(false);

onMounted(async () => {
  await loadUIPreferences();
  
  // v3.1.0: Nexus Intent Listener
  window.addEventListener('ter-nexus-intent', ((e: CustomEvent) => {
    const { targetId } = e.detail;
    if (targetId === '@pdf' || targetId === '@scholar' || targetId === '@plot') {
      storeActions.pushLog(`[NEXUS] Auto-switching to RESEARCH_MODE to handle ${targetId}`);
      storeActions.setPreset('RESEARCH');
    }
  }) as any);

  // v2.14.2: Force unlock on fresh load to prevent interaction freeze
  globalState.isLocked = false;

  await listen('auth-trigger', () => {
    if (globalState.isConnected) {
      globalState.isLocked = true;
    }
  });
  
  window.addEventListener('keydown', handleGlobalKeyDown);
  window.addEventListener('keydown', (e) => { if (e.ctrlKey) isCtrlPressed.value = true; });
  window.addEventListener('keyup', (e) => { if (!e.ctrlKey) isCtrlPressed.value = false; });
  document.addEventListener('mousemove', handleGlobalMouseMove);
  document.addEventListener('mouseup', () => { isResizingSFTP.value = false; document.body.style.cursor = ''; });
  window.addEventListener('close-all-menus', () => closeAllMenus());
  
  listen('conn-status', (e: any) => {
    if (e.payload === 'DISCONNECTED') {
      storeActions.setConnected(false);
      storeActions.pushLog('[SYSTEM] Connection lost or closed.');
    } else {
      storeActions.pushLog(e.payload);
    }
  });

  listen('connection-metrics', (e: any) => {
    storeActions.updateMetrics(e.payload);
  });

  listen('backend-log', (e: any) => {
    if (!isLogsPaused.value) {
      storeActions.pushLog(e.payload);
    }
  });
  listen('traffic-event', () => {
    isTrafficFlashing.value = true;
    if (trafficTimeout) clearTimeout(trafficTimeout);
    trafficTimeout = setTimeout(() => isTrafficFlashing.value = false, 150);
  });

  const saved = localStorage.getItem(storageKey(globalState.host));
  if (!globalState.isConnected && !saved) {
    await createNewTab("Main Shell", 'terminal', {}, false, "tab-1");
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown);
  document.removeEventListener('mousemove', handleGlobalMouseMove);
  if (statsIntervalId) clearInterval(statsIntervalId);
});

const activeMenu = ref<string | null>(null);
const closeAllMenus = () => {
  activeMenu.value = null;
  showContextMenu.value = false;
  showExplorerMenu.value = false;
  showMorseMacro.value = false;
  showPrivilegeMenu.value = false;
  showWebMenu.value = false;
};

watch(activeMenu, (newVal) => {
  if (newVal === null) {
    showContextMenu.value = false;
    showExplorerMenu.value = false;
    showMorseMacro.value = false;
    showPrivilegeMenu.value = false;
    showWebMenu.value = false;
  }
});

watch(() => showContextMenu.value, (val) => { if (val) activeMenu.value = 'terminal'; });
watch(() => showExplorerMenu.value, (val) => { if (val) activeMenu.value = 'explorer'; });
watch(() => showMorseMacro.value, (val) => { if (val) activeMenu.value = 'morse'; });
watch(() => showPrivilegeMenu.value, (val) => { if (val) activeMenu.value = 'privilege'; });
watch(() => showWebMenu.value, (val) => { if (val) activeMenu.value = 'web'; });
</script>

<template>
  <div class="app-shell" 
       :class="{ 
         'safe-mode': globalState.isSafeMode,
         'cyber-cursor-active': globalState.cursorConfig.enabled 
       }" 
       :style="{ 
         '--ter-ui-scale': uiPrefs.ui_scale,
         '--ter-glow-opacity': uiPrefs.glow_intensity / 100,
         '--ter-pulse-duration': (2.0 - (uiPrefs.pulse_speed / 100) * 1.8) + 's',
         'font-size': (14 * uiPrefs.ui_scale) + 'px'
       }"
       @click="closeAllMenus" 
       @contextmenu.prevent="(e) => { 
         const target = e.target as HTMLElement;
         if (target.closest('.file-item') || target.closest('.terminal-view-container') || target.closest('.tab-item')) {
           return;
         }
         closeAllMenus();
       }">
    <CyberGate v-if="!globalState.isConnected" @connected="onConnected" />
    
    <div v-else class="main-view">
      <SettingsPanel :isOpen="globalState.showSettings" 
                     :useNativeWebview="useNativeWebview" 
                     :isSafeMode="globalState.isSafeMode"
                     :sidebarSlots="sidebarSlots"
                     :uiPrefs="uiPrefs"
                     @update:useNativeWebview="useNativeWebview = $event" 
                     @update:isSafeMode="storeActions.toggleSafeMode($event)"
                     @update:sidebarSlots="sidebarSlots = $event"
                     @update-layout="handleUpdateLayout"
                     @auto-detect="autoDetectScale"
                     @close="globalState.showSettings = false" @update-macros="(m) => activeMacros = m" />
      
      <main class="workspace" @click.stop>
        <!-- Modals and Context Menus -->
        <div v-if="showWebMenu" class="context-menu" :style="{ top: webMenuY + 'px', left: webMenuX + 'px' }">
          <header class="menu-header">WEB ACTIONS</header>
          <div class="menu-item" @click="invoke('reload_cyber_webview', { label: contextWebId! }); activeMenu = null">🔄 Reload</div>
          <div class="menu-item" @click="createWebview(); activeMenu = null">➕ New Web Instance</div>
          <div class="menu-divider"></div>
          <div class="menu-item danger" @click="closeWebview(contextWebId!); activeMenu = null">❌ Close Page</div>
        </div>

        <div v-if="showContextMenu" class="context-menu" :style="{ top: menuY + 'px', left: menuX + 'px' }">
          <header class="menu-header">
            <template v-if="contextMenuType === 'new-tab-menu'">NEW_TAB_DECK</template>
            <template v-else-if="contextMenuType === 'node-group'">NODE_GROUP_CONTROL</template>
            <template v-else-if="contextMenuType === 'clip-menu'">HARVEST_MODE</template>
            <template v-else-if="contextMenuType === 'render-menu'">RENDER_CONFIG</template>
            <template v-else-if="contextMenuType === 'sync-menu'">SYNC_CONTROL</template>
            <template v-else-if="contextMenuType === 'audit-menu'">AUDIT_CONTROL</template>
            <template v-else-if="contextMenuType === 'sidebar-menu'">SIDEBAR_CONTROL</template>
            <template v-else-if="contextMenuType === 'key-menu'">HOTKEY_MAPPING</template>
            <template v-else-if="contextMenuType === 'quantum-menu'">QUANTUM_CONTROL</template>
            <template v-else-if="contextMenuType === 'settings-menu'">SYS_PREFERENCES</template>
            <template v-else-if="contextMenuType === 'lock-menu'">ACCESS_CONTROL</template>
            <template v-else>TERMINAL ACTIONS</template>
          </header>
          
          <template v-if="contextMenuType === 'new-tab-menu'">
            <div class="menu-item highlight" @click="storeActions.createNewTab('Shell', 'terminal'); showContextMenu = false">🐚 NEW_TERMINAL</div>
            <div class="menu-item" @click="storeActions.createNewTab('Browser', 'webview', { url: 'https://www.google.com' }); showContextMenu = false">🌐 NEW_BROWSER_DECK</div>
            <div class="menu-item" @click="storeActions.createNewTab('Editor', 'editor', { path: '/tmp/new_file.txt', content: '' }); showContextMenu = false">📝 NEW_EDITOR_DECK</div>
            <div class="menu-divider"></div>
            <div class="menu-item" @click="toggleSplit(); showContextMenu = false">◫ TOGGLE_SPLIT_SCREEN</div>
          </template>

          <template v-else-if="contextMenuType === 'node-group'">
            <div class="menu-item" @click="globalState.showNetworkMatrix = true; showContextMenu = false">🌐 View Network Matrix</div>
            <div class="menu-item" @click="storeActions.pushLog('[SYSTEM] PING_CHECK initiated...'); showContextMenu = false">📡 Ping Check</div>
            <div class="menu-item" @click="storeActions.pushLog('[SYSTEM] Connection stats refreshed.'); showContextMenu = false">📊 Refresh Stats</div>
            <div class="menu-divider"></div>
            <div class="menu-item danger" @click="storeActions.pushLog('[SYSTEM] Resetting Connection...'); showContextMenu = false">🔄 Reset Connection</div>
          </template>

          <template v-else-if="contextMenuType === 'render-menu'">
            <div class="menu-item highlight" @click="storeActions.toggleSafeMode(!globalState.isSafeMode); showContextMenu = false">🛡️ Toggle Safe Mode</div>
            <div class="menu-item" @click="storeActions.pushLog('[UI] High Contrast mode toggled'); showContextMenu = false">🌓 High Contrast</div>
            <div class="menu-item" @click="storeActions.pushLog('[UI] Reduced Animations toggled'); showContextMenu = false">🧊 Reduce Animations</div>
            <div class="menu-item" @click="globalState.showSettings = true; showContextMenu = false">⚙️ Advanced UI Settings</div>
          </template>

          <template v-else-if="contextMenuType === 'clip-menu'">
            <div class="menu-item" :class="{ 'active-item': globalState.activeClipMode === 'terminal' }" @click="setClipMode('terminal')">📟 TERMINAL_BUFFER</div>
            <div class="menu-item" :class="{ 'active-item': globalState.activeClipMode === 'editor' }" @click="setClipMode('editor')">📝 EDITOR_CONTENT</div>
            <div class="menu-item" :class="{ 'active-item': globalState.activeClipMode === 'webview' }" @click="setClipMode('webview')">🌐 WEBVIEW_DOM</div>
            <div class="menu-item" :class="{ 'active-item': globalState.activeClipMode === 'bundle' }" @click="setClipMode('bundle')">📦 SMART_BUNDLE</div>
          </template>

          <template v-else-if="contextMenuType === 'audit-menu'">
            <div class="menu-item" @click="captureAndUpload(false); showContextMenu = false">📸 Snapshot</div>
            <div class="menu-item" @click="storeActions.pushLog('[AUDIT] UI_HISTORY_OPENED'); showContextMenu = false">🕒 History</div>
            <div class="menu-item" @click="storeActions.pushLog('[AUDIT] UI_EXPORT_READY'); showContextMenu = false">📥 Export</div>
          </template>

          <template v-else-if="contextMenuType === 'sync-menu'">
            <div class="menu-item highlight" @click="isAutoPilot = !isAutoPilot; showContextMenu = false">🤖 Toggle Auto-Sync</div>
            <div class="menu-item" @click="storeActions.pushLog('[SYNC] Frequency set to HIGH'); showContextMenu = false">⏱️ Sync Frequency: High</div>
            <div class="menu-item" @click="storeActions.pushLog('[SYNC] Conflict resolution: REMOTE_WINS'); showContextMenu = false">⚔️ Resolve: Remote Wins</div>
            <div class="menu-divider"></div>
            <div class="menu-item highlight" @click="storeActions.pushLog('[SYNC] Manual push started...'); showContextMenu = false">📤 Manual Sync Push</div>
          </template>

          <template v-else-if="contextMenuType === 'sidebar-menu'">
            <div class="menu-item" @click="globalState.isSidebarOpen = !globalState.isSidebarOpen; showContextMenu = false">🌓 Toggle View</div>
            <div class="menu-item" @click="storeActions.pushLog('[UI] Sidebar width reset'); showContextMenu = false">📌 Reset Width</div>
            <div class="menu-item" @click="storeActions.pushLog('[SYS] Cache cleared'); showContextMenu = false">🧹 Clear Cache</div>
          </template>

          <template v-else-if="contextMenuType === 'key-menu'">
            <div class="menu-item" @click="storeActions.pushLog('[SYS] Macro config active'); showContextMenu = false">⌨️ Macro Config</div>
            <div class="menu-item" @click="storeActions.pushLog('[SYS] Keymap edit active'); showContextMenu = false">🖱️ Keymap Edit</div>
            <div class="menu-item danger" @click="storeActions.pushLog('[SYS] Clipboard cleared'); showContextMenu = false">⏺️ Clipboard Clear</div>
          </template>

          <template v-else-if="contextMenuType === 'quantum-menu'">
            <div class="menu-item highlight" @click="globalState.showQuantumAudit = true; showContextMenu = false">🔍 Rapid Scan</div>
            <div class="menu-item" @click="storeActions.pushLog('[QUANTUM] Deep audit initiated'); showContextMenu = false">🧠 Deep Audit</div>
            <div class="menu-item" @click="storeActions.pushLog('[QUANTUM] Logs exported'); showContextMenu = false">📥 Log Export</div>
          </template>

          <template v-else-if="contextMenuType === 'settings-menu'">
            <div class="menu-item highlight" @click="globalState.showSettings = true; showContextMenu = false">⚙️ Profile Edit</div>
            <div class="menu-item" @click="storeActions.pushLog('[SYS] Config imported/exported'); showContextMenu = false">📤 Import/Export</div>
            <div class="menu-item danger" @click="storeActions.pushLog('[SYS] Factory reset initiated'); showContextMenu = false">☢️ Factory Reset</div>
          </template>

          <template v-else-if="contextMenuType === 'lock-menu'">
            <div class="menu-item" @click="storeActions.pushLog('[AUTH] Auto-lock settings opened'); showContextMenu = false">🔒 Auto-Lock Settings</div>
            <div class="menu-item" @click="storeActions.pushLog('[UI] Matrix theme applied'); showContextMenu = false">🧼 Matrix Theme</div>
            <div class="menu-item highlight" @click="storeActions.pushLog('[AUTH] Security pulse check'); showContextMenu = false">🚪 Security Pulse</div>
          </template>

          <template v-else>
            <div v-if="hasErrorSelection" class="menu-item highlight" @click="diagnoseSelection">🤖 Diagnose Error</div>
            <div class="menu-item" @click="renameTabAction">✏️ Rename</div>
            <div class="menu-item" @click="sendToBackground(contextMenuTabId!)">🚀 Background</div>
            <div class="menu-divider"></div>
            <div class="menu-item" @click="copySelectedText">📋 Copy</div>
            <div class="menu-item" @click="pasteFromClipboard">📥 Paste</div>
            <div class="menu-divider"></div>
            <header class="menu-header">TMUX CONTROL</header>
            <div class="menu-item" @click="invoke('write_pty', { tabId: activeTabId, data: '\x02%' }); showContextMenu = false">◫ Split Horizontal</div>
            <div class="menu-item" @click="invoke('write_pty', { tabId: activeTabId, data: '\x02\&quot;' }); showContextMenu = false">⬒ Split Vertical</div>
            <div class="menu-item" @click="invoke('write_pty', { tabId: activeTabId, data: '\x02z' }); showContextMenu = false">⤢ Toggle Zoom</div>
            <div class="menu-item danger" @click="invoke('write_pty', { tabId: activeTabId, data: '\x02x' }); showContextMenu = false">✕ Kill Pane</div>
            <div class="menu-divider"></div>
            <div class="menu-item danger" @click="closeTab(contextMenuTabId!)">❌ Close</div>
          </template>
        </div>

        <div v-if="showExplorerMenu" class="context-menu" :style="{ top: explorerMenuY + 'px', left: explorerMenuX + 'px' }">
          <header class="menu-header">FILE ACTIONS</header>
          <template v-if="selectedFile?.is_dir">
            <div class="menu-item" @click="explorerActionCd">📂 Open Folder</div>
            <div class="menu-item" @click="explorerActionUpload">📤 Upload</div>
          </template>
          <template v-else>
            <div class="menu-item highlight" @click="handleOpenInWebview">👁️ OPEN_IN_WEBVIEW</div>
            <div class="menu-item" @click="explorerActionDump">📟 DUMP_TO_TERMINAL</div>
            <div class="menu-item" @click="handleQuickEdit">📝 QUICK_EDIT</div>
            <div class="menu-divider"></div>
            <div class="menu-item" @click="handleExplorerDownload">📥 Download</div>
            <div class="menu-item" @click="handlePreviewAction">👁️ Preview</div>
            <div class="menu-divider"></div>
            <div class="menu-item danger" @click="explorerActionDelete">🗑️ Delete</div>
          </template>
        </div>

        <div v-if="showPreviewModal" class="modal-overlay preview-overlay" @contextmenu.prevent @click.self="closePreview">
          <div class="preview-card cyber-card">
            <header class="preview-header">
              <span class="title">👁️ PREVIEWING: {{ previewFileName }}</span>
              <button class="close-btn" @click="closePreview">✕</button>
            </header>
            <div class="preview-body scroller">
              <pre class="preview-text">{{ previewContent }}</pre>
            </div>
          </div>
        </div>

        <div v-if="showMorseMacro" class="context-menu" :style="{ top: menuY + 'px', left: menuX + 'px' }">
          <header class="menu-header">QUICK MACROS</header>
          <div v-for="m in activeMacros" :key="m.name" class="menu-item" @click="runMacro(m.cmd)">⚡ {{ m.name }}</div>
        </div>

        <div v-if="showPrivilegeMenu" class="context-menu" :style="{ top: privilegeMenuY + 'px', left: privilegeMenuX + 'px' }">
          <header class="menu-header">CYBER PRIVILEGE: {{ privilegeModule.toUpperCase() }}</header>
          <div class="menu-item">🛠️ Deep Diagnostic</div>
          <div class="menu-item">🛡️ Secure Isolation</div>
          <div class="menu-item highlight">☢️ Core Override</div>
        </div>

        <div v-if="showSkillSettings" class="modal-overlay" @contextmenu.prevent @click.self="showSkillSettings = false">
          <div class="auth-card cyber-card">
            <h2 class="cyber-title">SKILL_CONFIG: {{ selectedSkill?.name }}</h2>
            <div class="skill-form">
              <label class="label">RPC_COMMAND</label>
              <input v-model="selectedSkill.rpc" class="cyber-input" />
              <label class="label">DESCRIPTION</label>
              <textarea v-model="selectedSkill.description" class="cyber-input" rows="3"></textarea>
            </div>
            <button @click="showSkillSettings = false" class="btn-primary">APPLY</button>
          </div>
        </div>

        <!-- Matrix Allocator Entry Point -->
        <div class="workspace-body">
          <MatrixAllocator :sharedProps="sharedProps"
                           @switch-tab="bringToForeground($event)"
                           @switch-tab-secondary="activeTabIdSecondary = $event"
                           @proc-context="onTerminalContextMenu($event)"                           @terminal-context="onTerminalContextMenu($event)"
                           @run-skill="runSkill($event)"
                           @fast-access="onFastAccess($event)"
                           @explorer-context="onExplorerContextMenu($event)"
                           @resize-sftp-start="handleResizeSFTP($event)"
                           @view-changed="handleSidebarViewRevert($event)"
                           @switch-web="activeWebviewId = $event"
                           @web-context="onWebContextMenu($event)"
                           @skill-context="onSkillContextMenu($event)"
                           @header-context="onHeaderContextMenu($event)"
                           @path-updated="handleEditorPathUpdate($event)"
                           @open-trigger-settings="globalState.showSettings = true"
                           @cycle-health-mode="cycleHealthMode()"
                           @resize-charts="resizeCharts()"
                           @open-vault-entry="handleVaultEntry($event)"
                           @close-tab="closeTab($event)"
                           @new-tab="createNewTab()"
                           @toggle-split="toggleSplit()" />
        </div>

        <footer class="status-bar">
          <div class="status-left">
            <button class="status-btn sidebar-toggle" 
                    @click.stop="globalState.isSidebarOpen = !globalState.isSidebarOpen"
                    @contextmenu.prevent.stop="onTerminalContextMenu({ e: $event, id: 'SIDEBAR_CONTROL', type: 'sidebar-menu' })">
              {{ globalState.isSidebarOpen ? 'SIDE_HIDE' : 'SIDE_SHOW' }}
            </button>
            <span class="status-sep">|</span>
            <button class="status-btn core-btn" 
                    @click="globalState.showNetworkMatrix = true"
                    @contextmenu.prevent.stop="onTerminalContextMenu({ e: $event, id: 'NODE_GROUP', type: 'node-group' })">
              {{globalState.host}}_CORE
            </button>
          </div>

          <div class="hotkey-bar">
            <button class="status-btn modifier" 
                    @click="activeTabId && terminalTabs.find(t => t.id === activeTabId)?.viewType === 'terminal' && invoke('write_pty', { tabId: activeTabId, data: '\t' })"
                    @contextmenu.prevent.stop="onTerminalContextMenu({ e: $event, id: 'KEY_CONTROL', type: 'key-menu' })">TAB</button>
            <button class="status-btn modifier" 
                    :class="{ 'active': isCtrlPressed }" 
                    @click="isCtrlPressed = !isCtrlPressed"
                    @contextmenu.prevent.stop="onTerminalContextMenu({ e: $event, id: 'KEY_CONTROL', type: 'key-menu' })">CTRL</button>
            <button class="status-btn modifier" 
                    @click="activeTabId && terminalTabs.find(t => t.id === activeTabId)?.viewType === 'terminal' && invoke('write_pty', { tabId: activeTabId, data: '\x03' })"
                    @contextmenu.prevent.stop="onTerminalContextMenu({ e: $event, id: 'KEY_CONTROL', type: 'key-menu' })">C-C</button>
            <button class="status-btn modifier" 
                    @click="activeTabId && terminalTabs.find(t => t.id === activeTabId)?.viewType === 'terminal' && invoke('write_pty', { tabId: activeTabId, data: '\x1b' })"
                    @contextmenu.prevent.stop="onTerminalContextMenu({ e: $event, id: 'KEY_CONTROL', type: 'key-menu' })">ESC</button>
          </div>

          <div class="status-right">
            <button class="status-btn" 
                    :class="{ 'active': globalState.isSafeMode }" 
                    @click="storeActions.toggleSafeMode(!globalState.isSafeMode)"
                    @contextmenu.prevent.stop="onTerminalContextMenu({ e: $event, id: 'RENDER_CONTROL', type: 'render-menu' })">
              {{ globalState.isSafeMode ? 'SAFE_MODE: ON' : 'SAFE_MODE: OFF' }}
            </button>
            <span class="status-sep">|</span>
            <button class="status-btn" 
                    :class="{ 'clip-flash': isClipFlashing }" 
                    @click="copyLatestAI"
                    @contextmenu.prevent.stop="onTerminalContextMenu({ e: $event, id: 'CLIP_CONTROL', type: 'clip-menu' })">
              CLIP:{{ globalState.activeClipMode.toUpperCase().substring(0, 4) }}
            </button>
            <span class="status-sep">|</span>
            <button class="status-btn" 
                    @click="captureAndUpload(false)"
                    @contextmenu.prevent.stop="onTerminalContextMenu({ e: $event, id: 'AUDIT_CONTROL', type: 'audit-menu' })">AUDIT</button>
            <span class="status-sep">|</span>
            <button class="status-btn" 
                    @click="globalState.showQuantumAudit = true"
                    @contextmenu.prevent.stop="onTerminalContextMenu({ e: $event, id: 'QUANTUM_CONTROL', type: 'quantum-menu' })">
              SCAN
            </button>
            <span class="status-sep">|</span>
            <button class="status-btn nexus-btn" 
                    :class="{ 'active': globalState.showNexus }"
                    @click="globalState.showNexus = !globalState.showNexus">
              NEXUS
            </button>
            <span class="status-sep">|</span>
            <button class="status-btn web-toggle" 
                    :class="{ 'active': globalState.useNativeWebview }" 
                    @click="globalState.useNativeWebview = !globalState.useNativeWebview; localStorage.setItem('ter_use_native_webview', globalState.useNativeWebview.toString())"
                    @contextmenu.prevent.stop="onTerminalContextMenu({ e: $event, id: 'RENDER_CONTROL', type: 'render-menu' })">
              WEB_ENGINE: {{ globalState.useNativeWebview ? 'NATIVE' : 'IFRAME' }}
            </button>
            <span class="status-sep">|</span>
            <button class="status-btn auto-toggle" 
                    :class="{ 'active': isAutoPilot }" 
                    @click="isAutoPilot = !isAutoPilot"
                    @contextmenu.prevent.stop="onTerminalContextMenu({ e: $event, id: 'SYNC_CONTROL', type: 'sync-menu' })">
              AUTO_SYNC: {{ isAutoPilot ? 'ON' : 'OFF' }}
            </button>
            <span class="status-sep">|</span>
            <button class="status-btn" 
                    @click="globalState.showSettings = true"
                    @contextmenu.prevent.stop="onTerminalContextMenu({ e: $event, id: 'SETTINGS_CONTROL', type: 'settings-menu' })">SETTINGS</button>
            <span class="status-sep">|</span>
            <button class="status-btn lock-btn" 
                    :class="{ 'active': globalState.isLocked }" 
                    @click="globalState.isLocked = !globalState.isLocked"
                    @contextmenu.prevent.stop="onTerminalContextMenu({ e: $event, id: 'LOCK_CONTROL', type: 'lock-menu' })">SYS_LOCK</button>
          </div>
        </footer>
      </main>
    </div>
    <MatrixScreen :isLocked="globalState.isLocked" :logs="backendLogs" :cpuUsage="currentCpuUsage ?? 0" @unlock="globalState.isLocked = false" />
    <NetworkMatrix v-if="globalState.showNetworkMatrix" :activeId="globalState.activeServerId" :activeTabId="activeTabId" @close="globalState.showNetworkMatrix = false" />
    <QuantumInspector :isOpen="globalState.showQuantumAudit" @close="globalState.showQuantumAudit = false" />
    <CyberNexus :isOpen="globalState.showNexus" @close="globalState.showNexus = false" />
    <CyberCursor />
  </div>
</template>

<style scoped>
.app-shell { 
  height: 100vh; 
  width: 100vw; 
  background: #000; 
  color: #d4d4d8; 
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  overflow: hidden; 
  display: flex; 
  flex-direction: column; 
}

.app-shell.cyber-cursor-active,
.app-shell.cyber-cursor-active :deep(*) {
  cursor: none !important;
}

/* Monospace zones for technical clarity */
.app-shell :deep(.terminal-pane), 
.app-shell :deep(.logs-container), 
.app-shell :deep(.log-stream-static),
.app-shell :deep(.preview-text),
.app-shell :deep(.cyber-input),
.app-shell :deep(.address-bar-input),
.app-shell :deep(.branding-text),
.app-shell :deep(.status-btn),
.app-shell :deep(.status-item) {
  font-family: 'JetBrains Mono', 'Fira Code', 'Ubuntu Mono', monospace !important;
}

.main-view { display: flex; flex: 1; height: 100%; width: 100%; overflow: hidden; position: relative; }

:deep(.side-bar) {
  width: 100%;
  flex-shrink: 0;
  transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1), padding 0.2s ease, opacity 0.2s ease;
  overflow: hidden;
}

.app-shell :deep(.module) {
  border-radius: calc(6px * var(--ter-ui-scale));
  overflow: hidden;
}

:deep(.side-bar.collapsed) {
  width: 0 !important;
  min-width: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  border: none !important;
  opacity: 0;
  pointer-events: none;
}

.workspace { 
  flex: 1; 
  display: flex; 
  flex-direction: column; 
  background: #000; 
  overflow: hidden; 
  position: relative; 
  height: 100%;
  min-width: 0;
  width: 100%;
}
.workspace-body { flex: 1; display: flex; overflow: hidden; position: relative; width: 100%; }
.terminal-pane { flex: 1; height: 100%; min-width: 0; display: flex; flex-direction: column; overflow: hidden; background: #000; }
.cyber-pane { width: calc(420px * var(--ter-ui-scale)); height: 100%; border-left: 1px solid #27272a; display: none; flex-direction: column; background: #000; }
.cyber-pane.open { display: flex; }
.cyber-container { display: flex; flex-direction: column; height: 100%; }
.cyber-logs-view { flex: 0 0 30%; border-bottom: 1px solid #27272a; overflow: hidden; display: flex; flex-direction: column; }
.cyber-logs-view header { padding: calc(5px * var(--ter-ui-scale)) calc(10px * var(--ter-ui-scale)); font-size: calc(11px * var(--ter-ui-scale)); color: #71717a; border-bottom: 1px solid #18181b; letter-spacing: 0.5px; }
.logs-container { flex: 1; overflow-y: auto; padding: calc(10px * var(--ter-ui-scale)); font-size: calc(11px * var(--ter-ui-scale)); color: #a1a1aa; }
.cyber-webview-wrapper { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.webview-address-bar { padding: calc(5px * var(--ter-ui-scale)); background: #09090b; border-bottom: 1px solid #27272a; display: flex; gap: calc(5px * var(--ter-ui-scale)); }
.address-bar-input { flex: 1; background: #000; border: 1px solid #27272a; color: #22c55e; padding: 2px 8px; font-size: calc(11px * var(--ter-ui-scale)); outline: none; border-radius: 4px; }
.refresh-btn { background: #18181b; border: 1px solid #27272a; color: #22c55e; cursor: pointer; padding: 0 calc(8px * var(--ter-ui-scale)); border-radius: 4px; }

/* v2.11.43: Bookmarks Bar Styles */
.bookmarks-bar { display: flex; gap: calc(8px * var(--ter-ui-scale)); padding: calc(4px * var(--ter-ui-scale)) calc(8px * var(--ter-ui-scale)); background: #000; border-bottom: 1px solid #18181b; overflow-x: auto; scrollbar-width: none; }
.bookmarks-bar::-webkit-scrollbar { display: none; }
.bookmark-item { font-size: calc(9px * var(--ter-ui-scale)); color: #a1a1aa; padding: 2px 8px; border: 1px solid rgba(113, 113, 122, 0.5); border-radius: 4px; cursor: pointer; white-space: nowrap; transition: all 0.25s ease; background: rgba(24, 24, 27, 0.5); }
.bookmark-item:hover { color: #22c55e; border-color: #22c55e; background: rgba(34, 197, 94, 0.1); box-shadow: 0 0 calc(10px * var(--ter-ui-scale)) rgba(34, 197, 94, 0.3); transform: translateY(-1px); }

.safe-mode-placeholder { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #09090b; color: #71717a; gap: calc(15px * var(--ter-ui-scale)); font-family: 'JetBrains Mono', monospace; }
.safe-mode-placeholder .icon { font-size: calc(32px * var(--ter-ui-scale)); }
.safe-mode-placeholder .msg { font-size: calc(12px * var(--ter-ui-scale)); letter-spacing: 1px; }
.safe-mode-placeholder .os-browser-btn { background: #18181b; border: 1px solid #27272a; color: #22c55e; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: calc(11px * var(--ter-ui-scale)); }

.engine-indicator { 
  font-size: calc(9px * var(--ter-ui-scale)); 
  padding: 2px 6px; 
  border-radius: 4px; 
  background: #18181b; 
  color: #71717a; 
  border: 1px solid #27272a;
  white-space: nowrap;
  display: flex;
  align-items: center;
}
.engine-indicator.native { color: #a855f7; border-color: rgba(168, 85, 247, 0.4); }

.clip-flash {
  color: #00ff9d !important;
  text-shadow: 0 0 calc(8px * var(--ter-ui-scale)) #00ff9d !important;
  transform: scale(1.1);
}

.status-bar { 
  height: calc(var(--ter-status-bar-height) * var(--ter-ui-scale)); 
  background: #09090b; 
  border-top: 1px solid #18181b; 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  padding: 0 calc(12px * var(--ter-ui-scale)); 
  font-size: calc(11px * var(--ter-ui-scale)); 
  flex-shrink: 0; 
  z-index: 10000; /* v2.17.24: Standardized */
  text-transform: uppercase;
  letter-spacing: 1px;
}

.status-left, .status-right, .hotkey-bar { display: flex; align-items: center; gap: calc(8px * var(--ter-ui-scale)); }
.status-sep { color: #27272a; font-size: calc(10px * var(--ter-ui-scale)); margin: 0 calc(4px * var(--ter-ui-scale)); pointer-events: none; }

.pulse-dot {
  margin-right: calc(6px * var(--ter-ui-scale));
  color: #22c55e;
  transition: all 0.3s;
  font-size: 1.2em;
}
.pulse-dot.flashing {
  animation: pulse-green 1s infinite;
}
.pulse-dot.offline {
  color: #ef4444;
}
@keyframes pulse-green {
  0% { transform: scale(1); opacity: 1; text-shadow: 0 0 0px #22c55e; }
  50% { transform: scale(1.2); opacity: 0.7; text-shadow: 0 0 8px #22c55e; }
  100% { transform: scale(1); opacity: 1; text-shadow: 0 0 0px #22c55e; }
}

.status-btn { 
  background: transparent; 
  border: none; 
  color: #52525b; 
  cursor: pointer; 
  padding: calc(4px * var(--ter-ui-scale)) calc(8px * var(--ter-ui-scale)); 
  font-family: 'JetBrains Mono', monospace !important;
  font-size: calc(11px * var(--ter-ui-scale));
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  border-radius: 4px;
}

.status-btn:hover { color: #fff; transform: scale(1.05); }
.status-btn.active { color: #fff; text-shadow: 0 0 calc(4px * var(--ter-ui-scale)) currentColor; animation: breathe 2s infinite ease-in-out; }

.morse-preview {
  position: absolute;
  top: calc(-18px * var(--ter-ui-scale));
  left: 50%;
  transform: translateX(-50%);
  background: #22c55e;
  color: #000;
  padding: calc(1px * var(--ter-ui-scale)) calc(4px * var(--ter-ui-scale));
  border-radius: 2px;
  font-size: calc(9px * var(--ter-ui-scale));
  font-weight: bold;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}
.core-btn:hover .morse-preview { opacity: 1; }

.web-toggle.active { color: #3b82f6; text-shadow: 0 0 calc(5px * var(--ter-ui-scale)) rgba(59, 130, 246, 0.5); }
.auto-toggle.active { color: #a855f7; text-shadow: 0 0 calc(5px * var(--ter-ui-scale)) rgba(168, 85, 247, 0.5); }
.modifier.active { color: #a855f7; background: rgba(168, 85, 247, 0.1); border: 1px solid rgba(168, 85, 247, 0.2); }
.lock-btn:hover { color: #ef4444 !important; text-shadow: 0 0 calc(5px * var(--ter-ui-scale)) rgba(239, 68, 68, 0.5); }

@keyframes breathe {
  0%, 100% { opacity: 1; filter: brightness(1); }
  50% { opacity: 0.7; filter: brightness(1.3); }
}

.context-menu { 
  position: fixed !important; 
  z-index: 200000 !important; /* v2.17.24: Standardized */
  background: rgba(9, 9, 11, 0.95) !important; 
  backdrop-filter: blur(10px);
  border: 1px solid #22c55e !important; 
  padding: calc(15px * var(--ter-ui-scale)) !important; 
  box-shadow: 0 0 calc(20px * var(--ter-ui-scale)) rgba(34, 197, 94, 0.3) !important; 
  border-radius: 6px !important; 
}
.menu-header { padding: calc(4px * var(--ter-ui-scale)) calc(8px * var(--ter-ui-scale)); font-size: calc(10px * var(--ter-ui-scale)); color: #166534; border-bottom: 1px solid #18181b; margin-bottom: calc(4px * var(--ter-ui-scale)); letter-spacing: 0.5px; }
.menu-item { padding: calc(6px * var(--ter-ui-scale)) calc(12px * var(--ter-ui-scale)); font-size: calc(12px * var(--ter-ui-scale)); cursor: pointer; color: #d4d4d8; border-radius: 4px; margin-bottom: 1px; }
.menu-item:hover { background: #22c55e; color: #000; }
.menu-item.active-item {
  color: #22c55e !important;
  border-left: 2px solid #22c55e;
  padding-left: calc(10px * var(--ter-ui-scale)) !important;
  background: rgba(34, 197, 94, 0.05);
}
.menu-item.danger { color: #ef4444; }
.menu-item.danger:hover { background: #ef4444; color: #000; }
.menu-divider { height: 1px; background: #18181b; margin: calc(4px * var(--ter-ui-scale)) 0; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(5px); display: flex; align-items: center; justify-content: center; z-index: 100000; }
.cyber-card { background: #09090b; border: 1px solid #22c55e; padding: calc(30px * var(--ter-ui-scale)); min-width: calc(400px * var(--ter-ui-scale)); box-shadow: 0 0 calc(30px * var(--ter-ui-scale)) rgba(34, 197, 94, 0.2); border-radius: 8px; }
.cyber-title { color: #22c55e; font-size: calc(18px * var(--ter-ui-scale)); letter-spacing: 2px; margin-bottom: calc(15px * var(--ter-ui-scale)); }
.skill-form { display: flex; flex-direction: column; gap: calc(10px * var(--ter-ui-scale)); }
.label { font-size: calc(10px * var(--ter-ui-scale)); color: #71717a; text-transform: uppercase; }
.cyber-input { background: #000; border: 1px solid #27272a; color: #22c55e; padding: calc(8px * var(--ter-ui-scale)); font-size: calc(12px * var(--ter-ui-scale)); outline: none; width: 100%; border-radius: 4px; }
.btn-primary { background: #22c55e; color: #000; border: none; padding: calc(10px * var(--ter-ui-scale)); font-weight: bold; cursor: pointer; margin-top: calc(15px * var(--ter-ui-scale)); border-radius: 4px; font-size: calc(12px * var(--ter-ui-scale)); }

.preview-overlay { z-index: 100001; background: rgba(0, 0, 0, 0.9); backdrop-filter: blur(15px); }
.preview-card { width: 80vw; height: 80vh; max-width: 1000px; display: flex; flex-direction: column; padding: 0; overflow: hidden; border-color: #3b82f6; box-shadow: 0 0 calc(40px * var(--ter-ui-scale)) rgba(59, 130, 246, 0.2); }
.preview-header { display: flex; justify-content: space-between; align-items: center; padding: calc(15px * var(--ter-ui-scale)) calc(20px * var(--ter-ui-scale)); background: rgba(59, 130, 246, 0.1); border-bottom: 1px solid rgba(59, 130, 246, 0.2); }
.preview-header .title { font-size: calc(12px * var(--ter-ui-scale)); font-family: 'JetBrains Mono', monospace; color: #3b82f6; letter-spacing: 1px; }
.preview-header .close-btn { background: transparent; border: none; color: #71717a; cursor: pointer; font-size: calc(18px * var(--ter-ui-scale)); }
.preview-header .close-btn:hover { color: #fff; }
.preview-body { flex: 1; padding: calc(20px * var(--ter-ui-scale)); overflow: auto; background: #000; }
.preview-text { margin: 0; font-family: 'JetBrains Mono', monospace; font-size: calc(13px * var(--ter-ui-scale)); color: #d4d4d8; line-height: 1.6; white-space: pre-wrap; word-break: break-all; }

.app-shell :deep(.tab-item) { font-size: calc(12px * var(--ter-ui-scale)); letter-spacing: 0.5px; border-radius: 4px 4px 0 0; }
.app-shell :deep(.name), .app-shell :deep(.file-name) { font-size: calc(12px * var(--ter-ui-scale)); }
.app-shell :deep(.header-with-action) { font-size: calc(11px * var(--ter-ui-scale)); letter-spacing: 0.5px; }

.app-shell.safe-mode :deep(*) {
  text-shadow: none !important;
  box-shadow: none !important;
  animation: none !important;
  backdrop-filter: none !important;
  transition: none !important;
}
.app-shell.safe-mode :deep(.scanline) { display: none !important; }

.webview-container.grid-layout {
  display: grid !important;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 2px;
  background: #18181b !important;
}
.grid-slot { border: 1px solid #27272a; overflow: hidden; background: #000; }
</style>
