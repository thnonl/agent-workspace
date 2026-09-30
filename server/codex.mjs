// Codex (CLI, desktop app, IDE extension) keeps one rollout per thread:
//   ~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<thread id>.jsonl      (append-only, like Claude's transcripts)
//   ~/.codex/session_index.jsonl                                      (thread id -> thread name)
// The parser below turns the finished items of a rollout into the same office events the Claude parser produces.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MUSINGS, pick, clip, base, toolSummary, cleanPrompt } from './util.mjs';

export const defaultCodexHome = () => process.env.CODEX_HOME || path.join(os.homedir(), '.codex');

const numbered = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && /^\d+$/.test(d.name)).map((d) => d.name).sort();
  } catch {
    return [];
  }
};

/** Rollouts of the newest few days (a session only matters while it is recent, so older date folders are never opened). */
export function listCodexFiles(sessionsDir, days = 3) {
  const dayDirs = [];
  for (const y of numbered(sessionsDir).reverse()) {
    for (const m of numbered(path.join(sessionsDir, y)).reverse()) {
      for (const d of numbered(path.join(sessionsDir, y, m)).reverse()) {
        dayDirs.push(path.join(sessionsDir, y, m, d));
        if (dayDirs.length >= days) break;
      }
      if (dayDirs.length >= days) break;
    }
    if (dayDirs.length >= days) break;
  }
  const found = [];
  for (const dir of dayDirs) {
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      /* gone */
    }
    for (const f of names) {
      const m = /^rollout-.*?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i.exec(f);
      if (m) found.push({ file: path.join(dir, f), id: m[1] });
    }
  }
  return found;
}

/** Thread names by thread id (the index is small and rewritten by Codex, so it is re-read only when it changes). */
export function createTitleIndex(codexHome) {
  const file = path.join(codexHome, 'session_index.jsonl');
  let mtime = -1;
  let names = new Map();
  return (id) => {
    try {
      const m = fs.statSync(file).mtimeMs;
      if (m !== mtime) {
        mtime = m;
        names = new Map();
        for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
          if (!line.trim()) continue;
          try {
            const o = JSON.parse(line);
            if (o.id && o.thread_name) names.set(o.id, o.thread_name);
          } catch {
            /* partial line */
          }
        }
      }
    } catch {
      /* no index yet */
    }
    return names.get(id) || '';
  };
}

const text = (content) =>
  (Array.isArray(content) ? content : [])
    .map((c) => (typeof c?.text === 'string' ? c.text : ''))
    .join(' ');

/** The desktop app puts attached files in front of the request; the request itself follows "## My request:". */
const userRequest = (raw) => {
  const t = String(raw ?? '');
  const i = t.lastIndexOf('## My request:');
  return cleanPrompt(i >= 0 ? t.slice(i + '## My request:'.length) : t);
};

/** A finished tool-like item -> [tool name in Claude vocabulary, input]. Unknown kinds keep their own name. */
function toolOf(item) {
  switch (item.type) {
    case 'CommandExecution': {
      const parsed = Array.isArray(item.parsed_cmd) ? item.parsed_cmd[0] : null;
      if (parsed?.type === 'read' && parsed.path) return ['Read', { file_path: parsed.path }];
      if (parsed?.type === 'search') return ['Grep', { pattern: parsed.query || parsed.cmd }];
      if (parsed?.type === 'list_files') return ['Glob', { pattern: parsed.path || parsed.cmd }];
      const cmd = Array.isArray(item.command) ? item.command[item.command.length - 1] : item.command;
      return ['Bash', { command: parsed?.cmd || cmd }];
    }
    case 'FileChange': {
      const [file, change] = Object.entries(item.changes || {})[0] || [];
      return [change?.type === 'add' ? 'Write' : 'Edit', { file_path: file }];
    }
    case 'McpToolCall':
      return [`mcp__${item.server || 'mcp'}__${item.tool || 'tool'}`, item.arguments];
    case 'ImageView':
      return ['Read', { file_path: item.path ? base(String(item.path).replace(/^file:\/+/, '')) : 'an image' }];
    case 'WebSearch':
      return ['WebSearch', { query: item.query || item.action?.query }];
    default:
      return [item.type, {}];
  }
}

/** Items that are conversation, not work: no tool bubble for them. */
const NOT_TOOLS = new Set(['UserMessage', 'AgentMessage', 'Reasoning', 'ContextCompaction', 'Plan']);

export function createCodexParser({ say, mainStart, mainEnd }) {
  return function handleLine(s, o) {
    const p = o.payload;
    if (!p || typeof p !== 'object') return;
    if (o.type === 'session_meta' || o.type === 'turn_context') {
      if (p.cwd) {
        if (p.cwd !== s.cwd) s.cwd = p.cwd;
        if (!s.firstCwd) s.firstCwd = p.cwd;
      }
      return;
    }
    if (o.type !== 'event_msg') return;
    switch (p.type) {
      case 'task_started':
        mainStart(s);
        break;
      case 'task_complete': {
        // the closing message normally arrived as an AgentMessage already; say it only when it did not
        const last = String(p.last_agent_message ?? '').trim();
        if (last && last !== s.lastAgentText) {
          mainStart(s);
          say(s, 'main', 'text', last);
          s.lastAgentText = last;
        }
        mainEnd(s);
        break;
      }
      case 'turn_aborted':
        mainEnd(s);
        break;
      case 'item_completed': {
        const item = p.item;
        if (!item) break;
        if (item.type === 'UserMessage') {
          const t = userRequest(text(item.content));
          if (!t) break;
          if (!s.firstPrompt) s.firstPrompt = t;
          mainStart(s);
          say(s, 'main', 'task', t);
        } else if (item.type === 'AgentMessage') {
          const t = text(item.content).trim();
          if (!t) break;
          mainStart(s);
          s.lastAgentText = t;
          say(s, 'main', 'text', t);
        } else if (item.type === 'Reasoning') {
          mainStart(s);
          const summary = text((item.summary_text || []).map((t) => (typeof t === 'string' ? { text: t } : t)));
          say(s, 'main', 'thinking', clip(summary, 240) || pick(MUSINGS));
        } else if (!NOT_TOOLS.has(item.type)) {
          const [name, input] = toolOf(item);
          mainStart(s);
          say(s, 'main', 'tool', toolSummary(name, input), name);
        }
        break;
      }
      default:
    }
  };
}
