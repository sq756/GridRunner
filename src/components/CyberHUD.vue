<script setup lang="ts">
import { computed, ref, watch, onMounted, watchEffect } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { globalState, backendLogs, webviewInstances, activeWebviewId, activeTabId, storeActions } from '../store';
import { useCyber } from '../composables/useCyber';
import CyberWebview from './CyberWebview.vue';

const props = defineProps<{
  zoneId: string;
}>();

const isSwitchingProtocol = ref(false);
const showProtocolMenu = ref(false);
const protocolMenuPos = ref({ x: 0, y: 0 });

const handleReconnect = async () => {
  if (!globalState.activeServerId) {
    storeActions.pushLog('[WARN] No active server ID to reconnect to.');
    return;
  }

  isSwitchingProtocol.value = true;
  
  // v2.18.0: Protocol-Aware Intelligent Reconnection
  if (globalState.isConnected && globalState.currentAgentPort) {
    const nextProtocol = globalState.connectionMetrics.protocol === 'SSH/TCP' ? 'WS' : 'QUIC';
    storeActions.pushLog(`[SYSTEM] Initiating Protocol Transition to ${nextProtocol}...`);
    
    try {
      if (nextProtocol === 'WS') {
        await invoke('upgrade_transport', { 
          url: `ws://${globalState.host}:${globalState.currentAgentPort}`, 
          token: globalState.agentToken 
        });
      } else {
        // QUIC uses specific port (usually HTTP port + 1)
        await invoke('upgrade_transport', { 
          url: `quic://${globalState.host}:${globalState.currentAgentPort + 1}`, 
          token: globalState.agentToken 
        });
      }
      storeActions.pushLog(`[SUCCESS] Kernel synchronized via ${nextProtocol}.`);
      isSwitchingProtocol.value = false;
      return;
    } catch (e) {
      storeActions.pushLog(`[INFO] Transition failed: ${e}.`);
    }
  }

  storeActions.pushLog('[SYSTEM] Emergency Link Restoration initiated...');
  try {
    await invoke('connect_with_id', { id: globalState.activeServerId });
    storeActions.pushLog('[SUCCESS] Remote link restored.');
  } catch (e) {
    storeActions.pushLog(`[ERROR] Critical Link Failure: ${e}`);
  } finally {
    isSwitchingProtocol.value = false;
  }
};

const onProtocolContextMenu = (e: MouseEvent) => {
  e.preventDefault();
  protocolMenuPos.value = { x: e.clientX, y: e.clientY };
  showProtocolMenu.value = true;
};

const forceSwitchProtocol = async (p: 'SSH' | 'WS' | 'QUIC') => {
  showProtocolMenu.value = false;
  isSwitchingProtocol.value = true;
  try {
    if (p === 'SSH') {
      await invoke('connect_with_id', { id: globalState.activeServerId });
    } else {
      const port = globalState.currentAgentPort || 34567;
      const url = p === 'WS' ? `ws://${globalState.host}:${port}` : `quic://${globalState.host}:${port + 1}`;
      await invoke('upgrade_transport', { url, token: globalState.agentToken });
    }
    storeActions.pushLog(`[SYSTEM] Forced protocol switch to ${p} complete.`);
  } catch (e) {
    storeActions.pushLog(`[ERROR] Forced switch to ${p} failed: ${e}`);
  } finally {
    isSwitchingProtocol.value = false;
  }
};

const tacticalLogs = computed(() => backendLogs.value.slice(-50));

const getLogColor = (log: string) => {
  if (log.includes('[ERROR]')) return '#ef4444';
  if (log.includes('[SYSTEM]') || log.includes('[STATUS]')) return '#22c55e';
  if (log.includes('[DEBUG]') || log.includes('[INFO]')) return '#888888';
  if (log.includes('AI') || log.includes('Reasoning')) return '#a855f7';
  return '#a1a1aa';
};

// v2.15.3: Instance Ownership
const ownedInstanceId = computed(() => `web-${props.zoneId.toLowerCase()}`);

const currentInstance = ref<any>(null);

watchEffect(() => {
  const targetId = ownedInstanceId.value;
  let inst = webviewInstances.value.find(w => w.id === targetId);
  if (!inst && webviewInstances.value.length > 0) {
    inst = webviewInstances.value[0];
  }
  currentInstance.value = inst;
});

const updateWebviewUrl = (id: string, url: string) => {
  const instance = webviewInstances.value.find(w => w.id === id);
  if (instance) instance.url = url;
};

const {
  previewUrl, isWebviewLoading, refreshWebview, handleScrapeData, onDomExtracted, disableTunnel, useNativeWebview
} = useCyber(activeTabId, backendLogs, ownedInstanceId, updateWebviewUrl);

// Sync local previewUrl with instance url when instance changes
// Bug 2 Fix: Only sync when user is NOT actively typing in the address bar
watch(() => currentInstance.value?.url, (newUrl) => {
  if (newUrl && newUrl !== previewUrl.value && !isUserTypingUrl.value) {
    console.log(`[CyberHUD:${props.zoneId}] Syncing previewUrl to:`, newUrl);
    previewUrl.value = newUrl;
  }
}, { immediate: true });

onMounted(() => {
  const targetId = ownedInstanceId.value;
  console.log(`[CyberHUD:${props.zoneId}] Mounting. Ensuring instance.`);
  
  if (webviewInstances.value.length === 0) {
    webviewInstances.value.push({
      id: targetId,
      title: `Web Deck [${props.zoneId}]`,
      url: 'http://localhost:5173',
      isActive: true
    });
  }
});

const showLogs = ref(true);
const showGridMenu = ref(false);
const gridMenuPos = ref({ x: 0, y: 0 });

// Bug 2 Fix: Track whether user is actively typing in the address bar
const isUserTypingUrl = ref(false);

// Bug 3 Fix: Add new webview instance
const addWebviewInstance = () => {
  const id = `web-${Math.random().toString(36).substr(2, 9)}`;
  webviewInstances.value.push({ id, title: 'New Page', url: 'https://google.com', isActive: true });
  activeWebviewId.value = id;
  previewUrl.value = 'https://google.com';
};

const toggleWebEngine = () => {
  storeActions.setNativeWebview(!globalState.useNativeWebview);
};

const onGridContextMenu = (e: MouseEvent) => {
  e.preventDefault();
  gridMenuPos.value = { x: e.clientX, y: e.clientY };
  showGridMenu.value = true;
};

const setGridLayout = (r: number, c: number) => {
  globalState.gridLayout.rows = r;
  globalState.gridLayout.cols = c;
  showGridMenu.value = false;
};

const getSlotStyle = (idx: number) => {
  if (!globalState.gridMode) return { width: '100%', height: '100%' };
  const rows = globalState.gridLayout.rows;
  const cols = globalState.gridLayout.cols;
  
  // Fill order: row by row
  const r = Math.floor(idx / cols) + 1;
  const c = (idx % cols) + 1;
  
  // If we have more instances than grid cells, hide them
  if (r > rows) return { display: 'none' };

  return {
    gridRow: r,
    gridColumn: c,
    width: '100%',
    height: '100%',
    position: 'relative'
  };
};
</script>

<template>
  <div class="cyber-hud-container">
    <div v-if="showLogs" class="cyber-logs-view">
      <header @click="showLogs = false" style="cursor: pointer;" title="Click to Collapse Logs">
        <span class="title">Cyber Logs (HUD) [CLOSE]</span>
      </header>
      <div class="logs-container">
        <div v-for="(log, i) in tacticalLogs" :key="i" class="log-line" :style="{ color: getLogColor(log) }">
          {{ log }}
        </div>
      </div>
    </div>
    <div v-else class="logs-collapsed-bar" @click="showLogs = true" title="Click to Expand Logs">
      <span>LOGS_COLLAPSED [EXPAND]</span>
    </div>
    <div class="cyber-webview-wrapper">
      <nav class="webview-address-bar">
        <div class="engine-indicator" 
             :class="{ 'native': globalState.useNativeWebview }" 
             @click="toggleWebEngine" 
             style="cursor: pointer;" 
             title="Click to Switch Engine (Native/Iframe)">
          {{ globalState.useNativeWebview ? '⚡ Native' : '🐢 Iframe' }}
        </div>

        <!-- v2.18.0: Kernel Diagnostic Light (Interactive Button) -->
        <div class="kernel-diagnostic-light" 
             style="cursor: pointer;"
             @click="handleReconnect"
             @contextmenu="onProtocolContextMenu"
             :class="{ 
               'is-direct': globalState.connectionMetrics.isDirect,
               'is-switching': isSwitchingProtocol 
             }"
             :title="`PROTOCOL: ${globalState.connectionMetrics.protocol}\nLATENCY: ${globalState.connectionMetrics.latency}ms\n\nLEFT CLICK: Smart Upgrade\nRIGHT CLICK: Force Select` ">
          <div class="status-dot" :class="{ 
            'direct': globalState.connectionMetrics.isDirect && !isSwitchingProtocol,
            'relay': globalState.connectionMetrics.relay && !isSwitchingProtocol,
            'ssh': globalState.connectionMetrics.protocol === 'SSH/TCP' && !isSwitchingProtocol,
            'syncing': isSwitchingProtocol
          }"></div>
          <span class="metrics-label">
            <template v-if="isSwitchingProtocol">SYNCING_KERNEL...</template>
            <template v-else>
              <span v-if="globalState.connectionMetrics.isDirect" class="direct-tag">● DIRECT</span>
              <span v-else-if="globalState.connectionMetrics.relay" class="relay-tag">▲ RELAY</span>
              {{ globalState.connectionMetrics.protocol }} 
              <span class="latency" v-if="globalState.connectionMetrics.latency > 0">
                {{ globalState.connectionMetrics.latency }}ms
              </span>
            </template>
          </span>
        </div>

        <input v-model="previewUrl" 
               @focus="isUserTypingUrl = true"
               @blur="isUserTypingUrl = false"
               @keyup.enter="isUserTypingUrl = false; refreshWebview(previewUrl)" 
               class="address-bar-input" />
        <button @click="refreshWebview(previewUrl)" class="refresh-btn">⚡</button>
        <button @click="addWebviewInstance" class="refresh-btn" title="Add New Web Page (+)">＋</button>
        <button @click="handleScrapeData()" class="refresh-btn" title="Scrape Page Content (h3)">📊</button>
        <button v-if="!showLogs" @click="showLogs = true" class="refresh-btn" title="Show Logs">📖</button>
        <button @click="globalState.gridMode = !globalState.gridMode" 
                @contextmenu="onGridContextMenu"
                class="refresh-btn" 
                :title="globalState.gridMode ? 'Exit Grid Mode' : 'Enter Grid Mode (Right Click for Layouts)'" 
                :style="{ color: globalState.gridMode ? '#3b82f6' : '#71717a' }">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
        </button>
        <button @click="disableTunnel = !disableTunnel" class="refresh-btn" :title="disableTunnel ? 'Enable Remote Tunnel' : 'Disable Remote Tunnel'" :style="{ color: disableTunnel ? '#ef4444' : '#22c55e' }">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5"></path><rect x="5" y="11" width="14" height="10" rx="2"></rect><circle cx="12" cy="16" r="1"></circle></svg>
        </button>
      </nav>

      <div class="webview-container" 
           :class="{ 'grid-layout': globalState.gridMode }"
           :style="globalState.gridMode ? { 
             display: 'grid', 
             gridTemplateColumns: `repeat(${globalState.gridLayout.cols}, 1fr)`,
             gridTemplateRows: `repeat(${globalState.gridLayout.rows}, 1fr)`,
             gap: '2px',
             flex: 1,
             minHeight: 0
           } : { 
             display: 'flex', 
             flexDirection: 'column',
             flex: 1,
             minHeight: 0,
             height: '100%'
           }">
         
         <!-- v2.15.46: Intelligent Multi-Instance Rendering -->
         <template v-if="globalState.gridMode">
           <div v-for="(inst, idx) in webviewInstances" 
                :key="inst.id" 
                :style="getSlotStyle(idx)"
                class="grid-slot">
             <CyberWebview
               :id="inst.id"
               :url="inst.url"
               :isActive="true"
               :isSafeMode="globalState.isSafeMode"
               :zoneId="zoneId"
               @dom-extracted="onDomExtracted"
             />
           </div>
         </template>

         <template v-else-if="useNativeWebview && !globalState.isSafeMode">
           <div v-if="currentInstance" class="grid-slot" style="width: 100%; height: 100%; position: relative;">
             <CyberWebview
               :id="currentInstance.id"
               :url="currentInstance.url"
               :isActive="true"
               :isSafeMode="globalState.isSafeMode"
               :zoneId="zoneId"
               :hide-header="true"
               @dom-extracted="onDomExtracted"
             />
           </div>
         </template>
         <div v-else-if="globalState.isSafeMode" class="safe-mode-placeholder">
           <span class="icon">🛡️</span>
           <div class="msg">WEB_ENGINE_DISABLED_IN_SAFE_MODE</div>
           <button class="os-browser-btn" @click="storeActions.toggleSafeMode(false)">DISABLE_SAFE_MODE</button>
         </div>
         <iframe v-else :src="previewUrl" class="cyber-iframe" frameborder="0" style="flex: 1; width: 100%; height: 100%; background: #ffffff; border: none;"></iframe>
      </div>
    </div>

    <!-- v2.15.47: Grid Layout Context Menu -->
    <div v-if="showGridMenu" 
         class="grid-context-menu" 
         :style="{ top: gridMenuPos.y + 'px', left: gridMenuPos.x + 'px' }"
         @click="showGridMenu = false">
      <header>GRID_LAYOUT_PRESETS</header>
      <div class="menu-item" @click="setGridLayout(2, 3)">2 x 3 (Classic)</div>
      <div class="menu-item" @click="setGridLayout(3, 3)">3 x 3 (Standard)</div>
      <div class="menu-item" @click="setGridLayout(3, 4)">3 x 4 (Tall)</div>
      <div class="menu-item" @click="setGridLayout(4, 4)">4 x 4 (Dense)</div>
      <div class="menu-separator"></div>
      <div class="menu-item disabled">CUSTOM_LAYOUT...</div>
    </div>

    <!-- v2.18.0: Protocol Control Menu -->
    <div v-if="showProtocolMenu" 
         class="grid-context-menu protocol-menu" 
         :style="{ top: protocolMenuPos.y + 'px', left: protocolMenuPos.x + 'px' }"
         v-on-click-outside="() => showProtocolMenu = false">
      <header>KERNEL_PROTOCOL_CONTROL</header>
      <div class="menu-item" @click="forceSwitchProtocol('SSH')">
        <span class="p-icon">🔒</span> FORCE_SSH (TCP/22)
      </div>
      <div class="menu-item" @click="forceSwitchProtocol('WS')" :class="{ 'disabled': !globalState.currentAgentPort }">
        <span class="p-icon">🌐</span> UPGRADE_WS (TCP/WSS)
      </div>
      <div class="menu-item" @click="forceSwitchProtocol('QUIC')" :class="{ 'disabled': !globalState.currentAgentPort }">
        <span class="p-icon">⚡</span> ACTIVATE_QUIC (UDP/QUIC)
      </div>
      <div class="menu-separator"></div>
      <div class="menu-info">AGENT_PORT: {{ globalState.currentAgentPort || 'OFFLINE' }}</div>
    </div>
    </div>
    </template>

    <style scoped>
    .protocol-menu {
    border-color: #3b82f644;
    }
    .menu-info {
    padding: 6px 12px;
    font-size: 8px;
    color: #52525b;
    text-align: right;
    }
    .p-icon { margin-right: 8px; font-size: 12px; }

    .kernel-diagnostic-light.is-switching {
    border-color: #3b82f6;
    background: rgba(59, 130, 246, 0.1);
    animation: light-glitch 0.5s infinite;
    }

    .status-dot.syncing {
    background: #3b82f6;
    box-shadow: 0 0 10px #3b82f6;
    animation: rotate-sync 1s infinite linear;
    border-radius: 2px; /* Square dot when syncing */
    }

    @keyframes rotate-sync {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
    }

    @keyframes light-glitch {
    0% { opacity: 1; }
    50% { opacity: 0.7; }
    100% { opacity: 1; }
    }

.grid-context-menu {
  position: fixed;
  z-index: 10000;
  background: #09090b;
  border: 1px solid #22c55e44;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.8);
  min-width: 160px;
  padding: 4px;
  border-radius: 4px;
}
.grid-context-menu header {
  padding: 6px 10px;
  font-size: 9px;
  color: #71717a;
  border-bottom: 1px solid #18181b;
  margin-bottom: 4px;
  font-family: 'JetBrains Mono', monospace;
}
.grid-context-menu .menu-item {
  padding: 8px 12px;
  font-size: 11px;
  color: #a1a1aa;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
}
.grid-context-menu .menu-item:hover {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}
.grid-context-menu .menu-separator {
  height: 1px;
  background: #18181b;
  margin: 4px 0;
}
.grid-context-menu .menu-item.disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.logs-collapsed-bar {
  background: #050505;
  border-bottom: 1px solid #27272a;
  padding: 4px 10px;
  font-size: 9px;
  color: #52525b;
  cursor: pointer;
  text-align: center;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 1px;
}
.logs-collapsed-bar:hover { background: #09090b; color: #22c55e; }

.cyber-hud-container { display: flex; flex-direction: column; height: 100%; width: 100%; background: #000; }
.cyber-logs-view { flex: 0 0 30%; border-bottom: 1px solid #27272a; overflow: hidden; display: flex; flex-direction: column; }
.cyber-logs-view header { padding: calc(5px * var(--ter-ui-scale)) calc(10px * var(--ter-ui-scale)); font-size: calc(11px * var(--ter-ui-scale)); color: #71717a; border-bottom: 1px solid #18181b; letter-spacing: 0.5px; }
.logs-container { flex: 1; overflow-y: auto; padding: calc(10px * var(--ter-ui-scale)); font-size: calc(11px * var(--ter-ui-scale)); color: #a1a1aa; font-family: 'JetBrains Mono', monospace; }
.cyber-webview-wrapper { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.webview-address-bar { padding: calc(5px * var(--ter-ui-scale)); background: #09090b; border-bottom: 1px solid #27272a; display: flex; gap: calc(5px * var(--ter-ui-scale)); }
.address-bar-input { flex: 1; background: #000; border: 1px solid #27272a; color: #22c55e; padding: 2px 8px; font-size: calc(11px * var(--ter-ui-scale)); outline: none; border-radius: 4px; font-family: 'JetBrains Mono', monospace; }
.refresh-btn { background: #18181b; border: 1px solid #27272a; color: #22c55e; cursor: pointer; padding: 0 calc(8px * var(--ter-ui-scale)); border-radius: 4px; }

.webview-container.grid-layout {
  display: grid !important;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 2px;
  background: #18181b !important;
}
.grid-slot { border: 1px solid #27272a; overflow: hidden; background: #000; }

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

/* v2.18.0: Kernel Diagnostic Light Styles */
.kernel-diagnostic-light {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #000;
  border: 1px solid #27272a;
  padding: 0 8px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  transition: all 0.2s ease;
}

.kernel-diagnostic-light:hover {
  border-color: #3b82f6;
  background: #18181b;
}

.kernel-diagnostic-light.is-direct {
  border-color: rgba(34, 197, 94, 0.5);
  background: rgba(34, 197, 94, 0.05);
}

.direct-tag {
  color: #22c55e;
  font-weight: bold;
  margin-right: 6px;
  text-shadow: 0 0 5px rgba(34, 197, 94, 0.4);
}

.relay-tag {
  color: #eab308;
  font-weight: bold;
  margin-right: 6px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #71717a;
}

.status-dot.direct {
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
  animation: pulse-light 2s infinite ease-in-out;
}

.status-dot.relay {
  background: #eab308;
  box-shadow: 0 0 8px #eab308;
  animation: pulse-light 1.5s infinite ease-in-out;
}

.status-dot.ssh {
  background: #3b82f6;
  opacity: 0.8;
}

@keyframes pulse-light {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.6; }
}

.metrics-label {
  font-size: 9px;
  color: #a1a1aa;
  white-space: nowrap;
}

.metrics-label .latency {
  color: #22c55e;
  margin-left: 4px;
}
</style>
