<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { globalState, storeActions } from '../store';

const sessions = ref<string[]>([]);
const loading = ref(false);
let timer: any = null;

const refresh = async () => {
  if (!globalState.isConnected) return;
  loading.value = true;
  try {
    const res = await invoke<string[]>('list_remote_tmux_sessions');
    sessions.value = res;
  } catch (e) {
    console.error("Fetch sessions fail", e);
  } finally {
    loading.value = false;
  }
};

const attach = async (id: string) => {
  await storeActions.createNewTab(id, 'terminal', {}, false, id);
};

const kill = async (id: string) => {
  if (confirm(`Kill session ${id}?`)) {
    await invoke('kill_remote_tmux_session', { id });
    refresh();
  }
};

onMounted(() => {
  refresh();
  timer = setInterval(refresh, 5000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="running-processes cyber-panel">
    <div class="panel-header">
      <span class="title">RUNNING PROCESSES</span>
      <button @click="refresh" :class="{ spinning: loading }">
        <span class="icon">↻</span>
      </button>
    </div>
    
    <div class="process-list scrollbar-hide">
      <div v-if="!globalState.isConnected" class="empty-state">
        DISCONNECTED
      </div>
      <div v-else-if="sessions.length === 0" class="empty-state">
        NO ACTIVE SESSIONS
      </div>
      <div v-for="id in sessions" :key="id" class="process-item">
        <div class="proc-info">
          <div class="proc-name">{{ id }}</div>
          <div class="proc-status">RUNNING</div>
        </div>
        <div class="proc-actions">
          <button @click="attach(id)" class="btn-attach" title="Attach Workstation">⚡</button>
          <button @click="kill(id)" class="btn-kill" title="Terminate">✕</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.running-processes {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: rgba(10, 10, 12, 0.8);
  border: 1px solid rgba(0, 255, 157, 0.1);
  font-family: 'JetBrains Mono', monospace;
}

.panel-header {
  padding: 10px;
  background: rgba(0, 255, 157, 0.05);
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(0, 255, 157, 0.2);
}

.title {
  color: #00ff9d;
  font-size: 0.75rem;
  letter-spacing: 1px;
}

.process-list {
  flex: 1;
  overflow-y: auto;
  padding: 5px;
}

.process-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  margin-bottom: 5px;
  background: rgba(255, 255, 255, 0.03);
  border-left: 2px solid #00ff9d;
  transition: all 0.2s;
}

.process-item:hover {
  background: rgba(0, 255, 157, 0.05);
  transform: translateX(2px);
}

.proc-name {
  color: #e4e4e7;
  font-size: 0.85rem;
  font-weight: bold;
}

.proc-status {
  color: #71717a;
  font-size: 0.65rem;
}

.proc-actions {
  display: flex;
  gap: 8px;
}

.proc-actions button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-attach { color: #00ff9d; }
.btn-attach:hover { background: rgba(0, 255, 157, 0.2); text-shadow: 0 0 8px #00ff9d; }

.btn-kill { color: #f43f5e; }
.btn-kill:hover { background: rgba(244, 63, 94, 0.2); }

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #52525b;
  font-size: 0.7rem;
  font-style: italic;
}

.spinning { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.scrollbar-hide::-webkit-scrollbar { display: none; }
</style>
