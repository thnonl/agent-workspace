// Access token for other machines: loopback passes, ?token= sets the cookie, cookie / bearer pass, everything else is 401.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGuard, loadToken, lanAddresses, generateToken, MAX_FAILS, FAIL_WINDOW_MS } from './mobile.mjs';

const TOKEN = 'ABC123';

/** Runs the guard on a fake request; resolves with what it answered, or `next` when it let the request through. */
function run(url, { remote = '192.168.1.20', headers = {}, guard = createGuard({ token: TOKEN }) } = {}) {
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

test('the locked page has a box for the token that sends ?token= to the same address (wrong ones get it again)', async () => {
  for (const url of ['/', '/?token=wrong', '/some/page']) {
    const r = await run(url);
    assert.equal(r.status, 401, url);
    const path = url.split('?')[0];
    assert.match(r.body, new RegExp(`<form method="get" action="${path}">`), url);
    assert.match(r.body, /<input name="token"/, url);
  }
  assert.match((await run('/')).body, /This office is locked/);
  assert.match((await run('/?token=wrong')).body, /Wrong token/);
  // what the form sends gets in
  assert.equal((await run('/some/page?token=ABC123')).headers.Location, '/some/page');
  // the address of the page goes into the form escaped
  assert.doesNotMatch((await run('/%22%3E%3Cscript%3E')).body, /"><script>/);
});

test('?token= sets the cookie and redirects without it; cookie and bearer pass', async () => {
  const r = await run('/?token=ABC123&demo');
  assert.equal(r.status, 302);
  assert.equal(r.headers.Location, '/?demo=');
  assert.match(r.headers['Set-Cookie'], /^aw_token=ABC123;.*HttpOnly/);
  assert.equal(await run('/api/events', { headers: { cookie: 'x=1; aw_token=ABC123' } }), 'next');
  assert.equal(await run('/api/settings', { headers: { authorization: 'Bearer ABC123' } }), 'next');
});

test('typed tokens: case does not matter, O reads as 0, I and L as 1', async () => {
  const guard = createGuard({ token: 'BE5FG0' });
  for (const typed of ['BE5FG0', 'be5fg0', ' BE5FGO ', 'be5fgo']) assert.equal((await run(`/?token=${encodeURIComponent(typed)}`, { guard })).status, 302, typed);
  assert.equal((await run('/?token=1L1', { guard: createGuard({ token: '111' }) })).status, 302);
  assert.equal((await run('/?token=BE5FG9', { guard })).status, 401);
});

test('generated tokens: 6 characters, no I, L or O', () => {
  for (let i = 0; i < 200; i++) assert.match(generateToken(), /^[0-9A-HJKMNP-Z]{6}$/);
});

test('too many wrong tokens from one address: 429 until the window ends, others and loopback unaffected', async () => {
  let t = 0;
  const guard = createGuard({ token: TOKEN, now: () => t });
  for (let i = 0; i < MAX_FAILS; i++) assert.equal((await run('/?token=WRONG1', { guard })).status, 401);
  assert.equal((await run('/?token=ABC123', { guard })).status, 429, 'even the right token waits');
  assert.equal((await run('/api/events', { guard, headers: { cookie: 'aw_token=ABC123' } })).status, 429);
  assert.equal((await run('/m?t=ABC123', { guard })).status, 429);
  assert.equal((await run('/?token=ABC123', { guard, remote: '192.168.1.21' })).status, 302, 'another address');
  assert.equal(await run('/', { guard, remote: '127.0.0.1' }), 'next', 'this machine');
  t += FAIL_WINDOW_MS;
  assert.equal((await run('/?token=ABC123', { guard })).status, 302, 'after the window');
});

test('a cookie from an older token is cleared and counts once, missing tokens do not count', async () => {
  let t = 0;
  const guard = createGuard({ token: TOKEN, now: () => t });
  const r = await run('/api/events', { guard, headers: { cookie: 'aw_token=OLD999' } });
  assert.equal(r.status, 401);
  assert.match(r.headers['Set-Cookie'], /^aw_token=; .*Max-Age=0/);
  for (let i = 0; i < MAX_FAILS * 2; i++) assert.equal((await run('/api/events', { guard })).status, 401, 'no token at all is not a guess');
  assert.equal((await run('/?token=ABC123', { guard })).status, 302);
});

test('/m: landing page with the intent link for a good token, 401 for a bad one', async () => {
  const ok = await run('/m?t=ABC123');
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
    assert.match(made, /^[0-9A-Z]{6}$/);
    assert.equal(loadToken({ file }), made, 'stays the same across restarts');
    fs.writeFileSync(file, 'q3J9x-long-base64url-token-from-before\n');
    assert.match(loadToken({ file }), /^[0-9A-Z]{6}$/, 'an old long token is replaced by a short one');
  } finally {
    if (env !== undefined) process.env.AGENT_WORKSPACE_TOKEN = env;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
