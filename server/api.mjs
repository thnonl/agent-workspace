import { createSettingsStore } from './settings.mjs';

const BODY_LIMIT = 2 * 1024 * 1024;

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > BODY_LIMIT) {
        reject(Object.assign(new Error('too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** A page from another origin must not be able to rewrite the settings: same host only, and a JSON body (forces a CORS preflight). */
function sameOriginJson(req) {
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return false;
    } catch {
      return false;
    }
  }
  return /^application\/json\b/i.test(String(req.headers['content-type'] || ''));
}

// Tiny connect-style middleware exposing the monitor over Server-Sent Events.
// The monitor only runs while somebody listens: the first stream starts it, and it stops `idleStopMs` after the last
// stream closed (a page reload or an EventSource reconnect must not cost a cold start).
export function createApi(monitor, { idleStopMs = 30_000, settings } = {}) {
  // opened on first use: a server nobody asks for settings never creates the database file
  let store = settings;
  const settingsStore = () => (store ??= createSettingsStore());
  // one subscription for all clients: each event is stringified once and the same frame goes to every stream
  const clients = new Set();
  let off = null;
  let stopTimer = null;
  const broadcast = (ev) => {
    const frame = `data: ${JSON.stringify(ev)}` + '\n\n';
    for (const res of clients) res.write(frame);
  };
  return function api(req, res, next) {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      const send = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
      res.write('retry: 2000\n\n');
      clearTimeout(stopTimer);
      monitor.start?.(); // no-op while it runs; a cold start finishes before the snapshot below is taken
      send({ type: 'hello', claudeDir: monitor.claudeDir, sources: monitor.sources, windowMin: Math.round(monitor.windowMs / 60000) });
      for (const ev of monitor.snapshot()) send(ev);
      send({ type: 'ready' });
      clients.add(res);
      off ??= monitor.on(broadcast);
      const heartbeat = setInterval(() => res.write(': hb\n\n'), 15000);
      req.on('close', () => {
        clearInterval(heartbeat);
        clients.delete(res);
        if (!clients.size) {
          off?.();
          off = null;
          clearTimeout(stopTimer);
          stopTimer = setTimeout(() => {
            if (!clients.size) monitor.stop?.();
          }, idleStopMs);
          stopTimer.unref?.();
        }
      });
      return;
    }
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, claudeDir: monitor.claudeDir, sources: monitor.sources, sessions: monitor.sessionCount() }));
      return;
    }
    // key/value routes backed by SQLite: the user's settings and the head count of every room
    const table = url.pathname === '/api/settings' ? 'all' : url.pathname === '/api/room-people' ? 'roomPeople' : null;
    if (table) {
      const write = table === 'all' ? 'apply' : 'applyRoomPeople';
      if (req.method === 'GET') {
        const s = settingsStore();
        if (!s.available) return json(res, 503, { error: 'sqlite unavailable' });
        return json(res, 200, s[table]());
      }
      if (req.method === 'PUT') {
        if (!sameOriginJson(req)) return json(res, 403, { error: 'forbidden' });
        const s = settingsStore();
        if (!s.available) return json(res, 503, { error: 'sqlite unavailable' });
        readBody(req)
          .then((text) => {
            const body = JSON.parse(text);
            if (!body || typeof body !== 'object' || Array.isArray(body)) throw Object.assign(new Error('object expected'), { status: 400 });
            json(res, 200, { saved: s[write](body) });
          })
          .catch((err) => json(res, err.status || (err instanceof SyntaxError ? 400 : 500), { error: err.message }));
        return;
      }
      return json(res, 405, { error: 'method not allowed' });
    }
    next();
  };
}
