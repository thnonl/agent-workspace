// Is a newer version on npm? Asked once in a while from the registry; the page shows a sticky note with the update steps.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OK_TTL_MS = 6 * 60 * 60 * 1000;
const FAIL_TTL_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 5000;

function readPackage(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return { name: String(pkg.name || ''), version: String(pkg.version || '') };
  } catch {
    return { name: '', version: '' };
  }
}

/** -1 / 0 / 1 like a sort comparator; a pre-release (1.4.0-beta.1) is older than its release, garbage is never newer. */
export function compareVersions(a, b) {
  const parse = (v) => /^v?(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?/.exec(String(v).trim());
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return 0;
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d) return Math.sign(d);
  }
  if (pa[4] === pb[4]) return 0;
  if (!pa[4]) return 1;
  if (!pb[4]) return -1;
  return pa[4] < pb[4] ? -1 : 1;
}

/** How this copy was started: an npx cache, a git checkout, or an npm install (global or in a project). */
export function installKind(root = ROOT) {
  if (root.split(path.sep).includes('_npx')) return 'npx';
  if (fs.existsSync(path.join(root, '.git'))) return 'checkout';
  return 'npm';
}

/** the start options worth repeating (`--no-open` is not: the update is started by hand on the host) */
const safeArgs = (args) => args.filter((a) => a !== '--no-open');

/** The commands to type on the host, in order (the server has to be stopped first: Ctrl+C in its terminal). A git checkout updates itself. */
export function updateCommands({ name, kind, args = [], dev = false }) {
  const extra = safeArgs(args).map((a) => (/^[\w@%+=:,./<>-]+$/.test(a) ? a : JSON.stringify(a)));
  const tail = extra.length ? ` ${extra.join(' ')}` : '';
  if (kind === 'checkout') return ['git pull', 'npm install', dev ? 'npm run dev' : `npm run build && npm start${tail ? ' --' + tail : ''}`];
  // npx with the @latest tag for every install (a global one too): no install step, and @latest makes npx look past its cache
  return [`npx ${name}@latest${tail}`];
}

/**
 * `check()` → { current, latest, newer, name, kind, commands, host }. The registry is asked at most every 6 h (30 min after a
 * failure); concurrent callers share one request. AGENT_WORKSPACE_NO_UPDATE_CHECK=1 turns it off.
 */
export function createUpdateCheck({ root = ROOT, args = [], dev = false, fetchImpl = globalThis.fetch, now = Date.now, env = process.env } = {}) {
  const pkg = readPackage(root);
  const kind = installKind(root);
  const off = !!env.AGENT_WORKSPACE_NO_UPDATE_CHECK || !pkg.name || !pkg.version || typeof fetchImpl !== 'function';
  let latest = '';
  let until = 0;
  let pending = null;

  const ask = async () => {
    const url = `https://registry.npmjs.org/${pkg.name.replace('/', '%2F')}/latest`;
    try {
      const r = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = await r.json();
      if (typeof body?.version !== 'string') throw new Error('no version');
      latest = body.version;
      until = now() + OK_TTL_MS;
    } catch {
      until = now() + FAIL_TTL_MS; // offline or registry down: keep what we knew, try again later
    }
  };

  return async function check() {
    if (!off && now() >= until) {
      pending ??= ask().finally(() => {
        pending = null;
      });
      await pending;
    }
    const newer = !!latest && compareVersions(latest, pkg.version) > 0;
    return {
      name: pkg.name,
      current: pkg.version,
      latest: latest || null,
      newer,
      kind,
      commands: newer ? updateCommands({ name: pkg.name, kind, args, dev }) : [],
      host: os.hostname(),
    };
  };
}
