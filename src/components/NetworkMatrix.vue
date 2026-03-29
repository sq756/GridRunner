<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { VueFlow, useVueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { terminalManager } from '../TerminalManager';
import { globalState } from '../store';

// Basic styles for VueFlow
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';

const props = defineProps<{
  activeId: string | null;
  activeTabId: string | null;
}>();

const emit = defineEmits(['close']);

const { onConnect, addEdges, fitView } = useVueFlow();

const nodes = ref<any[]>([]);
const edges = ref<any[]>([]);
const authUrl = ref('https://vpn.pku.edu.cn');
const terminalRef = ref<HTMLElement | null>(null);
const authPaneRef = ref<HTMLElement | null>(null);
const allServers = ref<any[]>([]);
const showServerPicker = ref(false);
const isMihomoRunning = ref(false);

// Tunnel state
const showTunnelForm = ref(false);
const tunnelConfig = ref({ remote: 8888, local: 9999 });

const loadAllServers = async () => {
  allServers.value = await invoke('list_server_configs');
};

const buildTopology = async () => {
  if (!props.activeId) {
    nodes.value = [{
      id: 'local', type: 'input', label: 'LOCALHOST (DISCONNECTED)',
      position: { x: 150, y: 50 },
      style: { background: '#09090b', color: '#71717a', border: '1px solid #27272a', borderRadius: '4px', fontSize: '9px' },
    }];
    return;
  };
  
  try {
    const chain = await invoke<any[]>('get_connection_chain', { id: props.activeId });
    const newNodes = [];
    const newEdges = [];
    
    newNodes.push({
      id: 'local', type: 'input', label: 'LOCALHOST',
      position: { x: 150, y: 50 },
      style: { background: '#09090b', color: '#22c55e', border: '1px solid #22c55e', borderRadius: '4px', fontSize: '9px' },
    });

    let prevId = 'local';
    if (isMihomoRunning.value) {
      newNodes.push({
        id: 'mihomo', label: 'MIHOMO_PROXY',
        position: { x: 150, y: 150 },
        style: { background: '#050505', color: '#36b9ff', border: '1px solid #36b9ff', borderRadius: '4px', fontSize: '9px' },
      });
      newEdges.push({ id: 'e-local-mihomo', source: 'local', target: 'mihomo', animated: true, style: { stroke: '#36b9ff' } });
      prevId = 'mihomo';
    }

    chain.forEach((server, index) => {
      const isTarget = index === chain.length - 1;
      const nodeId = `node-${server.id}`;
      newNodes.push({
        id: nodeId, type: isTarget ? 'output' : 'default',
        label: (server.label || server.host).toUpperCase(),
        position: { x: 150, y: (isMihomoRunning.value ? 250 : 150) + index * 120 },
        style: { 
          background: '#050505', color: isTarget ? '#a855f7' : '#3b82f6', 
          border: `1px solid ${isTarget ? '#a855f7' : '#3b82f6'}`, 
          borderRadius: '4px', fontSize: '9px', padding: '10px',
          boxShadow: `0 0 10px ${isTarget ? 'rgba(168, 85, 247, 0.2)' : 'rgba(59, 130, 246, 0.2)'}`
        },
      });
      newEdges.push({ id: `e-${prevId}-${nodeId}`, source: prevId, target: nodeId, animated: true, style: { stroke: '#22c55e', strokeWidth: 2 } });
      prevId = nodeId;
    });

    newNodes.push({
      id: 'add-node', label: '+ ADD_NEXT_HOP',
      position: { x: 150, y: (isMihomoRunning.value ? 250 : 150) + chain.length * 120 },
      style: { background: 'transparent', color: '#52525b', border: '1px dashed #27272a', borderRadius: '4px', fontSize: '8px', cursor: 'pointer' },
    });
    newEdges.push({ id: `e-add`, source: prevId, target: 'add-node', style: { stroke: '#27272a', strokeDasharray: '5,5' } });

    nodes.value = newNodes;
    edges.value = newEdges;
    setTimeout(() => fitView(), 100);
  } catch (e) { console.error("Topology fail", e); }
};

const openExternalAuth = async () => {
  if (!authUrl.value.startsWith('http')) authUrl.value = 'https://' + authUrl.value;
  
  if (authPaneRef.value) {
    const rect = authPaneRef.value.getBoundingClientRect();
    await invoke('open_auth_window', { 
      url: authUrl.value,
      x: rect.x,
      y: rect.y + 30, // Offset for pane header
      width: rect.width,
      height: rect.height - 30
    });
  }
};

const syncWebviewBounds = async () => {
  if (authPaneRef.value) {
    const rect = authPaneRef.value.getBoundingClientRect();
    await invoke('update_webview_bounds', { 
      label: 'auth-gateway',
      x: rect.x,
      y: rect.y + 30,
      width: rect.width,
      height: rect.height - 30
    }).catch(() => {});
  }
};

let resizeInterval: any = null;

const toggleMihomo = async () => {
  if (isMihomoRunning.value) { isMihomoRunning.value = false; }
  else {
    try {
      await invoke('spawn_mihomo', { configPath: '/tmp/mihomo.yaml', binPath: '/usr/bin/mihomo', tabId: props.activeTabId });
      isMihomoRunning.value = true;
    } catch (e) { alert("Mihomo Start Fail: " + e); }
  }
  buildTopology();
};

const handleNodeClick = (event: any) => {
  if (event.node.id === 'add-node') showServerPicker.value = true;
  else if (event.node.id.startsWith('node-')) showTunnelForm.value = true;
};

const createReverseTunnel = async () => {
  try {
    await invoke('open_reverse_tunnel', { remotePort: tunnelConfig.value.remote, localPort: tunnelConfig.value.local });
    alert(`Reverse Tunnel Initialized: Node -> Local:${tunnelConfig.value.local}`);
    showTunnelForm.value = false;
    edges.value.push({
      id: 'e-reverse', source: nodes.value[nodes.value.length - 2].id, target: 'local',
      animated: true, label: 'REVERSE', style: { stroke: '#ef4444', strokeDasharray: '5,5' }
    });
  } catch (e) { alert("Tunnel fail: " + e); }
};

const chainNewNode = async (serverId: string) => {
  const targetServer = allServers.value.find(s => s.id === serverId);
  if (targetServer && props.activeId) {
    const updatedServer = { ...targetServer, proxy_id: props.activeId };
    await invoke('save_server_config', { config: updatedServer });
    showServerPicker.value = false;
    alert("Chain updated. Reconnect to activate.");
    buildTopology();
  }
};

onMounted(async () => {
  loadAllServers();
  buildTopology();
  
  window.addEventListener('resize', syncWebviewBounds);
  resizeInterval = setInterval(syncWebviewBounds, 500);

  if (props.activeTabId) {
    let retries = 0;
    const mountLoop = () => {
      if (terminalRef.value && terminalRef.value.offsetWidth > 0) {
        terminalManager.mount(props.activeTabId!, terminalRef.value);
        setTimeout(() => terminalManager.fitAll(), 200);
      } else if (retries < 10) { retries++; setTimeout(mountLoop, 200); }
    };
    mountLoop();
  }
});

onUnmounted(async () => {
  window.removeEventListener('resize', syncWebviewBounds);
  if (resizeInterval) clearInterval(resizeInterval);
  await invoke('close_auth_window').catch(() => {});
});

onConnect((params) => addEdges([params]));
</script>

<template>
  <div class="network-matrix-overlay" @contextmenu.prevent.stop>
    <div class="matrix-header">
      <div class="matrix-title">NETWORK_COMMAND_CENTER // ORCHESTRATION_v2</div>
      <div class="header-actions">
        <button class="action-btn" :class="{ 'active': isMihomoRunning }" @click="toggleMihomo">
          {{ isMihomoRunning ? 'MIHOMO: ONLINE' : 'START_MIHOMO' }}
        </button>
        <button class="action-btn" @click="buildTopology">REFRESH_PATH</button>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>
    </div>

    <div class="dashboard-body">
      <section class="pane terminal-pane">
        <header class="pane-header">ACTIVE_PTY_STREAM // SYSTEM_LOGS</header>
        <div ref="terminalRef" class="terminal-container">
          <div v-if="!activeTabId" class="no-pty">NO_ACTIVE_PTY_SESSION</div>
        </div>
      </section>

      <section class="pane topology-pane">
        <header class="pane-header">CONNECTION_PATH_VISUALIZER</header>
        <div class="flow-container">
          <VueFlow v-model:nodes="nodes" v-model:edges="edges" :fit-view-on-init="true" class="cyber-flow" @nodeClick="handleNodeClick">
            <Background pattern-color="#22c55e" :gap="20" :size="0.5" />
          </VueFlow>
          
          <div v-if="showServerPicker" class="picker-overlay">
            <div class="picker-card cyber-card">
              <header>SELECT_NEXT_HOP</header>
              <div class="picker-list scroller-mini">
                <div v-for="s in allServers" :key="s.id" class="picker-item" @click="chainNewNode(s.id)">{{ (s.label || s.host).toUpperCase() }}</div>
              </div>
              <button @click="showServerPicker = false" class="close-picker">CANCEL</button>
            </div>
          </div>

          <div v-if="showTunnelForm" class="picker-overlay">
            <div class="picker-card cyber-card">
              <header>REVERSE_TUNNEL_SETUP</header>
              <div class="tunnel-inputs">
                <label>Remote Port</label><input v-model.number="tunnelConfig.remote" type="number" class="cyber-input" />
                <label>Local Port</label><input v-model.number="tunnelConfig.local" type="number" class="cyber-input" />
              </div>
              <button @click="createReverseTunnel" class="btn-launch mini">ESTABLISH</button>
              <button @click="showTunnelForm = false" class="close-picker">CANCEL</button>
            </div>
          </div>
        </div>
        <div class="topology-hud">
          <div class="hud-item">ENCRYPTION: AES-256-GCM</div>
          <div class="hud-item">PROTOCOL: <span :style="{ color: globalState.connectionMetrics.isDirect ? '#22c55e' : '#f59e0b' }">{{ globalState.connectionMetrics.protocol }}</span></div>
          <div class="hud-item">LATENCY: {{ globalState.connectionMetrics.latency }}ms</div>
          <div class="hud-item">STATUS: {{ props.activeId ? 'SECURE' : 'IDLE' }}</div>
        </div>
      </section>

      <section class="pane auth-pane" ref="authPaneRef">
        <header class="pane-header">AUTHENTICATION_GATEWAY</header>
        <div class="auth-box">
          <div class="auth-placeholder">
            <div class="glitch-text">NATIVE_ENGINE_READY</div>
            <p>TLS verification disabled. Direct embedded access enabled.</p>
            <input v-model="authUrl" class="auth-input" @keyup.enter="openExternalAuth" />
            <button class="btn-launch" @click="openExternalAuth">MOUNT_SECURE_AUTH_WINDOW</button>
            <div class="quick-links-grid">
              <button @click="authUrl = 'https://vpn.pku.edu.cn'; openExternalAuth()">PKU_VPN</button>
              <button @click="authUrl = 'https://vpn.pkusz.edu.cn'; openExternalAuth()">SZ_VPN</button>
              <button @click="authUrl = 'http://127.0.0.1:9090/ui'; openExternalAuth()">MIHOMO_UI</button>
            </div>
          </div>
        </div>
      </section>
    </div>
    <div class="matrix-footer">/// SYSTEM_READY // ALL_TUNNELS_NOMINAL // SECURE_HANDSHAKE_ESTABLISHED</div>
  </div>
</template>

<style scoped>
.network-matrix-overlay { position: fixed; inset: 0; background: #000; z-index: 100000; display: flex; flex-direction: column; color: #d4d4d8; font-family: 'JetBrains Mono', monospace; }
.matrix-header { height: calc(45px * var(--ter-ui-scale)); padding: 0 calc(20px * var(--ter-ui-scale)); display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #18181b; background: #050505; }
.matrix-title { font-size: calc(12px * var(--ter-ui-scale)); letter-spacing: 2px; color: #22c55e; font-weight: bold; }
.header-actions { display: flex; gap: 15px; align-items: center; }
.action-btn { background: transparent; border: 1px solid #27272a; color: #71717a; font-size: calc(10px * var(--ter-ui-scale)); padding: calc(4px * var(--ter-ui-scale)) calc(10px * var(--ter-ui-scale)); cursor: pointer; }
.action-btn:hover, .action-btn.active { border-color: #22c55e; color: #22c55e; box-shadow: 0 0 10px rgba(34, 197, 94, 0.2); }
.close-btn { background: transparent; border: none; color: #52525b; font-size: 20px; cursor: pointer; }
.close-btn:hover { color: #ef4444; }
.dashboard-body { flex: 1; display: flex; overflow: hidden; padding: 10px; gap: 10px; }
.pane { display: flex; flex-direction: column; background: #09090b; border: 1px solid #18181b; overflow: hidden; }
.pane-header { background: #111111; padding: calc(6px * var(--ter-ui-scale)) calc(12px * var(--ter-ui-scale)); font-size: calc(10px * var(--ter-ui-scale)); color: #52525b; border-bottom: 1px solid #18181b; letter-spacing: 1px; }
.terminal-pane { flex: 3; }
.topology-pane { flex: 2; position: relative; }
.auth-pane { flex: 3; }
.terminal-container { flex: 1; background: #000; overflow: hidden; }
.no-pty { height: 100%; display: flex; align-items: center; justify-content: center; color: #3f3f46; font-size: 12px; }
.flow-container { flex: 1; position: relative; }
.cyber-flow { background: transparent; }
.topology-hud { padding: calc(10px * var(--ter-ui-scale)); background: #050505; border-top: 1px solid #18181b; display: flex; justify-content: space-between; font-size: calc(9px * var(--ter-ui-scale)); color: #166534; }
.auth-box { flex: 1; display: flex; align-items: center; justify-content: center; padding: 40px; text-align: center; }
.auth-placeholder { max-width: 400px; }
.glitch-text { color: #22c55e; font-size: 18px; font-weight: bold; margin-bottom: 20px; letter-spacing: 4px; }
.auth-input { width: 100%; background: #000; border: 1px solid #27272a; color: #3b82f6; padding: 10px; font-family: inherit; font-size: 12px; outline: none; margin-bottom: 20px; text-align: center; }
.btn-launch { background: #22c55e; color: #000; border: none; padding: 12px 24px; font-weight: bold; cursor: pointer; letter-spacing: 1px; width: 100%; margin-bottom: 30px; }
.btn-launch.mini { padding: 8px; margin-bottom: 10px; font-size: 10px; }
.btn-launch:hover { box-shadow: 0 0 20px rgba(34, 197, 94, 0.4); }
.quick-links-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
.quick-links-grid button { 
  background: rgba(24, 24, 27, 0.5); 
  border: 1px solid #555555; 
  color: #a1a1aa; 
  font-size: 10px; 
  padding: 8px; 
  cursor: pointer; 
  transition: all 0.25s ease; 
}
.quick-links-grid button:hover { 
  border-color: #22c55e; 
  color: #22c55e; 
  background: rgba(34, 197, 94, 0.05);
  box-shadow: 0 0 10px rgba(34, 197, 94, 0.2);
}
.picker-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(4px); z-index: 10; display: flex; align-items: center; justify-content: center; }
.picker-card { width: 220px; padding: 20px; border: 1px solid #22c55e; background: #000; }
.picker-card header { font-size: 10px; color: #22c55e; margin-bottom: 15px; border-bottom: 1px solid #22c55e; padding-bottom: 5px; text-align: center; }
.picker-item { padding: 10px; border: 1px solid #18181b; margin-bottom: 8px; cursor: pointer; font-size: 11px; transition: all 0.2s; text-align: center; }
.picker-item:hover { border-color: #22c55e; background: rgba(34, 197, 94, 0.1); }
.close-picker { width: 100%; background: transparent; border: 1px solid #ef4444; color: #ef4444; font-size: 10px; padding: 6px; cursor: pointer; margin-top: 15px; }
.tunnel-inputs { display: flex; flex-direction: column; gap: 5px; margin-bottom: 15px; text-align: left; }
.tunnel-inputs label { font-size: 9px; color: #52525b; }
.tunnel-inputs .cyber-input { margin-bottom: 5px; padding: 6px; }
.scroller-mini { max-height: 250px; overflow-y: auto; }
.scroller-mini::-webkit-scrollbar { width: 2px; }
.scroller-mini::-webkit-scrollbar-thumb { background: #22c55e; }
.matrix-footer { height: calc(30px * var(--ter-ui-scale)); padding: 0 calc(20px * var(--ter-ui-scale)); display: flex; align-items: center; font-size: calc(9px * var(--ter-ui-scale)); color: #166534; border-top: 1px solid #18181b; background: #050505; }
:deep(.vue-flow__node) { padding: 8px; min-width: 140px; text-align: center; border-radius: 0; }
:deep(.vue-flow__edge-path) { stroke: #22c55e; stroke-width: 2; }
:deep(.vue-flow__handle) { background: #22c55e; width: 6px; height: 6px; }
</style>
