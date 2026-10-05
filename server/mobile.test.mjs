// Connect routes for phones and other machines: no token anywhere, /m and /api/connect answer everybody.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectRoutes, lanAddresses } from './mobile.mjs';

/** Runs the routes on a fake request; resolves with what they answered, or `next` when they let the request through. */
function run(url, { remote = '192.168.1.20', headers = {} } = {}) {
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
    createConnectRoutes()(req, res, () => resolve('next'));
  });
}

test('other machines get the office without a token, page and API alike', async () => {
  assert.equal(await run('/'), 'next');
  assert.equal(await run('/api/events'), 'next');
  assert.equal(await run('/api/settings', { remote: '10.0.0.7' }), 'next');
  assert.equal(await run('/', { remote: '127.0.0.1', headers: { 'x-forwarded-for': '1.2.3.4' } }), 'next', 'a local tunnel too');
  assert.equal(await run('/api/settings', { headers: { cookie: 'aw_token=OLD999', authorization: 'Bearer OLD999' } }), 'next', 'an old cookie or header');
});

test('a token from an older app, link or bookmark: the page opens without it, whatever it says', async () => {
  for (const [url, to] of [['/?token=ABC123', '/'], ['/?token=wrong&demo', '/?demo='], ['/?token=', '/'], ['/some/page?token=x', '/some/page']]) {
    const r = await run(url);
    assert.equal(r.status, 302, url);
    assert.equal(r.headers.Location, to, url);
    assert.match(r.headers['Set-Cookie'], /^aw_token=; .*Max-Age=0/, 'the old cookie is dropped');
  }
  assert.equal(await run('/api/events?token=ABC123'), 'next', 'the API just ignores it');
});

test('/m: landing page with the intent link, also for an old QR code with a token', async () => {
  for (const url of ['/m', '/m?t=ABC123']) {
    const r = await run(url);
    assert.equal(r.status, 200, url);
    assert.match(r.body, /intent:\/\/connect/);
    assert.match(r.body, /releases\/latest\/download\/agent-workspace\.apk/);
    assert.doesNotMatch(r.body, /token|&t=/i, url);
  }
});

test('/api/connect: port and addresses, no token', async () => {
  const info = JSON.parse((await run('/api/connect')).body);
  assert.equal(info.port, 4173);
  assert.equal(info.token, undefined);
  assert.ok(Array.isArray(info.addresses));
  assert.deepEqual(lanAddresses('127.0.0.1'), [], 'a loopback-only server has no address for phones');
  assert.deepEqual(lanAddresses('192.168.1.5'), [{ address: '192.168.1.5', name: '' }]);
});
