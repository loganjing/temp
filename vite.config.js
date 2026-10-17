import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 缓存目录指向 dist 内部，避免写入 node_modules。
  cacheDir: 'dist/.vite',
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      // 开发形态：/api 由 Vite 代理转发到后端服务。
      '/api': 'http://localhost:3000',
    },
  },
});
