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
    <LayoutNodeRenderer :node="tree" :sharedProps="sharedProps" v-bind="$attrs" />
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
