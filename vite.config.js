import { defineConfig } from 'vite';

// base './' lets the same build run on GitHub Pages (sub-path) and inside Electron (file://)
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
});
