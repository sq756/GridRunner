import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { globalState } from './store';

export interface TerminalInstance {
  id: string;
  term: Terminal;
  fit: FitAddon;
  unlisten?: UnlistenFn;
}

/**
 * Registry Pattern: TerminalManager only manages terminal instances in memory.
 * DOM operations are handled by the TerminalView component.
 */
class TerminalManager {
  public instances: Map<string, TerminalInstance> = new Map();
  private callbacks: Map<string, (id: string, data: string) => void> = new Map();

  // v2.17.0: Global Data Hook for RPC/Interceptors
  private dataHook: ((id: string, text: string, bytes: Uint8Array) => boolean) | null = null;
  private static instance: TerminalManager;

  constructor() {
    if (TerminalManager.instance) return TerminalManager.instance;
    TerminalManager.instance = this;

    // Global for debugging
    if (typeof window !== 'undefined') {
      (window as any).terminalManager = this;
    }
  }

  public setOnDataCallback(id: string, cb: (id: string, data: string) => void) {
    this.callbacks.set(id, cb);
  }

  /**
   * Register a global hook to process data before writing to terminals.
   * If hook returns true, processing stops (data is 'consumed').
   */
  public setDataHook(hook: (id: string, text: string, bytes: Uint8Array) => boolean) {
    this.dataHook = hook;
  }

  public async getOrCreate(id: string, options: any = {}): Promise<TerminalInstance> {
    const existing = this.instances.get(id);
    if (existing) return existing;

    console.log(`[TerminalManager] Creating terminal instance: ${id}`);
    const term = new Terminal({
      cursorBlink: true,
      fontSize: globalState.terminalFontSize,
      fontFamily: "'JetBrains Mono', 'Ubuntu Mono', 'Fira Code', monospace",
      theme: { background: '#000000', foreground: '#d4d4d8' },
      allowTransparency: false,
      scrollback: 800, // Bug 8/9: reduced from 2000 to lower memory footprint
      wheelScrollSensitivity: 1,
      // v2.17.0: FIXED DA Leak (^[[?1;2c)
      // Disabling device attributes response prevents the terminal from 
      // automatically replying to \x1b[c which can pollute the PTY buffer.
      deviceAttributes: '',
      ...options
    });

    // Hard-set to avoid any leakage to the PTY stdin
    (term as any).options.deviceAttributes = '';

    const fit = new FitAddon();
    term.loadAddon(fit);

    // v2.15.40: Re-enabling Canvas for standard rendering
    // WebGL remains disabled for multi-pane stability

    // Atomic data binding
    term.onData((data) => {
      const cb = this.callbacks.get(id);
      if (cb) cb(id, data);
    });

    // v2.15.35: Global Listener Registration
    if (!this.isGlobalListenerActive) {
      this.setupGlobalPtyListener();
    }

    const instance: TerminalInstance = { id, term, fit };
    this.instances.set(id, instance);
    return instance;
  }

  private isGlobalListenerActive = false;
  private async setupGlobalPtyListener() {
    this.isGlobalListenerActive = true;
    console.log("[TerminalManager] Activating Global PTY Dispatcher");
    const decoder = new TextDecoder('utf-8');

    await listen('pty-data', (event: any) => {
      const payload = event.payload as any;
      const id = payload.id;
      const rawData = payload.data;

      const bytes = Array.isArray(rawData) ? new Uint8Array(rawData) : rawData;
      const text = typeof bytes === 'string' ? bytes : decoder.decode(bytes);

      // Execute hook if registered
      if (this.dataHook && this.dataHook(id, text, bytes)) {
        return; // Hook consumed the data (e.g. it was an RPC command)
      }

      const instance = this.instances.get(id);
      if (instance) {
        instance.term.write(bytes);
      }
    });
  }

  /**
   * Explicitly mount terminal to a DOM element.
   * v2.17.3: Robust Re-attachment Logic
   */
  public async mount(id: string, element: HTMLElement) {
    const instance = await this.getOrCreate(id);
    const term = instance.term;

    // v2.17.3: Check if it's already in the target element
    if (term.element && term.element.parentElement === element) {
      console.log(`[TerminalManager] ${id} already in place. Force refresh.`);
      term.refresh(0, term.rows - 1);
      setTimeout(() => instance.fit.fit(), 20);
      return;
    }

    // If it's attached elsewhere, detach it first safely
    if (term.element && term.element.parentElement) {
      console.log(`[TerminalManager] Moving terminal ${id} to new container.`);
      try {
        term.element.parentElement.removeChild(term.element);
      } catch (e) {
        // Fallback: clear the old parent if removeChild fails
        term.element.parentElement.innerHTML = '';
      }
    }

    // Clear the NEW container before mounting
    element.innerHTML = '';

    try {
      if (term.element) {
        // If xterm already has its DOM node, just append it!
        // This is much safer than calling .open() again.
        element.appendChild(term.element);
      } else {
        // First time initialization
        term.open(element);
      }

      if (term.element) {
        term.element.onmousedown = () => {
          window.dispatchEvent(new CustomEvent('close-all-menus'));
        };
      }

      // v2.17.3: Aggressive Wake-up
      setTimeout(() => {
        if (element.offsetWidth > 0) {
          instance.fit.fit();
          term.refresh(0, term.rows - 1);
          term.focus();
          // Force a second refresh to ensure canvas layers are active
          requestAnimationFrame(() => term.refresh(0, term.rows - 1));
        }
      }, 50);
    } catch (e) {
      console.error(`[TerminalManager] Mount Fail ${id}:`, e);
    }
  }

  public setFontSize(size: number) {
    globalState.terminalFontSize = size;
    localStorage.setItem('ter_terminal_font_size', size.toString());
    this.instances.forEach((instance) => {
      instance.term.options.fontSize = size;
      // v2.17.20: Immediate fit after resize
      setTimeout(() => instance.fit.fit(), 20);
    });
  }

  public fitAll() {
    this.instances.forEach((instance) => {
      if (instance.term.element && instance.term.element.offsetWidth > 0) {
        instance.fit.fit();
      }
    });
  }

  public focus(id: string) {
    const instance = this.instances.get(id);
    if (instance) {
      instance.term.focus();
    } else {
      console.warn(`[TerminalManager] Cannot focus, instance ${id} not found`);
    }
  }

  public getSelection(id: string): string {
    const instance = this.instances.get(id);
    return instance ? instance.term.getSelection() : '';
  }

  public write(id: string, data: string | Uint8Array) {
    const instance = this.instances.get(id);
    if (instance) {
      instance.term.write(data);
    } else {
      // Very frequent logging might be noisy, but useful for diagnosis
      // console.warn(`[TerminalManager] Cannot write, instance ${id} not found`);
    }
  }

  public remove(id: string) {
    const instance = this.instances.get(id);
    if (instance) {
      console.log(`[TerminalManager] Removing terminal ${id}`);
      instance.term.dispose();
      this.instances.delete(id);
      this.callbacks.delete(id);
      // Clean up backend PTY resources
      invoke('close_pty', { tabId: id }).catch(e => {
        console.error("Failed to close backend PTY:", e);
      });
    }
  }
}

export const terminalManager = new TerminalManager();
export { WebglAddon };
