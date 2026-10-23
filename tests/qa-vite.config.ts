/**
 * QA Vite config — proxies /api to the QA backend on port 3001.
 */
export default {
  root: '.',
  build: { outDir: 'dist/client', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  esbuild: { jsx: 'automatic' },
};
