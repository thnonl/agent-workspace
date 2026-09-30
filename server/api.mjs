// Tiny connect-style middleware exposing the monitor over Server-Sent Events.
// The monitor only runs while somebody listens: the first stream starts it, and it stops `idleStopMs` after the last
// stream closed (a page reload or an EventSource reconnect must not cost a cold start).
export function createApi(monitor, { idleStopMs = 30_000 } = {}) {
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
    next();
  };
}
