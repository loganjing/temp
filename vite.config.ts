import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite 构建配置
// 后端 Hono 服务默认监听 3000 端口，同时托管 dist/ 静态文件与 /api 接口。
// 开发模式下 Vite dev server 运行在 5173，通过 proxy 将 /api 转发到后端。
export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
