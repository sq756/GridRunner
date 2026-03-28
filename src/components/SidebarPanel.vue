<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import VaultView from './VaultView.vue';
import SftpExplorer from './SftpExplorer.vue';

import { globalState, backendLogs } from '../store';
import { realFiles } from '../composables/useExplorer';

const props = defineProps<{
  bgTabs: any[];
  webviewInstances?: any[];
  activeWebviewId?: string | null;
  skills: any[];
  lastActivityMap: Record<string, number>;
  cpuChartRef: any;
  memChartRef: any;
  netChartRef: any;
  healthMode: string;
  currentNetSpeed: { up: string, down: string };
  extraStats: any;
  isAutoPilot: boolean;
  isSafeMode: boolean;
  sftpHeight: number;
  slots: string[]; // Fixed: Changed from Record to string array
  isLogsOverlay: boolean;
  hostName?: string;
}>();

const emit = defineEmits([
  'switch-tab', 'proc-context', 'update:isAutoPilot', 'audit-ui', 'switch-mode', 
  'run-skill', 'change-dir', 'view-history', 'open-trigger-settings', 'fast-access', 
  'morse-down', 'morse-up', 'morse-context', 'explorer-context', 'cycle-health-mode', 
  'skill-context', 'header-context', 'resize-sftp-start', 'resize-charts', 
  'view-changed', 'switch-web', 'web-context', 'open-vault-entry'
]);

const activeView = ref<string>('OPS');
const activeLogsSubView = ref<'realtime' | 'vault'>('realtime');

onMounted(() => {
  window.addEventListener('switch-sidebar-view', (e: any) => {
    activeView.value = e.detail;
  });
});

watch(activeView, (nv) => {
  emit('view-changed', nv);
  if (nv === 'OPS') {
    nextTick(() => { emit('resize-charts'); });
  }
});

const cycleView = (direction: 1 | -1 = 1) => {
  if (!props.slots || props.slots.length === 0) return;
  const currentIndex = props.slots.indexOf(activeView.value);
  const nextIndex = (currentIndex + direction + props.slots.length) % props.slots.length;
  activeView.value = props.slots[nextIndex];
};

const handleWheel = (e: WheelEvent) => {
  if (e.shiftKey || (e.target as HTMLElement).closest('.view-switcher-safe')) {
    e.preventDefault();
    cycleView(e.deltaY > 0 ? 1 : -1);
  }
};

const draggedFile = ref<any>(null);
const onDragStart = (f: any) => { if (!f.is_dir) draggedFile.value = f; };
const onDropOnSkill = (skill: any) => {
  if (draggedFile.value) {
    emit('run-skill', { ...skill, context_file: draggedFile.value });
    draggedFile.value = null;
  }
};

const isResizingSFTP = ref(false);
const startResizingSFTP = (e: MouseEvent) => {
  isResizingSFTP.value = true;
  document.addEventListener('mousemove', handleSFTPResize);
  document.addEventListener('mouseup', stopSFTPResize);
};
const explorerWrapperRef = ref<HTMLElement | null>(null);

let sftpResizeFrame = 0;
const handleSFTPResize = (e: MouseEvent) => {
  if (!isResizingSFTP.value || !explorerWrapperRef.value) return;
  if (sftpResizeFrame) cancelAnimationFrame(sftpResizeFrame);
  sftpResizeFrame = requestAnimationFrame(() => {
    const rect = explorerWrapperRef.value!.getBoundingClientRect();
    const newHeight = rect.bottom - e.clientY;
    globalState.sftpHeight = Math.max(100, Math.min(600, newHeight));
  });
};
const stopSFTPResize = () => {
  isResizingSFTP.value = false;
  if (sftpResizeFrame) cancelAnimationFrame(sftpResizeFrame);
  localStorage.setItem('ter_sftp_height', globalState.sftpHeight.toString());
  document.removeEventListener('mousemove', handleSFTPResize);
  document.removeEventListener('mouseup', stopSFTPResize);
};

const lastVisited = computed(() => {
  try {
    const saved = localStorage.getItem('ter_fast_access');
    const parsed = saved ? JSON.parse(saved) : [];
    if (Array.isArray(parsed)) return parsed.slice(0, 5);
  } catch (e) {}
  return [];
});

const sidebarRef = ref<HTMLElement | null>(null);

// v2.11.54: Sidebar Vertical Splitter Logic
const processesHeightPercent = ref(Number(localStorage.getItem('ter_sidebar_split')) || 40);
const isResizingVertical = ref(false);

const startResizingVertical = (e: MouseEvent) => {
  isResizingVertical.value = true;
  document.addEventListener('mousemove', handleVerticalResize);
  document.addEventListener('mouseup', stopVerticalResize);
};

let vertResizeFrame = 0;
const handleVerticalResize = (e: MouseEvent) => {
  if (!isResizingVertical.value || !sidebarRef.value) return;
  if (vertResizeFrame) cancelAnimationFrame(vertResizeFrame);
  vertResizeFrame = requestAnimationFrame(() => {
    const rect = sidebarRef.value!.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const percent = Math.max(10, Math.min(90, (relativeY / rect.height) * 100));
    processesHeightPercent.value = percent;
  });
};

const stopVerticalResize = () => {
  isResizingVertical.value = false;
  if (vertResizeFrame) cancelAnimationFrame(vertResizeFrame);
  localStorage.setItem('ter_sidebar_split', processesHeightPercent.value.toString());
  document.removeEventListener('mousemove', handleVerticalResize);
  document.removeEventListener('mouseup', stopVerticalResize);
};

const onFastAccessClick = (path: string) => { emit('fast-access', path); };
const isTabActive = (id: string) => (Date.now() - (props.lastActivityMap[id] || 0)) < 1000;

// v2.11.47: LOGS Tactical Matrix & Vault Recovery
const logsActiveMode = ref<'live' | 'vault'>('live');
const staticLogTab = ref<'ALL' | 'NET' | 'AI' | 'VAULT' | 'SYS' | 'SEC'>('ALL');

const setLogTab = (tab: any) => {
  staticLogTab.value = tab;
  if (tab === 'VAULT') {
    logsActiveMode.value = 'vault';
  } else {
    logsActiveMode.value = 'live';
  }
};

const getLogColor = (log: string) => {
  if (log.includes('[ERROR]')) return '#ef4444';
  if (log.includes('[SYSTEM]') || log.includes('[STATUS]')) return '#22c55e';
  if (log.includes('[DEBUG]') || log.includes('[INFO]')) return '#888888'; // Increased from #52525b
  if (log.includes('AI') || log.includes('Reasoning')) return '#a855f7';
  return '#a1a1aa';
};

const filteredStrategicLogs = computed(() => {
  if (staticLogTab.value === 'ALL') return backendLogs.value;
  return backendLogs.value.filter(log => {
    if (staticLogTab.value === 'AI') return log.includes('AI') || log.includes('Reasoning') || log.includes('Thinking') || log.includes('Observation');
    if (staticLogTab.value === 'NET') return log.includes('NET') || log.includes('SSH') || log.includes('Tunnel');
    return true;
  });
});

// v2.11.33: Data protection for NaN values
const safeVal = (v: any) => (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) ? '[ SCANNING... ]' : v;
</script>

<template>
  <aside class="side-bar" ref="sidebarRef" @wheel="handleWheel" @contextmenu.prevent>
    <div class="sidebar-branding" @click="globalState.showSettings = true">
      <div class="branding-text">TER // CYBER_DECK</div>
      <div class="scanline"></div>
    </div>

    <div class="view-switcher-safe">
      <button v-for="(s, idx) in slots" :key="s"
              :class="{ active: activeView === s, 'overlay-tab': idx === 2 && isLogsOverlay }" 
              @click="activeView = s">
        [{{ s }}]
      </button>
    </div>

    <!-- OPS View -->
    <div v-show="activeView === 'OPS'" class="safe-view-wrapper safe-flex-wrapper" style="flex-direction: column;">
      <div class="module sys-health" @click="$emit('cycle-health-mode')" style="cursor: pointer; flex-shrink: 0;">
        <header>System Health ({{ healthMode.toUpperCase() }})</header>
        
        <!-- v2.11.33: Resource View with high-fidelity fallback bars -->
        <div v-if="healthMode === 'resource'" class="chart-box-enhanced">
          <div class="stat-row">
            <span class="label">CPU</span>
            <div class="cyber-bar-bg">
              <div class="cyber-bar-fill" :style="{ width: (safeVal(extraStats.cpu_raw) || 0) + '%' }"></div>
            </div>
            <canvas ref="cpuChartRef" width="100" height="30" class="mini-chart overlay-chart"></canvas>
          </div>
          <div class="stat-row">
            <span class="label">RAM</span>
            <div class="cyber-bar-bg">
              <div class="cyber-bar-fill blue" :style="{ width: (safeVal(extraStats.mem_raw) || 0) + '%' }"></div>
            </div>
            <canvas ref="memChartRef" width="100" height="30" class="mini-chart overlay-chart"></canvas>
          </div>
        </div>

        <div v-else-if="healthMode === 'network'" class="net-box">
          <div class="speed-row"><span class="label">UP:</span> <span class="val">{{ currentNetSpeed.up }}</span></div>
          <div class="speed-row"><span class="label">DOWN:</span> <span class="val">{{ currentNetSpeed.down }}</span></div>
          <canvas ref="netChartRef" width="200" height="40" class="net-chart"></canvas>
        </div>

        <!-- v2.11.33: Detail Mode Visual Hierarchies -->
        <div v-else class="detail-box">
          <div class="meta-row"><span class="label highlight">GPU:</span> <span class="val">{{ safeVal(extraStats.gpu) }}</span></div>
          <div class="meta-row"><span class="label highlight">UPT:</span> <span class="val">{{ safeVal(extraStats.uptime) }}</span></div>
          <div class="meta-row"><span class="label highlight">IP:</span> <span class="val">{{ safeVal(extraStats.ip) }}</span></div>
          <div class="meta-row"><span class="label highlight">DISK:</span> <span class="val">{{ safeVal(extraStats.disk) }}</span></div>
        </div>
      </div>

      <div class="module scroller flex-scroller processes" :style="{ height: processesHeightPercent + '%', flex: 'none' }">
        <header>Running Processes</header>
        <ul class="data-list">
          <!-- Terminal Tabs -->
          <li v-for="t in bgTabs" :key="t.id" @click="$emit('switch-tab', t.id)" @contextmenu.prevent.stop="$emit('proc-context', {event: $event, tab: t})">
            <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 17h16M4 7h16M4 12h16"></path></svg></span>
            <span class="name">{{ t.title }}</span>
            <span class="val active" :class="{ 'breathing': isTabActive(t.id) }">ACTIVE</span>
          </li>
          <!-- Webview Instances (v2.11.43) -->
          <li v-for="w in webviewInstances" :key="w.id" @click="$emit('switch-web', w.id)" @contextmenu.prevent.stop="$emit('web-context', {event: $event, web: w})">
            <span class="icon">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
            </span>
            <span class="name">{{ w.title || 'Web Task' }}</span>
            <span class="val active" :class="{ 'highlight': activeWebviewId === w.id }">WEB</span>
          </li>
        </ul>
      </div>

      <!-- v2.11.54: Vertical Splitter -->
      <div class="v-splitter" @mousedown="startResizingVertical">
        <div class="v-line"></div>
      </div>

      <div class="module explorer-wrapper" :style="{ flex: '1', minHeight: '0' }">
        <SftpExplorer
          :hostName="hostName"
          @explorer-context="(e: any) => { console.log('[SidebarPanel] explorer-context'); $emit('explorer-context', e); }"
          @item-drag-start="onDragStart"
        />      </div>
    </div>

    <!-- ARS View: Removed Settings Button -->
    <div v-show="activeView === 'ARS'" class="safe-view-wrapper safe-flex-wrapper">
      <div class="module scroller flex-scroller skills-hub">
        <header class="header-minimal">
          <span>Skill Hub</span>
        </header>
        <ul class="data-list">
          <li v-for="s in skills" :key="s.id" @click="$emit('run-skill', s)" @contextmenu.prevent.stop="$emit('skill-context', {event: $event, skill: s})" @dragover.prevent @drop="onDropOnSkill(s)">
            <span class="icon">
              <svg v-if="!s.icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
              <template v-else>{{ s.icon }}</template>
            </span>
            <span class="name">{{ s.name }}</span><span class="val">RUN</span>
          </li>
        </ul>
      </div>
    </div>

    <!-- NAV View -->
    <div v-show="activeView === 'NAV'" class="safe-view-wrapper safe-flex-wrapper">
      <div class="module scroller flex-scroller history">
        <header>FAST ACCESS</header>
        <ul class="data-list">
          <li v-for="path in lastVisited" :key="path" @click="onFastAccessClick(path)">
            <span class="icon">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2s-7 7-6.05 11z"></path></svg>
            </span>
            <span class="name">{{ path.split('/').pop() || '/' }}</span><span class="val">GOTO</span>
          </li>
        </ul>
      </div>
      
      <!-- v2.11.46: Refactored SFTP Explorer with Breadcrumbs and Proper Scrolling -->
      <div class="v-splitter" @mousedown="startResizingSFTP">
        <div class="v-line"></div>
      </div>
      <div class="module explorer-wrapper" ref="explorerWrapperRef" :style="{ height: sftpHeight + 'px', flex: 'none' }">
        <SftpExplorer
          :hostName="hostName"
          @explorer-context="(e: any) => { console.log('[SidebarPanel] explorer-context'); $emit('explorer-context', e); }"
          @item-drag-start="onDragStart"
        />
      </div>
    </div>

    <!-- LOGS View (v2.11.47 Tactical Matrix) -->
    <div v-show="activeView === 'LOGS'" class="safe-view-wrapper safe-flex-wrapper">
      <div class="tactical-logs-matrix">
        <button v-for="t in (['ALL', 'NET', 'AI', 'VAULT', 'SYS', 'SEC'] as const)" :key="t"
                :class="{ active: staticLogTab === t, 'is-special': ['AI', 'VAULT'].includes(t) && staticLogTab === t }"
                @click="setLogTab(t)">
          [{{ t }}]
        </button>
      </div>
      
      <div v-if="logsActiveMode === 'live'" class="module scroller static-log-container full-height">
        <header>STRATEGIC_ARCHIVE_LOGS</header>
        <div class="log-stream-static">
          <div v-for="(log, i) in filteredStrategicLogs" :key="i" 
               class="log-line-static"
               :style="{ color: getLogColor(log) }">
            {{ log }}
          </div>
        </div>
      </div>

      <div v-else class="full-height">
        <VaultView @open-entry="(e) => $emit('open-vault-entry', e)" />
      </div>
    </div>
  </aside>
</template>

<style scoped>
.view-switcher-safe { display: flex; height: calc(28px * var(--ter-ui-scale)); background: #000; border-bottom: 1px solid #18181b; }
.view-switcher-safe button { flex: 1; background: transparent; border: none; color: #71717a; font-family: 'JetBrains Mono', monospace; font-size: calc(10px * var(--ter-ui-scale)); cursor: pointer; transition: all 0.2s; font-weight: bold; }
.view-switcher-safe button.active { color: #22c55e; background: rgba(34, 197, 94, 0.1); border-bottom: calc(2px * var(--ter-ui-scale)) solid #22c55e; }
.view-switcher-safe button.overlay-tab { color: #a855f7; border-bottom-color: #a855f7; animation: border-pulse 1s infinite; }

@keyframes border-pulse { 0%, 100% { border-bottom-width: 2px; } 50% { border-bottom-width: 4px; } }

.side-bar { background: #09090b; width: 100%; height: 100%; display: flex; flex-direction: column; flex-shrink: 0; border-right: 1px solid #27272a; overflow: hidden; }
.sidebar-branding { height: var(--ter-header-height); display: flex; align-items: center; padding: 0 calc(16px * var(--ter-ui-scale)); background: rgba(34, 197, 94, 0.05); border-bottom: 1px solid #27272a; position: relative; overflow: hidden; cursor: pointer; }
.branding-text { font-size: calc(10px * var(--ter-ui-scale)); color: #22c55e; letter-spacing: 0.2em; font-family: 'JetBrains Mono', monospace; font-weight: bold; z-index: 1; }
.safe-view-wrapper { display: flex; flex-direction: column; flex: 1; overflow: hidden; height: 100%; }
.safe-flex-wrapper .flex-scroller { flex: 1; max-height: none; height: 100%; }
.module { padding: calc(16px * var(--ter-ui-scale)); border-bottom: 1px solid #27272a; }

/* v2.11.33: Unified Header Letter Spacing */
.module header { font-size: calc(11px * var(--ter-ui-scale)); color: #71717a; margin-bottom: calc(12px * var(--ter-ui-scale)); text-transform: uppercase; display: flex; justify-content: space-between; align-items: center; letter-spacing: 2px; }
.header-minimal { display: block; }

.scroller { min-height: 0; overflow-y: auto !important; }
.processes { flex: 1; height: 100%; min-height: 0; }

/* v2.11.54: Vertical Splitter Styles */
.v-splitter { height: 6px; cursor: row-resize; display: flex; align-items: center; justify-content: center; background: #000; flex: 0 0 auto; z-index: 10; }
.v-splitter:hover .v-line { background: #22c55e; box-shadow: 0 0 8px #22c55e; }
.v-line { width: 100%; height: 1px; background: #27272a; transition: all 0.1s; }

.explorer-wrapper { padding: 0 !important; border-bottom: 1px solid #27272a; position: relative; overflow: hidden; display: flex; flex-direction: column; }
.data-list { list-style: none; padding: 0; margin: 0; }
.data-list li, .file-item { display: flex; align-items: center; gap: calc(10px * var(--ter-ui-scale)); padding: calc(8px * var(--ter-ui-scale)) calc(10px * var(--ter-ui-scale)); margin-bottom: calc(4px * var(--ter-ui-scale)); border-radius: 4px; cursor: pointer; color: #d4d4d8; font-size: calc(13px * var(--ter-ui-scale)); transition: all 0.15s ease; border: 1px solid transparent; }
.data-list li:hover { background: rgba(34, 197, 94, 0.05); color: #22c55e; border-color: rgba(34, 197, 94, 0.1); }

.data-list li .val { font-size: calc(9px * var(--ter-ui-scale)); padding: calc(2px * var(--ter-ui-scale)) calc(6px * var(--ter-ui-scale)); border: 1px solid rgba(113, 113, 122, 0.3); border-radius: 3px; color: #71717a; transition: all 0.2s; margin-left: auto; letter-spacing: 1px; font-weight: bold; min-width: calc(40px * var(--ter-ui-scale)); text-align: center; }
.data-list li:hover .val { border-color: #22c55e; color: #22c55e; background: rgba(34, 197, 94, 0.1); box-shadow: 0 0 8px rgba(34, 197, 94, 0.2); }
.data-list li .val.active { color: #22c55e; border-color: rgba(34, 197, 94, 0.4); }
.data-list li .val.highlight { color: #a855f7; border-color: rgba(168, 85, 247, 0.4); }
.data-list li:hover .val.highlight { color: #a855f7; border-color: #a855f7; background: rgba(168, 85, 247, 0.1); box-shadow: 0 0 8px rgba(168, 85, 247, 0.2); }

/* v2.11.33: SFTP folder/icon spacing */
.file-spacing { gap: calc(18px * var(--ter-ui-scale)) !important; }

/* v2.11.47: Tactical LOGS Matrix Styles */
.tactical-logs-matrix { display: grid; grid-template-columns: repeat(3, 1fr); background: #000; border-bottom: 1px solid #18181b; padding: calc(6px * var(--ter-ui-scale)); gap: calc(4px * var(--ter-ui-scale)); flex-shrink: 0; }
.tactical-logs-matrix button { background: transparent; border: 1px solid #27272a; color: #52525b; font-size: calc(9px * var(--ter-ui-scale)); cursor: pointer; height: calc(24px * var(--ter-ui-scale)); display: flex; align-items: center; justify-content: center; border-radius: 2px; text-transform: uppercase; font-weight: bold; transition: all 0.1s; font-family: 'JetBrains Mono', monospace; }
.tactical-logs-matrix button:hover { border-color: #3f3f46; color: #71717a; }
.tactical-logs-matrix button.active { color: #fff; background: #18181b; border-color: #3f3f46; }
.tactical-logs-matrix button.is-special.active { color: #00ff9d; border-color: #00ff9d; }

.static-log-container { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: #000; }
.log-stream-static { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 4px; min-height: 0; }
.log-line-static { font-family: 'JetBrains Mono', monospace; font-size: calc(10px * var(--ter-ui-scale)); color: #a1a1aa; white-space: pre-wrap; word-break: break-all; border-left: calc(2px * var(--ter-ui-scale)) solid transparent; padding-left: calc(8px * var(--ter-ui-scale)); }
.log-line-static:hover { border-left-color: #27272a; background: #09090b; }

.mini-chart { height: 30px; background: transparent; border: none; }
.breathing { animation: breathe 0.8s infinite; }
@keyframes breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
.resizable-handle { height: 4px; cursor: ns-resize; background: transparent; }
.resizable-handle.top { position: absolute; top: 0; left: 0; width: 100%; z-index: 20; }
.resizable-handle:hover { background: #22c55e; }
</style>
