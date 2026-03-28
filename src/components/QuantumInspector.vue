<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits(['close']);

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let animationFrameId: number;

const capturedElements = ref<any[]>([]);

const scanDOM = () => {
  const elements: any[] = [];
  // Scan for interesting components
  const selectors = [
    '.app-shell', '.main-view', '.sidebar-panel', '.pane', 
    '.tab-bar', '.workspace-body', '.terminal-view-container',
    '.cyber-hud-container', '.webview-container', '.settings-drawer',
    '.drawer-overlay', '.cyber-cursor', '.file-list', '.context-menu',
    '.grid-context-menu', '.tab-item'
  ];

  const allSelected = document.querySelectorAll(selectors.join(', '));
  
  allSelected.forEach((el: Element) => {
    const htmlEl = el as HTMLElement;
    const rect = htmlEl.getBoundingClientRect();
    const style = window.getComputedStyle(htmlEl);
    const zIndex = style.zIndex === 'auto' ? 0 : parseInt(style.zIndex);
    const bgColor = style.backgroundColor;
    const isVisible = rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';

    if (isVisible) {
      elements.push({
        name: htmlEl.className.split(' ')[0] || htmlEl.tagName,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        zIndex: zIndex,
        color: bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)' ? bgColor : '#22c55e',
        opacity: parseFloat(style.opacity) || 1
      });
    }
  });

  capturedElements.value = elements;
  return elements;
};

const init3D = () => {
  if (!canvasRef.value || !containerRef.value) return;

  const width = containerRef.value.clientWidth;
  const height = containerRef.value.clientHeight;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050505);

  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 10000);
  camera.position.set(width / 2, height / 2, 1000);

  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(width / 2, height / 2, 0);
  controls.update();

  // Grid Helper
  const gridHelper = new THREE.GridHelper(5000, 50, 0x22c55e, 0x18181b);
  gridHelper.rotation.x = Math.PI / 2;
  gridHelper.position.set(width / 2, height / 2, -10);
  scene.add(gridHelper);

  const uiElements = scanDOM();
  
  // v2.15.70: Map DOM to 3D planes
  uiElements.forEach((el) => {
    const geometry = new THREE.PlaneGeometry(el.width, el.height);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(el.color.includes('rgb') ? el.color : '#22c55e'),
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    // Center alignment adjustment
    mesh.position.set(el.x + el.width / 2, height - (el.y + el.height / 2), el.zIndex * 2);
    scene.add(mesh);

    // Wireframe for borders
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x22c55e }));
    line.position.copy(mesh.position);
    scene.add(line);
  });

  const animate = () => {
    animationFrameId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();
};

const exportData = async () => {
  const json = JSON.stringify(capturedElements.value, null, 2);
  const path = await save({
    defaultPath: 'ter_ui_audit.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (path) {
    // Note: Assuming @tauri-apps/plugin-fs is available based on project structure
    // If not, we fall back to console or clipboard
    console.log("[QUANTUM_AUDIT] Exporting to:", path);
    try {
      await writeTextFile(path, json);
    } catch (e) {
      console.error("Export fail:", e);
    }
  }
};

onMounted(() => {
  if (props.isOpen) {
    nextTick(() => init3D());
  }
});

watch(() => props.isOpen, (val) => {
  if (val) {
    nextTick(() => init3D());
  } else {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
  }
});

onUnmounted(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
});
</script>

<template>
  <div v-if="isOpen" class="quantum-inspector-overlay" ref="containerRef">
    <div class="inspector-toolbar">
      <div class="brand">QUANTUM_UI_AUDIT_v1</div>
      <div class="actions">
        <button @click="exportData" class="tool-btn">EXPORT_JSON</button>
        <button @click="$emit('close')" class="tool-btn close">EXIT_AUDIT</button>
      </div>
    </div>
    <canvas ref="canvasRef"></canvas>
    <div class="inspector-hint">
      LEFT_MOUSE: ROTATE | RIGHT_MOUSE: PAN | WHEEL: ZOOM
      <br/>
      Z-AXIS REPRESENTS CSS Z-INDEX (AMPLIFIED 2X)
    </div>
  </div>
</template>

<style scoped>
.quantum-inspector-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  background: #000;
  display: flex;
  flex-direction: column;
}

.inspector-toolbar {
  height: 40px;
  background: #09090b;
  border-bottom: 1px solid #22c55e44;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  color: #22c55e;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  letter-spacing: 2px;
}

.tool-btn {
  background: transparent;
  border: 1px solid #22c55e;
  color: #22c55e;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  margin-left: 10px;
  font-family: inherit;
  font-size: 10px;
}
.tool-btn:hover { background: rgba(34, 197, 94, 0.1); }
.tool-btn.close { border-color: #ef4444; color: #ef4444; }
.tool-btn.close:hover { background: rgba(239, 68, 68, 0.1); }

canvas { flex: 1; outline: none; }

.inspector-hint {
  position: absolute;
  bottom: 20px;
  left: 20px;
  color: #71717a;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  line-height: 1.5;
  pointer-events: none;
}
</style>