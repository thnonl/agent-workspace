// The user's settings (quality, weather, names, progress …) live in a small SQLite file instead of the browser's
// localStorage, so they survive a cleared browser, a different port (dev 5173 / start 4173) and a different browser.
// Needs `node:sqlite` (Node 22.5+); on an older Node the store reports `available: false` and the page keeps using localStorage.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

export const MAX_KEY = 120;
export const MAX_VALUE = 512 * 1024;

export function defaultDbFile() {
  return process.env.AGENT_WORKSPACE_DB || path.join(os.homedir(), '.agent-workspace', 'settings.db');
}

export const validKey = (k) => typeof k === 'string' && k.length > 0 && k.length <= MAX_KEY && /^[\w.:-]+$/.test(k);

/** Key → string value store. All methods are synchronous (SQLite in-process); `file` may be ':memory:'. */
export function createSettingsStore({ file = defaultDbFile(), log = console.error } = {}) {
  let db = null;
  let error = null;
  try {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA busy_timeout = 2000');
    db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL) STRICT');
  } catch (err) {
    error = err;
    db = null;
    log(`[settings] SQLite unavailable, settings stay in the browser: ${err.message}`);
  }
  const sel = db?.prepare('SELECT key, value FROM settings');
  const put = db?.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  );
  const del = db?.prepare('DELETE FROM settings WHERE key = ?');

  return {
    available: !!db,
    error,
    file,
    all() {
      const out = {};
      if (sel) for (const r of sel.all()) out[r.key] = r.value;
      return out;
    },
    /** `changes`: key → string (store) or null (delete). Invalid entries are skipped; returns how many were applied. One transaction. */
    apply(changes) {
      if (!db) return 0;
      let n = 0;
      db.exec('BEGIN');
      try {
        const now = Date.now();
        for (const [k, v] of Object.entries(changes)) {
          if (!validKey(k)) continue;
          if (v === null) del.run(k);
          else if (typeof v === 'string' && v.length <= MAX_VALUE) put.run(k, v, now);
          else continue;
          n++;
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return n;
    },
    close() {
      try {
        db?.close();
      } catch {
        /* already closed */
      }
      db = null;
    },
  };
}
