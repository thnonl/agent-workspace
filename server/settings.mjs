// The user's settings (quality, weather, names, progress …) live in a small SQLite file instead of the browser's
// localStorage, so they survive a cleared browser, a different port (dev 5173 / start 4173) and a different browser.
// Needs `node:sqlite` (Node 22.5+); on an older Node the store reports `available: false` and the page keeps using localStorage.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

export const MAX_KEY = 120;
export const MAX_VALUE = 512 * 1024;
/** a head count older than this is not worth restoring */
export const ROOM_PEOPLE_MAX_AGE = 2 * 3600_000;

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
    // how many people (director + staff) are in each room right now, so a reloaded page can seat them again
    db.exec('CREATE TABLE IF NOT EXISTS room_people (room_id TEXT PRIMARY KEY, people INTEGER NOT NULL, updated_at INTEGER NOT NULL) STRICT');
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
  const selPeople = db?.prepare('SELECT room_id, people FROM room_people WHERE updated_at >= ?');
  const prunePeople = db?.prepare('DELETE FROM room_people WHERE updated_at < ?');
  const putPeople = db?.prepare(
    'INSERT INTO room_people (room_id, people, updated_at) VALUES (?, ?, ?) ON CONFLICT(room_id) DO UPDATE SET people = excluded.people, updated_at = excluded.updated_at',
  );
  const delPeople = db?.prepare('DELETE FROM room_people WHERE room_id = ?');
  const transaction = (fn) => {
    db.exec('BEGIN');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

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
    /** Room id → people in the room, for rooms written within `maxAgeMs` (older rows are dropped: that session is long gone). */
    roomPeople(maxAgeMs = ROOM_PEOPLE_MAX_AGE) {
      const out = {};
      if (!db) return out;
      const since = Date.now() - maxAgeMs;
      prunePeople.run(since);
      for (const r of selPeople.all(since)) out[r.room_id] = r.people;
      return out;
    },
    /** `changes`: room id → head count (1..99) or null (the room is empty / gone). Returns how many were applied. */
    applyRoomPeople(changes) {
      if (!db) return 0;
      return transaction(() => {
        let n = 0;
        const now = Date.now();
        for (const [id, v] of Object.entries(changes)) {
          if (!validKey(id)) continue;
          if (v === null) delPeople.run(id);
          else if (Number.isInteger(v) && v >= 1 && v <= 99) putPeople.run(id, v, now);
          else continue;
          n++;
        }
        return n;
      });
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
