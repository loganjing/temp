import { defineConfig } from 'vitest/config';

// 后端单元测试专用配置（独立于 vite.config.ts，避免加载前端插件）
export default defineConfig({
  test: {
    include: ['src/server/__tests__/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
});
