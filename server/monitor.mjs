// Watches Claude Code transcripts (~/.claude/projects/<project>/<session>.jsonl and
// <session>/subagents/agent-*.jsonl) and turns raw JSONL lines into small "office events"
// that the front-end animates. No Claude configuration is required: transcripts are
// append-only files, so we simply tail them.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { createCodexParser, createTitleIndex, defaultCodexHome, listCodexFiles } from './codex.mjs';
import { createOpenCodeSource, defaultOpenCodeDb } from './opencode.mjs';
import { MIN, MUSINGS, pick, clip, base, toolSummary, cleanPrompt, resultText, readNewLines, parseJson } from './util.mjs';

const SPAWN_TOOLS = new Set(['Agent', 'Task']);

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
  constructor(id, file, dirName, provider = 'claude') {
    this.id = id;
    this.provider = provider;
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
    this.lastAgentText = '';
    /** OpenCode only: cursor and sub-agent conversations */
    this.oc = null;
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
  // null switches a source off (tests do that to stay away from the real ones)
  codexDir = path.join(defaultCodexHome(), 'sessions'),
  opencodeDb = defaultOpenCodeDb(),
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
    provider: s.provider,
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

  const codexLine = createCodexParser({ say, mainStart, mainEnd });
  const codexTitle = codexDir ? createTitleIndex(path.dirname(codexDir)) : () => '';

  // ------------------------------------------------------------------ files
  const pollMain = (s, mtimeMs, now) => {
    const lines = readNewLines(s.file, s.state, 24 * 1024 * 1024);
    if (lines.length) s.lastLineAt = s.silent ? mtimeMs : now;
    for (const l of lines) {
      const o = parseJson(l);
      if (o) (s.provider === 'codex' ? codexLine : handleMainLine)(s, o);
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

  /** Catches a session up silently with load(), then announces it exactly like a late-joining browser would see it. */
  const register = (s, mtimeMs, now, load) => {
    s.lastActivity = mtimeMs;
    s.lastLineAt = mtimeMs;
    sessions.set(s.id, s);
    load(s);
    s.lastLineAt = Math.max(s.lastLineAt, mtimeMs);
    settle(s, now);
    s.silent = false;
    s.announcedTitle = `${s.title}\u0000${s.root}`;
    for (const ev of snapshotSession(s)) emitter.emit('event', ev);
    return s;
  };

  const openSession = (id, file, dirName, mtimeMs, now, provider = 'claude') => {
    const s = new Session(id, file, dirName, provider);
    return register(s, mtimeMs, now, () => {
      pollMain(s, mtimeMs, now);
      if (provider === 'claude') pollSubFiles(s, now);
    });
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
  // A calm machine should cost (almost) nothing: sessions that are doing nothing are polled slowly, transcripts that
  // are too old to matter are not stat'ed again and again, and (where the OS supports it) a recursive file watcher
  // wakes the affected session / triggers a scan the moment a transcript changes.
  /** session ids whose files changed according to the watcher */
  const dirty = new Set();
  /** session id -> earliest time of the next poll of an idle session */
  const nextPoll = new Map();
  /** transcripts that were too old (or empty) when last looked at: file -> time of that look */
  const ignored = new Map();
  let watcher = null;
  let codexWatcher = null;
  let scanSoon = null;
  const CODEX_ID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;
  const hotWindowMs = hotPollMs * 40;
  const idlePollMs = () => hotPollMs * (watcher ? 8 : 4);
  const recheckMs = () => (watcher ? 10 * MIN : 30_000);

  const rescanSoon = () => {
    if (!scanSoon) scanSoon = setTimeout(() => { scanSoon = null; guard(coldScan)(); }, 50);
  };

  const watchDir = (dir, onChange) => {
    try {
      const w = fs.watch(dir, { recursive: true, persistent: false }, (_evt, name) => {
        if (name) onChange(String(name));
      });
      w.on('error', () => w.close());
      return w;
    } catch {
      return null; // no recursive watching here (or no such folder): the slower polling below still works
    }
  };

  const startWatchers = () => {
    watcher = watchDir(claudeDir, (name) => {
      const parts = name.split(/[\\/]/);
      if (parts.length < 2) return;
      const id = parts[1].endsWith('.jsonl') ? parts[1].slice(0, -6) : parts[1];
      dirty.add(id);
      if (parts.length === 2 && parts[1].endsWith('.jsonl')) {
        ignored.delete(path.join(claudeDir, name));
        if (!sessions.has(id)) rescanSoon();
      }
    });
    codexWatcher = codexDir
      ? watchDir(codexDir, (name) => {
          const id = CODEX_ID.exec(name)?.[1];
          if (!id) return;
          dirty.add(id);
          ignored.delete(path.join(codexDir, name));
          if (!sessions.has(id)) rescanSoon();
        })
      : null;
  };

  const listSessionFiles = () => {
    const found = [];
    let dirs = [];
    try {
      dirs = fs.readdirSync(claudeDir, { withFileTypes: true });
    } catch {
      /* no Claude Code folder: the other sources may still be there */
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
      for (const f of files) if (f.endsWith('.jsonl')) found.push({ dirName: d.name, file: path.join(dirPath, f), id: f.slice(0, -6), provider: 'claude' });
    }
    if (codexDir) for (const { file, id } of listCodexFiles(codexDir)) found.push({ dirName: '', file, id, provider: 'codex' });
    return found;
  };

  const coldScan = () => {
    const now = Date.now();
    for (const { dirName, file, id, provider } of listSessionFiles()) {
      if (sessions.has(id)) continue;
      const seen = ignored.get(file);
      if (seen !== undefined && now - seen < recheckMs()) continue;
      let st;
      try {
        st = fs.statSync(file);
      } catch {
        continue;
      }
      if (st.size === 0 || now - st.mtimeMs > windowMs) {
        ignored.set(file, now);
        continue;
      }
      ignored.delete(file);
      openSession(id, file, dirName, st.mtimeMs, now, provider);
    }
    oc?.scan(now);
  };

  /** What every session needs after its source was read: title, stale checks, retirement of a long quiet session. */
  const afterPoll = (s, now, changed = false) => {
    if (changed) s.lastActivity = now;
    if (s.provider === 'codex') {
      const name = codexTitle(s.id);
      if (name) s.aiTitle = clip(name, 60);
    }
    announceTitle(s);
    settle(s, now);
    if (now - s.lastActivity > windowMs && !s.mainActive && runningAgents(s).length === 0) {
      emitter.emit('event', { type: 'session_end', sessionId: s.id, reason: 'idle' });
      sessions.delete(s.id);
      nextPoll.delete(s.id);
    }
  };

  const oc = opencodeDb
    ? createOpenCodeSource(
        { sessions, newSession: (id, file, provider) => new Session(id, file, '', provider), register, say, mainStart, mainEnd, spawnAgent, finishAgent, runningAgents, afterPoll },
        { dbFile: opencodeDb, windowMs },
      )
    : null;

  const hotPoll = () => {
    const now = Date.now();
    for (const s of [...sessions.values()]) {
      if (s.oc) continue; // OpenCode sessions live in a database: oc.poll() below
      const hot = s.mainActive || s.pendingTools.size > 0 || now - s.lastActivity < hotWindowMs || runningAgents(s).length > 0;
      if (!hot && !dirty.has(s.id) && now < (nextPoll.get(s.id) ?? 0)) continue;
      dirty.delete(s.id);
      nextPoll.set(s.id, now + idlePollMs());
      let st;
      try {
        st = fs.statSync(s.file);
      } catch {
        emitter.emit('event', { type: 'session_end', sessionId: s.id, reason: 'gone' });
        sessions.delete(s.id);
        nextPoll.delete(s.id);
        continue;
      }
      let changed = false;
      if (st.size !== s.state.offset) changed = pollMain(s, st.mtimeMs, now);
      if (s.provider === 'claude' && pollSubFiles(s, now)) changed = true;
      if (!changed) s.lastActivity = Math.max(s.lastActivity, st.mtimeMs);
      afterPoll(s, now, changed);
    }
    oc?.poll(now);
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
    sources: { claude: claudeDir, codex: codexDir, opencode: opencodeDb },
    on: (fn) => {
      emitter.on('event', fn);
      return () => emitter.off('event', fn);
    },
    snapshot: () => [...sessions.values()].flatMap(snapshotSession),
    sessionCount: () => sessions.size,
    start() {
      if (hotTimer) return;
      startWatchers();
      guard(coldScan)();
      hotTimer = setInterval(guard(hotPoll), hotPollMs);
      // with a watcher the periodic scan is only a safety net
      scanTimer = setInterval(guard(coldScan), watcher ? scanMs * 5 : scanMs);
    },
    stop() {
      clearInterval(hotTimer);
      clearInterval(scanTimer);
      clearTimeout(scanSoon);
      scanSoon = null;
      watcher?.close();
      codexWatcher?.close();
      watcher = codexWatcher = null;
      oc?.close();
      hotTimer = scanTimer = null;
    },
  };
}
