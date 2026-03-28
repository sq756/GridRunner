<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { globalState, storeActions } from '../store';

const matrixConfig = computed(() => globalState.workspaceMatrix);
const saveMatrix = () => {
  localStorage.setItem('ter_matrix', JSON.stringify(globalState.workspaceMatrix));
};

const props = defineProps<{
  isOpen: boolean;
  useNativeWebview: boolean;
  isSafeMode: boolean;
  sidebarSlots: string[];
  uiPrefs: {
    ui_scale: number;
    glow_intensity: number;
    pulse_speed: number;
  }
}>();

const emit = defineEmits(['close', 'update-macros', 'update:useNativeWebview', 'update:isSafeMode', 'update:sidebarSlots', 'auto-detect', 'update-layout']);

const allViews = ['OPS', 'ARS', 'NAV', 'LOGS'];

const toggleSlot = (view: string) => {
  const current = [...props.sidebarSlots];
  if (current.includes(view)) {
    if (current.length > 1) {
      const idx = current.indexOf(view);
      current.splice(idx, 1);
    }
  } else {
    if (current.length < 3) {
      current.push(view);
    } else {
      current.shift();
      current.push(view);
    }
  }
  emit('update:sidebarSlots', current);
};

const macros = ref<{name: string, cmd: string}[]>([]);

onMounted(() => {
  loadCondaPath();
  const saved = localStorage.getItem('ter_macros');
  if (saved) {
    macros.value = JSON.parse(saved);
  } else {
    // Default Presets
    macros.value = [
      { name: 'Root', cmd: 'sudo su -' },
      { name: 'Exit', cmd: 'exit' },
      { name: 'Status', cmd: 'top' },
      { name: 'Clear', cmd: 'clear' }
    ];
    saveMacros();
  }
});

const saveMacros = () => {
  localStorage.setItem('ter_macros', JSON.stringify(macros.value));
  emit('update-macros', macros.value);
};

const addMacro = () => {
  macros.value.push({ name: 'New Macro', cmd: '' });
  saveMacros();
};

const removeMacro = (index: number) => {
  macros.value.splice(index, 1);
  saveMacros();
};

// v2.11.54: Conda Path Logic
const condaPath = ref('');
const loadCondaPath = async () => {
  try {
    const p = await invoke<string>('get_conda_path');
    condaPath.value = p || '';
  } catch (e) {}
};
const saveCondaPath = async () => {
  try {
    await invoke('set_conda_path', { path: condaPath.value });
  } catch (e) {}
};

const saveCursor = () => {
  localStorage.setItem('ter_cursor', JSON.stringify(globalState.cursorConfig));
};
</script>

<template>
  <Transition name="slide">
    <div v-if="isOpen" class="settings-drawer">
      <header class="drawer-header">
        <div class="title-group">
          <span class="icon">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          </span>
          <h3>SYSTEM_SETTINGS</h3>
        </div>
        <button class="close-btn" @click="$emit('close')">×</button>
      </header>

      <div class="drawer-content">
        <section class="config-section">
          <header>🐍 BACKEND_ECOSYSTEM (Conda/Python)</header>
          <div class="setting-row">
            <span class="label">CONDA_EXECUTABLE_PATH</span>
            <input v-model="condaPath" @change="saveCondaPath" class="cyber-input conda-input" placeholder="/path/to/conda" />
          </div>
          <p class="hint">Required for advanced document processing (e.g. pdftotext).</p>
        </section>

        <section class="config-section">
          <header>📐 WORKSPACE MATRIX (Zone Allocation)</header>
          <div class="matrix-configurator">
            <div class="zone-row">
              <span class="zone-label">ZONE_LEFT</span>
              <select v-model="matrixConfig.zoneLeft" @change="saveMatrix" class="cyber-input cyber-select zone-select">
                <option value="SIDEBAR_PANEL">SIDEBAR_PANEL (OPS/NAV)</option>
                <option value="SFTP_EXPLORER">SFTP_EXPLORER</option>
                <option value="CYBER_HUD">CYBER_HUD</option>
                <option value="RUNNING_PROCESSES">RUNNING_PROCESSES</option>
                <option value="NONE">-- HIDDEN --</option>
              </select>
            </div>
            <div class="zone-row">
              <span class="zone-label">ZONE_MAIN</span>
              <select v-model="matrixConfig.zoneMain" @change="saveMatrix" class="cyber-input cyber-select zone-select">
                <option value="TERMINAL_MAIN">TERMINAL_MAIN</option>
                <option value="CYBER_HUD">CYBER_HUD</option>
                <option value="RUNNING_PROCESSES">RUNNING_PROCESSES</option>
              </select>
            </div>
            <div class="zone-row">
              <span class="zone-label">ZONE_RIGHT</span>
              <select v-model="matrixConfig.zoneRight" @change="saveMatrix" class="cyber-input cyber-select zone-select">
                <option value="CYBER_HUD">CYBER_HUD (WEB)</option>
                <option value="SFTP_EXPLORER">SFTP_EXPLORER</option>
                <option value="SIDEBAR_PANEL">SIDEBAR_PANEL</option>
                <option value="RUNNING_PROCESSES">RUNNING_PROCESSES</option>
                <option value="NONE">-- HIDDEN --</option>
              </select>
            </div>
          </div>
          <div class="quick-presets">
            <button class="preset-btn" @click="$emit('update-layout', 'classic')">[ CLASSIC ]</button>
            <button class="preset-btn" @click="$emit('update-layout', 'developer')">[ WEB_DEV ]</button>
            <button class="preset-btn" @click="$emit('update-layout', 'ops')">[ OPS_DUAL ]</button>
          </div>
          <p class="hint">Allocate widgets to specific screen zones dynamically.</p>
        </section>

        <section class="config-section">
          <header>📐 SIDEBAR_DECK SLOTS (Select 3)</header>
          <div class="slot-selector">
            <button v-for="v in allViews" :key="v" 
                    :class="{ active: sidebarSlots.includes(v) }"
                    @click="toggleSlot(v)">
              {{ v }}
            </button>
          </div>
          <p class="hint">The 3rd slot is dynamic and can be overridden by AGENT protocols.</p>
        </section>

        <section class="config-section">
          <header>🛡️ SYSTEM_STABILITY (Emergency Rescue)</header>
          <div class="setting-row">
            <span class="label">SAFE_MODE (Disable Webviews & Glow)</span>
            <label class="mini-switch">
              <input type="checkbox" :checked="isSafeMode" @change="$emit('update:isSafeMode', $event.target.checked)" />
              <span class="slider"></span>
            </label>
          </div>
          <p class="hint">Enable this if you experience black screens or UI lag.</p>
        </section>

        <section class="config-section">
          <header>🌐 WEB_ENGINE CONFIG (Native UI Mode)</header>
          <div class="setting-row">
            <span class="label">USE_NATIVE_ENGINE (Unlock Google/GitHub)</span>
            <label class="mini-switch">
              <input type="checkbox" :checked="globalState.useNativeWebview" @change="storeActions.setNativeWebview(($event.target as HTMLInputElement).checked)" />
              <span class="slider"></span>
            </label>
          </div>
          <p class="hint">Toggle this if you see login restrictions in Webview.</p>
        </section>

        <section class="config-section">
          <header>⌨️ QUICK MACROS (Morse Light Right-Click)</header>
          <div class="macro-list">
            <div v-for="(m, i) in macros" :key="i" class="macro-item">
              <input v-model="m.name" @change="saveMacros" class="macro-name" placeholder="Label" />
              <input v-model="m.cmd" @change="saveMacros" class="macro-cmd" placeholder="Command" />
              <button @click="removeMacro(i)" class="delete-btn">🗑️</button>
            </div>
          </div>
          <button @click="addMacro" class="btn-add-macro">+ Add New Macro</button>
        </section>

        <section class="config-section">
          <header>🎨 UI_PREFERENCES_MATRIX</header>
          <div class="preference-matrix">
            <!-- Row 1: TYPO -->
            <div class="pref-column">
              <span class="column-header">[ TYPO ]</span>
              <div class="pref-item">
                <label>UI_SCALE</label>
                <div class="control-row">
                  <input type="range" v-model="uiPrefs.ui_scale" min="0.5" max="2.0" step="0.1" />
                  <span class="val">{{ uiPrefs.ui_scale }}x</span>
                </div>
              </div>
              <button class="auto-detect-btn" @click="$emit('auto-detect')">AUTO_DETECT</button>
            </div>

            <!-- Row 2: CHROM -->
            <div class="pref-column">
              <span class="column-header">[ CHROM ]</span>
              <div class="pref-item">
                <label>GLOW</label>
                <div class="control-row">
                  <input type="range" v-model="uiPrefs.glow_intensity" min="0" max="100" />
                  <span class="val">{{ uiPrefs.glow_intensity }}%</span>
                </div>
              </div>
            </div>

            <!-- Row 3: BIO -->
            <div class="pref-column">
              <span class="column-header">[ BIO ]</span>
              <div class="pref-item">
                <label>PULSE</label>
                <div class="control-row">
                  <input type="range" v-model="uiPrefs.pulse_speed" min="0" max="100" />
                  <span class="val">{{ uiPrefs.pulse_speed }}ms</span>
                </div>
              </div>
            </div>
          </div>
          <p class="hint">Real-time GPU rendering parameters. Verified for stability.</p>
        </section>

        <section class="config-section">
          <header>🖱️ CYBER_CURSOR (Interaction Model)</header>
          <div class="cursor-settings-box">
            <div class="setting-row mini">
              <span class="label">ENABLE_CUSTOM_CURSOR</span>
              <label class="mini-switch">
                <input type="checkbox" v-model="globalState.cursorConfig.enabled" @change="saveCursor" />
                <span class="slider"></span>
              </label>
            </div>
            
            <div class="cursor-controls" :class="{ disabled: !globalState.cursorConfig.enabled }">
              <div class="pref-item">
                <label>CURSOR_SIZE</label>
                <div class="control-row">
                  <input type="range" v-model="globalState.cursorConfig.size" min="4" max="24" @input="saveCursor" />
                  <span class="val">{{ globalState.cursorConfig.size }}px</span>
                </div>
              </div>
              <div class="pref-item">
                <label>GLOW_RADIUS</label>
                <div class="control-row">
                  <input type="range" v-model="globalState.cursorConfig.glow" min="0" max="40" @input="saveCursor" />
                  <span class="val">{{ globalState.cursorConfig.glow }}px</span>
                </div>
              </div>
              <div class="setting-row mini borderless">
                <span class="label">BREATHING_EFFECT</span>
                <label class="mini-switch">
                  <input type="checkbox" v-model="globalState.cursorConfig.breathing" @change="saveCursor" />
                  <span class="slider"></span>
                </label>
              </div>
              <div class="setting-row mini borderless">
                <span class="label">CURSOR_COLOR</span>
                <input type="color" v-model="globalState.cursorConfig.color" @change="saveCursor" class="color-picker" />
              </div>
            </div>
          </div>
          <p class="hint">Virtual pointer rendering with haptic feedback simulation.</p>
        </section>
      </div>

      <footer class="drawer-footer">
        <span class="ver">TER_CORE v2.13.2</span>
        <div class="status-group">
          <span class="status-tag">SYS_LOCK: OFF</span>
          <span class="status-tag highlight">ENCRYPTION_ACTIVE</span>
        </div>
      </footer>
    </div>
  </Transition>
  <div v-if="isOpen" class="drawer-overlay" @click="$emit('close')"></div>
</template>

<style scoped>
.settings-drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: 380px;
  height: 100vh;
  background: rgba(9, 9, 11, 0.95);
  backdrop-filter: blur(20px);
  border-left: 1px solid #22c55e44;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  box-shadow: -10px 0 30px rgba(0, 0, 0, 0.5);
}

.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 2147483646;
}

.drawer-header {
  padding: 20px;
  border-bottom: 1px solid #27272a;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-group { display: flex; align-items: center; gap: 12px; }
.title-group h3 { font-size: 14px; color: #22c55e; letter-spacing: 0.1em; margin: 0; }

.close-btn { background: transparent; border: none; color: #71717a; font-size: 24px; cursor: pointer; transition: color 0.2s; }
.close-btn:hover { color: #fff; }

.drawer-content { flex: 1; overflow-y: auto; padding: 20px; }

.config-section { margin-bottom: calc(30px * var(--ter-ui-scale)); }
.config-section header { font-size: calc(11px * var(--ter-ui-scale)); color: #71717a; margin-bottom: calc(15px * var(--ter-ui-scale)); font-weight: bold; }

.setting-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: calc(15px * var(--ter-ui-scale)); background: rgba(255, 255, 255, 0.03); padding: calc(10px * var(--ter-ui-scale)); border-radius: 6px; border: 1px solid #27272a; }
.setting-row.mini { padding: calc(6px * var(--ter-ui-scale)) calc(10px * var(--ter-ui-scale)); margin-bottom: calc(8px * var(--ter-ui-scale)); }
.setting-row.borderless { background: transparent; border: none; padding-left: 0; padding-right: 0; }

.cursor-settings-box { background: rgba(255, 255, 255, 0.02); padding: calc(12px * var(--ter-ui-scale)); border-radius: 8px; border: 1px solid #27272a; }
.cursor-controls { display: flex; flex-direction: column; gap: calc(12px * var(--ter-ui-scale)); margin-top: calc(10px * var(--ter-ui-scale)); }
.cursor-controls.disabled { opacity: 0.3; pointer-events: none; }

.color-picker { background: transparent; border: 1px solid #3f3f46; width: calc(40px * var(--ter-ui-scale)); height: calc(20px * var(--ter-ui-scale)); cursor: pointer; padding: 0; border-radius: 2px; }

.slot-selector { display: flex; gap: calc(8px * var(--ter-ui-scale)); margin-bottom: calc(10px * var(--ter-ui-scale)); }
.slot-selector button { flex: 1; padding: calc(6px * var(--ter-ui-scale)); background: #000; border: 1px solid #27272a; color: #52525b; font-size: calc(10px * var(--ter-ui-scale)); font-family: 'JetBrains Mono', monospace; cursor: pointer; border-radius: 4px; transition: all 0.2s; }
.slot-selector button.active { border-color: #22c55e; color: #22c55e; box-shadow: 0 0 calc(10px * var(--ter-ui-scale)) rgba(34, 197, 94, 0.2); }

.matrix-configurator { display: flex; flex-direction: column; gap: calc(8px * var(--ter-ui-scale)); margin-bottom: calc(15px * var(--ter-ui-scale)); background: rgba(255, 255, 255, 0.02); padding: calc(10px * var(--ter-ui-scale)); border-radius: 6px; border: 1px dashed #27272a; }
.zone-row { display: flex; align-items: center; justify-content: space-between; gap: calc(10px * var(--ter-ui-scale)); }
.zone-label { font-size: calc(9px * var(--ter-ui-scale)); color: #22c55e; font-family: 'JetBrains Mono', monospace; font-weight: bold; width: calc(80px * var(--ter-ui-scale)); }
.zone-select { flex: 1; padding: calc(4px * var(--ter-ui-scale)) calc(8px * var(--ter-ui-scale)) !important; font-size: calc(10px * var(--ter-ui-scale)) !important; margin-bottom: 0 !important; }
.quick-presets { display: flex; gap: calc(6px * var(--ter-ui-scale)); margin-bottom: calc(10px * var(--ter-ui-scale)); }
.preset-btn { flex: 1; background: transparent; border: 1px solid #3f3f46; color: #a1a1aa; font-size: calc(9px * var(--ter-ui-scale)); font-family: 'JetBrains Mono', monospace; cursor: pointer; padding: calc(4px * var(--ter-ui-scale)); border-radius: 2px; transition: all 0.2s; }
.preset-btn:hover { border-color: #22c55e; color: #22c55e; }

.macro-list { display: flex; flex-direction: column; gap: calc(10px * var(--ter-ui-scale)); margin-bottom: calc(15px * var(--ter-ui-scale)); }
.macro-item { display: flex; gap: calc(8px * var(--ter-ui-scale)); align-items: center; background: rgba(255, 255, 255, 0.03); padding: calc(8px * var(--ter-ui-scale)); border-radius: 6px; border: 1px solid #27272a; }

.macro-name { width: calc(80px * var(--ter-ui-scale)); background: transparent; border: none; border-bottom: 1px dashed #3f3f46; color: #fff; font-size: calc(12px * var(--ter-ui-scale)); outline: none; }
.macro-cmd { flex: 1; background: transparent; border: none; color: #22c55e; font-size: calc(12px * var(--ter-ui-scale)); font-family: monospace; outline: none; }

.conda-input { width: calc(180px * var(--ter-ui-scale)); font-size: calc(10px * var(--ter-ui-scale)) !important; padding: calc(4px * var(--ter-ui-scale)) calc(8px * var(--ter-ui-scale)) !important; color: #a1a1aa !important; }

/* v2.13.2: Cyber Toggle Switch */
.mini-switch {
  position: relative;
  display: inline-block;
  width: calc(34px * var(--ter-ui-scale));
  height: calc(18px * var(--ter-ui-scale));
}
.mini-switch input { opacity: 0; width: 0; height: 0; }
.slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: #18181b;
  border: 1px solid #3f3f46;
  transition: .3s;
  border-radius: 2px;
}
.slider:before {
  position: absolute;
  content: "";
  height: calc(10px * var(--ter-ui-scale));
  width: calc(10px * var(--ter-ui-scale));
  left: calc(3px * var(--ter-ui-scale));
  bottom: calc(3px * var(--ter-ui-scale));
  background-color: #52525b;
  transition: .3s;
  border-radius: 1px;
}
input:checked + .slider {
  border-color: #22c55e;
  background-color: rgba(34, 197, 94, 0.1);
  box-shadow: 0 0 calc(8px * var(--ter-ui-scale)) rgba(34, 197, 94, 0.2);
}
input:checked + .slider:before {
  transform: translateX(calc(16px * var(--ter-ui-scale)));
  background-color: #22c55e;
  box-shadow: 0 0 calc(5px * var(--ter-ui-scale)) #22c55e;
}

.delete-btn { background: transparent; border: none; cursor: pointer; opacity: 0.4; transition: opacity 0.2s; }
.delete-btn:hover { opacity: 1; }

.btn-add-macro { width: 100%; padding: calc(8px * var(--ter-ui-scale)); background: rgba(34, 197, 94, 0.1); border: 1px dashed #22c55e; color: #22c55e; border-radius: 6px; cursor: pointer; font-size: calc(11px * var(--ter-ui-scale)); transition: all 0.2s; }
.btn-add-macro:hover { background: rgba(34, 197, 94, 0.2); }

.config-section.disabled { opacity: 0.4; }
.hint { font-size: calc(10px * var(--ter-ui-scale)); color: #52525b; font-style: italic; }

/* v2.11.48: Tactical Preference Matrix Styles */
.preference-matrix { display: grid; grid-template-columns: repeat(3, 1fr); gap: calc(12px * var(--ter-ui-scale)); background: rgba(255, 255, 255, 0.02); padding: calc(12px * var(--ter-ui-scale)); border-radius: 8px; border: 1px solid #27272a; margin-bottom: calc(10px * var(--ter-ui-scale)); }
.pref-column { display: flex; flex-direction: column; gap: calc(10px * var(--ter-ui-scale)); }
.column-header { font-size: calc(9px * var(--ter-ui-scale)); color: #22c55e; font-weight: bold; letter-spacing: 1px; border-bottom: 1px solid #18181b; padding-bottom: calc(4px * var(--ter-ui-scale)); }
.pref-item { display: flex; flex-direction: column; gap: calc(4px * var(--ter-ui-scale)); }
.pref-item label { font-size: calc(8px * var(--ter-ui-scale)); color: #71717a; text-transform: uppercase; }
.control-row { display: flex; align-items: center; gap: calc(6px * var(--ter-ui-scale)); }
.pref-item input[type="range"] { flex: 1; accent-color: #22c55e; height: 4px; cursor: pointer; }
.pref-item .val { font-size: calc(9px * var(--ter-ui-scale)); color: #fff; font-family: 'JetBrains Mono', monospace; min-width: calc(30px * var(--ter-ui-scale)); text-align: right; }
.auto-detect-btn { margin-top: auto; background: #18181b; border: 1px solid #27272a; color: #71717a; font-size: calc(8px * var(--ter-ui-scale)); padding: calc(4px * var(--ter-ui-scale)); border-radius: 2px; cursor: pointer; transition: all 0.1s; font-weight: bold; }
.auto-detect-btn:hover { color: #22c55e; border-color: #22c55e; }

.drawer-footer { padding: calc(15px * var(--ter-ui-scale)) calc(20px * var(--ter-ui-scale)); border-top: 1px solid #27272a; display: flex; justify-content: space-between; align-items: center; font-family: 'JetBrains Mono', monospace; font-size: calc(9px * var(--ter-ui-scale)); color: #52525b; }
.status-group { display: flex; gap: calc(12px * var(--ter-ui-scale)); }
.status-tag { cursor: help; transition: color 0.2s; }
.status-tag:hover { color: #a1a1aa; }
.status-tag.highlight { color: #166534; }
.status-tag.highlight:hover { color: #22c55e; text-shadow: 0 0 calc(5px * var(--ter-ui-scale)) #22c55e; }

.slide-enter-active, .slide-leave-active { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.slide-enter-from, .slide-leave-to { transform: translateX(100%); }
</style>