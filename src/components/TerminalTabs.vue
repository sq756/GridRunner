<script setup lang="ts">
import { ref, nextTick, computed } from 'vue';
import TerminalView from './TerminalView.vue';
import TerEditor from './TerEditor.vue';
import CyberWebview from './CyberWebview.vue';
import { terminalManager } from '../TerminalManager';

import { getCurrentWindow } from '@tauri-apps/api/window';
const appWindow = getCurrentWindow();

import { globalState } from '../store';

const props = defineProps<{
  tabs: any[];
  activeTabId: string | null;
  activeTabIdSecondary: string | null;
  splitMode: boolean;
  connectionStatus: 'connected' | 'busy' | 'disconnected';
  uiScale: number;
}>();

const emit = defineEmits(['switch-tab', 'switch-tab-secondary', 'close-tab', 'new-tab', 'terminal-context', 'rename-tab', 'pin-tab', 'copy-tab-id', 'toggle-split', 'save-complete', 'path-updated']);

const splitVertical = ref(localStorage.getItem('ter_split_vertical') === 'true');

const getVisibleTabs = () => props.tabs.filter(t => !t.isBackground);

const minimize = () => appWindow.minimize();
const toggleMaximize = () => appWindow.toggleMaximize();
const closeApp = () => appWindow.close();

// v2.15.60: Persistent View Objects
const primaryActiveTab = computed(() => props.tabs.find(t => t.id === props.activeTabId));
const secondaryActiveTab = computed(() => props.tabs.find(t => t.id === props.activeTabIdSecondary));

const switchTab = (id: string) => {
  globalState.focusedPane = 'primary';
  emit('switch-tab', id);
  nextTick(() => {
    terminalManager.focus(id);
  });
};

const switchTabSecondary = (id: string) => {
  globalState.focusedPane = 'secondary';
  emit('switch-tab-secondary', id);
  nextTick(() => {
    terminalManager.focus(id);
  });
};

const handleTabClick = (id: string) => {
  if (!props.splitMode) {
    switchTab(id);
    return;
  }

  // v2.17.9: Intelligent Pane Switching
  if (id === props.activeTabIdSecondary) {
    globalState.focusedPane = 'secondary';
    terminalManager.focus(id);
    return;
  }
  if (id === props.activeTabId) {
    globalState.focusedPane = 'primary';
    terminalManager.focus(id);
    return;
  }

  if (globalState.focusedPane === 'secondary') {
    switchTabSecondary(id);
  } else {
    switchTab(id);
  }
};

const toggleSplitDirection = () => {
  splitVertical.value = !splitVertical.value;
  localStorage.setItem('ter_split_vertical', splitVertical.value.toString());
  nextTick(() => {
    window.dispatchEvent(new Event('resize'));
  });
};

const handleTabWheel = (e: WheelEvent) => {
  if (e.shiftKey) {
    e.preventDefault();
    const visibleTabs = getVisibleTabs();
    if (visibleTabs.length <= 1) return;
    
    // v2.17.8: Simple & Predictable Wheel Switch
    const currentId = props.activeTabId || visibleTabs[0].id;
    const currentIndex = visibleTabs.findIndex(t => t.id === currentId);
    if (currentIndex === -1) return;
    
    const nextIndex = e.deltaY > 0 
      ? (currentIndex + 1) % visibleTabs.length
      : (currentIndex - 1 + visibleTabs.length) % visibleTabs.length;
    
    switchTab(visibleTabs[nextIndex].id);
  }
};

const handleNewTabContext = (e: MouseEvent) => {
  console.log('[TerminalTabs] handleNewTabContext triggered');
  emit('terminal-context', { 
    e, 
    id: 'NEW_TAB_BUTTON', 
    type: 'new-tab-menu' 
  });
};

const handleStatusClick = () => {
  storeActions.pushLog(`[INFO] HOST: ${globalState.host} | STATUS: ${props.connectionStatus.toUpperCase()} | NODES: ${props.tabs.length}`);
};

const handleStatusDoubleClick = () => {
  globalState.showNetworkMatrix = true;
};

const handleStatusContextMenu = (e: MouseEvent) => {
  emit('terminal-context', { e, id: 'STATUS_DOT', type: 'new-tab-menu' });
};

const handleSearchClick = () => {
  globalState.showSettings = true;
};
</script>

<template>
  <div class="terminal-workspace">
    <!-- Multi-Terminal Tab Bar -->
    <nav class="tab-bar" @wheel="handleTabWheel" style="z-index: 5000; position: relative;">
      <div class="tab-bar-content">
        <div class="status-indicator-zone" 
             @click="handleStatusClick" 
             @dblclick="handleStatusDoubleClick"
             @contextmenu.prevent.stop="handleStatusContextMenu">
          <div class="status-dot large" :class="connectionStatus"></div>
          <div class="quick-switcher-icon" @click.stop="handleSearchClick">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </div>
        </div>

        <div class="tabs-scroll-area">
          <div v-for="t in getVisibleTabs()" 
               :key="t.id" 
               class="tab-item" 
               :class="{ 'active': t.id === activeTabId || (splitMode && t.id === activeTabIdSecondary) }" 
               @click.stop="handleTabClick(t.id)"
               @contextmenu.prevent.stop="$emit('terminal-context', { e: $event, id: t.id, type: 'terminal' })">
            <span class="tab-icon">
              <svg v-if="t.viewType === 'terminal'" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
              <svg v-else-if="t.viewType === 'webview'" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10z"></path></svg>
              <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            </span>
            <span class="title">{{ t.title }}</span>
            <button class="btn-close" @click.stop="$emit('close-tab', t.id)">
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <div class="active-bar" v-if="t.id === activeTabId"></div>
            <div class="active-bar-secondary" v-if="splitMode && t.id === activeTabIdSecondary"></div>
            </div>
        </div>

        <button class="btn-new-tab" @click.stop="$emit('new-tab')" @contextmenu.prevent.stop="handleNewTabContext" title="New Tab">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <button class="btn-split" :class="{ 'active': splitMode }" @click.stop="$emit('toggle-split')" @contextmenu.prevent="toggleSplitDirection">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="3" x2="12" y2="21"></line></svg>
        </button>

        <div class="drag-spacer" data-tauri-drag-region></div>

        <div class="window-controls">
          <button class="win-btn" @click.stop="minimize">_</button>
          <button class="win-btn" @click.stop="toggleMaximize">□</button>
          <button class="win-btn close" @click.stop="closeApp">×</button>
        </div>
      </div>
    </nav>

    <div class="workspace-body" :class="{ 'split-mode': splitMode, 'split-vertical': splitVertical }">
      <!-- Primary Pane -->
      <section class="pane primary-pane" 
               :class="{ 'active-pane': activeTabId && globalState.focusedPane === 'primary' }"
               @mousedown="globalState.focusedPane = 'primary'">
        <div v-if="activeTabId" class="tab-view-wrapper">
          <TerminalView 
            v-show="primaryActiveTab?.viewType === 'terminal'"
            :id="activeTabId" 
            :active="globalState.focusedPane === 'primary'" 
            :uiScale="uiScale"
            @terminal-context="$emit('terminal-context', $event)" 
          />
          
          <TerEditor v-if="primaryActiveTab?.viewType === 'editor'" 
                     :key="'prim-editor-' + activeTabId"
                     :id="activeTabId" 
                     :path="primaryActiveTab.data?.path" 
                     :initialContent="primaryActiveTab.data?.content"
                     @path-updated="$emit('path-updated', $event)"
                     @save-complete="$emit('save-complete')" />
          
          <template v-for="t in getVisibleTabs()" :key="'pane-prim-web-' + t.id">
            <CyberWebview v-if="t.viewType === 'webview'" 
                            v-show="t.id === activeTabId"
                            :id="t.id"
                            :url="t.data?.url" 
                            :isActive="t.id === activeTabId && globalState.focusedPane === 'primary'" />
          </template>
        </div>
        <div v-else class="empty-pane-msg">SELECT_TAB_FOR_DECK_1</div>
      </section>

      <!-- Secondary Pane -->
      <section v-if="splitMode" class="pane secondary-pane" 
               :class="{ 'active-pane-sec': activeTabIdSecondary && globalState.focusedPane === 'secondary' }"
               @mousedown="globalState.focusedPane = 'secondary'">
        <div v-if="activeTabIdSecondary" class="tab-view-wrapper">
          <TerminalView 
            v-show="secondaryActiveTab?.viewType === 'terminal'"
            :id="activeTabIdSecondary" 
            :active="globalState.focusedPane === 'secondary'" 
            :uiScale="uiScale"
            @terminal-context="$emit('terminal-context', $event)" 
          />
          
          <TerEditor v-if="secondaryActiveTab?.viewType === 'editor'" 
                     :key="'sec-editor-' + activeTabIdSecondary"
                     :id="activeTabIdSecondary" 
                     :path="secondaryActiveTab.data?.path" 
                     :initialContent="secondaryActiveTab.data?.content"
                     @path-updated="$emit('path-updated', $event)"
                     @save-complete="$emit('save-complete')" />
          
          <template v-for="t in getVisibleTabs()" :key="'pane-sec-web-' + t.id">
            <CyberWebview v-if="t.viewType === 'webview'" 
                            v-show="t.id === activeTabIdSecondary"
                            :id="t.id"
                            :url="t.data?.url" 
                            :isActive="t.id === activeTabIdSecondary && globalState.focusedPane === 'secondary'" />
          </template>
        </div>
        <div v-else class="empty-pane-msg">SELECT_TAB_FOR_DECK_2</div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.terminal-workspace { flex: 1; display: flex; flex-direction: column; height: 100%; overflow: hidden; background: #000; position: relative; }
.tab-bar { background: #09090b; border-bottom: 1px solid #27272a; height: 32px; flex-shrink: 0; }
.tab-bar-content { display: flex; align-items: center; height: 100%; width: 100%; }
.tabs-scroll-area { display: flex; height: 100%; overflow-x: auto; scrollbar-width: none; }
.tabs-scroll-area::-webkit-scrollbar { display: none; }
.tab-item { padding: 0 12px; height: 100%; display: flex; align-items: center; font-size: 11px; color: #71717a; border-right: 1px solid #18181b; cursor: pointer; position: relative; white-space: nowrap; min-width: 80px; }
.tab-item.active { background: #18181b; color: #fff; }
.active-bar { position: absolute; bottom: 0; left: 0; width: 100%; height: 2px; background: #3b82f6; }
.active-bar-secondary { position: absolute; bottom: 0; left: 0; width: 100%; height: 2px; background: #a855f7; }

.btn-new-tab, .btn-split { 
  background: transparent; 
  border: none; 
  color: #71717a; 
  padding: 0 10px; 
  cursor: pointer; 
  height: 100%; 
  position: relative;
  z-index: 6000 !important; /* Absolute top priority for buttons */
}
.btn-new-tab:hover, .btn-split:hover { color: #fff; background: rgba(255,255,255,0.05); }

.drag-spacer { flex: 1; height: 100%; }
.window-controls { display: flex; height: 100%; }
.win-btn { width: 32px; height: 100%; border: none; background: transparent; color: #71717a; cursor: pointer; }
.win-btn:hover { background: #27272a; color: #fff; }
.win-btn.close:hover { background: #ef4444; }
.workspace-body { flex: 1; display: flex; overflow: hidden; position: relative; }
.workspace-body.split-mode { flex-direction: row; }
.workspace-body.split-vertical { flex-direction: column; }
.pane { flex: 1; position: relative; overflow: hidden; min-width: 0; min-height: 0; border: 1px solid transparent; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.active-pane { 
  border-color: #3b82f688; 
  box-shadow: inset 0 0 30px rgba(59, 130, 246, 0.25), 0 0 20px rgba(59, 130, 246, 0.2); 
}
.active-pane-sec { 
  border-color: #a855f788; 
  box-shadow: inset 0 0 30px rgba(168, 85, 247, 0.25), 0 0 20px rgba(168, 85, 247, 0.2); 
}
.tab-view-wrapper { position: absolute; inset: 0; width: 100%; height: 100%; display: flex; flex-direction: column; }
.empty-pane-msg { height: 100%; display: flex; align-items: center; justify-content: center; color: #27272a; font-size: 10px; letter-spacing: 2px; }
.status-indicator-zone { padding: 0 10px; display: flex; align-items: center; gap: 8px; border-right: 1px solid #18181b; cursor: pointer; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: #52525b; transition: all 0.3s; }
.status-dot.large { width: 10px; height: 10px; box-shadow: 0 0 8px rgba(34, 197, 94, 0.2); }
.status-dot.connected { 
  background: #22c55e; 
  box-shadow: 0 0 12px rgba(34, 197, 94, 0.5);
  animation: pulse-green 2s infinite ease-in-out;
}
@keyframes pulse-green {
  0% { transform: scale(1); filter: brightness(1); }
  50% { transform: scale(1.15); filter: brightness(1.4); box-shadow: 0 0 18px rgba(34, 197, 94, 0.7); }
  100% { transform: scale(1); filter: brightness(1); }
}
.tab-icon { margin-right: 6px; opacity: 0.6; }
.btn-close { margin-left: 8px; background: transparent; border: none; color: #3f3f46; cursor: pointer; padding: 2px; border-radius: 2px; }
.btn-close:hover { color: #ef4444; background: #27272a; }
</style>
