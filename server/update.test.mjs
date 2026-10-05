import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compareVersions, createUpdateCheck, installKind, updateCommands } from './update.mjs';

function fakeRoot(version, { git = false, npx = false } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-update-'));
  const root = npx ? path.join(base, '_npx', 'abc', 'node_modules', 'pkg') : base;
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@thnonline/agent-workspace', version }));
  if (git) fs.mkdirSync(path.join(root, '.git'));
  return root;
}

test('compareVersions orders releases and pre-releases', () => {
  assert.equal(compareVersions('1.3.5', '1.3.4'), 1);
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.3.4', '1.3.4'), 0);
  assert.equal(compareVersions('1.4.0-beta.1', '1.4.0'), -1);
  assert.equal(compareVersions('2.0.0', '1.9.0'), 1);
  assert.equal(compareVersions('garbage', '1.0.0'), 0);
});

test('installKind tells npx, checkout and npm installs apart', () => {
  assert.equal(installKind(fakeRoot('1.0.0', { npx: true })), 'npx');
  assert.equal(installKind(fakeRoot('1.0.0', { git: true })), 'checkout');
  assert.equal(installKind(fakeRoot('1.0.0')), 'npm');
});

test('updateCommands repeats the start options (not --no-open)', () => {
  const name = '@thnonline/agent-workspace';
  assert.deepEqual(updateCommands({ name, kind: 'npx', args: ['--host', '0.0.0.0', '--no-open'] }), [`npx ${name}@latest --host 0.0.0.0`]);
  assert.deepEqual(updateCommands({ name, kind: 'npm', args: ['--port=5000'] }), [`npx ${name}@latest --port=5000`]);
  assert.deepEqual(updateCommands({ name, kind: 'checkout', dev: true }), ['git pull', 'npm install', 'npm run dev']);
  assert.deepEqual(updateCommands({ name, kind: 'checkout', args: ['-p', '5000'] }), ['git pull', 'npm install', 'npm run build && npm start -- -p 5000']);
});

test('check asks the registry once, caches it, and reports a newer version', async () => {
  let calls = 0;
  let t = 0;
  const fetchImpl = async (url) => {
    calls++;
    assert.match(url, /registry\.npmjs\.org\/@thnonline%2Fagent-workspace\/latest$/);
    return { ok: true, json: async () => ({ version: '1.4.0' }) };
  };
  const check = createUpdateCheck({ root: fakeRoot('1.3.4', { npx: true }), fetchImpl, now: () => t, env: {} });
  const [a, b] = await Promise.all([check(), check()]);
  assert.equal(calls, 1);
  assert.equal(a.newer, true);
  assert.equal(a.latest, '1.4.0');
  assert.equal(a.current, '1.3.4');
  assert.deepEqual(a.commands, ['npx @thnonline/agent-workspace@latest']);
  assert.deepEqual(b, a);
  await check();
  assert.equal(calls, 1);
  t += 7 * 60 * 60 * 1000;
  await check();
  assert.equal(calls, 2);
});

test('check stays quiet when offline, up to date, or turned off', async () => {
  const down = createUpdateCheck({ root: fakeRoot('1.3.4'), fetchImpl: async () => { throw new Error('offline'); }, env: {} });
  assert.equal((await down()).newer, false);
  const same = createUpdateCheck({ root: fakeRoot('1.3.4'), fetchImpl: async () => ({ ok: true, json: async () => ({ version: '1.3.4' }) }), env: {} });
  const info = await same();
  assert.equal(info.newer, false);
  assert.deepEqual(info.commands, []);
  let called = false;
  const off = createUpdateCheck({ root: fakeRoot('1.3.4'), fetchImpl: async () => { called = true; }, env: { AGENT_WORKSPACE_NO_UPDATE_CHECK: '1' } });
  assert.equal((await off()).latest, null);
  assert.equal(called, false);
});

test('/api/version answers the check plus whether the page runs on the host', async () => {
  const { createApi } = await import('./api.mjs');
  const http = await import('node:http');
  const api = createApi({}, { update: async () => ({ newer: true, latest: '9.9.9', commands: ['x'] }) });
  const server = http.createServer((req, res) => api(req, res, () => res.writeHead(404).end()));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const { port } = server.address();
    const local = await (await fetch(`http://127.0.0.1:${port}/api/version`)).json();
    assert.equal(local.latest, '9.9.9');
    assert.equal(local.local, true);
    const proxied = await (await fetch(`http://127.0.0.1:${port}/api/version`, { headers: { 'X-Forwarded-For': '10.0.0.5' } })).json();
    assert.equal(proxied.local, false);
  } finally {
    server.close();
  }
});
