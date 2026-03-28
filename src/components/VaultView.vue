<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';

const vaultEntries = ref<any[]>([]);
const isLoading = ref(false);
const emit = defineEmits(['open-entry']);

const loadVault = async () => {
  isLoading.value = true;
  try {
    vaultEntries.value = await invoke('list_vault');
  } catch (e) {
    console.error("Failed to load vault", e);
  } finally {
    isLoading.value = false;
  }
};

const copyEntry = async (path: string) => {
  try {
    const content = await invoke<string>('read_local_file', { path });
    await navigator.clipboard.writeText(content);
    alert("Copied to clipboard!");
  } catch (e) {
    alert("Copy failed: " + e);
  }
};

const openEntry = async (entry: any) => {
  try {
    const content = await invoke<string>('read_local_file', { path: entry.path });
    emit('open-entry', { name: entry.name, content, path: entry.path });
  } catch (e) {
    alert("Open failed: " + e);
  }
};

onMounted(loadVault);
</script>

<template>
  <div class="vault-view">
    <header class="vault-header">
      <span>GHOST_VAULT</span>
      <button class="refresh-btn" @click="loadVault" :disabled="isLoading">RESCAN</button>
    </header>
    
    <div class="vault-list scroller">
      <div v-for="entry in vaultEntries" :key="entry.name" class="vault-card" @click="openEntry(entry)">
        <div class="vault-info">
          <div class="vault-name">{{ entry.name }}</div>
          <div class="vault-meta">ARCHIVE_MD</div>
        </div>
        <button class="copy-icon-btn" @click.stop="copyEntry(entry.path)" title="Copy to Clipboard">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
      </div>
      <div v-if="vaultEntries.length === 0" class="empty-hint">No archives captured yet.</div>
    </div>
  </div>
</template>

<style scoped>
.vault-view { display: flex; flex-direction: column; height: 100%; background: #000; }
.vault-header { padding: 10px 16px; border-bottom: 1px solid #18181b; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #22c55e; letter-spacing: 2px; }
.refresh-btn { background: transparent; border: 1px solid #27272a; color: #71717a; font-size: 9px; cursor: pointer; padding: 2px 6px; border-radius: 4px; }
.refresh-btn:hover { color: #fff; border-color: #3b82f6; }

.vault-list { flex: 1; overflow-y: auto; padding: 10px; }
.vault-card { background: rgba(34, 197, 94, 0.03); border: 1px solid #18181b; border-radius: 6px; padding: 10px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s; }
.vault-card:hover { border-color: #22c55e; box-shadow: 0 0 10px rgba(34, 197, 94, 0.1); }

.vault-info { flex: 1; min-width: 0; }
.vault-name { font-size: 11px; color: #d4d4d8; font-family: 'JetBrains Mono', monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vault-meta { font-size: 9px; color: #52525b; margin-top: 4px; }

.copy-icon-btn { background: transparent; border: none; cursor: pointer; font-size: 14px; opacity: 0.6; }
.copy-icon-btn:hover { opacity: 1; transform: scale(1.1); }

.empty-hint { text-align: center; font-size: 10px; color: #3f3f46; padding: 20px; }
</style>
