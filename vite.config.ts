/**
 * Vite configuration for the ticket-system SPA.
 *
 * Uses esbuild automatic JSX runtime so the React plugin is not required
 * for production builds. The dev-server proxies /api to the Hono backend
 * on port 3000.
 */
export default {
  root: '.',
  build: {
    outDir: 'dist/client',
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
  esbuild: {
    jsx: 'automatic',
  },
};
