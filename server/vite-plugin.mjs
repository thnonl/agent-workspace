import { createMonitor } from './monitor.mjs';
import { createApi } from './api.mjs';

/** Runs the transcript monitor inside the Vite dev / preview server. */
export default function claudeMonitor() {
  let monitor;
  const attach = (server) => {
    monitor ??= createMonitor();
    monitor.start();
    server.middlewares.use(createApi(monitor));
    server.httpServer?.once('close', () => monitor.stop());
  };
  return {
    name: 'claude-office-monitor',
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
