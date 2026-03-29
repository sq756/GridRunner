<script setup lang="ts">
import { ref, computed } from 'vue';
import { rpcBus, type RPCNode, type RPCLink, type RPCEvent } from '../rpcBus';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits(['close']);

// --- 状态控制 ---
const activeTab = ref<'NODES' | 'PATCH_BAY' | 'TRAFFIC'>('TRAFFIC');

// --- 跳线表单状态 ---
const newLink = ref({
  source: '',
  event: '',
  target: '',
  action: ''
});

const addLink = () => {
  if (!newLink.value.source || !newLink.value.target) return;
  rpcBus.addLink({
    source: newLink.value.source,
    event: newLink.value.event,
    target: newLink.value.target,
    action: newLink.value.action
  });
  // 重置表单
  newLink.value = { source: '', event: '', target: '', action: '' };
};

const getLogColor = (event: RPCEvent) => {
  if (event.from === 'SYSTEM') return '#71717a';
  if (event.status === 'FAILED') return '#ef4444';
  if (event.status === 'ROUTED') return '#a855f7';
  if (event.status === 'CONSUMED') return '#22c55e';
  return '#3b82f6';
};

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
};
</script>

<template>
  <Transition name="fade">
    <div v-if="isOpen" class="nexus-overlay" @click.self="$emit('close')">
      <div class="nexus-panel cyber-card">
        <header class="nexus-header">
          <div class="brand">
            <span class="glitch-text">THE_NEXUS // NEURAL_BUS_v3.0</span>
            <div class="pulse-dot"></div>
          </div>
          <nav class="nexus-tabs">
            <button v-for="t in (['NODES', 'PATCH_BAY', 'TRAFFIC'] as const)" 
                    :key="t" 
                    :class="{ active: activeTab === t }"
                    @click="activeTab = t">
              [{{ t }}]
            </button>
          </nav>
          <button class="close-btn" @click="$emit('close')">×</button>
        </header>

        <div class="nexus-body">
          <!-- 1. 活跃节点列表 -->
          <section v-if="activeTab === 'NODES'" class="nodes-view">
            <header class="section-title">ACTIVE_NEURONS ({{ rpcBus.nodes.size }})</header>
            <div class="node-grid">
              <div v-for="[id, node] in rpcBus.nodes" :key="id" class="node-card">
                <div class="node-id">{{ id }}</div>
                <div class="node-label">{{ node.label }}</div>
                <div class="capabilities">
                  <span v-for="cap in node.capabilities" :key="cap" class="cap-tag">{{ cap }}</span>
                </div>
                <div class="status-online">ONLINE</div>
              </div>
            </div>
          </section>

          <!-- 2. 跳线盘 (连线管理) -->
          <section v-if="activeTab === 'PATCH_BAY'" class="patch-view">
            <div class="link-creator">
              <header class="section-title">NEW_NEURAL_LINK</header>
              <div class="link-form">
                <select v-model="newLink.source" class="nexus-input">
                  <option value="" disabled>SOURCE_NODE</option>
                  <option v-for="[id] in rpcBus.nodes" :key="id" :value="id">{{ id }}</option>
                </select>
                <input v-model="newLink.event" placeholder="EVENT_NAME (e.g. plot)" class="nexus-input" />
                <div class="arrow">➡️</div>
                <select v-model="newLink.target" class="nexus-input">
                  <option value="" disabled>TARGET_NODE</option>
                  <option v-for="[id] in rpcBus.nodes" :key="id" :value="id">{{ id }}</option>
                </select>
                <input v-model="newLink.action" placeholder="ACTION (e.g. reload)" class="nexus-input" />
                <button @click="addLink" class="btn-primary">DEPLOY_LINK</button>
              </div>
            </div>

            <div class="link-list">
              <header class="section-title">ACTIVE_PATCHES</header>
              <div v-for="link in rpcBus.links" :key="link.id" class="link-item">
                <div class="link-path">
                  <span class="src">{{ link.source }}</span>
                  <span class="evt">[{{ link.event }}]</span>
                  <span class="connector">══▶</span>
                  <span class="dst">{{ link.target }}</span>
                  <span class="act">[{{ link.action }}]</span>
                </div>
                <div class="link-actions">
                  <button @click="link.enabled = !link.enabled" :class="{ disabled: !link.enabled }">
                    {{ link.enabled ? 'ENABLED' : 'DISABLED' }}
                  </button>
                  <button @click="rpcBus.removeLink(link.id)" class="btn-danger">SEVER</button>
                </div>
              </div>
            </div>
          </section>

          <!-- 3. 实时流量嗅探器 -->
          <section v-if="activeTab === 'TRAFFIC'" class="traffic-view">
            <header class="section-title">
              <span>TRAFFIC_SNIFFER (Shadow Logs)</span>
              <button @click="rpcBus.traffic.value = []" class="btn-mini">CLEAR_TRAFFIC</button>
            </header>
            <div class="traffic-stream scroller">
              <div v-for="event in rpcBus.traffic.value" :key="event.id" 
                   class="traffic-line" :style="{ borderLeftColor: getLogColor(event) }">
                <span class="time">{{ formatTime(event.timestamp) }}</span>
                <span class="status" :style="{ color: getLogColor(event) }">[{{ event.status }}]</span>
                <span class="route">
                  <span class="node-from">{{ event.from }}</span> 
                  <span class="arrow">-></span> 
                  <span class="node-to">{{ event.target || 'BROADCAST' }}</span>
                </span>
                <span class="action">:: {{ event.action }}</span>
                <span class="payload">{{ JSON.stringify(event.payload) }}</span>
              </div>
            </div>
          </section>
        </div>

        <footer class="nexus-footer">
          <span class="sys-stat">BUS_LOAD: {{ (rpcBus.traffic.value.length / 2).toFixed(1) }}%</span>
          <span class="sys-stat">LATENCY: &lt;1ms</span>
          <span class="sys-stat">SECURITY: ENCRYPTED_TUNNEL</span>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.nexus-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(10px);
  z-index: 200000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.nexus-panel {
  width: 100%;
  max-width: 1200px;
  height: 80vh;
  display: flex;
  flex-direction: column;
  background: #050505;
  border: 1px solid #22c55e44;
  box-shadow: 0 0 40px rgba(34, 197, 94, 0.1);
  overflow: hidden;
}

.nexus-header {
  padding: 20px;
  background: rgba(34, 197, 94, 0.05);
  border-bottom: 1px solid #18181b;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand { display: flex; align-items: center; gap: 15px; }
.glitch-text { color: #22c55e; font-family: 'JetBrains Mono', monospace; font-weight: bold; letter-spacing: 2px; }
.pulse-dot { width: 8px; height: 8px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 10px #22c55e; animation: blink 1s infinite; }

.nexus-tabs { display: flex; gap: 10px; }
.nexus-tabs button { 
  background: transparent; border: none; color: #52525b; 
  font-family: 'JetBrains Mono', monospace; cursor: pointer; transition: all 0.2s;
}
.nexus-tabs button.active { color: #22c55e; text-shadow: 0 0 10px rgba(34, 197, 94, 0.5); }

.nexus-body { flex: 1; padding: 30px; overflow: hidden; display: flex; flex-direction: column; }
.section-title { font-size: 12px; color: #71717a; margin-bottom: 20px; letter-spacing: 3px; border-bottom: 1px solid #18181b; padding-bottom: 5px; }

/* Nodes View */
.node-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; }
.node-card { 
  background: #09090b; border: 1px solid #27272a; padding: 15px; border-radius: 4px;
  position: relative; overflow: hidden;
}
.node-id { color: #22c55e; font-weight: bold; font-family: 'JetBrains Mono', monospace; margin-bottom: 5px; }
.node-label { font-size: 12px; color: #a1a1aa; }
.cap-tag { font-size: 9px; background: #18181b; color: #71717a; padding: 2px 6px; margin-right: 5px; border-radius: 2px; }
.status-online { position: absolute; top: 15px; right: 15px; font-size: 8px; color: #22c55e; }

/* Patch View */
.link-form { display: flex; align-items: center; gap: 15px; margin-bottom: 40px; background: #09090b; padding: 20px; border-radius: 4px; border: 1px dashed #27272a; }
.nexus-input { background: #000; border: 1px solid #27272a; color: #22c55e; padding: 8px 12px; font-size: 12px; border-radius: 4px; outline: none; }
.link-item { 
  display: flex; justify-content: space-between; align-items: center; 
  background: #09090b; padding: 12px 20px; margin-bottom: 10px; border-radius: 4px;
}
.link-path { display: flex; align-items: center; gap: 10px; font-family: 'JetBrains Mono', monospace; font-size: 13px; }
.evt, .act { color: #a855f7; font-size: 11px; }
.connector { color: #3f3f46; letter-spacing: -2px; }

/* Traffic View */
.traffic-stream { flex: 1; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; font-family: 'JetBrains Mono', monospace; }
.traffic-line { 
  font-size: 11px; padding: 6px 15px; background: rgba(255,255,255,0.02);
  border-left: 3px solid transparent; white-space: nowrap; display: flex; gap: 15px; align-items: center;
}
.time { color: #52525b; min-width: 100px; }
.route { color: #a1a1aa; min-width: 200px; }
.payload { color: #71717a; font-style: italic; overflow: hidden; text-overflow: ellipsis; }

.nexus-footer { padding: 15px 30px; border-top: 1px solid #18181b; display: flex; gap: 30px; font-size: 10px; color: #3f3f46; }

.btn-primary { background: #22c55e; color: #000; border: none; padding: 8px 20px; border-radius: 4px; font-weight: bold; cursor: pointer; }
.btn-danger { background: transparent; border: 1px solid #ef4444; color: #ef4444; font-size: 10px; padding: 4px 8px; cursor: pointer; border-radius: 2px; }
.close-btn { background: transparent; border: none; color: #71717a; font-size: 24px; cursor: pointer; }

@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
