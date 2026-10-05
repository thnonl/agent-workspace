// Phones and other machines on the local network: the connect info for the "Connect a device" settings and the /m page
// a scanned QR code opens. Nothing asks for a token: whoever can reach the server's address can open the office.
import os from 'node:os';

export const REPO = 'thnonl/agent-workspace';
/** The APK of the newest GitHub release (the release workflow uploads it under this name). */
export const APK_URL = `https://github.com/${REPO}/releases/latest/download/agent-workspace.apk`;
export const ANDROID_PACKAGE = 'io.github.thnonl.agentworkspace';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
/** This machine – unless a proxy or tunnel on this machine (ngrok, cloudflared …) forwards the request for someone else. */
export const isLoopback = (req) => LOOPBACK.has(req.socket?.remoteAddress ?? '') && !req.headers?.['x-forwarded-for'] && !req.headers?.forwarded;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const PAGE_STYLE = `body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;background:#1d1b2e;color:#f4efe6}
main{max-width:22rem;padding:1.5rem;text-align:center}h1{font-size:1.4rem;margin:.2rem 0 1rem}p{color:#c9c2d8}
a.btn{display:block;margin:.7rem 0;padding:.85rem 1rem;border-radius:.8rem;background:#f2a65a;color:#1d1b2e;font-weight:700;text-decoration:none}
a.alt{background:#3a3655;color:#f4efe6}small{color:#8f88a6}`;

function page(res, status, title, body) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  res.end(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${esc(title)}</title><style>${PAGE_STYLE}</style></head><body><main>${body}</main></body></html>`,
  );
}

/**
 * The page behind the QR code. On Android it hands the address to the app (intent:// URL); a phone without the app gets the
 * APK of the latest release instead (browser_fallback_url). Buttons for the same, and for opening the office right here in
 * the browser.
 */
function landing(res) {
  page(
    res,
    200,
    'Agent Workspace',
    `<h1>🏢 Agent Workspace</h1>
<p id="note">Opening the app…</p>
<a class="btn" id="app" href="#">Open in the Android app</a>
<a class="btn alt" href="${esc(APK_URL)}">Download the Android app (APK)</a>
<a class="btn alt" href="/">Open in this browser</a>
<small>Installing the APK needs "Install unknown apps" allowed for your browser.</small>
<script>
(function () {
  var q = 'h=' + encodeURIComponent(location.hostname) + '&p=' + encodeURIComponent(location.port || '80');
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

/** Connect-style middleware: serves /m (the QR landing page) and /api/connect (where phones can reach this server). */
export function createConnectRoutes() {
  return function connectRoutes(req, res, next) {
    let url;
    try {
      url = new URL(req.url || '/', 'http://x');
    } catch {
      return next();
    }
    // (a QR code of an older version still carries `?t=<token>`: it is simply ignored)
    if (url.pathname === '/m') return landing(res);
    if (url.pathname === '/api/connect') {
      const bound = req.socket?.server?.address?.()?.address ?? req.socket?.localAddress;
      const port = req.socket?.localPort;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ port, bound, addresses: lanAddresses(bound), apkUrl: APK_URL, releasesUrl: `https://github.com/${REPO}/releases` }));
    }
    next();
  };
}
