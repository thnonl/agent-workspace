import { createMonitor } from './monitor.mjs';
import { createApi } from './api.mjs';
import { createGuard, loadToken } from './mobile.mjs';
import { createUpdateCheck } from './update.mjs';

/** Runs the transcript monitor inside the Vite dev / preview server. */
export default function claudeMonitor() {
  let monitor;
  const attach = (server) => {
    monitor ??= createMonitor();
    // (`vite --host` shares the dev server too: same token rules as the production server)
    server.middlewares.use(createGuard({ token: loadToken() }));
    server.middlewares.use(createApi(monitor, { update: createUpdateCheck({ dev: true }) }));
    server.httpServer?.once('close', () => monitor.stop());
  };
  return {
    name: 'claude-office-monitor',
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
