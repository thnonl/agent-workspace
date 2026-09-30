// SSE broadcast: one monitor subscription shared by all clients, every client sees every event once, in order.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { createApi } from './api.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function harness() {
  const em = new EventEmitter();
  const monitor = {
    claudeDir: 'C:/x', sources: {}, windowMs: 60000,
    snapshot: () => [{ type: 'session', sessionId: 's1' }],
    sessionCount: () => 1,
    on: (fn) => { em.on('event', fn); return () => em.off('event', fn); },
  };
  const api = createApi(monitor);
  const server = http.createServer((req, res) => api(req, res, () => res.writeHead(404).end()));
  return { em, server, emit: (e) => em.emit('event', e), listeners: () => em.listenerCount('event') };
}

function client(port) {
  const c = { events: [], req: null, closed: false };
  c.ready = new Promise((resolve) => {
    c.req = http.get({ port, path: '/api/events' }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (frame.startsWith('data: ')) c.events.push(JSON.parse(frame.slice(6)));
          if (c.events.at(-1)?.type === 'ready') resolve();
        }
      });
      res.on('error', () => {});
    });
    c.req.on('error', () => {});
  });
  c.close = () => c.req.destroy();
  return c;
}

test('SSE: hello+snapshot first, every client gets every event once in order, cleanup and resubscribe', async () => {
  const h = harness();
  await new Promise((r) => h.server.listen(0, r));
  const port = h.server.address().port;
  assert.equal(h.listeners(), 0);
  const cs = [client(port), client(port), client(port), client(port)];
  await Promise.all(cs.map((c) => c.ready));
  assert.equal(h.listeners(), 1, 'single monitor subscription');
  for (const c of cs) assert.deepEqual(c.events.map((e) => e.type), ['hello', 'session', 'ready']);
  for (let i = 0; i < 50; i++) h.emit({ type: 'n', i });
  await sleep(50);
  cs[1].close(); // disconnect mid-stream
  await sleep(30);
  for (let i = 50; i < 100; i++) h.emit({ type: 'n', i });
  await sleep(100);
  const nums = (c) => c.events.filter((e) => e.type === 'n').map((e) => e.i);
  const all = [...Array(100).keys()];
  assert.deepEqual(nums(cs[0]), all);
  assert.deepEqual(nums(cs[2]), all);
  assert.deepEqual(nums(cs[3]), all);
  assert.deepEqual(nums(cs[1]), all.slice(0, 50));
  assert.equal(h.listeners(), 1);
  for (const c of [cs[0], cs[2], cs[3]]) c.close();
  await sleep(100);
  assert.equal(h.listeners(), 0, 'listener removed after last disconnect');
  h.emit({ type: 'n', i: 999 }); // nobody listening: must not throw
  const again = client(port);
  await again.ready;
  assert.equal(h.listeners(), 1, 'reconnect re-subscribes');
  h.emit({ type: 'n', i: 7 });
  await sleep(50);
  assert.deepEqual(again.events.map((e) => e.type), ['hello', 'session', 'ready', 'n']);
  again.close();
  await sleep(50);
  assert.equal(h.listeners(), 0);
  h.server.closeAllConnections?.();
  await new Promise((r) => h.server.close(r));
});
