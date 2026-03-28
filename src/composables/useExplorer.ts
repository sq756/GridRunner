import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { globalState, activeTabId } from '../store';

export const sanitizeSftpPath = (p: string): string => {
  if (!p || p === '/') return '/';
  
  // v2.15.6: Robust Normalization
  let clean = p.trim();
  
  // Remove trailing slashes (unless it's just root)
  if (clean.length > 1 && clean.endsWith('/')) {
    clean = clean.substring(0, clean.length - 1);
  }

  if (!clean.startsWith('/')) {
    // If it doesn't start with slash, but is not . or .., it might be a relative segment
    if (clean !== '..' && clean !== '.') {
       // Assume it's relative to current if not specified, but this helper is pure.
       // The caller should handle relative joining. 
       // For safety in this pure helper, if no leading slash, we return as is
       // but ensure it's not empty
    }
  }
  
  return clean || '/';
};

/**
 * useExplorer Composable
 * v2.14.0: Migrated to Global Store for dynamic tiling.
 */
export const realFiles = ref<any[]>([]);

export function useExplorer() {
  const refreshExplorer = async (pathOverride?: string) => {
    if (!globalState.isConnected) {
      console.warn("[Explorer] Skip refresh: Not connected");
      return;
    }

    let targetPath = pathOverride || globalState.currentPath;
    targetPath = sanitizeSftpPath(targetPath);

    console.log("[Explorer] Fetching files for path:", targetPath);

    try {
      const content = await invoke<any>('ls_remote', { path: targetPath });      
      realFiles.value = content.files || [];
      globalState.currentPath = content.current_path; 
      console.log("[Explorer] Current Path confirmed:", globalState.currentPath);
    } catch (e) {
      console.error("[Explorer] Failed to refresh explorer:", e);
      realFiles.value = [];
    }
  };

  const changeDir = (p: string) => {
    if (p.startsWith('/')) {
      refreshExplorer(p);
      return;
    }

    let target = globalState.currentPath;
    if (p === '..') {
      if (globalState.currentPath === '/') return; 
      const pts = globalState.currentPath.split('/').filter(x => x);
      pts.pop();
      target = '/' + pts.join('/');
    } else {
      target = (globalState.currentPath === '/' ? '' : globalState.currentPath) + '/' + p;
    }
    
    refreshExplorer(target);
    
    setTimeout(() => {
      try {
        const s = localStorage.getItem('ter_fast_access');
        let l = s ? JSON.parse(s) : []; 
        if (!Array.isArray(l)) l = [];
        l = [globalState.currentPath, ...l.filter((x: string) => x !== globalState.currentPath)].slice(0, 5); 
        localStorage.setItem('ter_fast_access', JSON.stringify(l)); 
      } catch (e) {}
    }, 500);
  };

  const onFastAccess = async (p: string) => { 
    if (activeTabId.value) {
      await invoke('write_pty', { tabId: activeTabId.value, data: `cd "${p}"\r` }); 
    }
    setTimeout(() => refreshExplorer(p), 300); 
  };

  return {
    realFiles,
    refreshExplorer,
    changeDir,
    onFastAccess
  };
}
