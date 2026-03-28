import { computed, ref, onMounted, onUnmounted } from 'vue';
import {
  terminalTabs, activeTabId, activeTabIdSecondary, splitMode,
  storeActions
} from '../store';
import { terminalManager } from '../TerminalManager';

export type ViewType = 'terminal' | 'webview' | 'editor';

/**
 * useTabs Composable
 * v2.14.0: Migrated to Global Store for dynamic tiling.
 */
export function useTabs() {
  const lastActivityMap = ref<Record<string, number>>({});
  const backgroundTabs = computed(() => terminalTabs.value.filter(t => t.isBackground));

  const handleTabActivity = (e: any) => {
    const { id, timestamp } = e.detail;
    lastActivityMap.value[id] = timestamp;
  };

  onMounted(() => {
    window.addEventListener('ter-tab-activity', handleTabActivity);
  });

  onUnmounted(() => {
    window.removeEventListener('ter-tab-activity', handleTabActivity);
  });

  const createNewTab = storeActions.createNewTab;

  const toggleSplit = async () => {
    splitMode.value = !splitMode.value;
    if (splitMode.value) {
      // v2.15.10: Smart tab assignment for split mode
      // If primary and secondary are same, or secondary is empty, find a new one
      if (!activeTabIdSecondary.value || activeTabIdSecondary.value === activeTabId.value) {
        const other = terminalTabs.value.find(t => !t.isBackground && t.id !== activeTabId.value);
        if (other) {
          activeTabIdSecondary.value = other.id;
        } else {
          // If no other tab exists, auto-create one to prevent black screen
          const newId = await createNewTab("Deck-2", 'terminal');
          activeTabIdSecondary.value = newId;
        }
      }
    }
    // Force terminal fit after layout change
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      terminalManager.fitAll();
    }, 100);
  };

  const closeTab = (id: string) => {
    const idx = terminalTabs.value.findIndex(t => t.id === id);
    if (idx !== -1) {
      terminalTabs.value.splice(idx, 1);
      terminalManager.remove(id);
      if (activeTabId.value === id) {
        activeTabId.value = terminalTabs.value.find(t => !t.isBackground)?.id || null;
      }
    }
  };

  const sendToBackground = (id: string | null) => {
    const tid = id || activeTabId.value;
    if (tid) {
      const tab = terminalTabs.value.find(t => t.id === tid);
      if (tab) {
        const s = terminalManager.getSelection(tab.id).trim();
        const currentTitle = tab.title;
        // Bug 5 Fix: Only auto-rename if title is a generic default — preserve user-set names
        const isDefaultTitle = currentTitle === 'Shell' || currentTitle === 'Main Shell'
          || currentTitle.startsWith('Proc:')
          || currentTitle.startsWith('tab-')
          || /^[A-Z0-9_]+_CORE$/.test(currentTitle)  // e.g. REMOTE_NODE_CORE
          || currentTitle === 'Deck-2';
        if (isDefaultTitle) {
          tab.title = s ? `Proc: ${s.substring(0, 10)}...` : `Proc: ${tid.substring(0, 5)}`;
        }
        tab.isBackground = true;
        if (activeTabId.value === tid) {
          activeTabId.value = terminalTabs.value.find(t => !t.isBackground)?.id || null;
        }
      }
    }
  };

  const bringToForeground = (id: string) => {
    const t = terminalTabs.value.find(t => t.id === id);
    if (t) {
      t.isBackground = false;
      activeTabId.value = id;
    }
  };

  const renameTab = (id: string, newName: string) => {
    const t = terminalTabs.value.find(x => x.id === id);
    if (t) t.title = newName;
  };

  return {
    terminalTabs,
    activeTabId,
    activeTabIdSecondary,
    splitMode,
    toggleSplit,
    backgroundTabs,
    createNewTab,
    closeTab,
    sendToBackground,
    bringToForeground,
    renameTab,
    lastActivityMap
  };
}
