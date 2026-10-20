import { defineConfig } from 'vite';
import { serviceWorkerPlugin } from './build/serviceWorkerPlugin.js';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  build: { outDir: 'dist', emptyOutDir: true },
  plugins: [serviceWorkerPlugin()],
});
