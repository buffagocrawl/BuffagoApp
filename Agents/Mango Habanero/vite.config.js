import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1', port: 4317, strictPort: true,
    // Keep the browser Host and Origin paired for Mango's same-origin guard.
    proxy: { '/api': { target: 'http://127.0.0.1:4318', changeOrigin: false } }
  }
});
