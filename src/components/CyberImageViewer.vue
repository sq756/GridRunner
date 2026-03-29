<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { rpcBus } from '../rpcBus';
import { convertFileSrc } from '@tauri-apps/api/core';

const props = defineProps<{
  zoneId: string;
}>();

const imageUrl = ref<string | null>(null);
const lastUpdate = ref<number>(Date.now());
const loading = ref(false);
const error = ref<string | null>(null);

// v3.0: Register as a Neuron
onMounted(() => {
  rpcBus.register({
    id: props.zoneId,
    label: `Image Viewer [${props.zoneId}]`,
    capabilities: ['reload_image', 'clear']
  }, (event) => {
    // Handle incoming messages
    if (event.action === 'reload_image') {
      handleReload(event.payload);
    } else if (event.action === 'clear') {
      imageUrl.value = null;
    }
  });
});

onUnmounted(() => {
  rpcBus.unregister(props.zoneId);
});

const handleReload = (path: string) => {
  loading.value = true;
  error.value = null;
  
  try {
    // v2.19.5: Support local files via Tauri's asset protocol
    // If it starts with / or looks like a path, convert it
    let src = path;
    if (path.startsWith('/') || path.includes(':')) {
       src = convertFileSrc(path);
    }
    
    // Add cache buster
    imageUrl.value = `${src}?t=${Date.now()}`;
    lastUpdate.value = Date.now();
  } catch (e) {
    error.value = `Failed to load: ${e}`;
    console.error("[ImageViewer] Load error:", e);
  }
};

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
};

const onImageLoad = () => {
  loading.value = false;
};

const onImageError = () => {
  loading.value = false;
  error.value = "IMAGE_NOT_FOUND_OR_ACCESS_DENIED";
};
</script>

<template>
  <div class="cyber-image-viewer cyber-panel">
    <header class="panel-header">
      <div class="info">
        <span class="title">VISUAL_SENSING_GRID [{{ zoneId }}]</span>
        <span v-if="imageUrl" class="timestamp">UPDATED: {{ formatTime(lastUpdate) }}</span>
      </div>
      <div class="controls">
        <button v-if="imageUrl" @click="imageUrl = null" class="btn-mini">CLEAR</button>
        <div class="status-indicator" :class="{ 'active': loading }"></div>
      </div>
    </header>

    <div class="viewer-body scroller">
      <div v-if="!imageUrl && !error" class="empty-state">
        <div class="glitch-icon">👁️</div>
        <span>WAITING_FOR_NEURAL_DATA...</span>
        <p class="hint">Print [GR_RPC]{"action":"reload_image","payload":"path"} to display.</p>
      </div>

      <div v-if="error" class="error-state">
        <span class="error-msg">!! ERROR: {{ error }} !!</span>
        <button @click="error = null" class="btn-retry">RESET_SENSORS</button>
      </div>

      <img v-if="imageUrl" 
           :src="imageUrl" 
           @load="onImageLoad" 
           @error="onImageError"
           class="main-image" />
      
      <div v-if="loading" class="loading-overlay">
        <div class="scanner-line"></div>
        <span>CAPTURING_STREAM...</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cyber-image-viewer {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #000;
  border: 1px solid rgba(0, 255, 157, 0.1);
  font-family: 'JetBrains Mono', monospace;
  overflow: hidden;
}

.panel-header {
  height: 28px;
  background: rgba(34, 197, 94, 0.05);
  border-bottom: 1px solid #18181b;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 10px;
}

.title { font-size: 10px; color: #22c55e; letter-spacing: 1px; }
.timestamp { font-size: 8px; color: #52525b; margin-left: 10px; }

.viewer-body {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at center, #09090b 0%, #000 100%);
  overflow: auto;
}

.main-image {
  max-width: 95%;
  max-height: 95%;
  object-fit: contain;
  box-shadow: 0 0 30px rgba(0, 0, 0, 0.8);
  border: 1px solid #18181b;
}

.empty-state, .error-state {
  text-align: center;
  color: #3f3f46;
  padding: 40px;
}

.glitch-icon { font-size: 40px; margin-bottom: 15px; opacity: 0.3; }
.hint { font-size: 9px; margin-top: 15px; opacity: 0.5; }

.error-msg { color: #ef4444; font-size: 11px; display: block; margin-bottom: 15px; }

.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #22c55e;
  font-size: 10px;
}

.scanner-line {
  width: 80%;
  height: 2px;
  background: #22c55e;
  box-shadow: 0 0 10px #22c55e;
  position: absolute;
  animation: scan 1.5s infinite ease-in-out;
}

@keyframes scan {
  0% { top: 10%; opacity: 0; }
  50% { opacity: 1; }
  100% { top: 90%; opacity: 0; }
}

.btn-mini { background: transparent; border: 1px solid #27272a; color: #52525b; font-size: 8px; padding: 2px 6px; cursor: pointer; }
.btn-mini:hover { color: #fff; border-color: #3f3f46; }

.status-indicator { width: 6px; height: 6px; border-radius: 50%; background: #18181b; }
.status-indicator.active { background: #22c55e; box-shadow: 0 0 10px #22c55e; animation: pulse 1s infinite; }

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
</style>
