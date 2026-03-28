import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  server: {
    port: 5173,
    host: '0.0.0.0',
    strictPort: true,
    allowedHosts: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
})