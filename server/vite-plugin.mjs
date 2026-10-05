import { createMonitor } from './monitor.mjs';
import { createApi } from './api.mjs';
import { createConnectRoutes } from './mobile.mjs';
import { createUpdateCheck } from './update.mjs';

/** Runs the transcript monitor inside the Vite dev / preview server. */
export default function claudeMonitor() {
  let monitor;
  const attach = (server) => {
    monitor ??= createMonitor();
    // (`vite --host` shares the dev server too: the same connect page and info as the production server)
    server.middlewares.use(createConnectRoutes());
    server.middlewares.use(createApi(monitor, { update: createUpdateCheck({ dev: true }) }));
    server.httpServer?.once('close', () => monitor.stop());
  };
  return {
    name: 'claude-office-monitor',
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
