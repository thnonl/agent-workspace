// Tiny connect-style middleware exposing the monitor over Server-Sent Events.
export function createApi(monitor) {
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
      send({ type: 'hello', claudeDir: monitor.claudeDir, sources: monitor.sources, windowMin: Math.round(monitor.windowMs / 60000) });
      for (const ev of monitor.snapshot()) send(ev);
      send({ type: 'ready' });
      const off = monitor.on(send);
      const heartbeat = setInterval(() => res.write(': hb\n\n'), 15000);
      req.on('close', () => {
        clearInterval(heartbeat);
        off();
      });
      return;
    }
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, claudeDir: monitor.claudeDir, sessions: monitor.sessionCount() }));
      return;
    }
    next();
  };
}
