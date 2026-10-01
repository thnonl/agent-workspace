// Settings in SQLite: store semantics, the /api/settings routes and their same-origin guard.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from './api.mjs';
import { createSettingsStore } from './settings.mjs';

const monitor = { claudeDir: 'C:/x', sources: {}, windowMs: 60000, snapshot: () => [], sessionCount: () => 0, on: () => () => {} };

async function serve(settings) {
  const api = createApi(monitor, { settings });
  const server = http.createServer((req, res) => api(req, res, () => res.writeHead(404).end()));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => (server.closeAllConnections?.(), server.close(r))) };
}

const put = (base, body, headers = { 'Content-Type': 'application/json' }) =>
  fetch(`${base}/api/settings`, { method: 'PUT', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('store: set, overwrite, delete, invalid entries skipped, survives reopen', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-settings-'));
  const file = path.join(dir, 'sub', 's.db');
  const a = createSettingsStore({ file });
  assert.ok(a.available);
  assert.deepEqual(a.all(), {});
  assert.equal(a.apply({ 'agent-workspace.quality': 'high', 'claude-office:muted': '1', 'bad key!': 'x', num: 5, big: 'x'.repeat(600 * 1024) }), 2);
  assert.equal(a.apply({ 'agent-workspace.quality': 'low', 'claude-office:muted': null }), 2);
  a.close();
  const b = createSettingsStore({ file });
  assert.deepEqual(b.all(), { 'agent-workspace.quality': 'low' });
  b.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('API: GET returns everything, PUT merges and deletes, bad bodies are rejected', async () => {
  const s = createSettingsStore({ file: ':memory:' });
  const { base, close } = await serve(s);
  assert.deepEqual(await (await fetch(`${base}/api/settings`)).json(), {});
  let r = await put(base, { a: '1', 'b.c': '{"x":1}' });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { saved: 2 });
  await put(base, { a: null, d: '2' });
  assert.deepEqual(await (await fetch(`${base}/api/settings`)).json(), { 'b.c': '{"x":1}', d: '2' });
  assert.equal((await put(base, '{nope')).status, 400);
  assert.equal((await put(base, '[1]')).status, 400);
  assert.equal((await fetch(`${base}/api/settings`, { method: 'DELETE' })).status, 405);
  await close();
  s.close();
});

test('API: a foreign origin or a non-JSON body cannot write', async () => {
  const s = createSettingsStore({ file: ':memory:' });
  const { base, close } = await serve(s);
  assert.equal((await put(base, { a: '1' }, { 'Content-Type': 'text/plain' })).status, 403, 'simple cross-site request');
  assert.equal((await put(base, { a: '1' }, { 'Content-Type': 'application/json', Origin: 'http://evil.example' })).status, 403);
  assert.equal((await put(base, { a: '1' }, { 'Content-Type': 'application/json', Origin: base })).status, 200, 'same origin');
  assert.deepEqual(s.all(), { a: '1' });
  await close();
  s.close();
});

test('API: 503 when SQLite is unavailable (the page then keeps using localStorage)', async () => {
  const { base, close } = await serve({ available: false });
  assert.equal((await fetch(`${base}/api/settings`)).status, 503);
  assert.equal((await put(base, { a: '1' })).status, 503);
  await close();
});

test('room people: head counts are stored, replaced, deleted, validated and aged out', async () => {
  const s = createSettingsStore({ file: ':memory:' });
  assert.deepEqual(s.roomPeople(), {});
  assert.equal(s.applyRoomPeople({ 'room-1': 4, 'room-2': 1, 'bad id!': 2, 'room-3': 0, 'room-4': 1.5, 'room-5': '3' }), 2);
  assert.equal(s.applyRoomPeople({ 'room-1': 6, 'room-2': null }), 2);
  assert.deepEqual(s.roomPeople(), { 'room-1': 6 });
  assert.deepEqual(s.roomPeople(-1), {}, 'rows older than the limit are not returned');
  assert.deepEqual(s.roomPeople(), {}, '…and have been dropped');
  s.close();
});

test('API: /api/room-people reads and writes head counts with the same guard as the settings', async () => {
  const s = createSettingsStore({ file: ':memory:' });
  const { base, close } = await serve(s);
  const get = async () => (await fetch(`${base}/api/room-people`)).json();
  assert.deepEqual(await get(), {});
  let r = await fetch(`${base}/api/room-people`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 3, b: 2 }) });
  assert.deepEqual(await r.json(), { saved: 2 });
  await fetch(`${base}/api/room-people`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ b: null }) });
  assert.deepEqual(await get(), { a: 3 });
  r = await fetch(`${base}/api/room-people`, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: '{"a":9}' });
  assert.equal(r.status, 403);
  assert.deepEqual(await get(), { a: 3 });
  assert.deepEqual(await (await fetch(`${base}/api/settings`)).json(), {}, 'settings are a separate table');
  await close();
  s.close();
});
