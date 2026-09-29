// Watches Claude Code transcripts (~/.claude/projects/<project>/<session>.jsonl and
// <session>/subagents/agent-*.jsonl) and turns raw JSONL lines into small "office events"
// that the front-end animates. No Claude configuration is required: transcripts are
// append-only files, so we simply tail them.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';

const SPAWN_TOOLS = new Set(['Agent', 'Task']);
const MIN = 60_000;

// Claude often stores thinking blocks without readable text; show something cute instead.
const MUSINGS = ['Hmm, let me think…', 'Let me figure this out…', 'Thinking hard…', 'Working out the next step…', 'One moment, pondering…', 'Let me look at this carefully…'];
let musing = 0;
const pick = (list) => list[musing++ % list.length];

const clip = (s, n = 240) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
};

const base = (p) => (p ? String(p).split(/[\\/]/).filter(Boolean).pop() : '');

function toolSummary(name, input = {}) {
  const i = input || {};
  switch (name) {
    case 'Read':
      return `Reading ${base(i.file_path) || 'a file'}`;
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return `Editing ${base(i.file_path || i.notebook_path) || 'a file'}`;
    case 'Write':
      return `Writing ${base(i.file_path) || 'a file'}`;
    case 'Bash':
    case 'PowerShell':
      return i.description ? clip(i.description, 90) : `$ ${clip(i.command, 90)}`;
    case 'Grep':
      return `Searching “${clip(i.pattern, 50)}”`;
    case 'Glob':
      return `Finding ${clip(i.pattern, 60)}`;
    case 'WebFetch':
      return `Fetching ${clip(i.url, 70)}`;
    case 'WebSearch':
      return `Searching the web: ${clip(i.query, 70)}`;
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
      return 'Updating the todo list';
    case 'Agent':
    case 'Task':
      return `Delegating: ${clip(i.description || i.subagent_type || 'a task', 80)}`;
    default:
      if (name?.startsWith('mcp__')) {
        const [, server, ...rest] = name.split('__');
        return `Using ${server}: ${rest.join('_')}`;
      }
      return `Using ${name}`;
  }
}

function cleanPrompt(raw) {
  let t = String(raw ?? '');
  t = t.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ');
  t = t.replace(/<(ide_[a-z_]+|local-command-[a-z]+|command-[a-z]+)>[\s\S]*?<\/\1>/g, ' ');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  if (!t || t.startsWith('Caveat:') || t.startsWith('[Request interrupted')) return '';
  return t;
}

function resultText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((b) => (b?.type === 'text' ? b.text : '')).join(' ');
  return '';
}

/** Read every full line appended to `file` after `state.offset`. Keeps partial tail in `state.rest`. */
function readNewLines(file, state, maxBytes = Infinity) {
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return [];
  }
  if (st.size < state.offset) {
    state.offset = 0;
    state.rest = Buffer.alloc(0);
  }
  if (st.size === state.offset) return [];
  let start = state.offset;
  let skipFirst = false;
  if (state.offset === 0 && st.size > maxBytes) {
    start = st.size - maxBytes; // very large log: only look at its tail
    skipFirst = true;
  }
  const len = st.size - start;
  const buf = Buffer.allocUnsafe(len);
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    fs.readSync(fd, buf, 0, len, start);
  } catch {
    return [];
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  state.offset = st.size;
  let data = state.rest.length ? Buffer.concat([state.rest, buf]) : buf;
  const lines = [];
  let from = 0;
  for (;;) {
    const nl = data.indexOf(10, from);
    if (nl === -1) break;
    if (nl > from) lines.push(data.toString('utf8', from, nl));
    from = nl + 1;
  }
  state.rest = Buffer.from(data.subarray(from));
  if (skipFirst) lines.shift();
  return lines;
}

function parseJson(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

const encodeDir = (p) => String(p).replace(/[^a-zA-Z0-9]/g, '-');

/** Walk cwd upwards; return the ancestor whose encoded form equals dirName (the launch dir), else ''. */
export function projectRoot(cwd, dirName) {
  if (!cwd || !dirName) return '';
  let p = String(cwd);
  for (let i = 0; i < 16 && p; i++) {
    if (encodeDir(p) === dirName) return p;
    const trimmed = p.replace(/[\\/]+$/, '');
    const idx = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'));
    if (idx < 0) break;
    const parent = trimmed.slice(0, idx + 1);
    // keep root like "E:\" or "/" as-is, then stop after it
    const next = /^([A-Za-z]:)?[\\/]$/.test(parent) ? parent : parent.slice(0, -1);
    if (next === p) break;
    p = next;
  }
  return '';
}

class Session {
  constructor(id, file, dirName) {
    this.id = id;
    this.file = file;
    this.dirName = dirName;
    this.state = { offset: 0, rest: Buffer.alloc(0) };
    this.cwd = '';
    this.firstCwd = '';
    this.customTitle = '';
    this.aiTitle = '';
    this.firstPrompt = '';
    this.mainActive = false;
    this.mainLastSay = null;
    this.lastPrompt = '';
    this.lastFinal = '';
    this.pendingTools = new Set();
    this.agents = new Map(); // toolUseId -> { id,label,agentType,status,lastSay,asyncId,lastAt }
    this.subFiles = new Map(); // file -> { state, key, metaTried }
    this.lastLineAt = 0;
    this.lastActivity = 0;
    this.announcedTitle = '';
    this.silent = true;
  }

  get title() {
    return this.customTitle || this.aiTitle || clip(this.firstPrompt, 48) || this.id.slice(0, 8);
  }

  get root() {
    return (
      projectRoot(this.cwd, this.dirName) ||
      projectRoot(this.firstCwd, this.dirName) ||
      this.firstCwd ||
      this.cwd
    );
  }

  get project() {
    return base(this.root) || this.dirName.replace(/^[A-Za-z]--?/, '').split('-').filter(Boolean).pop() || 'session';
  }
}

export function createMonitor({
  claudeDir = process.env.CLAUDE_PROJECTS_DIR ||
    path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects'),
  windowMs = (Number(process.env.SESSION_WINDOW_MIN) || 30) * MIN,
  hotPollMs = 500,
  scanMs = 3000,
} = {}) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(100);
  /** @type {Map<string, Session>} */
  const sessions = new Map();
  let hotTimer = null;
  let scanTimer = null;

  // ---------------------------------------------------------------- emitting
  const out = (s, ev) => {
    if (!s.silent) emitter.emit('event', ev);
  };

  const sessionEvent = (s) => ({
    type: 'session',
    sessionId: s.id,
    title: s.title,
    cwd: s.root,
    project: s.project,
    updatedAt: s.lastActivity,
    ...(s.lastPrompt ? { lastPrompt: s.lastPrompt } : {}),
    ...(s.lastFinal ? { lastFinal: s.lastFinal } : {}),
  });

  const announceTitle = (s) => {
    const key = `${s.title}\u0000${s.root}`;
    if (key !== s.announcedTitle) {
      s.announcedTitle = key;
      out(s, sessionEvent(s));
    }
  };

  const say = (s, agentKey, kind, text, tool) => {
    // the main agent's messages also travel unclipped (line breaks kept): the last one is the session summary
    const full = agentKey === 'main' && kind === 'text' ? String(text ?? '').replace(/\r/g, '').trim().slice(0, 6000) : undefined;
    // remembered for the session event: an idle session can still show what was asked and how it ended
    if (agentKey === 'main') {
      if (kind === 'task') s.lastPrompt = clip(text, 1000);
      else if (full) s.lastFinal = full;
    }
    text = clip(text, 400);
    if (!text) return;
    const rec = { kind, text, tool, ...(full ? { full } : {}) };
    if (agentKey === 'main') s.mainLastSay = rec;
    else {
      const ag = s.agents.get(agentKey);
      if (ag) ag.lastSay = rec;
    }
    out(s, { type: 'agent_say', sessionId: s.id, agentId: agentKey, kind, text, tool, ...(full ? { full } : {}) });
  };

  const mainStart = (s) => {
    if (s.mainActive) return;
    s.mainActive = true;
    out(s, { type: 'agent_start', sessionId: s.id, agentId: 'main', role: 'main', label: 'Director' });
  };

  const mainEnd = (s) => {
    if (!s.mainActive) return;
    s.mainActive = false;
    out(s, { type: 'agent_done', sessionId: s.id, agentId: 'main' });
  };

  const spawnAgent = (s, id, label, agentType, silentStart = false) => {
    if (s.agents.has(id)) return s.agents.get(id);
    const ag = { id, label: clip(label || 'Sub agent', 70), agentType: agentType || '', status: 'running', lastSay: null, asyncId: '', lastAt: s.lastLineAt };
    s.agents.set(id, ag);
    if (!silentStart) out(s, { type: 'agent_start', sessionId: s.id, agentId: id, role: 'sub', label: ag.label, agentType: ag.agentType });
    return ag;
  };

  const finishAgent = (s, id, summary, failed = false) => {
    const ag = s.agents.get(id);
    if (!ag || ag.status !== 'running') return;
    ag.status = 'done';
    out(s, { type: 'agent_done', sessionId: s.id, agentId: id, summary: clip(summary, 260), failed });
  };

  // ------------------------------------------------------------ line parsing
  const handleNotifications = (s, text) => {
    const re = /<task-notification>([\s\S]*?)<\/task-notification>/g;
    let m;
    let any = false;
    while ((m = re.exec(text))) {
      any = true;
      const body = m[1];
      const id = (body.match(/<tool-use-id>([\s\S]*?)<\/tool-use-id>/) || [])[1]?.trim();
      const status = (body.match(/<status>([\s\S]*?)<\/status>/) || [])[1]?.trim() || 'completed';
      const result = (body.match(/<result>([\s\S]*?)<\/result>/) || [])[1] || (body.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1] || '';
      if (id) finishAgent(s, id, result, status !== 'completed');
    }
    return any;
  };

  const handleToolResult = (s, block, toolUseResult) => {
    const id = block.tool_use_id;
    const ag = s.agents.get(id);
    if (!ag) {
      s.pendingTools.delete(id);
      return;
    }
    const text = resultText(block.content);
    const tur = toolUseResult && typeof toolUseResult === 'object' ? toolUseResult : null;
    if (tur?.isAsync || tur?.status === 'async_launched' || /^Async agent launched/i.test(text)) {
      if (tur?.agentId) ag.asyncId = tur.agentId;
      return; // real completion arrives as a <task-notification>
    }
    finishAgent(s, id, text, block.is_error === true);
  };

  const handleBlocks = (s, ownerKey, content, stopReason) => {
    if (!Array.isArray(content)) return;
    for (const b of content) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'thinking') {
        say(s, ownerKey, 'thinking', b.thinking || pick(MUSINGS));
      } else if (b.type === 'text') {
        say(s, ownerKey, 'text', b.text);
      } else if (b.type === 'tool_use') {
        if (SPAWN_TOOLS.has(b.name)) {
          spawnAgent(s, b.id, b.input?.description || b.input?.subagent_type, b.input?.subagent_type);
        } else if (ownerKey === 'main') {
          s.pendingTools.add(b.id);
        }
        say(s, ownerKey, 'tool', toolSummary(b.name, b.input), b.name);
      }
    }
    void stopReason;
  };

  const handleMainLine = (s, o) => {
    if (o.isSidechain) return;
    if (o.cwd && o.cwd !== s.cwd) {
      s.cwd = o.cwd;
      if (!s.firstCwd) s.firstCwd = o.cwd;
    }
    switch (o.type) {
      case 'ai-title':
        if (o.aiTitle) s.aiTitle = clip(o.aiTitle, 60);
        break;
      case 'custom-title':
        if (o.customTitle) s.customTitle = clip(o.customTitle, 60);
        break;
      case 'queue-operation':
        if (o.operation === 'enqueue' && typeof o.content === 'string') handleNotifications(s, o.content);
        break;
      case 'system':
        if (o.subtype === 'turn_duration') mainEnd(s);
        break;
      case 'user': {
        if (o.isMeta) break;
        const c = o.message?.content;
        if (typeof c === 'string') {
          if (handleNotifications(s, c)) {
            mainStart(s);
            break;
          }
          const p = cleanPrompt(c);
          if (!p) break;
          if (!s.firstPrompt) s.firstPrompt = p;
          mainStart(s);
          say(s, 'main', 'task', p);
        } else if (Array.isArray(c)) {
          let text = '';
          for (const b of c) {
            if (b?.type === 'tool_result') handleToolResult(s, b, o.toolUseResult);
            else if (b?.type === 'text') text += ` ${b.text}`;
          }
          const p = cleanPrompt(text);
          if (p && !o.toolUseResult) {
            if (!s.firstPrompt) s.firstPrompt = p;
            mainStart(s);
            say(s, 'main', 'task', p);
          }
        }
        break;
      }
      case 'assistant': {
        const m = o.message;
        if (!m || o.isApiErrorMessage) break;
        mainStart(s);
        handleBlocks(s, 'main', m.content, m.stop_reason);
        if (m.stop_reason && m.stop_reason !== 'tool_use') mainEnd(s);
        break;
      }
      default:
    }
  };

  const handleSubLine = (s, key, o) => {
    const ag = s.agents.get(key);
    if (!ag) return;
    ag.lastAt = s.lastLineAt;
    if (o.type === 'assistant' && o.message) {
      handleBlocks(s, key, o.message.content, o.message.stop_reason);
    } else if (o.type === 'user' && Array.isArray(o.message?.content)) {
      for (const b of o.message.content) if (b?.type === 'tool_result') handleToolResult(s, b, o.toolUseResult);
    }
  };

  // ------------------------------------------------------------------ files
  const pollMain = (s, mtimeMs, now) => {
    const lines = readNewLines(s.file, s.state, 24 * 1024 * 1024);
    if (lines.length) s.lastLineAt = s.silent ? mtimeMs : now;
    for (const l of lines) {
      const o = parseJson(l);
      if (o) handleMainLine(s, o);
    }
    return lines.length > 0;
  };

  const pollSubFiles = (s, now) => {
    const dir = path.join(path.dirname(s.file), s.id, 'subagents');
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      return false;
    }
    let changed = false;
    for (const name of names) {
      if (!name.startsWith('agent-') || !name.endsWith('.jsonl')) continue;
      const file = path.join(dir, name);
      let sf = s.subFiles.get(file);
      if (!sf) {
        sf = { state: { offset: 0, rest: Buffer.alloc(0) }, key: null, agentFileId: name.slice(6, -6), dir };
        s.subFiles.set(file, sf);
      }
      if (!sf.key) {
        let meta = null;
        try {
          meta = JSON.parse(fs.readFileSync(path.join(dir, name.replace(/\.jsonl$/, '.meta.json')), 'utf8'));
        } catch {
          /* meta may not be written yet */
        }
        if (meta?.toolUseId) sf.key = meta.toolUseId;
        else {
          for (const ag of s.agents.values()) if (ag.asyncId && ag.asyncId === sf.agentFileId) sf.key = ag.id;
        }
        if (sf.key && !s.agents.has(sf.key)) {
          // agent started before we looked at the parent transcript; only adopt it if still fresh
          let fresh = false;
          try {
            fresh = now - fs.statSync(file).mtimeMs < 2 * MIN;
          } catch { /* gone */ }
          if (fresh) {
            const a = spawnAgent(s, sf.key, meta?.description || meta?.agentType, meta?.agentType, s.silent);
            if (s.silent) a.lastAt = now;
          } else sf.key = null;
        }
        if (!sf.key) continue;
      }
      const lines = readNewLines(file, sf.state, 8 * 1024 * 1024);
      if (lines.length) {
        changed = true;
        s.lastLineAt = s.silent ? Math.max(s.lastLineAt, safeMtime(file)) : now;
      }
      for (const l of lines) {
        const o = parseJson(l);
        if (o) handleSubLine(s, sf.key, o);
      }
    }
    return changed;
  };

  const safeMtime = (file) => {
    try {
      return fs.statSync(file).mtimeMs;
    } catch {
      return 0;
    }
  };

  const runningAgents = (s) => [...s.agents.values()].filter((a) => a.status === 'running');

  const settle = (s, now) => {
    // stale checks – a crashed or killed session must not keep its director at the desk forever
    const busy = s.pendingTools.size + runningAgents(s).length > 0;
    const limit = busy ? 15 * MIN : 2 * MIN;
    if (s.mainActive && now - s.lastLineAt > limit) mainEnd(s);
    for (const ag of runningAgents(s)) {
      if (now - Math.max(ag.lastAt, s.lastLineAt - 1) > 10 * MIN) finishAgent(s, ag.id, 'Timed out', false);
    }
  };

  const openSession = (id, file, dirName, mtimeMs, now) => {
    const s = new Session(id, file, dirName);
    s.lastActivity = mtimeMs;
    s.lastLineAt = mtimeMs;
    sessions.set(id, s);
    pollMain(s, mtimeMs, now);
    pollSubFiles(s, now);
    s.lastLineAt = Math.max(s.lastLineAt, mtimeMs);
    settle(s, now);
    s.silent = false;
    s.announcedTitle = `${s.title}\u0000${s.root}`;
    // announce the caught-up state exactly like a late-joining browser would see it
    for (const ev of snapshotSession(s)) emitter.emit('event', ev);
    return s;
  };

  const snapshotSession = (s) => {
    const evs = [sessionEvent(s)];
    if (s.mainActive) {
      evs.push({ type: 'agent_start', sessionId: s.id, agentId: 'main', role: 'main', label: 'Director' });
      if (s.mainLastSay) evs.push({ type: 'agent_say', sessionId: s.id, agentId: 'main', ...s.mainLastSay });
    }
    for (const ag of runningAgents(s)) {
      evs.push({ type: 'agent_start', sessionId: s.id, agentId: ag.id, role: 'sub', label: ag.label, agentType: ag.agentType });
      if (ag.lastSay) evs.push({ type: 'agent_say', sessionId: s.id, agentId: ag.id, ...ag.lastSay });
    }
    return evs;
  };

  // ------------------------------------------------------------------ loops
  const listSessionFiles = () => {
    const found = [];
    let dirs;
    try {
      dirs = fs.readdirSync(claudeDir, { withFileTypes: true });
    } catch {
      return found;
    }
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const dirPath = path.join(claudeDir, d.name);
      let files;
      try {
        files = fs.readdirSync(dirPath);
      } catch {
        continue;
      }
      for (const f of files) if (f.endsWith('.jsonl')) found.push({ dirName: d.name, file: path.join(dirPath, f), id: f.slice(0, -6) });
    }
    return found;
  };

  const coldScan = () => {
    const now = Date.now();
    for (const { dirName, file, id } of listSessionFiles()) {
      if (sessions.has(id)) continue;
      let st;
      try {
        st = fs.statSync(file);
      } catch {
        continue;
      }
      if (st.size === 0 || now - st.mtimeMs > windowMs) continue;
      openSession(id, file, dirName, st.mtimeMs, now);
    }
  };

  const hotPoll = () => {
    const now = Date.now();
    for (const s of [...sessions.values()]) {
      let st;
      try {
        st = fs.statSync(s.file);
      } catch {
        emitter.emit('event', { type: 'session_end', sessionId: s.id, reason: 'gone' });
        sessions.delete(s.id);
        continue;
      }
      let changed = false;
      if (st.size !== s.state.offset) changed = pollMain(s, st.mtimeMs, now);
      if (pollSubFiles(s, now)) changed = true;
      if (changed) s.lastActivity = now;
      else s.lastActivity = Math.max(s.lastActivity, st.mtimeMs);
      announceTitle(s);
      settle(s, now);
      if (now - s.lastActivity > windowMs && !s.mainActive && runningAgents(s).length === 0) {
        emitter.emit('event', { type: 'session_end', sessionId: s.id, reason: 'idle' });
        sessions.delete(s.id);
      }
    }
  };

  const guard = (fn) => () => {
    try {
      fn();
    } catch (err) {
      console.error('[monitor]', err);
    }
  };

  return {
    claudeDir,
    windowMs,
    on: (fn) => {
      emitter.on('event', fn);
      return () => emitter.off('event', fn);
    },
    snapshot: () => [...sessions.values()].flatMap(snapshotSession),
    sessionCount: () => sessions.size,
    start() {
      if (hotTimer) return;
      guard(coldScan)();
      hotTimer = setInterval(guard(hotPoll), hotPollMs);
      scanTimer = setInterval(guard(coldScan), scanMs);
    },
    stop() {
      clearInterval(hotTimer);
      clearInterval(scanTimer);
      hotTimer = scanTimer = null;
    },
  };
}
