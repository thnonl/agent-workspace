#!/usr/bin/env node
// Production server and command line entry:  npx @thnonl/agent-workspace   (from a checkout: npm run build && npm start)
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createMonitor } from './monitor.mjs';
import { createAppServer } from './app.mjs';

const HELP = `Claude Office – watch your Claude Code sessions as a 3D office

Usage: agent-workspace [options]

  -p, --port <n>   port to listen on (default 4173, or $PORT)
      --host <ip>  address to listen on (default 127.0.0.1; 0.0.0.0 shares the page with your network)
      --no-open    do not open the browser
  -h, --help       show this text
`;

/** Value of `--name value` / `--name=value` / `-n value`, or undefined. */
function option(args, long, short) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === long || a === short) return args[i + 1];
    if (a.startsWith(`${long}=`)) return a.slice(long.length + 1);
  }
  return undefined;
}

function openBrowser(url) {
  const [cmd, ...args] =
    process.platform === 'win32' ? ['cmd', '/c', 'start', '', url] : process.platform === 'darwin' ? ['open', url] : ['xdg-open', url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch {
    /* no browser to open: the address is printed anyway */
  }
}

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(option(args, '--port', '-p') ?? process.env.PORT) || 4173;
const host = option(args, '--host') ?? '127.0.0.1';

const monitor = createMonitor();
monitor.start();

const server = createAppServer({ root, monitor });
server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${port} is already in use – try --port <n>.` : err.message);
  process.exit(1);
});
server.listen(port, host, () => {
  const url = `http://${host === '0.0.0.0' || host === '::' ? 'localhost' : host}:${port}`;
  console.log(`Claude Office → ${url}`);
  console.log(`Watching ${monitor.claudeDir} (window ${Math.round(monitor.windowMs / 60000)} min)`);
  if (!args.includes('--no-open')) openBrowser(url);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    monitor.stop();
    server.close();
    process.exit(0);
  });
}
