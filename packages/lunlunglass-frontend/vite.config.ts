import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // 严格使用 5173 端口，如果被占用会报错
    // 允许 Electron 访问
    cors: true,
  },
  base: './', // 使用相对路径，便于 Electron 加载
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
