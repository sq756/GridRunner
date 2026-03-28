<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';

const props = defineProps<{
  id: string;
  path: string;
  initialContent: string;
}>();

const emit = defineEmits(['save-complete', 'path-updated']);

const content = ref(props.initialContent);
const isDirty = ref(false);
const isSaving = ref(false);

watch(content, (newVal) => {
  if (newVal !== props.initialContent) {
    isDirty.value = true;
  } else {
    isDirty.value = false;
  }
});

const handleSave = async (targetPath = props.path) => {
  if (isSaving.value) return;
  isSaving.value = true;
  try {
    await invoke('write_remote_file', { remotePath: targetPath, content: content.value });
    isDirty.value = false;
    
    if (targetPath !== props.path) {
      emit('path-updated', { id: props.id, path: targetPath });
    }
    
    emit('save-complete');
    console.log("[TerEditor] File saved successfully to:", targetPath);
  } catch (e) {
    alert("Save failed: " + e);
  } finally {
    isSaving.value = false;
  }
};

const handleSaveAs = () => {
  const newPath = prompt("Enter new remote path:", props.path);
  if (newPath && newPath !== props.path) {
    handleSave(newPath);
  }
};

const handleKeyDown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    handleSave();
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});
</script>

<template>
  <div class="ter-editor">
    <header class="editor-toolbar">
      <div class="path-group">
        <span class="file-path" :title="path">{{ path }}</span>
      </div>
      <div class="toolbar-actions">
        <span v-if="isDirty" class="dirty-indicator">MODIFIED</span>
        <button class="save-btn" :disabled="isSaving" @click="handleSaveAs">
          SAVE AS
        </button>
        <button class="save-btn primary" :disabled="!isDirty || isSaving" @click="handleSave()">
          {{ isSaving ? 'SAVING...' : 'SAVE [CTRL+S]' }}
        </button>
      </div>
    </header>
    <textarea v-model="content" class="editor-area" spellcheck="false"></textarea>
  </div>
</template>

<style scoped>
.ter-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: #000;
}

.editor-toolbar {
  height: 32px;
  background: #09090b;
  border-bottom: 1px solid #18181b;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px;
  flex-shrink: 0;
}

.path-group {
  flex: 1;
  min-width: 0;
  margin-right: 20px;
}

.file-path {
  font-size: 10px;
  color: #52525b;
  font-family: 'JetBrains Mono', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dirty-indicator {
  font-size: 9px;
  color: #eab308;
  font-weight: bold;
}

.save-btn {
  background: #18181b;
  border: 1px solid #27272a;
  color: #71717a;
  font-size: 9px;
  padding: 3px 10px;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.1s;
  font-family: 'JetBrains Mono', monospace;
}

.save-btn:hover:not(:disabled) {
  background: #27272a;
  color: #fff;
  border-color: #3f3f46;
}

.save-btn.primary {
  background: rgba(34, 197, 94, 0.1);
  border-color: #22c55e44;
  color: #22c55e;
}

.save-btn.primary:hover:not(:disabled) {
  background: #22c55e;
  color: #000;
}

.save-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.editor-area {
  flex: 1;
  background: #000;
  color: #d4d4d8;
  border: none;
  resize: none;
  padding: 15px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
  line-height: 1.6;
  outline: none;
}
</style>
