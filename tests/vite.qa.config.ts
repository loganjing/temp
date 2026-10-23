import { defineConfig, mergeConfig } from 'vite';
import baseConfig from '../vite.config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    server: {
      port: 5174,
      proxy: {
'/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3002',
        ws: true,
      },
      },
    },
  }),
);
