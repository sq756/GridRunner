<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted, onMounted } from 'vue';

const props = defineProps<{
  isLocked: boolean;
  logs: string[];
  cpuUsage: number;
}>();

const emit = defineEmits(['unlock']);

const matrixCanvas = ref<HTMLCanvasElement | null>(null);
let animationFrameId: number | null = null;
const isUnlocking = ref(false);
const systemTime = ref(new Date().toLocaleTimeString());

// Game of Life State
const cellSize = 6;
let grid: number[][] = [];
let cols = 0, rows = 0;

const initGrid = () => {
  cols = Math.ceil(window.innerWidth / cellSize);
  rows = Math.ceil(window.innerHeight / cellSize);
  grid = Array.from({ length: cols }, () => 
    Array.from({ length: rows }, () => Math.random() > 0.85 ? 1 : 0)
  );
  
  // Seed some common patterns
  seedPulsar(Math.floor(cols/2), Math.floor(rows/2));
};

const seedPulsar = (cx: number, cy: number) => {
  const p = [
    [2,1],[3,1],[4,1],[8,1],[9,1],[10,1],
    [1,2],[1,3],[1,4],[6,2],[6,3],[6,4],[11,2],[11,3],[11,4],
    [2,6],[3,6],[4,6],[8,6],[9,6],[10,6]
  ];
  p.forEach(([x, y]) => { if(grid[cx+x] && cy+y < rows) grid[cx+x][cy+y] = 1; });
};

const stepLife = () => {
  let next = grid.map(arr => [...arr]);
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      let neighbors = 0;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          if (i === 0 && j === 0) continue;
          const nx = (x + i + cols) % cols;
          const ny = (y + j + rows) % rows;
          neighbors += grid[nx][ny];
        }
      }
      if (grid[x][y] === 1 && (neighbors < 2 || neighbors > 3)) next[x][y] = 0;
      else if (grid[x][y] === 0 && neighbors === 3) next[x][y] = 1;
    }
  }
  grid = next;
};

const draw = (ctx: CanvasRenderingContext2D) => {
  if (!props.isLocked) return;
  
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; // Trail effect
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // v2.7.0: Ambient Life Game
  const brightness = isUnlocking.value ? 0.8 : 0.15;
  ctx.fillStyle = `rgba(34, 197, 94, ${brightness})`;
  
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      if (grid[x][y] === 1) {
        ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);
      }
    }
  }

  // Intermittent Data Stream Lightning
  if (Math.random() > 0.95) {
    ctx.fillStyle = 'rgba(34, 197, 94, 0.4)';
    const lx = Math.random() * ctx.canvas.width;
    ctx.fillRect(lx, 0, 1, ctx.canvas.height);
  }

  const speedFactor = isUnlocking.value ? 4 : (1 + props.cpuUsage / 20);
  if (Math.random() * 10 < speedFactor) stepLife();

  animationFrameId = requestAnimationFrame(() => draw(ctx));
};

const handleInteraction = (e: MouseEvent | KeyboardEvent) => {
  if (isUnlocking.value) return;
  
  if (e instanceof MouseEvent) {
    const gx = Math.floor(e.clientX / cellSize);
    const gy = Math.floor(e.clientY / cellSize);
    for(let i=-1; i<=1; i++) for(let j=-1; j<=1; j++) {
      if (grid[gx+i] && gy+j < rows) grid[gx+i][gy+j] = 1;
    }
  } else {
    // Key press: Seed random clusters
    for (let i = 0; i < 10; i++) {
      const rx = Math.floor(Math.random() * cols);
      const ry = Math.floor(Math.random() * rows);
      grid[rx][ry] = 1;
    }
    
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
      performUnlock();
    }
  }
};

const performUnlock = () => {
  isUnlocking.value = true;
  setTimeout(() => {
    isUnlocking.value = false;
    emit('unlock');
  }, 600);
};

watch(() => props.isLocked, (val) => {
  if (val) {
    nextTick(() => {
      initGrid();
      const ctx = matrixCanvas.value?.getContext('2d');
      if (ctx) draw(ctx);
      window.addEventListener('mousemove', handleInteraction);
      window.addEventListener('keydown', handleInteraction);
    });
  } else {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    window.removeEventListener('mousemove', handleInteraction);
    window.removeEventListener('keydown', handleInteraction);
  }
});

onUnmounted(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
});
</script>

<template>
  <div v-if="isLocked" class="matrix-container" :class="{ 'crt-off': isUnlocking }">
    <canvas ref="matrixCanvas" :width="1920" :height="1080"></canvas>
    
    <div class="system-meta-top">
      [SYSTEM_INTEGRITY_CHECKING...] [PTY_SESSION_RECOVERY: {{ Math.floor(Math.random()*1000000) }}] [ACTIVE_NODES: {{ logs.length }}]
    </div>

    <div class="matrix-overlay">
      <div class="security-barrier" :class="{ 'glitch-active': isUnlocking }">
        <h1 class="main-title">AUTHENTICATION REQUIRED</h1>
        <div class="decrypt-ritual" v-if="isUnlocking">DECRYPTING... {{ Math.random().toString(16).toUpperCase() }}</div>
      </div>
    </div>

    <div class="decrypt-prompt">
      <span class="breathing-text">PRESS ANY KEY TO INITIALIZE DECRYPTION</span>
    </div>
  </div>
</template>

<style scoped>
.matrix-container {
  position: fixed;
  inset: 0;
  z-index: 999999;
  background: #000;
  overflow: hidden;
  cursor: none;
  pointer-events: auto; /* v2.14.3: Explicitly auto only when active */
}

canvas { display: block; filter: blur(0.5px); }

.system-meta-top {
  position: absolute;
  top: 10px;
  left: 0;
  right: 0;
  text-align: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: rgba(34, 197, 94, 0.4);
  letter-spacing: 2px;
}

.matrix-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at center, transparent 30%, rgba(0, 0, 0, 0.8) 100%);
}

.main-title {
  font-family: 'JetBrains Mono', monospace;
  font-size: 28px;
  font-weight: 200;
  color: #22c55e;
  letter-spacing: 0.4em;
  text-shadow: 0 0 10px rgba(34, 197, 94, 0.3);
  margin: 0;
  transition: all 0.1s;
}

.security-barrier.glitch-active .main-title {
  animation: glitch 0.1s infinite;
  color: #fff;
  text-shadow: 2px 0 #ff00ff, -2px 0 #00ffff;
}

@keyframes glitch {
  0% { transform: translate(0); }
  20% { transform: translate(-2px, 2px); }
  40% { transform: translate(-2px, -2px); }
  60% { transform: translate(2px, 2px); }
  80% { transform: translate(2px, -2px); }
  100% { transform: translate(0); }
}

.decrypt-ritual {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #fff;
  margin-top: 20px;
}

.decrypt-prompt {
  position: absolute;
  bottom: 40px;
  left: 0;
  right: 0;
  text-align: center;
}

.breathing-text {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: rgba(34, 197, 94, 0.3);
  letter-spacing: 4px;
  animation: breathe 3s infinite ease-in-out;
}

@keyframes breathe {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 0.8; }
}

/* CRT Off Effect */
.crt-off {
  animation: crt-off 0.6s forwards cubic-bezier(0.19, 1, 0.22, 1);
}

@keyframes crt-off {
  0% { transform: scale(1, 1); filter: brightness(1); }
  40% { transform: scale(1, 0.005); filter: brightness(2); }
  100% { transform: scale(0, 0); filter: brightness(5); }
}
</style>
