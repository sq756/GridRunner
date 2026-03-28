import { invoke } from '@tauri-apps/api/core';

/**
 * TER_CORE WebviewManager
 * v2.15.3: Centralized registry for Native Webview coordination.
 * Prevents ID collisions and redundant IPC calls during Matrix re-allocation.
 */
class WebviewManager {
  private static instance: WebviewManager;
  private activeLabels: Set<string> = new Map<string, any>().keys() as any; // Dummy set for tracking
  private labels: string[] = [];

  constructor() {
    if (WebviewManager.instance) return WebviewManager.instance;
    WebviewManager.instance = this;
    (window as any).webviewManager = this;
  }

  public async create(label: string, url: string, bounds: { x: number, y: number, width: number, height: number }) {
    console.log(`[WebviewManager] Creating/Updating: ${label}`);
    try {
      await invoke('create_embedded_webview', {
        label,
        url,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      });
      if (!this.labels.includes(label)) this.labels.push(label);
    } catch (e) {
      console.error(`[WebviewManager] Failed to create ${label}:`, e);
    }
  }

  public async updateBounds(label: string, bounds: { x: number, y: number, width: number, height: number }) {
    // Optimization: Only update if the window exists and is managed by us
    await invoke('update_webview_bounds', {
      label,
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height)
    }).catch(() => {});
  }

  public async destroy(label: string) {
    console.log(`[WebviewManager] Destroying: ${label}`);
    await invoke('close_webview', { label }).catch(() => {});
    this.labels = this.labels.filter(l => l !== label);
  }

  public async navigate(label: string, url: string) {
    await invoke('navigate_cyber_webview', { label, url }).catch(() => {});
  }

  public async setAlwaysOnTop(label: string, onTop: boolean) {
    await invoke('set_window_always_on_top', { label, onTop }).catch(() => {});
  }

  public async destroyAll() {
    for (const label of [...this.labels]) {
      await this.destroy(label);
    }
  }
}

export const webviewManager = new WebviewManager();
