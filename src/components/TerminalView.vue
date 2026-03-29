<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { terminalManager } from '../TerminalManager';

const props = defineProps<{
  id: string;
  active: boolean;
  uiScale: number;
}>();

const emit = defineEmits(['terminal-context', 'new-tab', 'close-tab', 'toggle-split']);

const terminalRef = ref<HTMLElement | null>(null);
const showJumpBtn = ref(false);
let resizeObserver: ResizeObserver | null = null;
let fitTimeout: any = null;

const performFit = async () => {
  if (fitTimeout) clearTimeout(fitTimeout);
  fitTimeout = setTimeout(async () => {
    if (props.active && terminalRef.value) {
      const width = terminalRef.value.offsetWidth;
      const height = terminalRef.value.offsetHeight;
      
      if (width > 0 && height > 0) {
        const instance = await terminalManager.getOrCreate(props.id);
        instance.fit.fit();
        
        const { cols, rows } = instance.term;
        // Sync size with backend PTY
        import('@tauri-apps/api/core').then(({ invoke }) => {
          invoke('resize_pty', { tabId: props.id, cols, rows }).catch(() => {});
        });
        
        // v2.14.13: Force scroll to bottom after fit to prevent "scrolling from top" lag
        instance.term.scrollToBottom();
      } else {
        // v2.15.4: Retry fit if element is not yet ready
        performFit();
      }
    }
  }, 100); // Increased debounce for stability
};

const jumpToBottom = async () => {
  const instance = await terminalManager.getOrCreate(props.id);
  instance.term.scrollToBottom();
  showJumpBtn.value = false;
};

let refreshIntervalId: any = null;

const initTerminal = async (retries = 5) => {
  if (!terminalRef.value) {
    if (retries > 0) setTimeout(() => initTerminal(retries - 1), 100);
    return;
  }
  
  try {
    // v2.17.3: Removed manual innerHTML clearing here
    // as it's now handled atomically by TerminalManager.mount
    await terminalManager.mount(props.id, terminalRef.value);
    const instance = await terminalManager.getOrCreate(props.id);
    
    // Setup scroll listener for jump button
    instance.term.onScroll(() => {
      const buffer = instance.term.buffer.active;
      if (buffer.type === 'alternate') {
        showJumpBtn.value = false;
        return;
      }
      showJumpBtn.value = buffer.viewportY < buffer.baseY - 5;
    });

    setTimeout(performFit, 200);
  } catch (e) {
    console.error("Terminal init failed:", e);
    if (retries > 0) setTimeout(() => initTerminal(retries - 1), 200);
  }

  if (resizeObserver) resizeObserver.disconnect();
  resizeObserver = new ResizeObserver(() => {
    if (props.active) performFit();
  });
  resizeObserver.observe(terminalRef.value);

  if (props.active) {
    const instance = await terminalManager.getOrCreate(props.id);
    setTimeout(() => {
      // v3.1.9: Prevent focus theft
      const activeEl = document.activeElement;
      if (!activeEl || activeEl === document.body || activeEl.closest('.terminal-view-container')) {
        instance.term.focus();
      }
      instance.term.refresh(0, instance.term.rows - 1); // Force redraw
    }, 150);
  }
  
  // v2.15.16: Safety refresh interval
  if (refreshIntervalId) clearInterval(refreshIntervalId);
  refreshIntervalId = setInterval(async () => {
    if (props.active && terminalRef.value) {
      const instance = await terminalManager.getOrCreate(props.id);
      if (instance.term.element && instance.term.element.offsetWidth > 0) {
         // Only refresh if visible to save CPU
         instance.term.refresh(0, instance.term.rows - 1);
      }
    }
  }, 3000);
};

onMounted(async () => {
  await initTerminal();
});

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect();
  if (refreshIntervalId) clearInterval(refreshIntervalId);
});

watch(() => props.active, async (isActive) => {
  if (isActive && terminalRef.value) {
    await nextTick(); 
    
    requestAnimationFrame(async () => {
      if (terminalRef.value && terminalRef.value.offsetWidth > 0) {
        await terminalManager.mount(props.id, terminalRef.value);
        
        setTimeout(() => {
          performFit();
          const instance = terminalManager.instances.get(props.id);
          if (instance) {
            instance.term.refresh(0, instance.term.rows - 1);
            // v3.1.9: Prevent focus theft
      const activeEl = document.activeElement;
      if (!activeEl || activeEl === document.body || activeEl.closest('.terminal-view-container')) {
        instance.term.focus();
      }
          }
        }, 30);
      }
    });
  }
});

// v2.15.14: Explicit Re-mount Watcher on ID change
watch(() => props.id, async (newId, oldId) => {
  if (newId !== oldId && terminalRef.value) {
    console.log(`[TerminalView] Tab ID changed from ${oldId} to ${newId}. Re-mounting.`);
    await nextTick();
    terminalManager.mount(newId, terminalRef.value);
    const instance = await terminalManager.getOrCreate(newId);
    performFit();
    if (props.active) {
      setTimeout(() => {
        // v3.1.9: Prevent focus theft
      const activeEl = document.activeElement;
      if (!activeEl || activeEl === document.body || activeEl.closest('.terminal-view-container')) {
        instance.term.focus();
      }
        instance.term.refresh(0, instance.term.rows - 1);
      }, 100);
    }
  }
});
</script>

<template>
  <div ref="terminalRef" 
       class="terminal-view-container" 
       tabindex="-1"
       @mousedown="terminalManager.focus(props.id)"
       @contextmenu.prevent.stop="$emit('terminal-context', { e: $event, id: props.id })">
    <!-- v2.14.13: Floating Jump to Bottom Button -->
    <transition name="fade">
      <button v-if="showJumpBtn" class="jump-bottom-btn" @click="jumpToBottom">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline></svg>
        <span>JUMP_TO_BOTTOM</span>
      </button>
    </transition>
  </div>
</template>

<style>
.terminal-view-container {
  width: 100%;
  height: 100%;
  min-height: 100px;
  min-width: 100px;
  background: #000;
  overflow: hidden;
  position: relative;
  display: block;
  contain: content;
  will-change: transform;
}

.jump-bottom-btn {
  position: absolute;
  bottom: calc(20px * var(--ter-ui-scale));
  right: calc(30px * var(--ter-ui-scale));
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid #22c55e;
  color: #22c55e;
  padding: 6px 12px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: calc(10px * var(--ter-ui-scale));
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 100;
  backdrop-filter: blur(4px);
  box-shadow: 0 0 15px rgba(34, 197, 94, 0.2);
  transition: all 0.2s;
}
.jump-bottom-btn:hover {
  background: #22c55e;
  color: #000;
  box-shadow: 0 0 20px rgba(34, 197, 94, 0.5);
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s, transform 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(10px); }

.terminal-view-container .xterm {
  padding: 10px;
  height: 100%;
  width: 100%;
}

.terminal-view-container .xterm-viewport {
  background-color: #000 !important;
}

.xterm-screen {
  background-color: #09090b !important;
}
</style>
