// Helpers shared by the transcript monitor and its provider parsers (Claude Code, Codex, OpenCode).
import fs from 'node:fs';
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
