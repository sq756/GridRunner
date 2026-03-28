<script setup lang="ts">
import { computed, inject } from 'vue';
import { globalState } from '../store';
import { realFiles, useExplorer } from '../composables/useExplorer';

const terActions = inject<any>('TER_ACTIONS');

const props = defineProps<{
  hostName?: string;
}>();

const emit = defineEmits(['item-drag-start', 'explorer-context']);

const { changeDir } = useExplorer();

const breadcrumbs = computed(() => {
  const parts = (globalState.currentPath || '/').split('/').filter(p => p);
  const rootLabel = props.hostName || globalState.host || 'ROOT';
  const result = [{ name: rootLabel, path: '/' }];
  let current = '';
  for (const part of parts) {
    current += '/' + part;
    result.push({ name: part.toUpperCase(), path: current });
  }
  return result;
});

const sortedFiles = computed(() => {
  const baseFiles = realFiles.value.filter(f => f.name !== '..');
  return [...baseFiles].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
});

const onItemClick = (f: any) => {
  if (f.is_dir) changeDir(f.name);
};

const onContextMenu = (e: MouseEvent, file: any) => {
  console.log('[SftpExplorer] Context menu triggered for:', file?.name);
  emit('explorer-context', { e, file });
  if (terActions) {
    console.log('[SftpExplorer] Calling injected terActions.openExplorerContext');
    terActions.openExplorerContext({ e, file });
  }
};
</script>

<template>
  <div class="sftp-explorer-container">
    <header class="explorer-header">
      <span class="title">SFTP_EXPLORER</span>
      <div class="breadcrumbs-container">
        <div class="breadcrumbs">
          <template v-for="(bc, i) in breadcrumbs" :key="bc.path">
            <span class="bc-item" @click="changeDir(bc.path)">{{ bc.name }}</span>
            <span v-if="i < breadcrumbs.length - 1" class="bc-sep">></span>
          </template>
        </div>
      </div>
    </header>

    <div class="explorer-body scroller-enhanced">
      <ul class="file-list">
        <!-- Parent Dir -->
        <li class="file-item" 
            :class="{ 'disabled': globalState.currentPath === '/' }"
            @click="globalState.currentPath !== '/' && changeDir('..')" 
            @contextmenu.prevent.stop="globalState.currentPath !== '/' && onContextMenu($event, { name: '..', is_dir: true })">
          <span class="icon">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10h10a8 8 0 0 1 8 8v2"></path><polyline points="7 14 3 10 7 6"></polyline></svg>
          </span>
          <span class="name">..</span>
        </li>
        <!-- Files & Folders -->
        <li v-for="f in sortedFiles" :key="f.name" 
            class="file-item" 
            @click="onItemClick(f)"
            @contextmenu.prevent.stop="onContextMenu($event, f)"
            draggable="true"
            @dragstart="$emit('item-drag-start', f)">
          <span class="icon">
            <svg v-if="f.is_dir" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
          </span>
          <span class="name" :title="f.path">{{ f.name }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.sftp-explorer-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: transparent;
}

.explorer-header {
  padding: 12px 16px;
  border-bottom: 1px solid #27272a;
  flex-shrink: 0;
  max-width: 100%;
  overflow: hidden;
}

.explorer-header .title {
  font-size: calc(10px * var(--ter-ui-scale));
  color: #71717a;
  letter-spacing: 2px;
  display: block;
  margin-bottom: calc(8px * var(--ter-ui-scale));
}

.breadcrumbs-container {
  width: 100%;
  overflow-x: auto;
  scrollbar-width: none; /* Hide scrollbar */
  position: relative;
}
.breadcrumbs-container::-webkit-scrollbar { display: none; }

.breadcrumbs {
  display: flex;
  flex-wrap: nowrap; /* Prevent wrapping */
  gap: calc(4px * var(--ter-ui-scale));
  font-family: 'JetBrains Mono', monospace;
  font-size: calc(11px * var(--ter-ui-scale));
  white-space: nowrap;
}

.bc-item {
  color: #22c55e;
  cursor: pointer;
  transition: all 0.1s;
}

.bc-item:hover {
  text-decoration: underline;
  filter: brightness(1.2);
}

.bc-sep {
  color: #3f3f46;
  user-select: none;
}

.explorer-body {
  flex: 1;
  overflow-y: auto !important;
  min-height: 0;
}

.scroller-enhanced::-webkit-scrollbar { width: 4px; }
.scroller-enhanced::-webkit-scrollbar-thumb { background: #27272a; border-radius: 2px; }

.file-list {
  list-style: none;
  padding: 8px;
  margin: 0;
}

.file-item {
  display: flex;
  align-items: center;
  padding: calc(10px * var(--ter-ui-scale)) calc(14px * var(--ter-ui-scale));
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.1s ease;
  font-size: calc(13px * var(--ter-ui-scale));
  color: #d4d4d8;
  margin-bottom: calc(2px * var(--ter-ui-scale));
  border: 1px solid transparent;
  position: relative;
  z-index: 1;
}

.file-item.disabled {
  opacity: 0.3;
  cursor: not-allowed;
  pointer-events: none;
}

.file-item:hover {
  background: rgba(34, 197, 94, 0.05);
  color: #22c55e;
  border-color: rgba(34, 197, 94, 0.1);
}

.file-item .icon {
  margin-right: 12px; /* Increased to 12px spacing */
  font-size: 14px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s;
}

.file-item:hover .icon {
  transform: scale(1.1);
}

.file-item .name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis; /* Automatic truncation */
  flex: 1;
}
</style>
