// The production web server: the built front-end (dist/) plus the monitor API. Shared by `npm start` and the Electron app.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createApi } from './api.mjs';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** Requests below `root` only; anything unknown falls back to index.html (single-page app). */
function resolveFile(root, pathname) {
  const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
  const inside = file === root || file.startsWith(root + path.sep);
  try {
    if (inside && fs.statSync(file).isFile()) return file;
  } catch {
    /* not there */
  }
  return path.join(root, 'index.html');
}

export function createAppServer({ root, monitor }) {
  const api = createApi(monitor);
  return http.createServer((req, res) => {
    api(req, res, () => {
      const pathname = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname);
      const file = resolveFile(root, pathname);
      if (!fs.existsSync(file)) {
        res.writeHead(404).end('Run `npm run build` first.');
        return;
      }
      const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' };
      // file names under /assets carry a content hash: they never change
      if (pathname.startsWith('/assets/')) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
      res.writeHead(200, headers);
      fs.createReadStream(file).pipe(res);
    });
  });
}
