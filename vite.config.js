import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify('babylon') },
  server: { host: true, port: 5180 },
  build: { target: 'es2022', chunkSizeWarningLimit: 6000 },
  optimizeDeps: { exclude: ['@babylonjs/havok'] },
});
