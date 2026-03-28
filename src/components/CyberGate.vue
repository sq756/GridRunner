<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const emit = defineEmits(['connected']);

const isMasterPasswordSet = ref(false);
const masterPasswordStr = ref('');
const isConnecting = ref(false);
const connLogs = ref<string[]>([]);
const savedServers = ref<any[]>([]);
const showAddServerForm = ref(false);
const newServer = ref({ 
  label: '', host: '', port: 22, user: 'root', password_enc: '', 
  proxy_id: '', pre_connect_script: '', auto_tunnel: false 
});

let unlistenConn: any = null;
onMounted(async () => {
  unlistenConn = await listen('conn-status', (e: any) => {
    connLogs.value.push(e.payload);
    if (connLogs.value.length > 5) connLogs.value.shift();
  });
});

onUnmounted(() => { if (unlistenConn) unlistenConn(); });

const loadServers = async () => {
  savedServers.value = await invoke('list_server_configs');
};

const setMasterPass = async () => {
  await invoke('set_master_password', { password: masterPasswordStr.value });
  isMasterPasswordSet.value = true;
  loadServers();
};

const connectWithId = async (id: string) => {
  if (isConnecting.value) return;
  isConnecting.value = true;
  
  const s = savedServers.value.find(s => s.id === id);
  const hostLabel = s ? (s.label || s.host) : 'Remote';

  invoke('connect_with_id', { id }).then(async () => {
    isConnecting.value = false;
    emit('connected', { label: hostLabel, id });
  }).catch(e => {
    isConnecting.value = false;
    alert("Fail: " + e);
  });
};

const saveNewServer = async () => {
  if (!newServer.value.host || !newServer.value.user) return;
  await invoke('save_server_config', { 
    config: { 
      id: 'node-' + Math.random().toString(36).substr(2, 9), 
      ...newServer.value 
    } 
  });
  showAddServerForm.value = false;
  loadServers();
};

// Bug 4/10 Fix: Delete server node
const deleteServer = async (id: string) => {
  if (!confirm('Delete this node? This cannot be undone.')) return;
  await invoke('delete_server_config', { id });
  await loadServers();
};

onMounted(async () => {
  const isSet = await invoke<boolean>('check_master_password_set').catch(() => false);
  if (isSet) {
    isMasterPasswordSet.value = true;
    loadServers();
  }
});
</script>

<template>
  <div class="cyber-gate-wrapper" @contextmenu.prevent.stop>
    <div v-if="!isMasterPasswordSet" class="modal-overlay">
      <div class="auth-card cyber-card">
        <h2 class="cyber-title">SYSTEM OVERRIDE</h2>
        <div class="cyber-subtitle">/// AUTHENTICATION_REQUIRED</div>
        <input v-model="masterPasswordStr" type="password" placeholder="ENTER ACCESS KEY..." @keyup.enter="setMasterPass" class="cyber-input" />
        <button @click="setMasterPass" class="btn-primary">INITIALIZE</button>
      </div>
    </div>

    <div v-else class="workspace-setup">
      <div class="vault-container cyber-card" :class="{ 'connecting': isConnecting }">
        <header>
          <h2 class="cyber-title">AUTHORIZED NODES</h2>
          <button @click="showAddServerForm = true" class="btn-add">+</button>
        </header>
        
        <div v-if="showAddServerForm" class="add-server-overlay">
          <div class="cyber-form scroller-mini">
            <input v-model="newServer.label" placeholder="LABEL (e.g. PKU Internal)" class="cyber-input" />
            <div class="row">
              <input v-model="newServer.host" placeholder="HOST" class="cyber-input" />
              <input v-model.number="newServer.port" placeholder="PORT" class="cyber-input small" />
            </div>
            <input v-model="newServer.user" placeholder="USER" class="cyber-input" />
            <input v-model="newServer.password_enc" type="password" placeholder="PASSWORD" class="cyber-input" />
            
            <div class="advanced-divider">NETWORK_ORCHESTRATION</div>
            
            <select v-model="newServer.proxy_id" class="cyber-input cyber-select">
              <option value="">NO JUMP HOST (DIRECT)</option>
              <option v-for="s in savedServers" :key="'proxy-'+s.id" :value="s.id">
                JUMP: {{ s.label || s.host }}
              </option>
            </select>

            <textarea v-model="newServer.pre_connect_script" placeholder="PRE-CONNECT SCRIPT (e.g. pulse-login)" class="cyber-input cyber-area" rows="2"></textarea>
            
            <label class="check-row">
              <input type="checkbox" v-model="newServer.auto_tunnel" />
              <span>AUTO_DYNAMIC_FORWARD (-D SOCKS5)</span>
            </label>

            <div class="actions">
              <button @click="saveNewServer" class="btn-primary mini">SAVE</button>
              <button @click="showAddServerForm = false" class="btn-primary mini danger">CANCEL</button>
            </div>
          </div>
        </div>

        <div class="server-list">
          <div class="server-card local-card" @click.stop="emit('connected', { label: 'LOCAL', id: 'local-pty' })">
            <div class="icon-box local">LOCAL</div>
            <div class="info">
              <b>LOCAL SHELL</b><br/>
              <small>GUEST_MODE (NO SSH)</small>
            </div>
          </div>
          <div v-for="s in savedServers" :key="s.id" class="server-card" @click.stop="connectWithId(s.id)">
            <div class="icon-box">NODE</div>
            <div class="info">
              <b>{{ (s.label || 'UNTITLED').toUpperCase() }}</b><br/>
              <small>{{ s.user }}@{{ s.host }}</small>
              <div v-if="s.proxy_id" class="chain-tag">🔗 PROXY_ACTIVE</div>
            </div>
            <button class="delete-node-btn" @click.stop="deleteServer(s.id)" title="Delete Node">✕</button>
          </div>
          <div v-if="savedServers.length === 0" class="empty-nodes">NO AUTHORIZED NODES FOUND</div>
        </div>

        <div v-if="isConnecting" class="conn-orchestrator">
          <div class="conn-logs">
            <div v-for="(log, i) in connLogs" :key="i" class="conn-log-line">>>> {{ log }}</div>
          </div>
          <div class="conn-loader"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cyber-gate-wrapper { height: 100vh; width: 100vw; background: #000; position: fixed; inset: 0; z-index: 10001; }
.cyber-card { background: #09090b !important; border: 1px solid #22c55e !important; box-shadow: 0 0 15px rgba(34, 197, 94, 0.2) !important; border-radius: 0 !important; }
.cyber-title { color: #22c55e !important; font-family: 'JetBrains Mono', monospace; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 5px; }
.cyber-subtitle { font-size: 10px; color: #166534; margin-bottom: 20px; letter-spacing: 1px; }
.cyber-select { appearance: none; cursor: pointer; background: #000 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2322c55e' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E") no-repeat right 12px center !important; }
.cyber-input { background: #000 !important; border: 1px solid #27272a !important; color: #22c55e !important; font-family: 'JetBrains Mono', monospace !important; border-radius: 0 !important; outline: none !important; padding: 10px !important; margin-bottom: 15px; width: 100%; box-sizing: border-box; }
.cyber-input:focus { border-color: #22c55e !important; box-shadow: 0 0 5px rgba(34, 197, 94, 0.3); }
.btn-primary { background: transparent !important; border: 1px solid #22c55e !important; color: #22c55e !important; font-family: 'JetBrains Mono', monospace !important; text-transform: uppercase; letter-spacing: 1px; border-radius: 0 !important; transition: all 0.2s ease !important; cursor: pointer; padding: 12px; font-weight: bold; width: 100%; }
.btn-primary:hover { background: rgba(34, 197, 94, 0.2) !important; box-shadow: 0 0 10px rgba(34, 197, 94, 0.5) !important; }
.btn-primary.mini { padding: 6px 12px; font-size: 11px; width: auto; }
.btn-primary.danger { border-color: #ef4444 !important; color: #ef4444 !important; }
.btn-primary.danger:hover { background: rgba(239, 68, 68, 0.2) !important; box-shadow: 0 0 10px rgba(239, 68, 68, 0.5) !important; }

.workspace-setup { height: 100%; display: flex; align-items: center; justify-content: center; background: #000; }
.vault-container { width: 520px; padding: 40px; position: relative; }
.vault-container header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 1px solid #27272a; padding-bottom: 15px; }
.btn-add { background: transparent; border: 1px solid #22c55e; color: #22c55e; width: 28px; height: 28px; cursor: pointer; font-size: 20px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
.btn-add:hover { background: #22c55e; color: #000; }

.add-server-overlay { margin-bottom: 30px; padding: 20px; background: rgba(34, 197, 94, 0.05); border: 1px dashed #22c55e; }
.cyber-form { display: flex; flex-direction: column; }
.cyber-form .row { display: flex; gap: 10px; }
.cyber-form .row .small { width: 100px; }
.cyber-form .actions { display: flex; gap: 10px; margin-top: 10px; }

.scroller-mini { max-height: 400px; overflow-y: auto; padding-right: 10px; }
.scroller-mini::-webkit-scrollbar { width: 4px; }
.scroller-mini::-webkit-scrollbar-thumb { background: #22c55e; }

.advanced-divider { font-size: 9px; color: #166534; margin: 10px 0; border-bottom: 1px solid rgba(22, 101, 52, 0.3); padding-bottom: 4px; letter-spacing: 1px; }
.cyber-area { resize: none; font-size: 11px; padding: 8px !important; }
.check-row { display: flex; align-items: center; gap: 10px; color: #22c55e; font-size: 10px; margin-bottom: 15px; cursor: pointer; }
.check-row input { accent-color: #22c55e; }

.chain-tag { font-size: 8px; color: #3b82f6; margin-top: 4px; }

.conn-orchestrator { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.95); z-index: 100; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px solid #22c55e; }
.conn-logs { width: 80%; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #22c55e; margin-bottom: 30px; }
.conn-log-line { margin-bottom: 6px; border-left: 2px solid #22c55e; padding-left: 10px; animation: slideIn 0.2s ease-out; }
@keyframes slideIn { from { transform: translateX(-10px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

.conn-loader { width: 100px; height: 2px; background: rgba(34, 197, 94, 0.2); position: relative; overflow: hidden; }
.conn-loader::after { content: ''; position: absolute; left: 0; top: 0; height: 100%; width: 30%; background: #22c55e; box-shadow: 0 0 10px #22c55e; animation: load 1.5s infinite linear; }
@keyframes load { from { left: -30%; } to { left: 130%; } }

.server-list { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
.server-card { background: #050505; border: 1px solid #18181b; padding: 15px; display: flex; align-items: center; cursor: pointer; transition: all 0.2s; gap: 15px; }
.server-card:hover { border-color: #22c55e; transform: translateY(-2px); box-shadow: 0 5px 15px rgba(34, 197, 94, 0.1); }
.server-card .icon-box { background: rgba(34, 197, 94, 0.1); color: #22c55e; padding: 4px 8px; font-size: 10px; font-weight: bold; border: 1px solid rgba(34, 197, 94, 0.3); }
.server-card .icon-box.local { background: rgba(59, 130, 246, 0.1); color: #3b82f6; border-color: rgba(59, 130, 246, 0.3); }
.server-card.local-card:hover { border-color: #3b82f6; box-shadow: 0 5px 15px rgba(59, 130, 246, 0.1); }
.server-card small { color: #52525b; font-size: 11px; }
.empty-nodes { grid-column: span 2; text-align: center; color: #3f3f46; font-size: 12px; padding: 40px; border: 1px dashed #18181b; }

/* Bug 4/10 Fix: Delete button */
.delete-node-btn { margin-left: auto; align-self: flex-start; background: transparent; border: none; color: #3f3f46; cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: 2px; transition: all 0.2s; line-height: 1; }
.delete-node-btn:hover { color: #ef4444; background: rgba(239, 68, 68, 0.15); }

.modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.9); display: flex; align-items: center; justify-content: center; z-index: 10000; backdrop-filter: blur(8px); }
.auth-card { width: 360px; padding: 40px; }
</style>