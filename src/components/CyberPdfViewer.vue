<script setup lang="ts">
import { ref } from 'vue';
import { open } from '@tauri-apps/plugin-shell';

const props = defineProps<{
  url: string;
  title: string;
}>();

const handleOpenInBrowser = async () => {
  await open(props.url);
};
</script>

<template>
  <div class="pdf-viewer">
    <header class="pdf-toolbar">
      <span class="pdf-title">{{ title }}</span>
      <div class="toolbar-actions">
        <button class="tool-btn" @click="handleOpenInBrowser">🌍 BROWSER</button>
      </div>
    </header>
    <div class="pdf-content">
      <!-- v2.11.54: Integration with browser's native PDF renderer -->
      <iframe :src="url" class="pdf-iframe" frameborder="0"></iframe>
    </div>
  </div>
</template>

<style scoped>
.pdf-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: #000;
}

.pdf-toolbar {
  height: 28px;
  background: #18181b;
  border-bottom: 1px solid #27272a;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px;
  flex-shrink: 0;
}

.pdf-title {
  font-size: 10px;
  color: #71717a;
  font-family: 'JetBrains Mono', monospace;
}

.tool-btn {
  background: #27272a;
  border: 1px solid #3f3f46;
  color: #fff;
  font-size: 9px;
  padding: 2px 8px;
  border-radius: 2px;
  cursor: pointer;
}

.tool-btn:hover {
  background: #3b82f6;
}

.pdf-content {
  flex: 1;
  background: #fff; /* PDF usually looks better on white, but engine can be dark */
}

.pdf-iframe {
  width: 100%;
  height: 100%;
}
</style>
