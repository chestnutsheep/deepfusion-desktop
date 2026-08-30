import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    watch: {
      ignored: ['**/src-tauri/target/**'],
    },
    proxy: {
      // Tauri 开发模式下，前端(dev server)跑在 5188，后端 serve.py 跑在 5173。
      // 用相对路径 /api 请求，由 vite 代理到后端，避免跨端口 CORS/CSP 问题。
      '/api': {
        target: 'http://127.0.0.1:5173',
        changeOrigin: true,
      },
    },
  },
});
