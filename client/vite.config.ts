import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // Proxy keeps the frontend origin-relative in development.
    proxy: {
      '/api': { target: 'http://localhost:3002', changeOrigin: true },
    },
  },
});
