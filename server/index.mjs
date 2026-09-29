// Standalone production server:  npm run build && npm start
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMonitor } from './monitor.mjs';
import { createApi } from './api.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.env.PORT) || 4173;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

const monitor = createMonitor();
monitor.start();
const api = createApi(monitor);

const server = http.createServer((req, res) => {
  api(req, res, () => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname);
    let file = path.join(root, pathname === '/' ? 'index.html' : pathname);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404).end('Run `npm run build` first.');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(port, () => {
  console.log(`Claude Office → http://localhost:${port}`);
  console.log(`Watching ${monitor.claudeDir} (window ${Math.round(monitor.windowMs / 60000)} min)`);
});
