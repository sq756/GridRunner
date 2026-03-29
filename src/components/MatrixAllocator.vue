<script setup lang="ts">
import { computed } from 'vue';
import { globalState } from '../store';
import LayoutNodeRenderer from './LayoutNodeRenderer.vue';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  sharedProps?: any;
}>();

const tree = computed(() => globalState.workspaceTree);

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
    <LayoutNodeRenderer :node="tree" :sharedProps="sharedProps" 
      @switch-tab="$emit('switch-tab', $event)"
      @proc-context="$emit('proc-context', $event)"
      @terminal-context="$emit('terminal-context', $event)"
      @explorer-context="$emit('explorer-context', $event)"
      @web-context="$emit('web-context', $event)"
      @close-tab="$emit('close-tab', $event)"
      @new-tab="$emit('new-tab', $event)"
      @toggle-split="$emit('toggle-split', $event)" />
  </div>
</template>

<style scoped>
.matrix-allocator {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
}
</style>
