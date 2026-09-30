// OpenCode (2.x) keeps its sessions in one SQLite database:
//   ~/.local/share/opencode/opencode.db     tables session_v2 (sessions, sub-agents have parent_id) and session_message
// The database is opened read-only. It can be huge (tool output is stored in it), so only indexed lookups are used:
//   (session_id, seq) for the messages of a session, (time_created) to find sessions that are active right now.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { MUSINGS, pick, clip, cleanPrompt, toolSummary, cueOf, guessWindow, askOf } from './util.mjs';

const defaultConfig = () => process.env.OPENCODE_CONFIG || path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'opencode', 'opencode.json');
let limits = { at: 0, map: new Map() };

/** Context size of a model from the OpenCode config (provider.<id>.models.<id>.limit.context); 0 when the config does not say. */
export function modelLimit(providerID, modelID) {
  if (!providerID || !modelID) return 0;
  const now = Date.now();
  if (now - limits.at > 60_000) {
    const map = new Map();
    try {
      const raw = fs.readFileSync(defaultConfig(), 'utf8');
      let j;
      try {
        j = JSON.parse(raw);
      } catch {
        j = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ''));
      }
      for (const [pid, prov] of Object.entries(j.provider ?? j.providers ?? {})) {
        for (const [mid, m] of Object.entries(prov?.models ?? {})) {
          const c = Number(m?.limit?.context);
          if (c > 0) map.set(`${pid}/${mid}`, c);
        }
      }
    } catch {
      /* no config (or not readable): the window is guessed */
    }
    limits = { at: now, map };
  }
  return limits.map.get(`${providerID}/${modelID}`) || 0;
}

export const defaultOpenCodeDb = () =>
  process.env.OPENCODE_DB ||
  path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'opencode', 'opencode.db');

const SPAWN_TOOLS = new Set(['subagent', 'task']);
const TAIL_ROWS = 60;
const CHILD_TAIL_ROWS = 20;

/** OpenCode tool call -> [tool name in Claude's vocabulary (the front-end picks the icon by it), input]. */
function toolOf(it) {
  const i = it.state?.input && typeof it.state.input === 'object' ? it.state.input : {};
  const file = i.filePath || i.path || i.file || i.file_path;
  switch (String(it.name).toLowerCase()) {
    case 'read':
      return ['Read', { file_path: file }];
    case 'edit':
    case 'patch':
    case 'apply_patch':
      return ['Edit', { file_path: file }];
    case 'write':
      return ['Write', { file_path: file }];
    case 'shell':
    case 'bash':
      return ['Bash', { command: i.command, description: i.description }];
    case 'grep':
      return ['Grep', { pattern: i.pattern }];
    case 'glob':
    case 'list':
      return ['Glob', { pattern: i.pattern || i.path }];
    case 'webfetch':
      return ['WebFetch', { url: i.url }];
    case 'websearch':
      return ['WebSearch', { query: i.query }];
    case 'todowrite':
    case 'todo':
      return ['TodoWrite', {}];
    case 'execute': // "code mode": one script that calls other tools
      return ['Bash', { description: 'Running a script' }];
    case 'skill':
      return [it.name, { name: i.name || i.id }];
    default:
      return [it.name || 'tool', i];
  }
}

const outputText = (it) =>
  (Array.isArray(it.state?.content) ? it.state.content : [])
    .map((c) => (typeof c?.text === 'string' ? c.text : ''))
    .join(' ')
    .replace(/<\/?subagent[^>]*>/g, ' ')
    .trim() || String(it.state?.output ?? it.state?.error?.message ?? '');

/**
 * @param host  what the monitor offers: { sessions, newSession, register, say, mainStart, mainEnd, spawnAgent, finishAgent,
 *              runningAgents, afterPoll }
 */
export function createOpenCodeSource(host, { dbFile, windowMs, log = console.warn }) {
  if (!dbFile) return null;
  let db = null;
  let disabled = false;
  let lastStamp = '';
  let scanStamp = '';
  const topOf = new Map(); // session id -> its top-level session id (parents never change)
  const stmts = new Map();

  const open = () => {
    if (db || disabled) return db;
    if (!fs.existsSync(dbFile)) return null;
    try {
      const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
      db = new DatabaseSync(dbFile, { readOnly: true });
      db.exec('PRAGMA busy_timeout = 2000');
      const tables = new Set(db.prepare("select name from sqlite_master where type = 'table'").all().map((r) => r.name));
      if (!tables.has('session_v2') || !tables.has('session_message')) throw new Error('not an OpenCode 2.x database (no session_v2 / session_message)');
    } catch (err) {
      log(`[monitor] OpenCode disabled: ${err.message}`);
      disabled = true;
      try {
        db?.close();
      } catch {
        /* already closed */
      }
      db = null;
    }
    return db;
  };

  const q = (sql, ...args) => {
    let st = stmts.get(sql);
    if (!st) {
      st = db.prepare(sql);
      stmts.set(sql, st);
    }
    return st.all(...args);
  };

  /** Changes whenever OpenCode writes (it runs in WAL mode): lets a quiet machine skip every query. */
  const stamp = () => {
    let out = '';
    for (const f of [dbFile, `${dbFile}-wal`]) {
      try {
        const st = fs.statSync(f);
        out += `${st.mtimeMs}:${st.size};`;
      } catch {
        out += '-;';
      }
    }
    return out;
  };

  const ctxOf = (key, id, isMain) => ({ key, id, isMain, seq: 0, open: new Map() });

  // ------------------------------------------------------------- one message row
  const applyRow = (s, ctx, row) => {
    let d;
    try {
      d = JSON.parse(row.data);
    } catch {
      return;
    }
    ctx.seq = Math.max(ctx.seq, row.seq);
    if (row.type === 'user') {
      if (!ctx.isMain) return;
      const p = cleanPrompt(d.text);
      if (!p) return;
      if (!s.firstPrompt) s.firstPrompt = p;
      host.mainStart(s);
      host.say(s, 'main', 'task', p);
      return;
    }
    if (row.type === 'idle') {
      if (ctx.isMain) host.mainEnd(s);
      return;
    }
    if (row.type !== 'assistant') return;
    // tokens of a finished main-agent message = the context it leaves behind
    if (ctx.isMain && d.tokens && d.time?.completed) {
      const t = d.tokens;
      const used = (t.input || 0) + (t.output || 0) + (t.cache?.read || 0) + (t.cache?.write || 0);
      const limit = modelLimit(d.model?.providerID, d.model?.id);
      if (used > 0) host.context?.(s, { used, window: limit || guessWindow(d.model?.id, used), exact: limit > 0, model: d.model?.id || 'opencode' });
    }
    let m = ctx.open.get(row.id);
    if (!m) {
      m = { count: 0 };
      ctx.open.set(row.id, m);
      if (ctx.isMain) host.mainStart(s);
    }
    const done = !!d.time?.completed;
    const items = Array.isArray(d.content) ? d.content : [];
    for (let i = m.count; i < items.length; i++) {
      const it = items[i];
      if (it?.type === 'text' || it?.type === 'reasoning') {
        if (!done && !it.time?.completed) break; // still being written
        if (it.type === 'text') host.say(s, ctx.key, 'text', it.text);
        else host.say(s, ctx.key, 'thinking', String(it.text ?? '').replace(/\*\*/g, ' ').replace(/\s+/g, ' ').trim() || pick(MUSINGS));
      } else if (it?.type === 'tool') {
        if (ctx.isMain && SPAWN_TOOLS.has(it.name)) {
          const inp = it.state?.input || {};
          host.spawnAgent(s, it.id, inp.description || inp.agent || inp.subagent_type, inp.agent || inp.subagent_type);
          host.say(s, ctx.key, 'tool', `Delegating: ${clip(inp.description || inp.agent || 'a task', 80)}`, 'Agent');
        } else {
          const [name, input] = toolOf(it);
          host.say(s, ctx.key, 'tool', toolSummary(name, input), name, cueOf(name, input));
        }
      }
      m.count = i + 1;
    }
    if (ctx.isMain) {
      for (const it of items) {
        if (it?.type === 'tool' && SPAWN_TOOLS.has(it.name) && (it.state?.status === 'completed' || it.state?.status === 'error')) {
          host.finishAgent(s, it.id, outputText(it), it.state.status === 'error');
        }
        // the question tool: waiting for the user until it completes (the row is re-read while the message is open)
        const ask = it?.type === 'tool' ? askOf(it.name, it.state?.input) : null;
        if (ask) {
          if (it.state?.status === 'completed' || it.state?.status === 'error') host.askEnd(s, it.id);
          else host.askStart(s, it.id, ask);
        }
      }
    }
    if (done && m.count >= items.length) ctx.open.delete(row.id);
  };

  const ROWS = 'select id, seq, type, data from session_message where session_id = ?';

  /** Everything new in one conversation: rows after the last seen one, and the assistant messages that were still open. */
  const drain = (s, ctx, now) => {
    let any = false;
    for (const id of [...ctx.open.keys()]) {
      const r = q(`${ROWS} and id = ?`, ctx.id, id)[0];
      if (r) {
        applyRow(s, ctx, r);
        any = true;
      } else ctx.open.delete(id);
    }
    for (;;) {
      const rows = q(`${ROWS} and seq > ? order by seq limit 200`, ctx.id, ctx.seq);
      for (const r of rows) applyRow(s, ctx, r);
      if (rows.length) any = true;
      if (rows.length < 200) break;
    }
    return any;
  };

  /** Sub-agent conversations are separate sessions whose parent_id is the session; each one belongs to a delegating tool call. */
  const linkChildren = (s, now) => {
    const oc = s.oc;
    const rows = q('select id, title, time_created from session_v2 where parent_id = ? and time_created > ? order by time_created', s.id, oc.childSince);
    for (const r of rows) {
      oc.childSince = Math.max(oc.childSince, r.time_created);
      oc.unlinked.push({ id: r.id, title: String(r.title ?? '') });
    }
    const linked = new Set([...oc.children.values()].map((c) => c.agentKey));
    oc.unlinked = oc.unlinked.filter((kid) => {
      const running = host.runningAgents(s).filter((a) => !linked.has(a.id));
      const same = (a) => kid.title && (kid.title === a.label || kid.title.startsWith(a.label) || a.label.startsWith(kid.title));
      const ag = running.find(same) || running[0];
      if (!ag) return true; // the delegating tool call has not shown up yet: try again later
      linked.add(ag.id);
      const ctx = ctxOf(ag.id, kid.id, false);
      oc.children.set(kid.id, { ctx, agentKey: ag.id });
      const tail = q(`${ROWS} order by seq desc limit ${CHILD_TAIL_ROWS}`, kid.id).reverse();
      for (const r of tail) applyRow(s, ctx, r);
      if (tail.length) ag.lastAt = now;
      return false;
    });
  };

  const drainChildren = (s, now) => {
    let any = false;
    for (const [kidId, { ctx, agentKey }] of [...s.oc.children]) {
      const ag = s.agents.get(agentKey);
      if (!ag || ag.status !== 'running') {
        s.oc.children.delete(kidId);
        continue;
      }
      if (drain(s, ctx, now)) {
        ag.lastAt = now;
        any = true;
      }
    }
    return any;
  };

  const refreshMeta = (s) => {
    const r = q('select title, directory from session_v2 where id = ?', s.id)[0];
    if (!r) return;
    if (r.title) s.aiTitle = clip(r.title, 60);
    if (r.directory && r.directory !== s.cwd) {
      s.cwd = r.directory;
      if (!s.firstCwd) s.firstCwd = r.directory;
    }
  };

  // ---------------------------------------------------------------- public
  const openSession = (id, activityAt, now) => {
    const s = host.newSession(id, dbFile, 'opencode');
    s.oc = { ctx: ctxOf('main', id, true), children: new Map(), unlinked: [], childSince: now - 15 * 60_000 };
    host.register(s, activityAt, now, () => {
      refreshMeta(s);
      const tail = q(`${ROWS} order by seq desc limit ${TAIL_ROWS}`, id).reverse();
      for (const r of tail) applyRow(s, s.oc.ctx, r);
      const lastUser = q("select data from session_message where session_id = ? and type = 'user' order by seq desc limit 1", id)[0];
      if (lastUser) {
        try {
          const p = cleanPrompt(JSON.parse(lastUser.data).text);
          if (p) {
            s.lastPrompt = clip(p, 1000);
            if (!s.firstPrompt) s.firstPrompt = p;
          }
        } catch {
          /* unreadable row */
        }
      }
      linkChildren(s, now);
      drainChildren(s, now);
    });
  };

  /** Finds sessions with fresh messages that are not followed yet (a sub-agent's activity opens its top-level session). */
  const scan = (now) => {
    if (!open()) return;
    const st = stamp();
    if (st === scanStamp) return; // nothing was written since the last scan
    scanStamp = st;
    const rows = q('select session_id, max(time_created) as t from session_message where time_created > ? group by session_id', now - windowMs);
    const tops = new Map();
    for (const r of rows) {
      let id = topOf.get(r.session_id);
      if (id === undefined) id = r.session_id;
      for (let depth = 0; id && !topOf.has(r.session_id) && depth < 6; depth++) {
        const row = q('select parent_id from session_v2 where id = ?', id)[0];
        if (!row) {
          id = null;
          break;
        }
        if (!row.parent_id) break;
        id = row.parent_id;
      }
      if (id) topOf.set(r.session_id, id);
      if (id && !host.sessions.has(id)) tops.set(id, Math.max(tops.get(id) ?? 0, r.t));
    }
    for (const [id, t] of tops) openSession(id, t, now);
  };

  const poll = (now) => {
    const mine = [...host.sessions.values()].filter((s) => s.oc);
    if (!mine.length || !open()) return;
    const st = stamp();
    const changed = st !== lastStamp;
    for (const s of mine) {
      let any = false;
      if (changed) {
        const before = s.oc.ctx.seq;
        any = drain(s, s.oc.ctx, now);
        linkChildren(s, now);
        if (drainChildren(s, now)) any = true;
        if (any) {
          s.lastLineAt = now;
          if (s.oc.ctx.seq !== before) refreshMeta(s);
        }
      }
      host.afterPoll(s, now, any);
    }
    lastStamp = st;
  };

  return {
    scan,
    poll,
    close: () => {
      try { db?.close(); } catch { /* closed */ }
      db = null;
      stmts.clear();
      // a later open starts from scratch: the stamps and parent cache belong to sessions that were forgotten
      lastStamp = scanStamp = '';
      topOf.clear();
    },
  };
}
