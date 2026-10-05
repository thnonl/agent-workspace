// The production web server: the built front-end (dist/) plus the monitor API. Shared by `npm start` and the Electron app.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createApi } from './api.mjs';
import { createConnectRoutes } from './mobile.mjs';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
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

/** Does the Accept-Encoding header allow this coding (listed with q > 0)? */
function accepts(accept, enc) {
  for (const part of accept.split(',')) {
    const [name, ...params] = part.trim().split(';');
    if (name.trim().toLowerCase() !== enc) continue;
    const q = params.map((p) => /^\s*q\s*=\s*([\d.]+)\s*$/i.exec(p)).find(Boolean);
    return !q || Number(q[1]) > 0;
  }
  return false;
}

/** The precompressed sibling (written by compress-dist.mjs) the client accepts, if there is one. */
function encoded(file, accept) {
  for (const [enc, ext] of [['br', '.br'], ['gzip', '.gz']]) {
    if (!accepts(accept, enc)) continue;
    try {
      if (fs.statSync(file + ext).isFile()) return { file: file + ext, enc };
    } catch {
      /* not precompressed */
    }
  }
  return null;
}

/** `update`: see update.mjs. */
export function createAppServer({ root, monitor, update }) {
  const api = createApi(monitor, { update });
  const connect = createConnectRoutes();
  return http.createServer((req, res) => {
    connect(req, res, () => api(req, res, () => {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname);
      } catch {
        res.writeHead(400).end('Bad request'); // malformed %-escape: must not take the server down
        return;
      }
      const file = resolveFile(root, pathname);
      const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', Vary: 'Accept-Encoding' };
      // file names under /assets carry a content hash: they never change; index.html must always be revalidated
      if (pathname.startsWith('/assets/')) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
      else if (file.endsWith('index.html')) headers['Cache-Control'] = 'no-cache';
      const pre = encoded(file, String(req.headers['accept-encoding'] || ''));
      let send = file;
      if (pre) {
        send = pre.file;
        headers['Content-Encoding'] = pre.enc;
      }
      const stream = fs.createReadStream(send);
      stream.on('error', () => {
        if (!res.headersSent) res.writeHead(404).end('Run `npm run build` first.');
        else res.destroy();
      });
      stream.on('open', () => {
        res.writeHead(200, headers);
        stream.pipe(res);
      });
    }));
  });
}
