import { ref, type Ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';

import { save, open as openDialog } from '@tauri-apps/plugin-dialog';
import { sanitizeSftpPath } from './useExplorer';

export function useExplorerContextMenu(
  activeTabId: Ref<string | null>,
  currentPath: Ref<string>,
  refreshExplorer: () => Promise<void>
) {
  const showExplorerMenu = ref(false);
  const explorerMenuX = ref(0);
  const explorerMenuY = ref(0);
  const selectedFile = ref<any>(null);

  const calculateExplorerMenuPosition = (e: MouseEvent, estimatedHeight = 220, estimatedWidth = 160) => {
    let x = e.clientX + 10, y = e.clientY + 10; // v2.13.3: Offset to keep target visible
    if (y + estimatedHeight > window.innerHeight) y = window.innerHeight - estimatedHeight - 10;
    if (x + estimatedWidth > window.innerWidth) x = window.innerWidth - estimatedWidth - 10;
    explorerMenuX.value = x; explorerMenuY.value = y;
  };

  const onExplorerContextMenu = (p: { e: MouseEvent, file: any }) => {
    selectedFile.value = p.file;
    calculateExplorerMenuPosition(p.e);
    showExplorerMenu.value = true;
  };

  const getFullPath = () => {
    if (!selectedFile.value) return sanitizeSftpPath(currentPath.value);
    if (selectedFile.value.path) return sanitizeSftpPath(selectedFile.value.path); // v2.11.52: Use backend confirmed path
    
    if (selectedFile.value.name === '..') {
      const pts = currentPath.value.split('/').filter(x => x);
      pts.pop();
      const p = '/' + pts.join('/');
      return sanitizeSftpPath(p === '//' ? '/' : p);
    }
    const p = (currentPath.value === '/' ? '' : currentPath.value) + '/' + selectedFile.value.name;
    return sanitizeSftpPath(p);
  };

  const explorerActionCd = async () => {
    if (activeTabId.value) {
      let path = getFullPath();
      if (selectedFile.value && !selectedFile.value.is_dir) {
        path = currentPath.value; // cd to parent folder if it's a file
      }
      
      // v2.11.52: If we are already there, just trigger a refresh
      if (path === currentPath.value && selectedFile.value?.name !== '..') {
         await refreshExplorer();
      } else {
         await invoke('write_pty', { tabId: activeTabId.value, data: `cd "${path}"\r` });
         // We don't refresh immediately here because pty listener usually catches cd
         // But we can trigger a manual one for UI responsiveness
         setTimeout(refreshExplorer, 300);
      }
    }
    showExplorerMenu.value = false;
  };

  const explorerActionCat = async () => {
    if (activeTabId.value && selectedFile.value && !selectedFile.value.is_dir) {
      await invoke('write_pty', { tabId: activeTabId.value, data: `cat "${getFullPath()}"\r` });
    }
    showExplorerMenu.value = false;
  };

  const explorerActionVim = async () => {
    if (activeTabId.value && selectedFile.value && !selectedFile.value.is_dir) {
      await invoke('write_pty', { tabId: activeTabId.value, data: `vim "${getFullPath()}"\r` });
    }
    showExplorerMenu.value = false;
  };

  const explorerActionCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(getFullPath());
    } catch(e) {}
    showExplorerMenu.value = false;
  };

  const explorerActionRun = async () => {
    if (activeTabId.value && selectedFile.value && !selectedFile.value.is_dir) {
      await invoke('write_pty', { tabId: activeTabId.value, data: `"${getFullPath()}"\r` });
    }
    showExplorerMenu.value = false;
  };

  const explorerActionDownload = async (onStatus?: (s: string) => void) => {
    if (selectedFile.value && !selectedFile.value.is_dir) {
      const remotePath = getFullPath();
      const localPath = await save({
        defaultPath: selectedFile.value.name,
        title: 'Save Remote File'
      });
      if (localPath) {
        if (onStatus) onStatus(`📥 DOWNLOADING: ${selectedFile.value.name}...`);
        try {
          await invoke('download_file', { remotePath, localPath });
          if (onStatus) onStatus(`✅ DOWNLOADED: ${selectedFile.value.name}`);
        } catch (e) {
          alert("Download failed: " + e);
          if (onStatus) onStatus(`❌ DOWNLOAD_FAIL: ${selectedFile.value.name}`);
        }
      }
    }
    showExplorerMenu.value = false;
  };

  const explorerActionUpload = async () => {
    const localPath = await openDialog({
      multiple: false,
      title: 'Select File to Upload'
    });
    if (localPath && typeof localPath === 'string') {
      const fileName = localPath.split(/[/\\]/).pop();
      const remotePath = (currentPath.value === '/' ? '' : currentPath.value) + '/' + fileName;
      try {
        await invoke('upload_file', { remotePath, localPath });
        await refreshExplorer();
      } catch (e) {
        alert("Upload failed: " + e);
      }
    }
    showExplorerMenu.value = false;
  };

  const explorerActionDelete = async () => {
    if (selectedFile.value && selectedFile.value.name !== '..') {
      const path = getFullPath();
      if (confirm(`CONFIRM TERMINATION OF: ${selectedFile.value.name}?`)) {
        try {
          await invoke('delete_remote_file', { remotePath: path });
          await refreshExplorer();
        } catch (e) {
          alert("Delete failed: " + e);
        }
      }
    }
    showExplorerMenu.value = false;
  };

  const explorerActionPreview = async () => {
    if (selectedFile.value && !selectedFile.value.is_dir) {
      const path = getFullPath();
      try {
        const content = await invoke<string>('read_remote_file', { remotePath: path });
        return content;
      } catch (e) {
        alert("Preview failed: " + e);
      }
    }
    showExplorerMenu.value = false;
    return null;
  };

  const explorerActionDump = async () => {
    if (activeTabId.value && selectedFile.value && !selectedFile.value.is_dir) {
      try {
        await invoke('dump_to_terminal', { tabId: activeTabId.value, remotePath: getFullPath() });
      } catch (e) {
        alert("Dump failed: " + e);
      }
    }
    showExplorerMenu.value = false;
  };

  const explorerActionWrite = async (content: string) => {
    if (selectedFile.value && !selectedFile.value.is_dir) {
      try {
        await invoke('write_remote_file', { remotePath: getFullPath(), content });
        return true;
      } catch (e) {
        alert("Save failed: " + e);
      }
    }
    return false;
  };

  return {
    showExplorerMenu,
    explorerMenuX,
    explorerMenuY,
    selectedFile,
    onExplorerContextMenu,
    explorerActionCd,
    explorerActionCat,
    explorerActionVim,
    explorerActionCopyPath,
    explorerActionRun,
    explorerActionDownload,
    explorerActionUpload,
    explorerActionDelete,
    explorerActionPreview,
    explorerActionDump,
    explorerActionWrite
  };
}
