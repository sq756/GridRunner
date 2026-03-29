<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue';
import { open } from '@tauri-apps/plugin-shell';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { AGENT_SCRIPT } from '../constants';
import { globalState } from '../store';
import { webviewManager } from '../WebviewManager';

const props = defineProps<{ 
  id: string;
  url: string; 
  isActive: boolean;
  isSafeMode?: boolean;
  zoneId?: string; // v2.15.3: Used for coordinate isolation
  hideHeader?: boolean; // v2.18.3: Support for external address bars
}>();
const emit = defineEmits(['dom-extracted', 'web-context-menu']);

const containerRef = ref<HTMLElement | null>(null);
const isWebviewReady = ref(false);
const isWebviewError = ref(false);
const isPinned = ref(true);

const headerHeight = computed(() => props.hideHeader ? 0 : 32);

const inputUrl = ref(props.url);
const handleNavigate = () => {
  let url = inputUrl.value.trim();
  if (!url) return;
  // v2.17.27: Default to http for internal/local services to prevent ERR_SSL_PROTOCOL_ERROR
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    if (url.includes('localhost') || url.includes(':') || !url.includes('.')) {
      url = 'http://' + url;
    } else {
      url = 'https://' + url;
    }
  }
  inputUrl.value = url;
  if (isNative.value && isWebviewReady.value) {
    webviewManager.navigate(props.id, url);
  }
};

const isNative = computed(() => globalState.useNativeWebview);

let unlistenExtracted: any = null;
let resizeObserver: ResizeObserver | null = null;

const WEB_CONTEXT_SCRIPT = `
  window.addEventListener('contextmenu', e => {
    e.preventDefault();
    window.__TAURI__.emit('web-context-menu', { x: e.clientX, y: e.clientY, id: '${props.id}' });
  });
`;

const togglePin = async () => {
  isPinned.value = !isPinned.value;
  await webviewManager.setAlwaysOnTop(props.id, isPinned.value);
};

const updateWebviewBounds = async () => {
  if (!containerRef.value || !isWebviewReady.value || !isNative.value) return;
  
  const rect = containerRef.value.getBoundingClientRect();
  const windowPos = await getCurrentWindow().innerPosition();
  
  const safeHeight = Math.max(100, rect.height - headerHeight.value);
  const safeWidth = Math.max(100, rect.width);

  const bounds = { 
    x: Math.round(windowPos.x + rect.x),
    y: Math.round(windowPos.y + rect.y + headerHeight.value), 
    width: Math.round(safeWidth),
    height: Math.round(safeHeight)
  };

  if (props.isActive) {
    await webviewManager.updateBounds(props.id, bounds);
  } else {
    await webviewManager.updateBounds(props.id, { x: -10000, y: -10000, width: 100, height: 100 });
  }
};

let syncInterval: any = null;

const initWebview = async () => {
  if (!isNative.value) return;
  if (!containerRef.value || props.isSafeMode) return;
  
  isWebviewError.value = false;
  isWebviewReady.value = false;

  await nextTick();
  await new Promise(r => setTimeout(r, 150));
  
  const rect = containerRef.value.getBoundingClientRect();
  const windowPos = await getCurrentWindow().innerPosition();

  try {
    await webviewManager.create(props.id, props.url, {
      x: props.isActive ? Math.round(windowPos.x + rect.x) : -10000,
      y: props.isActive ? Math.round(windowPos.y + rect.y + headerHeight.value) : -10000,
      width: Math.max(100, Math.round(rect.width)),
      height: Math.max(100, Math.round(rect.height - headerHeight.value))
    });

    unlistenExtracted = await listen<string>(`dom-extracted-${props.id}`, (ev) => { emit('dom-extracted', ev.payload); });

    isWebviewReady.value = true;
    await invoke('eval_cyber_webview', { label: props.id, code: AGENT_SCRIPT });
    await invoke('eval_cyber_webview', { label: props.id, code: WEB_CONTEXT_SCRIPT });

    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(() => { updateWebviewBounds(); });
    resizeObserver.observe(containerRef.value);
    
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(() => {
      if (props.isActive) updateWebviewBounds();
    }, 1000);

  } catch (e) {
    console.error("Webview Creation Failed:", e);
    isWebviewError.value = true;
  }
};

const destroyWebview = async () => {
  if (unlistenExtracted) { unlistenExtracted(); unlistenExtracted = null; }
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
  await webviewManager.destroy(props.id);
  isWebviewReady.value = false;
};

const handleRetry = async () => {
  await destroyWebview();
  await nextTick();
  initWebview();
};

watch(() => props.url, (newUrl) => {
  inputUrl.value = newUrl;
  if (isNative.value && isWebviewReady.value) { 
    webviewManager.navigate(props.id, newUrl);
  }
});

watch(() => props.isActive, (active) => { 
  if (isNative.value) updateWebviewBounds(); 
});

watch(isNative, (val) => {
  if (val) {
    initWebview();
  } else {
    destroyWebview();
  }
});

onMounted(() => { initWebview(); });
onUnmounted(() => { destroyWebview(); });

const openInBrowser = async () => { try { await open(inputUrl.value); } catch(e){} };
defineExpose({ reload: () => invoke('reload_cyber_webview', { label: props.id }), destroy: destroyWebview });
</script>

<template>
  <div class="cyber-webview" ref="containerRef" :data-id="id">
    <div v-if="!hideHeader" class="drag-handle">
      <div class="drag-region"></div>
      <div class="url-bar">
        <input v-model="inputUrl" @keydown.enter="handleNavigate" class="url-input" placeholder="Enter URL and press ENTER..." />
      </div>
      <div class="drag-actions">
        <button v-if="isNative" class="pin-btn" :class="{ 'active': isPinned }" @click="togglePin" title="Toggle Always on Top">📌</button>
        <span class="mode-tag">{{ isNative ? 'NATIVE' : 'IFRAME' }}</span>
      </div>
    </div>

    <div class="webview-content" v-if="!isNative">
      <iframe :src="inputUrl" class="cyber-iframe" frameborder="0"></iframe>
      <div class="iframe-policy-hint">
        IFRAME_POLICY: If page is blank, switch to NATIVE engine.
      </div>
    </div>

    <template v-else>
      <div class="native-placeholder" v-if="!isWebviewReady && !isWebviewError">
        <div class="loader">INITIALIZING_TWM_ENGINE...</div>
      </div>
      <div class="native-error" v-if="isWebviewError">
        <div class="error-box">
          <span class="icon">⚠️</span>
          <div class="msg">RENDERER_CRASHED</div>
          <div class="hint">WSL/Linux graphics driver deadlock detected.</div>
          <div class="actions">
            <button class="retry-btn" @click="handleRetry">RETRY_INITIALIZATION</button>
          </div>
        </div>
      </div>
    </template>
    <div class="tunnel-hint" v-if="inputUrl.includes('localhost')">⚡ Agent Injected</div>
    <button class="os-browser-btn" @click="openInBrowser">🌍</button>
  </div>
</template>

<style scoped>
.iframe-policy-hint {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.7);
  color: #71717a;
  font-size: 8px;
  padding: 2px 8px;
  pointer-events: none;
  text-align: center;
  z-index: 10;
  font-family: 'JetBrains Mono', monospace;
}

.cyber-webview { display: flex; flex-direction: column; height: 100%; width: 100%; background: #000; position: relative; border: 1px solid #18181b; }
.drag-handle { height: 32px; background: #050505; border-bottom: 1px solid #18181b; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; position: relative; overflow: hidden; flex-shrink: 0; }
.drag-region { position: absolute; inset: 0; z-index: 1; }

.url-bar { flex: 1; margin: 0 10px; z-index: 5; position: relative; display: flex; align-items: center; }
.url-input { width: 100%; background: #111; border: 1px solid #222; color: #a1a1aa; font-size: 11px; padding: 4px 12px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; outline: none; transition: all 0.2s; }
.url-input:focus { border-color: #a855f7; color: #fff; background: #000; box-shadow: 0 0 10px rgba(168, 85, 247, 0.2); }

.drag-actions { display: flex; gap: 8px; z-index: 3; align-items: center; }
.pin-btn { background: transparent; border: none; font-size: 10px; cursor: pointer; opacity: 0.5; transition: all 0.2s; }
.pin-btn.active { opacity: 1; filter: drop-shadow(0 0 5px #22c55e); color: #22c55e; }
.mode-tag { font-size: 8px; color: #166534; border: 1px solid #166534; padding: 1px 4px; border-radius: 2px; }

.webview-content { flex: 1; min-height: 0; position: relative; }
.cyber-iframe { width: 100%; height: 100%; background: #fff; border: none; }

.native-placeholder { flex: 1; display: flex; align-items: center; justify-content: center; background: #09090b; color: #a855f7; font-family: 'JetBrains Mono', monospace; font-size: 12px; }
.native-error { flex: 1; display: flex; align-items: center; justify-content: center; background: #09090b; color: #ef4444; font-family: 'JetBrains Mono', monospace; padding: 20px; text-align: center; }
.error-box { border: 1px solid #ef4444; padding: 24px; border-radius: 8px; background: rgba(239, 68, 68, 0.05); max-width: 320px; z-index: 10; }
.error-box .msg { font-weight: bold; margin: 10px 0; letter-spacing: 2px; font-size: 14px; }
.error-box .hint { font-size: 10px; opacity: 0.7; margin-bottom: 20px; }
.actions { display: flex; flex-direction: column; gap: 12px; }
.retry-btn { background: #ef4444; color: #000; border: none; padding: 8px 16px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 11px; }
.retry-btn:hover { background: #f87171; }
.loader { animation: blink 1s infinite; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.tunnel-hint { position: absolute; bottom: 10px; right: 10px; background: rgba(0, 0, 0, 0.8); color: #a855f7; font-size: 9px; padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(168, 85, 247, 0.3); pointer-events: none; font-family: monospace; z-index: 5; }
.os-browser-btn { position: absolute; top: 42px; right: 10px; background: rgba(0, 0, 0, 0.6); border: 1px solid #27272a; color: #a1a1aa; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10; }
.os-browser-btn:hover { background: #18181b; color: #fff; border-color: #a855f7; }
</style>
