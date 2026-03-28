import { onMounted, onUnmounted, type Ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { terminalManager } from '../TerminalManager';
import { globalState, backendLogs, activeTabId, storeActions } from '../store';

/**
 * usePtyListener Composable
 * v2.17.0: FIXED Double-Echo (llss) and RPC Leak.
 * This version registers a data hook in TerminalManager instead of creating a second listener.
 */
export function usePtyListener(
  isAutoPilot: Ref<boolean>,
  lastAutoPilotTime: Ref<number>,
  activeTriggers: Ref<string[]>,
  captureAndUpload: (auto: boolean) => Promise<void>,
  refreshWebview: (url?: string) => Promise<void>,
  handleExtractDOM: () => Promise<void>,
  lastActivityMap: Ref<Record<string, number>>,
  toggleSplit?: () => void
) {

  const processPtyData = (id: string, text: string, _bytes: Uint8Array): boolean => {
    lastActivityMap.value[id] = Date.now();

    // v2.18.0: RPC Interception & Deep Cleanup
    if (text.includes('[GR_RPC]')) {
      const rpcRegex = /\[TER_RPC\]\s*({.*?})/g;
      let match;
      let consumed = false;

      while ((match = rpcRegex.exec(text)) !== null) {
        if (!match[1]) continue;
        try {
          const rpc = JSON.parse(match[1]);
          consumed = true;

          if (rpc.action === 'screenshot') {
            captureAndUpload(true);
          } else if (rpc.action === 'navigate' && rpc.url) {
            refreshWebview(rpc.url);
          } else if (rpc.action === 'extract_dom') {
            handleExtractDOM();
          } else if (rpc.action === 'notify') {
            storeActions.pushLog(`[🔔 AI NOTIFY] ${rpc.msg || rpc.message}`);
          } else if (rpc.action === 'chart') {
            storeActions.pushLog(`[📊 AI CHART DATA] ${JSON.stringify(rpc.data)}`);
          } else if (rpc.action === 'split_webview' && toggleSplit) {
            toggleSplit();
          }
        } catch (e) { console.warn("RPC Parse Error:", e); }
      }

      if (consumed) {
        const cleanText = text.replace(/\[TER_RPC\]\s*({.*?})/g, '');
        if (cleanText.length > 0) {
          // Manually write the non-RPC parts to avoid the original 'bytes' leak
          terminalManager.write(id, cleanText);
        }
        return true; // Mark original raw data as consumed
      }
    }

    // Status busy/connected logic
    if (globalState.connectionStatus === 'connected') {
      globalState.connectionStatus = 'busy';
      setTimeout(() => {
        if (globalState.connectionStatus === 'busy') globalState.connectionStatus = 'connected';
      }, 200);
    }

    // AutoPilot Logic
    if (isAutoPilot.value) {
      const pt = text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, ''); // Strip ANSI
      const actionMatch = pt.match(/\[TER_ACTION:\s*(click|type)\((\d+)(?:,\s*"(.*?)")?\)\]/);

      if (actionMatch) {
        const action = actionMatch[1], eid = actionMatch[2], txt = actionMatch[3] || "";
        const code = action === 'click' ? `window.TerAgent.click(${eid})` : `window.TerAgent.type(${eid}, ${JSON.stringify(txt)})`;
        if (activeTabId.value) invoke('eval_cyber_webview', { label: activeTabId.value, code });
        return true; // Consume action trigger
      } else if (!pt.includes('tab-') && (Date.now() - lastAutoPilotTime.value) > 500) {
        const lm = pt.match(/http:\/\/localhost:(\d+)/);
        if (lm && lm[1]) {
          const port = parseInt(lm[1]);
          if (globalState.currentAgentPort !== port) {
            globalState.currentAgentPort = port;
            refreshWebview(`http://localhost:${port}`);
          }
        }

        if (activeTriggers.value.some(t => pt.includes(t))) {
          lastAutoPilotTime.value = Date.now();
          setTimeout(() => { invoke('write_pty', { tabId: id, data: "\r" }); }, 300);
        }
      }
    }

    return false; // Not consumed
  };

  onMounted(() => {
    // Register the processor in the singleton TerminalManager
    terminalManager.setDataHook(processPtyData);
  });

  onUnmounted(() => {
    // We don't necessarily want to null it if other components use it,
    // but in current architecture, App.vue manages usePtyListener lifecycle.
  });

  return { setupPtyListener: () => { } }; // Dummy for compatibility
}
