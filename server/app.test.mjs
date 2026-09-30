// Static server: precompressed files by Accept-Encoding, no escape from the dist folder, bad URLs do not crash it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { EventEmitter } from 'node:events';
import { createAppServer } from './app.mjs';

const monitor = { claudeDir: 'C:/x', sources: {}, windowMs: 1, snapshot: () => [], sessionCount: () => 0, on: () => () => {} };

// raw request so the path reaches the server untouched
const get = (port, p, headers = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request({ port, path: p, headers, agent: false }, (res) => {
      const c = [];
      res.on('data', (d) => c.push(d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(c) }));
    });
    req.on('error', reject);
    req.end();
  });

test('static server: encodings, traversal, malformed URLs, missing files', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'app-'));
  const root = path.join(tmp, 'dist');
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'secret.txt'), 'TOP-SECRET');
  fs.writeFileSync(path.join(tmp, 'dist-evil.txt'), 'SIBLING-SECRET'); // shares the "dist" prefix
  const html = '<html>' + 'hello '.repeat(500) + '</html>';
  const js = 'console.log(1);'.repeat(200);
  fs.writeFileSync(path.join(root, 'index.html'), html);
  fs.writeFileSync(path.join(root, 'index.html.br'), zlib.brotliCompressSync(html));
  fs.writeFileSync(path.join(root, 'index.html.gz'), zlib.gzipSync(html));
  fs.writeFileSync(path.join(root, 'assets', 'a-123.js'), js);
  fs.writeFileSync(path.join(root, 'assets', 'a-123.js.gz'), zlib.gzipSync(js)); // gzip only
  const server = createAppServer({ root, monitor });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  try {
    const enc = async (p, ae) => (await get(port, p, ae === undefined ? {} : { 'Accept-Encoding': ae })).headers['content-encoding'];
    const expectIndex = { br: 'br', gzip: 'gzip', identity: undefined, 'gzip;q=0': undefined, 'gzip, deflate, br, zstd': 'br', 'deflate, gzip': 'gzip', 'br;q=0, gzip': 'gzip', 'gzip;q=0.5': 'gzip', 'br, gzip;q=0': 'br', GZIP: 'gzip', 'gzip;q=0.0': undefined, '*': undefined };
    for (const [ae, want] of Object.entries(expectIndex)) assert.equal(await enc('/', ae), want, `Accept-Encoding: ${ae}`);
    assert.equal(await enc('/'), undefined, 'no header');
    assert.equal(await enc('/assets/a-123.js', 'br, gzip'), 'gzip', 'falls back to the next encoding that exists');
    const r = await get(port, '/', { 'Accept-Encoding': 'br' });
    assert.equal(zlib.brotliDecompressSync(r.body).toString(), html);
    assert.equal(r.headers['cache-control'], 'no-cache');
    assert.match(r.headers.vary, /Accept-Encoding/);
    const a = await get(port, '/assets/a-123.js', { 'Accept-Encoding': 'gzip' });
    assert.equal(zlib.gunzipSync(a.body).toString(), js);
    assert.match(a.headers['cache-control'], /immutable/);
    assert.equal((await get(port, '/assets/a-123.js')).body.toString(), js);

    for (const p of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/%2e%2e%2fsecret.txt', '/assets/../../secret.txt', '/..%5csecret.txt', '/../dist-evil.txt', '/%2e%2e/dist-evil.txt', '/..\secret.txt', '/%252e%252e/secret.txt', '/%00', '//etc/passwd', '/C:/Windows/win.ini']) {
      const x = await get(port, p, { 'Accept-Encoding': 'identity' });
      assert.ok(!x.body.toString().includes('SECRET'), `leaked via ${p}`);
      assert.equal(x.body.toString(), html, `${p} falls back to the SPA index`);
    }
    const bad = await get(port, '/%E0%A4%A');
    assert.equal(bad.status, 400);
    assert.equal((await get(port, '/still-alive')).status, 200, 'server survived the malformed URL');
    assert.equal((await get(port, '/missing.js')).status, 200, 'unknown paths fall back to index.html (SPA)');
    // no index.html at all: 404, no crash
    fs.rmSync(path.join(root, 'index.html'));
    fs.rmSync(path.join(root, 'index.html.br'));
    fs.rmSync(path.join(root, 'index.html.gz'));
    assert.equal((await get(port, '/nothing')).status, 404);
    assert.equal((await get(port, '/', { 'Accept-Encoding': 'br' })).status, 404);
    assert.equal((await get(port, '/assets/a-123.js')).status, 200);
  } finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
