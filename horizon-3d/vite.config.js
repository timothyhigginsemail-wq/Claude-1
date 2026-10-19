import { defineConfig } from 'vite';

// Relative base so the production build can be opened from any static host or folder.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 900 },
});
