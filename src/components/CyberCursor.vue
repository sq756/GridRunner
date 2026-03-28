<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { globalState } from '../store';

const mouseX = ref(-100);
const mouseY = ref(-100);
const isHovering = ref(false);
const isPressed = ref(false);

const config = computed(() => globalState.cursorConfig);

const isFirstMove = ref(true);

const updateMouse = (e: MouseEvent) => {
  if (isFirstMove.value) isFirstMove.value = false;
  mouseX.value = e.clientX;
  mouseY.value = e.clientY;
  
  // Detect if hovering over clickable elements
  const target = e.target as HTMLElement;
  isHovering.value = !!target.closest('button, a, input, select, .tab-item, .node-info, [role="button"], .file-item, .bc-item');
};

const updateTouch = (e: TouchEvent) => {
  if (isFirstMove.value) isFirstMove.value = false;
  if (e.touches.length > 0) {
    mouseX.value = e.touches[0].clientX;
    mouseY.value = e.touches[0].clientY;
  }
};

const handleMouseDown = () => isPressed.value = true;
const handleMouseUp = () => isPressed.value = false;

onMounted(() => {
  window.addEventListener('mousemove', updateMouse, { passive: true });
  window.addEventListener('mousedown', handleMouseDown);
  window.addEventListener('mouseup', handleMouseUp);
  window.addEventListener('touchstart', updateTouch, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener('mousemove', updateMouse);
  window.removeEventListener('mousedown', handleMouseDown);
  window.removeEventListener('mouseup', handleMouseUp);
  window.removeEventListener('touchstart', updateTouch);
});

const cursorStyle = computed(() => ({
  transform: `translate(${mouseX.value}px, ${mouseY.value}px) scale(${isPressed.value ? 0.8 : (isHovering.value ? 1.6 : 1)})`,
  width: `${config.value.size}px`,
  height: `${config.value.size}px`,
  marginTop: `-${config.value.size / 2}px`,
  marginLeft: `-${config.value.size / 2}px`,
  backgroundColor: config.value.color,
  // v2.14.20: Black Mist Glow (Ensures visibility on white backgrounds)
  boxShadow: `0 0 ${config.value.glow}px ${config.value.color}, 0 0 ${config.value.glow * 2}px rgba(0,0,0,0.8), 0 0 ${config.value.glow * 4}px rgba(0,0,0,0.4)`,
  opacity: (config.value.enabled && !isFirstMove.value) ? 1 : 0
}));
</script>

<template>
  <div v-if="config.enabled" class="cyber-cursor-wrapper">
    <div class="cyber-cursor" :style="cursorStyle" :class="{ 'breathing': config.breathing }"></div>
  </div>
</template>

<style scoped>
.cyber-cursor-wrapper {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 999999;
}

.cyber-cursor {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 50%;
  /* v2.14.20: Removed transition to eliminate lag */
  transition: opacity 0.3s;
  will-change: transform;
}

.breathing {
  animation: cursor-breath 2.5s infinite ease-in-out;
}

@keyframes cursor-breath {
  0%, 100% { filter: brightness(1); opacity: 1; }
  50% { filter: brightness(1.5); opacity: 0.7; }
}
</style>
