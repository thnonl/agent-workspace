// Access token for other machines: loopback passes, ?token= sets the cookie, cookie / bearer pass, everything else is 401.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGuard, loadToken, lanAddresses } from './mobile.mjs';

const TOKEN = 'abc123';

/** Runs the guard on a fake request; resolves with what it answered, or `next` when it let the request through. */
function run(url, { remote = '192.168.1.20', headers = {} } = {}) {
  const guard = createGuard({ token: TOKEN });
  return new Promise((resolve) => {
    const req = { url, headers, socket: { remoteAddress: remote, localPort: 4173, server: { address: () => ({ address: '0.0.0.0', port: 4173 }) } } };
    const res = {
      status: 0,
      headers: {},
      writeHead(s, h = {}) {
        this.status = s;
        this.headers = h;
        return this;
      },
      end(body = '') {
        resolve({ status: this.status, headers: this.headers, body: String(body) });
      },
    };
    guard(req, res, () => resolve('next'));
  });
}

test('loopback needs no token', async () => {
  assert.equal(await run('/', { remote: '127.0.0.1' }), 'next');
  assert.equal(await run('/api/events', { remote: '::1' }), 'next');
  assert.equal(await run('/api/settings', { remote: '::ffff:127.0.0.1' }), 'next');
  assert.equal((await run('/', { remote: '127.0.0.1', headers: { 'x-forwarded-for': '1.2.3.4' } })).status, 401, 'a local tunnel is not local');
});

test('other machines: 401 without the token, page and API alike', async () => {
  const page = await run('/');
  assert.equal(page.status, 401);
  assert.match(page.headers['Content-Type'], /text\/html/);
  const api = await run('/api/events');
  assert.equal(api.status, 401);
  assert.match(api.body, /token required/);
  assert.equal((await run('/', { headers: { cookie: 'aw_token=wrong' } })).status, 401);
  assert.equal((await run('/?token=wrong')).status, 401);
});

test('?token= sets the cookie and redirects without it; cookie and bearer pass', async () => {
  const r = await run('/?token=abc123&demo');
  assert.equal(r.status, 302);
  assert.equal(r.headers.Location, '/?demo=');
  assert.match(r.headers['Set-Cookie'], /^aw_token=abc123;.*HttpOnly/);
  assert.equal(await run('/api/events', { headers: { cookie: 'x=1; aw_token=abc123' } }), 'next');
  assert.equal(await run('/api/settings', { headers: { authorization: 'Bearer abc123' } }), 'next');
});

test('/m: landing page with the intent link for a good token, 401 for a bad one', async () => {
  const ok = await run('/m?t=abc123');
  assert.equal(ok.status, 200);
  assert.match(ok.body, /intent:\/\/connect/);
  assert.match(ok.body, /releases\/latest\/download\/agent-workspace\.apk/);
  assert.equal((await run('/m?t=nope')).status, 401);
  assert.equal((await run('/m')).status, 401);
});

test('/api/connect: port, addresses and token for a token holder', async () => {
  const r = await run('/api/connect', { remote: '127.0.0.1' });
  const info = JSON.parse(r.body);
  assert.equal(info.port, 4173);
  assert.equal(info.token, TOKEN);
  assert.ok(Array.isArray(info.addresses));
  assert.deepEqual(lanAddresses('127.0.0.1'), [], 'a loopback-only server has no address for phones');
  assert.deepEqual(lanAddresses('192.168.1.5'), [{ address: '192.168.1.5', name: '' }]);
});

test('loadToken: explicit wins, else saved, else generated and saved', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tok-'));
  const file = path.join(dir, 'sub', 'token');
  const env = process.env.AGENT_WORKSPACE_TOKEN;
  delete process.env.AGENT_WORKSPACE_TOKEN;
  try {
    assert.equal(loadToken({ explicit: 'mine', file }), 'mine');
    assert.ok(!fs.existsSync(file));
    const made = loadToken({ file });
    assert.ok(made.length >= 20);
    assert.equal(loadToken({ file }), made, 'stays the same across restarts');
  } finally {
    if (env !== undefined) process.env.AGENT_WORKSPACE_TOKEN = env;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
