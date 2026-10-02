// Phones on the local network: the access token, the guard in front of every request, the connect info for the
// "Connect a phone" settings and the /m page a scanned QR code opens.
//
// Requests from this machine (loopback) never need the token. Anything else must bring it once, as `?token=` on any
// URL (the QR code and the Android app do that): the answer sets an HttpOnly cookie and redirects to the same URL
// without the token, so the page's own fetch / EventSource calls carry it from then on. `Authorization: Bearer <token>`
// works too (curl).
//
// The generated token is short enough to type: 6 characters like BE5FG0 (digits and capitals without I, L and O; it is
// compared ignoring case, with O read as 0 and I / L as 1). Guessing is kept out by a limit on wrong tries per address.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defaultDbFile } from './settings.mjs';

export const REPO = 'thnonl/agent-workspace';
/** The APK of the newest GitHub release (the release workflow uploads it under this name). */
export const APK_URL = `https://github.com/${REPO}/releases/latest/download/agent-workspace.apk`;
export const ANDROID_PACKAGE = 'io.github.thnonl.agentworkspace';
const COOKIE = 'aw_token';
/** what a generated token is made of: no I, L or O, which read like 1 and 0 */
const TOKEN_CHARS = '0123456789ABCDEFGHJKMNPQRSTUVWXYZ';
const TOKEN_LENGTH = 6;
const TOKEN_RE = new RegExp(`^[${TOKEN_CHARS}]{${TOKEN_LENGTH}}$`);
/** wrong tokens one address may send per window before it gets 429 for the rest of that window */
export const MAX_FAILS = 10;
export const FAIL_WINDOW_MS = 60_000;

export const generateToken = () => Array.from({ length: TOKEN_LENGTH }, () => TOKEN_CHARS[crypto.randomInt(TOKEN_CHARS.length)]).join('');

/** How tokens are compared: case does not matter, O counts as 0, I and L as 1 (easy to mistype from the screen). */
export const normalizeToken = (t) => String(t).trim().toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');

export function tokenFile() {
  return path.join(path.dirname(defaultDbFile()), 'token');
}

/**
 * The token: `explicit` (--token), else $AGENT_WORKSPACE_TOKEN, else the one saved in ~/.agent-workspace/token, else a new
 * random one that is saved there – so a phone that scanned the QR code once stays connected across restarts. A saved token
 * of the older, long kind is replaced by a short one.
 */
export function loadToken({ explicit, file = tokenFile(), log = console.error } = {}) {
  const given = explicit || process.env.AGENT_WORKSPACE_TOKEN;
  if (given) return String(given);
  try {
    const saved = fs.readFileSync(file, 'utf8').trim();
    if (TOKEN_RE.test(saved)) return saved;
  } catch {
    /* first run */
  }
  const token = generateToken();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, token + '\n', { mode: 0o600 });
  } catch (err) {
    log(`[mobile] could not save the access token (${err.message}); phones will need a new QR code after a restart`);
  }
  return token;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
/** This machine – unless a proxy or tunnel on this machine (ngrok, cloudflared …) forwards the request for someone else. */
export const isLoopback = (req) => LOOPBACK.has(req.socket?.remoteAddress ?? '') && !req.headers?.['x-forwarded-for'] && !req.headers?.forwarded;

function same(a, b) {
  const x = Buffer.from(normalizeToken(a));
  const y = Buffer.from(normalizeToken(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function cookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const PAGE_STYLE = `body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;background:#1d1b2e;color:#f4efe6}
main{max-width:22rem;padding:1.5rem;text-align:center}h1{font-size:1.4rem;margin:.2rem 0 1rem}p{color:#c9c2d8}
a.btn{display:block;margin:.7rem 0;padding:.85rem 1rem;border-radius:.8rem;background:#f2a65a;color:#1d1b2e;font-weight:700;text-decoration:none}
a.alt{background:#3a3655;color:#f4efe6}small{color:#8f88a6}`;

function page(res, status, title, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', ...headers });
  res.end(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${esc(title)}</title><style>${PAGE_STYLE}</style></head><body><main>${body}</main></body></html>`,
  );
}

/**
 * The page behind the QR code. On Android it hands the address and the token to the app (intent:// URL); a phone without
 * the app gets the APK of the latest release instead (browser_fallback_url). Buttons for the same, and for opening the
 * office right here in the browser.
 */
function landing(res, token) {
  const t = encodeURIComponent(token);
  page(
    res,
    200,
    'Agent Workspace',
    `<h1>🏢 Agent Workspace</h1>
<p id="note">Opening the app…</p>
<a class="btn" id="app" href="#">Open in the Android app</a>
<a class="btn alt" href="${esc(APK_URL)}">Download the Android app (APK)</a>
<a class="btn alt" href="/?token=${esc(t)}">Open in this browser</a>
<small>Installing the APK needs "Install unknown apps" allowed for your browser.</small>
<script>
(function () {
  var q = 'h=' + encodeURIComponent(location.hostname) + '&p=' + encodeURIComponent(location.port || '80') + '&t=${t}';
  var intent = 'intent://connect?' + q + '#Intent;scheme=agentworkspace;package=${ANDROID_PACKAGE};S.browser_fallback_url=' + encodeURIComponent(${JSON.stringify(APK_URL)}) + ';end';
  var android = /Android/i.test(navigator.userAgent);
  document.getElementById('app').href = android ? intent : 'agentworkspace://connect?' + q;
  if (android) location.href = intent;
  else document.getElementById('note').textContent = 'The app is for Android. On this device, open the office in the browser.';
})();
</script>`,
  );
}

/** IPv4 addresses a phone could use to reach this server, the likely LAN adapters first. */
export function lanAddresses(bound) {
  if (bound && !['0.0.0.0', '::', '::ffff:0.0.0.0'].includes(bound)) return LOOPBACK.has(bound) ? [] : [{ address: bound.replace(/^::ffff:/, ''), name: '' }];
  const virtual = /vEthernet|VirtualBox|VMware|WSL|Hyper-V|docker|^br-|^veth|vboxnet|utun|tailscale|zerotier/i;
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal || a.address.startsWith('169.254.')) continue;
      out.push({ address: a.address, name, virtual: virtual.test(name) });
    }
  }
  return out.sort((a, b) => Number(a.virtual) - Number(b.virtual)).map(({ address, name }) => ({ address, name }));
}

/**
 * Connect-style middleware in front of everything else: lets loopback and token holders through, serves /m and
 * /api/connect, answers 401 otherwise – and 429 to an address that sent too many wrong tokens lately.
 */
export function createGuard({ token, now = Date.now }) {
  /** remote address → wrong tries in the current window */
  const fails = new Map();
  const blocked = (ip) => {
    const f = fails.get(ip);
    return !!f && now() < f.until && f.n >= MAX_FAILS;
  };
  const failed = (ip) => {
    const t = now();
    let f = fails.get(ip);
    if (!f || t >= f.until) {
      if (fails.size > 1000) for (const [k, v] of fails) if (t >= v.until) fails.delete(k);
      f = { n: 0, until: t + FAIL_WINDOW_MS };
      fails.set(ip, f);
    }
    f.n++;
  };
  const tooMany = (res, api) => {
    const headers = { 'Cache-Control': 'no-store', 'Retry-After': String(Math.ceil(FAIL_WINDOW_MS / 1000)) };
    if (api) {
      res.writeHead(429, { 'Content-Type': 'application/json', ...headers });
      return res.end(JSON.stringify({ error: 'too many wrong tokens, try again in a minute' }));
    }
    return page(res, 429, 'Agent Workspace', '<h1>⏳ Too many wrong tokens</h1><p>Wait a minute, then try again.</p>', headers);
  };

  return function guard(req, res, next) {
    let url;
    try {
      url = new URL(req.url || '/', 'http://x');
    } catch {
      return next();
    }
    const local = isLoopback(req);
    const ip = req.socket?.remoteAddress ?? '';
    const api = url.pathname.startsWith('/api/');
    if (url.pathname === '/m') {
      if (!local && blocked(ip)) return tooMany(res, false);
      const given = url.searchParams.get('t') ?? url.searchParams.get('token');
      if (!given || !same(given, token)) {
        if (!local && given) failed(ip);
        return page(res, 401, 'Agent Workspace', '<h1>🔒 Wrong or old QR code</h1><p>Open <b>Settings → Connect a phone</b> on the computer and scan the QR code again.</p>');
      }
      return landing(res, token);
    }
    if (!local) {
      if (blocked(ip)) return tooMany(res, api);
      if (url.searchParams.has('token')) {
        if (!same(url.searchParams.get('token'), token)) {
          failed(ip);
          return page(res, 401, 'Agent Workspace', '<h1>🔒 Wrong token</h1><p>Check the token under <b>Settings → Connect a phone</b> on the computer, or scan its QR code.</p>');
        }
        url.searchParams.delete('token');
        res.writeHead(302, {
          'Set-Cookie': `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`,
          Location: url.pathname + url.search,
          'Cache-Control': 'no-store',
        });
        return res.end();
      }
      const bearer = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''))?.[1];
      const jar = cookie(req, COOKIE);
      if (!(bearer && same(bearer, token)) && !(jar && same(jar, token))) {
        const headers = {};
        if (bearer || jar) failed(ip);
        // a cookie from an older token: drop it, so the page's retries do not count as more wrong tries
        if (jar) headers['Set-Cookie'] = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
        if (api) {
          res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
          return res.end(JSON.stringify({ error: 'token required' }));
        }
        return page(res, 401, 'Agent Workspace', '<h1>🔒 This office is locked</h1><p>Open <b>Settings → Connect a phone</b> on the computer that runs Agent Workspace and scan the QR code, or type its token in the app.</p>', headers);
      }
    }
    if (url.pathname === '/api/connect') {
      const bound = req.socket?.server?.address?.()?.address ?? req.socket?.localAddress;
      const port = req.socket?.localPort;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ port, bound, addresses: lanAddresses(bound), token, apkUrl: APK_URL, releasesUrl: `https://github.com/${REPO}/releases` }));
    }
    next();
  };
}
