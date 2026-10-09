/**
 * Persistent settings, kept by the server in SQLite (`/api/settings`) instead of the browser's localStorage.
 * Reads are synchronous from an in-memory copy that `initSettings()` fills before the app starts; writes update that copy
 * at once and reach the server a moment later. When the server has no SQLite (or cannot be reached) everything falls back to
 * localStorage, so the page still works from a static host.
 */
const ENDPOINT = '/api/settings';
/** keys of the old localStorage layout: moved to the server on first start */
const LEGACY = /^(agent-workspace\.|claude-office:)/;
/** per-browser choices (they depend on this device's GPU and taste): always stay in localStorage */
const LOCAL = new Set(['agent-workspace.quality', 'agent-workspace.weather', 'agent-workspace.season', 'agent-workspace.hudFolded', 'agent-workspace.providerOff']);
const isLegacy = (k: string) => LEGACY.test(k) && !LOCAL.has(k);
const FLUSH_MS = 300;
const RETRY_MS = 5000;

let remote = false;
const mem = new Map<string, string>();
const pending = new Map<string, string | null>();
let timer = 0;

const ls = {
  get: (k: string): string | null => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode – the choice is simply not remembered */
    }
  },
  del: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
  keys: (): string[] => {
    try {
      return Object.keys(localStorage);
    } catch {
      return [];
    }
  },
};

async function put(changes: Record<string, string | null>, keepalive = false): Promise<boolean> {
  try {
    const r = await fetch(ENDPOINT, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes), keepalive });
    return r.ok;
  } catch {
    return false;
  }
}

async function flush(keepalive = false) {
  window.clearTimeout(timer);
  timer = 0;
  if (!pending.size) return;
  const batch = Object.fromEntries(pending);
  pending.clear();
  if (await put(batch, keepalive)) return;
  // not saved: keep the changes (newer ones win) and try again later
  for (const [k, v] of Object.entries(batch)) if (!pending.has(k)) pending.set(k, v);
  schedule(RETRY_MS);
}

function schedule(ms = FLUSH_MS) {
  if (!timer) timer = window.setTimeout(() => void flush(), ms);
}

/** Loads the settings from the server (and moves the old localStorage values over). Never rejects; call before anything reads a setting. */
export async function initSettings(): Promise<void> {
  try {
    const ctl = new AbortController();
    const t = window.setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(ENDPOINT, { signal: ctl.signal, cache: 'no-store' });
    window.clearTimeout(t);
    if (!r.ok) return;
    const data = (await r.json()) as Record<string, string>;
    for (const [k, v] of Object.entries(data)) if (typeof v === 'string') mem.set(k, v);
    remote = true;
    window.addEventListener('pagehide', () => void flush(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flush(true);
    });
  } catch {
    return; // no server API: localStorage mode
  }
  // one-off move: values the server does not know yet are uploaded, then removed from the browser
  const old: Record<string, string> = {};
  for (const k of ls.keys()) {
    const v = isLegacy(k) ? ls.get(k) : null;
    if (v === null) continue;
    if (!mem.has(k)) {
      mem.set(k, v);
      old[k] = v;
    }
  }
  if (Object.keys(old).length && !(await put(old))) {
    for (const [k, v] of Object.entries(old)) pending.set(k, v); // keep them in the browser too: nothing is lost if this fails
    schedule(RETRY_MS);
    return;
  }
  for (const k of ls.keys()) if (isLegacy(k)) ls.del(k);
}

export function getSetting(key: string): string | null {
  return remote && !LOCAL.has(key) ? (mem.get(key) ?? null) : ls.get(key);
}

export function setSetting(key: string, value: string) {
  if (!remote || LOCAL.has(key)) return ls.set(key, value);
  mem.set(key, value);
  pending.set(key, value);
  schedule();
}

export function removeSetting(key: string) {
  if (!remote || LOCAL.has(key)) return ls.del(key);
  mem.delete(key);
  pending.set(key, null);
  schedule();
}
