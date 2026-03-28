import { ref, type Ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { terminalManager } from '../TerminalManager';

export function useContextMenu(
  activeTabId: Ref<string | null>,
  renameTab: (id: string, name: string) => void,
  host: Ref<string>,
  currentPath: Ref<string>,
  currentAgentPort: Ref<number | null>,
  terminalTabs: Ref<any[]>
) {
  const showContextMenu = ref(false);
  const menuX = ref(0);
  const menuY = ref(0);
  const contextMenuTabId = ref<string | null>(null);
  const contextMenuType = ref<'terminal' | 'new-tab-menu' | 'node-group' | 'clip-menu' | 'render-menu' | 'sync-menu' | 'audit-menu' | 'sidebar-menu' | 'quantum-menu' | 'settings-menu' | 'lock-menu' | 'key-menu'>('terminal');
  const hasErrorSelection = ref(false);

  const calculateMenuPosition = (e: MouseEvent, estimatedHeight = 250, estimatedWidth = 180, forceUp = false) => {
    let x = e.clientX, y = e.clientY;

    // v2.17.19: Aggressive Footer Spacing
    // We add an extra 40px offset to ensure the menu floats above the footer with a gap
    if (forceUp || y + estimatedHeight > window.innerHeight) {
      y = e.clientY - estimatedHeight - 45; // Lifted higher
    } else {
      y = e.clientY + 5;
    }

    if (x + estimatedWidth > window.innerWidth) {
      x = window.innerWidth - estimatedWidth - 15;
    } else {
      x = e.clientX + 5;
    }

    menuX.value = x; menuY.value = y;
  };

  const onTerminalContextMenu = (p: { e: MouseEvent, id: string, type?: any }) => { 
    contextMenuTabId.value = p.id; 
    contextMenuType.value = p.type || 'terminal';

    // v2.17.25: Explicit direction mapping
    // new-tab-menu and standard terminal menus should pop DOWN
    // Only footer-specific menus should force UP
    const isFooterMenu = ['node-group', 'clip-menu', 'render-menu', 'sync-menu', 'audit-menu', 'sidebar-menu', 'quantum-menu', 'settings-menu', 'lock-menu', 'key-menu'].includes(contextMenuType.value);

    // Adjust height estimation based on type
    let h = 280;
    if (contextMenuType.value === 'node-group' || contextMenuType.value === 'settings-menu') h = 220;
    if (contextMenuType.value === 'audit-menu' || contextMenuType.value === 'quantum-menu' || contextMenuType.value === 'sidebar-menu') h = 160;
    if (contextMenuType.value === 'key-menu' || contextMenuType.value === 'lock-menu') h = 120;
    if (contextMenuType.value === 'new-tab-menu') h = 180;

    calculateMenuPosition(p.e, h, 180, isFooterMenu); 

    if (contextMenuType.value === 'terminal') {
      const s = terminalManager.getSelection(p.id); 
      hasErrorSelection.value = s.toLowerCase().includes('error') || s.toLowerCase().includes('exception') || s.includes('\x1b[31m'); 
    }

    showContextMenu.value = true; 
  };
  const copySelectedText = async () => { 
    const id = contextMenuTabId.value || activeTabId.value; 
    if (id) { 
      const s = terminalManager.getSelection(id); 
      if (s) await navigator.clipboard.writeText(s); 
    } 
    showContextMenu.value = false; 
  };

  const pasteFromClipboard = async () => { 
    const id = contextMenuTabId.value || activeTabId.value; 
    if (id) { 
      try { 
        const t = await navigator.clipboard.readText(); 
        if (t) invoke('write_pty', { tabId: id, data: t }); 
      } catch(e){} 
    } 
    showContextMenu.value = false; 
  };

  const renameTabAction = () => { 
    const id = contextMenuTabId.value; 
    if (id) { 
      const n = prompt("New name:"); 
      if (n) renameTab(id, n); 
    } 
    showContextMenu.value = false; 
  };

  const copyTabIdAction = async () => { 
    if (contextMenuTabId.value) await navigator.clipboard.writeText(contextMenuTabId.value); 
    showContextMenu.value = false; 
  };

  const copyRuntimeEnv = () => {
    const env = `/// TER_RUNTIME_ENV\nHOST: ${host.value}\nCWD: ${currentPath.value}\nAGENT_PORT: ${currentAgentPort.value}\nTIMESTAMP: ${new Date().toISOString()}`;
    navigator.clipboard.writeText(env);
    showContextMenu.value = false;
  };

  const generateRunReport = async () => {
    if (!contextMenuTabId.value) return;
    const tid = contextMenuTabId.value;
    const tab = terminalTabs.value.find(t => t.id === tid);
    try {
      const logs = await invoke<number[][]>('get_terminal_logs', { tabId: tid, limit: 100 });
      const decoder = new TextDecoder();
      const text = logs.map(chunk => decoder.decode(new Uint8Array(chunk))).join('').replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
      const report = `/// TER_RUN_REPORT\nTAB: ${tab?.title || tid}\nHOST: ${host.value}\nDATE: ${new Date().toLocaleString()}\n\n--- RECENT_LOGS ---\n${text.substring(Math.max(0, text.length - 2000))}`;
      navigator.clipboard.writeText(report);
    } catch (e) {
      console.error("Report fail", e);
    }
    showContextMenu.value = false;
  };

  const diagnoseSelection = async () => { 
    const id = contextMenuTabId.value || activeTabId.value; 
    if (id) { 
      const s = terminalManager.getSelection(id); 
      if (activeTabId.value) {
        await invoke('write_pty', { 
          tabId: activeTabId.value, 
          data: `\x1b[200~帮我诊断并给方案：\n\n\`\`\`\n${s}\n\`\`\`\x1b[201~\r` 
        }); 
      }
    } 
    showContextMenu.value = false; 
  };

  return {
    showContextMenu,
    menuX,
    menuY,
    contextMenuTabId,
    hasErrorSelection,
    contextMenuType,
    onTerminalContextMenu,
    copySelectedText,
    pasteFromClipboard,
    renameTabAction,
    copyTabIdAction,
    copyRuntimeEnv,
    generateRunReport,
    diagnoseSelection,
    calculateMenuPosition
  };
}
