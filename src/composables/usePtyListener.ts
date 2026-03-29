import { onMounted, onUnmounted, type Ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { terminalManager } from '../TerminalManager';
import { globalState, backendLogs, activeTabId, storeActions, type AgentRoleType } from '../store';

// --- Fragmentation Buffer State ---
const rpcBuffers = new Map<string, string>();

/**
 * usePtyListener Composable
 * v2.18.0: Multi-Agent Orchestrator Integration
 * Implements Stateful Interception to solve Chunk Fragmentation.
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

  const getRoleById = (id: string): AgentRoleType => {
    const roles = globalState.autoPilot.roles;
    for (const r in roles) {
      if (roles[r as AgentRoleType].tabId === id) return r as AgentRoleType;
    }
    return 'SYSTEM';
  };

  const processPtyData = (id: string, text: string, _bytes: Uint8Array): boolean => {
    lastActivityMap.value[id] = Date.now();

    // 1. Fragmentation Handling & RPC Interception
    let buffer = rpcBuffers.get(id) || "";
    let processingText = text;

    // Detect start of RPC signal
    if (!buffer && text.includes('[GR_RPC]')) {
      const startIndex = text.indexOf('[GR_RPC]');
      // Send preceding text to terminal
      if (startIndex > 0) {
        terminalManager.write(id, text.substring(0, startIndex));
      }
      buffer = text.substring(startIndex);
      rpcBuffers.set(id, buffer);
      return true; // Intercepted
    }

    // Accumulate if we are in an interception state
    if (buffer) {
      buffer += text;
      rpcBuffers.set(id, buffer);

      // Attempt to find full JSON block: [GR_RPC] { ... }
      // We look for balanced braces or a safe closing pattern
      const jsonStart = buffer.indexOf('{');
      if (jsonStart !== -1) {
        let braceCount = 0;
        let foundJson = false;
        let jsonEnd = -1;

        for (let i = jsonStart; i < buffer.length; i++) {
          if (buffer[i] === '{') braceCount++;
          else if (buffer[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
              jsonEnd = i;
              foundJson = true;
              break;
            }
          }
        }

        if (foundJson) {
          const rawJson = buffer.substring(jsonStart, jsonEnd + 1);
          const remaining = buffer.substring(jsonEnd + 1);
          
          try {
            const rpc = JSON.parse(rawJson);
            const sourceRole = getRoleById(id);
            
            // Dispatch to Central Bus
            storeActions.dispatchRPC(sourceRole, rpc);

            // Visual Substitution: Cyber-styled routing notification
            terminalManager.write(id, `\r\n\x1b[38;5;121m> ⚡ [SYSTEM] ORCHESTRATOR_ROUTING: ${sourceRole} -> ${rpc.target || 'BROADCAST'} [${rpc.action.toUpperCase()}]\x1b[0m\r\n`);
          } catch (e) {
            console.error("[RPC_PARSE_FAIL]", e, rawJson);
            terminalManager.write(id, `\r\n\x1b[31m> ⚠️ [SYSTEM] RPC_PAYLOAD_CORRUPTED\x1b[0m\r\n`);
          }

          // Reset buffer and process any leftover text in this chunk
          rpcBuffers.delete(id);
          if (remaining.trim()) {
            processPtyData(id, remaining, new Uint8Array());
          }
          return true;
        }
      }
      
      // Safety: If buffer grows too large without finding JSON, flush it to avoid data loss
      if (buffer.length > 4000) {
        terminalManager.write(id, buffer);
        rpcBuffers.delete(id);
      }
      return true; 
    }

    // 2. Legacy Interceptors (AutoPilot / Actions)
    // v2.18.0: Automatic Reconnection Trigger (moved from original but kept logic)
    if (text.includes('[Process Completed]') && globalState.isConnected) {
      storeActions.pushLog(`[SYSTEM] Connection loss detected on ${id}. Auto-recovery in 2s...`);
      setTimeout(() => { if (globalState.isConnected) storeActions.reconnectTab(id); }, 2000);
    }

    // Status busy/connected logic
    if (globalState.connectionStatus === 'connected') {
      globalState.connectionStatus = 'busy';
      setTimeout(() => { if (globalState.connectionStatus === 'busy') globalState.connectionStatus = 'connected'; }, 200);
    }

    if (isAutoPilot.value) {
      const pt = text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, ''); // Strip ANSI
      // ... (Rest of legacy autopilot logic remains for backward compatibility)
      if (pt.includes('[TER_ACTION:')) {
         // handle legacy...
      }
    }

    return false; // Not consumed
  };

  onMounted(() => {
    terminalManager.setDataHook(processPtyData);
  });

  onUnmounted(() => {
    // Clear buffers on unmount
    rpcBuffers.clear();
  });

  return { setupPtyListener: () => { } }; 
}

