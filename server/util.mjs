// Helpers shared by the transcript monitor and its provider parsers (Claude Code, Codex, OpenCode).
import fs from 'node:fs';
import { modelWindow } from './models.mjs';
export const MIN = 60_000;

// Claude often stores thinking blocks without readable text; show something cute instead.
export const MUSINGS = ['Hmm, let me think…', 'Let me figure this out…', 'Thinking hard…', 'Working out the next step…', 'One moment, pondering…', 'Let me look at this carefully…'];
let musing = 0;
export const pick = (list) => list[musing++ % list.length];

export const clip = (s, n = 240) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
};

export const base = (p) => (p ? String(p).split(/[\\/]/).filter(Boolean).pop() : '');

export function toolSummary(name, input = {}) {
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
        return `Using ${server} · ${rest.join('_').replace(/[_-]+/g, ' ')}`;
      }
      return `Using ${name}`;
  }
}

/** A tool call worth a small celebration in the office: 'commit' | 'push' (a git command run by the agent), else null. */
export function cueOf(name, input = {}) {
  if (name !== 'Bash' && name !== 'PowerShell') return null;
  const cmd = String(input?.command ?? '');
  if (/\bgit\s+(?:-[Cc]\s+\S+\s+)*push\b/.test(cmd)) return 'push';
  if (/\bgit\s+(?:-[Cc]\s+\S+\s+)*commit\b/.test(cmd)) return 'commit';
  return null;
}

// ---------------------------------------------------------------- context window
const ONE_M = 1_000_000;
const DEFAULT_WINDOW = 200_000;

/** "200000", "200k", "1m", "1.5M" -> tokens (0 when it is not a size) */
export function parseTokens(v) {
  const m = String(v ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*([km]?)$/i);
  if (!m) return 0;
  return Math.round(Number(m[1]) * (m[2].toLowerCase() === 'm' ? ONE_M : m[2].toLowerCase() === 'k' ? 1000 : 1));
}

/**
 * The context window of a model when the transcript does not say: CONTEXT_WINDOW_TOKENS wins, a "[1m]" / "-1m" model name means a
 * million, anything else is taken as 200k – and as a million once the session has outgrown that. Only a guess (the caller marks it so).
 */
export function guessWindow(model, used) {
  const forced = parseTokens(process.env.CONTEXT_WINDOW_TOKENS);
  if (forced) return forced;
  if (/\[1m\]|[-_]1m\b|1m-context/i.test(String(model ?? ''))) return ONE_M;
  if (used <= DEFAULT_WINDOW) return DEFAULT_WINDOW;
  return Math.ceil(used / ONE_M) * ONE_M;
}

/**
 * The window of a model: { window, exact }. exact when the model list knows it (models.mjs: Codex's cache, the Claude table, a "[1m]" name);
 * otherwise guessWindow(). CONTEXT_WINDOW_TOKENS overrides the list. A session that already holds more than the listed window means
 * the list is wrong for this session, so it is guessed too.
 */
export function resolveWindow(model, used) {
  if (!parseTokens(process.env.CONTEXT_WINDOW_TOKENS)) {
    const known = modelWindow(model);
    if (known && used <= known) return { window: known, exact: true };
  }
  return { window: guessWindow(model, used), exact: false };
}

/** Tokens the context holds after a Claude Code assistant message (what the next request starts from), or null. */
export function claudeContext(message) {
  const u = message?.usage;
  const model = String(message?.model ?? '');
  if (!u || !model || model.startsWith('<')) return null;
  const used = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.output_tokens || 0);
  if (!used) return null;
  return { used, ...resolveWindow(model, used), model };
}

/**
 * Interactive tool calls: the agent stops and waits for the user. Claude Code's AskUserQuestion / ExitPlanMode and OpenCode's
 * question tool share the input shape { questions: [{ question, header, options: [{ label }] }] } (plan: string for ExitPlanMode).
 * Returns { text, full } to show, or null when the call is not an ask.
 */
export function askOf(name, input) {
  const n = String(name ?? '').toLowerCase();
  const i = input && typeof input === 'object' ? input : {};
  if (n === 'exitplanmode') {
    const first = String(i.plan ?? '').replace(/^[#\s*-]+/, '').split('\n')[0];
    return { text: clip(`Plan ready for approval${first ? `: ${first}` : ''}`, 260), full: clip(i.plan, 1500) || undefined };
  }
  if (n !== 'askuserquestion' && n !== 'question') return null;
  const qs = (Array.isArray(i.questions) ? i.questions : [i]).filter((q) => q && typeof q === 'object');
  const label = (o) => (typeof o === 'string' ? o : o?.label);
  const line = (q) => {
    const opts = (Array.isArray(q.options) ? q.options : []).map(label).filter(Boolean);
    return `${clip(q.question || q.header, 200)}${opts.length ? ` — ${opts.join(' / ')}` : ''}`;
  };
  if (!qs.length || !(qs[0].question || qs[0].header)) return { text: 'Waiting for your answer', full: undefined };
  return { text: clip(line(qs[0]), 260), full: qs.length > 1 ? clip(qs.map(line).join('  |  '), 1500) : undefined };
}

/** Claude Code writes this user line when the person presses Esc: the turn is over, nothing more will be generated. */
export const isInterrupt = (raw) => String(raw ?? '').trim().startsWith('[Request interrupted');

export function cleanPrompt(raw) {
  let t = String(raw ?? '');
  t = t.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ');
  t = t.replace(/<(ide_[a-z_]+|local-command-[a-z]+|command-[a-z]+)>[\s\S]*?<\/\1>/g, ' ');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  if (!t || t.startsWith('Caveat:') || t.startsWith('[Request interrupted')) return '';
  return t;
}

export function resultText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((b) => (b?.type === 'text' ? b.text : '')).join(' ');
  return '';
}

/** Read every full line appended to `file` after `state.offset`. Keeps partial tail in `state.rest`. */
export function readNewLines(file, state, maxBytes = Infinity) {
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

export function parseJson(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
