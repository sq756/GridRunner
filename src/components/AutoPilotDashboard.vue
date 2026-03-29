<template>
  <div class="autopilot-dashboard">
    <div class="panel-header">
      <span class="title">⚡ MATRIX_ORCHESTRATOR_v1.0</span>
      <span class="status-badge" :class="statusClass">
        {{ ap.isActive ? (ap.isPaused ? 'PAUSED' : 'ENGAGED') : 'STANDBY' }}
      </span>
    </div>

    <div class="section">
      <div class="section-title">🎯 PRIME_DIRECTIVE (终极任务)</div>
      <textarea 
        v-model="ap.objective" 
        class="cyber-input" 
        placeholder="例如：写一个带有毛玻璃特效的 Vue 登录页面..."
        :disabled="ap.isActive"
      ></textarea>
    </div>

    <div class="section roles-grid">
      <div class="role-card" v-for="(roleData, roleName) in ap.roles" :key="roleName">
        <div class="role-header">
          <span class="role-icon">{{ roleData.icon }}</span>
          <span class="role-name">{{ roleName }}</span>
        </div>
        <select 
          :value="roleData.tabId" 
          @change="(e) => storeActions.bindRole(roleName, (e.target as HTMLSelectElement).value)"
          class="cyber-select"
        >
          <option :value="null">-- UNBOUND --</option>
          <option v-for="tab in terminalTabs" :key="tab.id" :value="tab.id">
            [{{ tab.id.substring(0,4) }}] {{ tab.title || 'Terminal' }}
          </option>
        </select>
      </div>
    </div>

    <div class="arcade-controls">
      <button 
        class="arcade-btn btn-engage" 
        :disabled="ap.isActive && !ap.isPaused"
        @click="engage"
      >
        <span class="icon">▶</span> ENGAGE
      </button>
      <button 
        class="arcade-btn btn-pause" 
        :disabled="!ap.isActive || ap.isPaused"
        @click="ap.isPaused = true"
      >
        <span class="icon">⏸</span> PAUSE
      </button>
      <button 
        class="arcade-btn btn-abort" 
        :disabled="!ap.isActive"
        @click="abort"
      >
        <span class="icon">⏹</span> ABORT
      </button>
    </div>

    <div class="section shadow-log-container">
      <div class="section-title">📡 CONTROL_PLANE_LOGS (影子日志)</div>
      <div class="shadow-logs" ref="logContainer">
        <div v-for="log in ap.controlLogs" :key="log.id" class="log-entry">
          <span class="log-time">[{{ formatTime(log.timestamp) }}]</span>
          <span class="log-route">{{ log.fromRole }} ➔ {{ log.toRole }}</span>
          <span class="log-action">[{{ log.action }}]</span>
        </div>
        <div v-if="ap.controlLogs.length === 0" class="empty-log">
          WAITING_FOR_RPC_SIGNAL...
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { globalState, terminalTabs, storeActions } from '../store';
import { invoke } from '@tauri-apps/api/core';

const ap = computed(() => globalState.autoPilot);

const statusClass = computed(() => {
  if (!ap.value.isActive) return 'status-standby';
  if (ap.value.isPaused) return 'status-paused';
  return 'status-engaged';
});

const logContainer = ref<HTMLElement | null>(null);

// Auto-scroll logs
watch(() => ap.value.controlLogs.length, () => {
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = 0; // Recent logs are unshifted to top
    }
  });
});

const engage = () => {
  if (!ap.value.objective) {
    storeActions.pushLog("[WARN] No prime directive set.");
    return;
  }
  if (!ap.value.roles.ACTOR.tabId) {
    storeActions.pushLog("[WARN] No actor bound to kernel.");
    return;
  }

  globalState.autoPilot.isActive = true;
  globalState.autoPilot.isPaused = false;
  
  const initPrompt = `[SYSTEM_INIT] PRIME_DIRECTIVE: ${ap.value.objective}\r\nPlease begin execution of step 1.\r`;
  invoke('write_pty', { tabId: ap.value.roles.ACTOR.tabId, data: initPrompt });
};

const abort = () => {
  globalState.autoPilot.isActive = false;
  globalState.autoPilot.isPaused = false;
  
  Object.values(ap.value.roles).forEach(role => {
    if (role.tabId) {
      invoke('write_pty', { tabId: role.tabId, data: `\x03` }); 
      invoke('write_pty', { tabId: role.tabId, data: `\r\n\x1b[31m> [SYSTEM] EMERGENCY_ABORT_SEQUENCE_COMPLETE\x1b[0m\r\n` });
    }
  });
};

const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
</script>

<style scoped>
.autopilot-dashboard {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #050505;
  color: #a1a1aa;
  font-family: 'JetBrains Mono', monospace;
  padding: 15px;
  gap: 15px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #18181b;
  padding-bottom: 10px;
}

.title { color: #22c55e; font-weight: bold; font-size: 12px; letter-spacing: 1px; }
.status-badge { padding: 2px 10px; border-radius: 2px; font-size: 10px; font-weight: bold; border: 1px solid transparent; }
.status-standby { border-color: #3f3f46; color: #71717a; }
.status-engaged { background: rgba(34, 197, 94, 0.1); color: #22c55e; border-color: #22c55e; box-shadow: 0 0 10px rgba(34, 197, 94, 0.2); }
.status-paused { background: rgba(234, 179, 8, 0.1); color: #eab308; border-color: #eab308; animation: blink 1s infinite; }

@keyframes blink { 50% { opacity: 0.5; } }

.section-title { font-size: 9px; color: #52525b; margin-bottom: 8px; letter-spacing: 1px; font-weight: bold; }

.cyber-input, .cyber-select {
  width: 100%;
  background: #000;
  border: 1px solid #27272a;
  color: #3b82f6;
  padding: 8px;
  font-family: inherit;
  font-size: 11px;
  outline: none;
  border-radius: 0;
}
.cyber-input:focus, .cyber-select:focus { border-color: #3b82f6; box-shadow: 0 0 5px rgba(59, 130, 246, 0.3); }
.cyber-input { height: 80px; resize: none; color: #d4d4d8; }

.roles-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.role-card { background: #09090b; border: 1px solid #18181b; padding: 10px; }
.role-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.role-icon { font-size: 14px; }
.role-name { font-size: 10px; font-weight: bold; color: #a1a1aa; }

.arcade-controls { display: flex; gap: 10px; }
.arcade-btn {
  flex: 1; padding: 12px 0; font-family: inherit; font-weight: bold; font-size: 12px;
  border: none; cursor: pointer; transition: all 0.1s; text-align: center;
  text-transform: uppercase;
}
.arcade-btn:disabled { opacity: 0.2; cursor: not-allowed; filter: grayscale(1); }
.arcade-btn:active:not(:disabled) { transform: translateY(2px); filter: brightness(1.2); }

.btn-engage { background: #166534; color: #4ade80; border-bottom: 3px solid #052e16; }
.btn-pause { background: #854d0e; color: #fde047; border-bottom: 3px solid #422006; }
.btn-abort { background: #991b1b; color: #f87171; border-bottom: 3px solid #450a0a; }

.shadow-log-container { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.shadow-logs {
  flex: 1; background: #000; border: 1px solid #18181b; overflow-y: auto;
  padding: 10px; font-size: 10px;
}
.log-entry { margin-bottom: 6px; border-bottom: 1px solid #09090b; padding-bottom: 4px; display: flex; gap: 8px; align-items: baseline; }
.log-time { color: #3f3f46; flex-shrink: 0; }
.log-route { color: #a855f7; font-weight: bold; flex-shrink: 0; }
.log-action { color: #22c55e; flex: 1; }
.empty-log { color: #27272a; font-style: italic; text-align: center; margin-top: 40px; font-size: 9px; }

/* Custom Scrollbar */
.shadow-logs::-webkit-scrollbar { width: 4px; }
.shadow-logs::-webkit-scrollbar-thumb { background: #18181b; }
.shadow-logs::-webkit-scrollbar-thumb:hover { background: #27272a; }
</style>
