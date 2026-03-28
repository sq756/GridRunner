<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { globalState } from '../store';
import TileContainer from './TileContainer.vue';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  sharedProps?: any;
}>();

const matrix = computed(() => globalState.workspaceMatrix);
const isSidebarOpen = computed(() => globalState.isSidebarOpen);

const showLeft = computed(() => matrix.value.zoneLeft !== 'NONE' && (matrix.value.zoneLeft !== 'SIDEBAR_PANEL' || isSidebarOpen.value));
const showRight = computed(() => matrix.value.zoneRight !== 'NONE');

// --- Resizer Logic ---
const activeResizer = ref<'left' | 'right' | null>(null);

const startResize = (type: 'left' | 'right') => {
  activeResizer.value = type;
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', stopResize);
};

const handleMouseMove = (e: MouseEvent) => {
  if (!activeResizer.value) return;
  const totalWidth = window.innerWidth;
  
  if (activeResizer.value === 'left') {
    let ratio = (e.clientX / totalWidth) * 100;
    ratio = Math.max(10, Math.min(50, ratio));
    globalState.workspaceMatrix.leftRatio = ratio;
  } else if (activeResizer.value === 'right') {
    let ratio = ((totalWidth - e.clientX) / totalWidth) * 100;
    ratio = Math.max(10, Math.min(50, ratio));
    globalState.workspaceMatrix.rightRatio = ratio;
  }
};

const stopResize = () => {
  activeResizer.value = null;
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', stopResize);
  localStorage.setItem('ter_matrix', JSON.stringify(globalState.workspaceMatrix));
};

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', stopResize);
});

// v2.14.17: Explicit Event Tunneling
const emit = defineEmits([
  'switch-tab', 'proc-context', 'terminal-context', 'run-skill', 
  'fast-access', 'explorer-context', 'resize-sftp-start',
  'change-dir', 'switch-web', 'web-context', 'open-vault-entry', 'view-changed',
  'save-complete', 'cycle-health-mode', 'skill-context', 'header-context',
  'resize-charts', 'open-trigger-settings', 'close-tab', 'new-tab', 'toggle-split'
]);
</script>

<template>
  <div class="matrix-allocator">
    <!-- Zone Left -->
    <div v-if="showLeft" class="zone zone-left" :style="{ width: matrix.leftRatio + '%' }">
      <TileContainer zoneId="LEFT" :widgetId="matrix.zoneLeft" :widgetProps="sharedProps" 
                     @switch-tab="$emit('switch-tab', $event)"
                     @proc-context="$emit('proc-context', $event)"
                     @terminal-context="$emit('terminal-context', $event)"
                     @run-skill="$emit('run-skill', $event)"
                     @fast-access="$emit('fast-access', $event)"
                     @explorer-context="(e: any) => { console.log('[MatrixAllocator] explorer-context'); $emit('explorer-context', e); }"
                     @resize-sftp-start="$emit('resize-sftp-start', $event)"
                     @change-dir="$emit('change-dir', $event)"
                     @switch-web="$emit('switch-web', $event)"
                     @web-context="$emit('web-context', $event)"
                     @open-vault-entry="$emit('open-vault-entry', $event)"
                     @view-changed="$emit('view-changed', $event)"
                     @save-complete="$emit('save-complete', $event)"
                     @cycle-health-mode="$emit('cycle-health-mode', $event)"
                     @skill-context="$emit('skill-context', $event)"
                     @header-context="$emit('header-context', $event)"
                     @resize-charts="$emit('resize-charts', $event)"
                     @open-trigger-settings="$emit('open-trigger-settings', $event)"
                     @close-tab="$emit('close-tab', $event)"
                     @new-tab="$emit('new-tab', $event)"
                     @toggle-split="$emit('toggle-split', $event)"
                     v-on="$attrs" />
    </div>

    <!-- Left Resizer -->
    <div v-if="showLeft" class="resizer v-resizer" @mousedown="startResize('left')" :class="{ active: activeResizer === 'left' }"></div>

    <!-- Zone Main -->
    <div class="zone zone-main">
      <TileContainer zoneId="MAIN" :widgetId="matrix.zoneMain" :widgetProps="sharedProps" 
                     @switch-tab="$emit('switch-tab', $event)"
                     @proc-context="$emit('proc-context', $event)"
                     @terminal-context="$emit('terminal-context', $event)"
                     @run-skill="$emit('run-skill', $event)"
                     @fast-access="$emit('fast-access', $event)"
                     @explorer-context="(e: any) => { console.log('[MatrixAllocator] explorer-context'); $emit('explorer-context', e); }"
                     @resize-sftp-start="$emit('resize-sftp-start', $event)"
                     @change-dir="$emit('change-dir', $event)"
                     @switch-web="$emit('switch-web', $event)"
                     @web-context="$emit('web-context', $event)"
                     @open-vault-entry="$emit('open-vault-entry', $event)"
                     @view-changed="$emit('view-changed', $event)"
                     @save-complete="$emit('save-complete', $event)"
                     @cycle-health-mode="$emit('cycle-health-mode', $event)"
                     @skill-context="$emit('skill-context', $event)"
                     @header-context="$emit('header-context', $event)"
                     @resize-charts="$emit('resize-charts', $event)"
                     @open-trigger-settings="$emit('open-trigger-settings', $event)"
                     @close-tab="$emit('close-tab', $event)"
                     @new-tab="$emit('new-tab', $event)"
                     @toggle-split="$emit('toggle-split', $event)"
                     v-on="$attrs" />
    </div>

    <!-- Right Resizer -->
    <div v-if="showRight" class="resizer v-resizer" @mousedown="startResize('right')" :class="{ active: activeResizer === 'right' }"></div>

    <!-- Zone Right -->
    <div v-if="showRight" class="zone zone-right" :style="{ width: matrix.rightRatio + '%' }">
      <TileContainer zoneId="RIGHT" :widgetId="matrix.zoneRight" :widgetProps="sharedProps" 
                     @switch-tab="$emit('switch-tab', $event)"
                     @proc-context="$emit('proc-context', $event)"
                     @terminal-context="$emit('terminal-context', $event)"
                     @run-skill="$emit('run-skill', $event)"
                     @fast-access="$emit('fast-access', $event)"
                     @explorer-context="(e: any) => { console.log('[MatrixAllocator] explorer-context'); $emit('explorer-context', e); }"
                     @resize-sftp-start="$emit('resize-sftp-start', $event)"
                     @change-dir="$emit('change-dir', $event)"
                     @switch-web="$emit('switch-web', $event)"
                     @web-context="$emit('web-context', $event)"
                     @open-vault-entry="$emit('open-vault-entry', $event)"
                     @view-changed="$emit('view-changed', $event)"
                     @save-complete="$emit('save-complete', $event)"
                     @cycle-health-mode="$emit('cycle-health-mode', $event)"
                     @skill-context="$emit('skill-context', $event)"
                     @header-context="$emit('header-context', $event)"
                     @resize-charts="$emit('resize-charts', $event)"
                     @open-trigger-settings="$emit('open-trigger-settings', $event)"
                     @close-tab="$emit('close-tab', $event)"
                     @new-tab="$emit('new-tab', $event)"
                     @toggle-split="$emit('toggle-split', $event)"
                     v-on="$attrs" />
    </div>
  </div>
</template>

<style scoped>
.matrix-allocator {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
}

.zone {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.zone-main {
  flex: 1; /* Main zone takes remaining space */
  min-width: 0;
}

.resizer {
  background: #18181b;
  z-index: 10;
  transition: background 0.2s;
  flex: 0 0 auto;
}

.v-resizer {
  width: 4px;
  cursor: col-resize;
  border-left: 1px solid #27272a;
  border-right: 1px solid #27272a;
}

.v-resizer:hover, .v-resizer.active {
  background: #22c55e;
}
</style>