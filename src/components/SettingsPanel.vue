<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { globalState, storeActions } from '../store';
import { useUIPreferences } from '../composables/useUIPreferences';

// v3.1.10: Using central preference manager
const { uiPrefs: localUiPrefs } = useUIPreferences();

const saveMatrix = () => {
  localStorage.setItem('ter_workspace_tree', JSON.stringify(globalState.workspaceTree));
};

const props = defineProps<{
  isOpen: boolean;
  useNativeWebview: boolean;
  isSafeMode: boolean;
  sidebarSlots: string[];
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

      <div class="drawer-content scroller">
        <section class="config-section">
          <header>📐 WORKSPACE PRESETS (Neural Layouts)</header>
          <div class="quick-presets">
            <button class="preset-btn" @click="storeActions.setPreset('RESEARCH')">[ RESEARCH ]</button>
            <button class="preset-btn" @click="storeActions.setPreset('DEV')">[ DEV_STUDIO ]</button>
            <button class="preset-btn" @click="storeActions.setPreset('SIMULATION')">[ SIM_MODE ]</button>
          </div>
          <p class="hint">Switch between pre-configured recursive layout matrices.</p>
        </section>

        <section class="config-section">
          <header>🛡️ SYSTEM_STABILITY (Safe Engine)</header>
          <div class="setting-row">
            <span class="label">SAFE_MODE (Disable Effects)</span>
            <label class="mini-switch">
              <input type="checkbox" :checked="isSafeMode" @change="$emit('update:isSafeMode', ($event.target as HTMLInputElement).checked)" />
              <span class="slider"></span>
            </label>
          </div>
        </section>

        <section class="config-section">
          <header>🎨 UI_PREFERENCES_MATRIX</header>
          <div class="preference-matrix">
            <div class="pref-column">
              <span class="column-header">[ TYPO ]</span>
              <div class="pref-item">
                <label>UI_SCALE</label>
                <div class="control-row">
                  <input type="range" v-model.number="localUiPrefs.ui_scale" min="0.5" max="2.0" step="0.1" />
                  <span class="val">{{ localUiPrefs.ui_scale }}x</span>
                </div>
              </div>
            </div>
            <div class="pref-column">
              <span class="column-header">[ CHROM ]</span>
              <div class="pref-item">
                <label>GLOW</label>
                <div class="control-row">
                  <input type="range" v-model.number="localUiPrefs.glow_intensity" min="0" max="100" />
                  <span class="val">{{ localUiPrefs.glow_intensity }}%</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="config-section">
          <header>🖱️ CYBER_CURSOR</header>
          <div class="cursor-settings-box">
            <div class="setting-row mini borderless">
              <span class="label">ENABLE_CUSTOM_CURSOR</span>
              <label class="mini-switch">
                <input type="checkbox" v-model="globalState.cursorConfig.enabled" @change="saveCursor" />
                <span class="slider"></span>
              </label>
            </div>
            <div v-if="globalState.cursorConfig.enabled" class="cursor-controls">
              <div class="pref-item">
                <label>CURSOR_SIZE</label>
                <input type="range" v-model.number="globalState.cursorConfig.size" min="4" max="24" @input="saveCursor" />
              </div>
              <div class="setting-row mini borderless">
                <span class="label">COLOR</span>
                <input type="color" v-model="globalState.cursorConfig.color" @change="saveCursor" />
              </div>
            </div>
          </div>
        </section>

        <section class="config-section">
          <header>⌨️ QUICK MACROS</header>
          <div class="macro-list">
            <div v-for="(m, i) in macros" :key="i" class="macro-item">
              <input v-model="m.name" @change="saveMacros" class="macro-name" />
              <input v-model="m.cmd" @change="saveMacros" class="macro-cmd" />
              <button @click="removeMacro(i)" class="delete-btn">🗑️</button>
            </div>
          </div>
          <button @click="addMacro" class="btn-add-macro">+ Add New Macro</button>
        </section>
      </div>

      <footer class="drawer-footer">
        <span class="ver">GRIDRUNNER v3.1.10</span>
        <div class="status-group">
          <span class="status-tag highlight">STABLE_CHANNEL</span>
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
  background: rgba(9, 9, 11, 0.98);
  backdrop-filter: blur(20px);
  border-left: 1px solid #22c55e44;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
}
.drawer-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); z-index: 2147483646; }
.drawer-header { padding: 20px; border-bottom: 1px solid #27272a; display: flex; justify-content: space-between; align-items: center; }
.title-group { display: flex; align-items: center; gap: 12px; }
.title-group h3 { font-size: 14px; color: #22c55e; letter-spacing: 0.1em; margin: 0; }
.close-btn { background: transparent; border: none; color: #71717a; font-size: 24px; cursor: pointer; }
.drawer-content { flex: 1; overflow-y: auto; padding: 20px; }
.config-section { margin-bottom: 30px; }
.config-section header { font-size: 11px; color: #71717a; margin-bottom: 15px; font-weight: bold; }
.setting-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; background: rgba(255, 255, 255, 0.03); padding: 10px; border-radius: 6px; }
.setting-row.borderless { background: transparent; padding: 0; }
.preference-matrix { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; background: rgba(255, 255, 255, 0.02); padding: 15px; border-radius: 8px; }
.pref-column { display: flex; flex-direction: column; gap: 10px; }
.column-header { font-size: 9px; color: #22c55e; border-bottom: 1px solid #18181b; }
.control-row { display: flex; align-items: center; gap: 10px; }
.val { font-size: 9px; color: #fff; min-width: 30px; }
.quick-presets { display: flex; gap: 8px; }
.preset-btn { flex: 1; background: transparent; border: 1px solid #3f3f46; color: #a1a1aa; font-size: 9px; cursor: pointer; padding: 6px; }
.preset-btn:hover { border-color: #22c55e; color: #22c55e; }
.macro-list { display: flex; flex-direction: column; gap: 8px; }
.macro-item { display: flex; gap: 8px; background: rgba(255,255,255,0.03); padding: 8px; border-radius: 4px; }
.macro-name { width: 60px; background: transparent; border: none; color: #fff; border-bottom: 1px dashed #333; }
.macro-cmd { flex: 1; background: transparent; border: none; color: #22c55e; }
.btn-add-macro { width: 100%; padding: 8px; background: rgba(34, 197, 94, 0.1); border: 1px dashed #22c55e; color: #22c55e; cursor: pointer; margin-top: 10px; }
.mini-switch { position: relative; display: inline-block; width: 34px; height: 18px; }
.mini-switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; inset: 0; background-color: #18181b; border: 1px solid #3f3f46; transition: .3s; border-radius: 2px; }
.slider:before { position: absolute; content: ""; height: 10px; width: 10px; left: 3px; bottom: 3px; background-color: #52525b; transition: .3s; }
input:checked + .slider { border-color: #22c55e; }
input:checked + .slider:before { transform: translateX(16px); background-color: #22c55e; }
.drawer-footer { padding: 15px 20px; border-top: 1px solid #27272a; display: flex; justify-content: space-between; font-size: 9px; color: #52525b; }
.slide-enter-active, .slide-leave-active { transition: transform 0.3s; }
.slide-enter-from, .slide-leave-to { transform: translateX(100%); }
</style>