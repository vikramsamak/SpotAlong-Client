import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tunnel from './plugins/tunnel.ts';

export default defineConfig({
  plugins: [react(), tunnel()],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
