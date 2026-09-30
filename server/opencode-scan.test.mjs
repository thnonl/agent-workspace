// The OpenCode scan is gated by a DB file stamp: new writes are noticed, an unchanged DB costs no queries.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createMonitor } from './monitor.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('OpenCode scan: new child session, retired session reopened after a write, idle DB = no queries', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-scan-'));
  const dbFile = path.join(root, 'opencode.db');
  const db = new DatabaseSync(dbFile);
  db.exec(`pragma journal_mode = wal;
    create table session_v2 (id text primary key, parent_id text, directory text, title text, time_created integer, time_updated integer);
    create table session_message (id text primary key, session_id text, type text, seq integer, time_created integer, time_updated integer, data text);
    create unique index m_seq on session_message (session_id, seq);
    create index m_time on session_message (time_created);`);
  let seq = 0;
  const put = (sid, type, data) => {
    const now = Date.now();
    db.prepare('insert into session_message values (?,?,?,?,?,?,?)').run(`m${seq}`, sid, type, seq++, now, now, JSON.stringify(data));
  };
  const addSession = (id, parent, title) => db.prepare('insert into session_v2 values (?,?,?,?,?,?)').run(id, parent, 'E:/proj', title, Date.now(), Date.now());

  // count every statement the monitor's (read-only) connection executes
  const { DatabaseSync: Shared } = createRequire(import.meta.url)('node:sqlite');
  const realPrepare = Shared.prototype.prepare;
  let queries = 0;
  let counting = false;
  Shared.prototype.prepare = function (sql) {
    const st = realPrepare.call(this, sql);
    const all = st.all.bind(st);
    st.all = (...a) => {
      if (counting) queries++;
      return all(...a);
    };
    return st;
  };

  const events = [];
  const monitor = createMonitor({ claudeDir: path.join(root, 'none'), codexDir: null, opencodeDb: dbFile, windowMs: 2000, hotPollMs: 30, scanMs: 60 });
  monitor.on((e) => events.push(e));
  try {
    addSession('ses_a', null, 'First');
    put('ses_a', 'user', { text: 'hello a' });
    put('ses_a', 'idle', { outcome: 'succeeded' });
    monitor.start();
    await sleep(400);
    const opened = (id) => events.filter((e) => e.type === 'session' && e.sessionId === id).length;
    assert.equal(opened('ses_a'), 1, 'first scan opens ses_a');

    // a brand-new tree whose only fresh rows are in the child session
    addSession('ses_b', null, 'Second');
    addSession('ses_b_kid', 'ses_b', 'kid');
    put('ses_b_kid', 'assistant', { time: { created: Date.now(), completed: Date.now() }, content: [{ type: 'tool', id: 'k1', name: 'grep', state: { status: 'completed', input: { pattern: 'x' } } }] });
    await sleep(400);
    assert.equal(opened('ses_b'), 1, 'child write opens the top-level session (stamp changed)');
    assert.equal(opened('ses_b_kid'), 0, 'child is not a room');

    // let everything retire (quiet longer than the window), then write again
    await sleep(3500);
    assert.ok(events.some((e) => e.type === 'session_end' && e.sessionId === 'ses_a'), 'ses_a retired ' + JSON.stringify(events.map((e) => e.type + ':' + (e.sessionId ?? '')).slice(-12)) + monitor.sessionCount());
    assert.equal(monitor.sessionCount(), 0, 'memory is empty');
    // idle DB: not a single query
    counting = true;
    queries = 0;
    await sleep(600);
    counting = false;
    assert.equal(queries, 0, `idle DB executed ${queries} queries`);
    put('ses_a', 'user', { text: 'hello again' });
    put('ses_a', 'idle', { outcome: 'succeeded' });
    counting = true;
    await sleep(400);
    counting = false;
    assert.ok(queries > 0, 'the spy sees the queries of a real write');
    assert.equal(opened('ses_a'), 2, 'retired session is reopened after the next DB write');
    assert.equal(monitor.snapshot().find((e) => e.type === 'session' && e.sessionId === 'ses_a')?.lastPrompt, 'hello again');
  } finally {
    Shared.prototype.prepare = realPrepare;
    monitor.stop();
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
