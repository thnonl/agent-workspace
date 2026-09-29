import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import claudeMonitor from './server/vite-plugin.mjs';

export default defineConfig({
  plugins: [react(), claudeMonitor()],
  server: { port: 5173, host: true },
  build: { chunkSizeWarningLimit: 1600 },
});
