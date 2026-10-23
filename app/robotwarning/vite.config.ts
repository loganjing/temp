import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

if (process.env.QA_RUN_ID && !process.env.QA_API_BASE_URL) throw new Error('QA_API_BASE_URL is required for QA')

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.QA_API_BASE_URL ?? 'http://localhost:3000',
      '/ws': {
        target: process.env.QA_API_BASE_URL ?? 'http://localhost:3000',
        ws: true,
      },
    },
  },
})
