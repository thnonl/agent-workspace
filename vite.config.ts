import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import claudeMonitor from './server/vite-plugin.mjs';

export default defineConfig({
  plugins: [react(), claudeMonitor()],
  server: { port: 5173, host: true },
  build: {
    chunkSizeWarningLimit: 900,
    // three.js and the React runtime hardly ever change: keep them in their own files so the browser can cache them
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\/]three[\/]/ },
            { name: 'react', test: /node_modules[\/](react|react-dom|scheduler|zustand)[\/]/ },
          ],
        },
      },
    },
  },
});
