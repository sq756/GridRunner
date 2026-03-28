import { ref, watch, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';

export interface UIPreferences {
  ui_scale: number;
  glow_intensity: number;
  pulse_speed: number;
}

export function useUIPreferences() {
  const uiPrefs = ref<UIPreferences>({
    ui_scale: 1.0,
    glow_intensity: 50,
    pulse_speed: 50
  });

  const loadUIPreferences = async () => {
    try {
      const fingerprint = await invoke<any>('get_device_fingerprint');
      const prefs = await invoke<Record<string, string>>('list_ui_preferences');
      
      // v2.11.49: Adaptive Genetic Identification
      if (!prefs.ui_scale) {
        // First run on this device: apply smart defaults
        if (fingerprint.is_mobile || window.innerWidth < 600) {
          uiPrefs.value.ui_scale = 1.5; // Mobile/Browser optimized
        } else {
          uiPrefs.value.ui_scale = 1.0;
        }
      } else {
        const parsedScale = parseFloat(prefs.ui_scale);
        uiPrefs.value.ui_scale = (isNaN(parsedScale) || parsedScale <= 0) ? 1.0 : parsedScale;
      }

      if (prefs.glow_intensity) {
        const parsedGlow = parseInt(prefs.glow_intensity);
        uiPrefs.value.glow_intensity = isNaN(parsedGlow) ? 50 : Math.max(0, Math.min(100, parsedGlow));
      }
      if (prefs.pulse_speed) {
        const parsedPulse = parseInt(prefs.pulse_speed);
        uiPrefs.value.pulse_speed = isNaN(parsedPulse) ? 50 : Math.max(0, Math.min(100, parsedPulse));
      }
      
      applyUIPreferences();
    } catch (e) {
      console.error('Failed to load UI preferences:', e);
    }
  };

  const saveUIPreference = async (key: keyof UIPreferences, value: any) => {
    try {
      await invoke('save_ui_preference', { key, value: value.toString() });
    } catch (e) {
      console.error(`Failed to save UI preference ${key}:`, e);
    }
  };

  const applyUIPreferences = () => {
    const root = document.documentElement;
    root.style.setProperty('--ter-ui-scale', uiPrefs.value.ui_scale.toString());
    root.style.setProperty('--ter-glow-opacity', (uiPrefs.value.glow_intensity / 100).toString());
    // Pulse speed: map 0-100 to a reasonable duration (e.g., 2s to 0.2s)
    const pulseDuration = 2.0 - (uiPrefs.value.pulse_speed / 100) * 1.8;
    root.style.setProperty('--ter-pulse-duration', `${pulseDuration}s`);
    
    // Scale body font size based on ui_scale
    root.style.setProperty('--ter-base-font-size', `${14 * uiPrefs.value.ui_scale}px`);
  };

  // Throttled saving
  let saveTimeout: any = null;
  watch(uiPrefs, (newPrefs) => {
    applyUIPreferences();
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveUIPreference('ui_scale', newPrefs.ui_scale);
      saveUIPreference('glow_intensity', newPrefs.glow_intensity);
      saveUIPreference('pulse_speed', newPrefs.pulse_speed);
    }, 1000);
  }, { deep: true });

  const autoDetectScale = () => {
    const width = window.innerWidth;
    if (width < 600) uiPrefs.value.ui_scale = 0.8;
    else if (width < 1024) uiPrefs.value.ui_scale = 1.0;
    else if (width < 1440) uiPrefs.value.ui_scale = 1.1;
    else uiPrefs.value.ui_scale = 1.2;
  };

  return {
    uiPrefs,
    loadUIPreferences,
    autoDetectScale
  };
}
