<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, useAttrs } from 'vue';
import { type LayoutNode, globalState, storeActions } from '../store';
import TileContainer from './TileContainer.vue';

const props = defineProps<{
  node: LayoutNode;
  sharedProps: any;
}>();

const emit = defineEmits(['switch-tab', 'proc-context', 'terminal-context', 'run-skill', 'fast-access', 'explorer-context', 'resize-sftp-start', 'change-dir', 'switch-web', 'web-context', 'open-vault-entry', 'view-changed', 'save-complete', 'cycle-health-mode', 'skill-context', 'header-context', 'resize-charts', 'open-trigger-settings', 'close-tab', 'new-tab', 'toggle-split']);

const isSplit = computed(() => props.node.type === 'split-h' || props.node.type === 'split-v');
const isHorizontal = computed(() => props.node.type === 'split-h');

// --- Resizer Logic ---
const activeResizer = ref(false);

const startResize = (e: MouseEvent) => {
  activeResizer.value = true;
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', stopResize);
};

const handleMouseMove = (e: MouseEvent) => {
  if (!activeResizer.value) return;
  
  // Find current element bounds to calculate relative percentage
  const container = document.getElementById(`container-${props.node.id}`);
  if (!container) return;
  
  const rect = container.getBoundingClientRect();
  let ratio;
  if (isHorizontal.value) {
    ratio = ((e.clientX - rect.left) / rect.width) * 100;
  } else {
    ratio = ((e.clientY - rect.top) / rect.height) * 100;
  }
  
  props.node.ratio = Math.max(5, Math.min(95, ratio));
};

const stopResize = () => {
  activeResizer.value = false;
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', stopResize);
  // Persist tree
  storeActions.updateLayout(globalState.workspaceTree);
};

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', stopResize);
});

const attrs = useAttrs();
const forwardedAttrs = computed(() => {
  const result = { ...attrs };
  delete result.onFocus; // v3.1.9: Prevent focus theft loops in recursive layouts
  return result;
});
</script>

<template>
  <div :id="'container-' + node.id" 
       class="layout-node" 
       :class="{ 'split-h': node.type === 'split-h', 'split-v': node.type === 'split-v', 'widget-leaf': node.type === 'widget' }">
    
    <template v-if="isSplit && node.children">
      <!-- Child 1 -->
      <div class="child-pane" :style="isHorizontal ? { width: node.ratio + '%' } : { height: node.ratio + '%' }">
        <LayoutNodeRenderer :node="node.children[0]" :sharedProps="sharedProps" v-bind="forwardedAttrs" />
      </div>

      <!-- Resizer -->
      <div class="resizer" :class="isHorizontal ? 'h-resizer' : 'v-resizer'" @mousedown="startResize"></div>

      <!-- Child 2 -->
      <div class="child-pane" :style="isHorizontal ? { width: (100 - node.ratio) + '%' } : { height: (100 - node.ratio) + '%' }">
        <LayoutNodeRenderer :node="node.children[1]" :sharedProps="sharedProps" v-bind="forwardedAttrs" />
      </div>
    </template>

    <template v-else-if="node.type === 'widget'">
      <TileContainer :zoneId="node.id" :widgetId="node.widgetId!" :widgetProps="sharedProps" v-bind="forwardedAttrs" />
    </template>
  </div>
</template>

<style scoped>
.layout-node {
  width: 100%;
  height: 100%;
  display: flex;
  overflow: hidden;
  position: relative;
  background: #000;
}

.split-h { flex-direction: row; }
.split-v { flex-direction: column; }

.child-pane {
  position: relative;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
}

.resizer {
  background: #18181b;
  flex: 0 0 4px;
  z-index: 10;
  transition: background 0.2s;
  position: relative;
}

.resizer:hover { background: #22c55e; }

.h-resizer { cursor: col-resize; border-left: 1px solid #27272a; border-right: 1px solid #27272a; }
.v-resizer { cursor: row-resize; border-top: 1px solid #27272a; border-bottom: 1px solid #27272a; height: 4px; width: 100%; }

.widget-leaf { border: 1px solid transparent; }
</style>
