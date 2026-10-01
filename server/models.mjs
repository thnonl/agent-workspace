// Context windows of the models the monitor meets, so the page does not have to guess them.
//   Codex    ~/.codex/models_cache.json   (Codex refreshes it from OpenAI: slug -> context_window)
//   Claude   the table below, taken from platform.claude.com/docs/en/build-with-claude/context-windows (checked 2026-10-01);
//            Claude Code transcripts only hold token usage, never the size of the window
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ONE_M = 1_000_000;
const TWO_HUNDRED_K = 200_000;

const codexHome = () => process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
let codexCache = { at: 0, map: new Map() };

/** slug -> tokens a Codex session can really use (context_window x effective_context_window_percent, the number Codex itself reports) */
export function codexWindows() {
  const now = Date.now();
  if (now - codexCache.at < 60_000) return codexCache.map;
  const map = new Map();
  try {
    const j = JSON.parse(fs.readFileSync(path.join(codexHome(), 'models_cache.json'), 'utf8'));
    for (const m of Array.isArray(j.models) ? j.models : []) {
      const w = Number(m?.context_window);
      if (!m?.slug || !(w > 0)) continue;
      const pct = Number(m.effective_context_window_percent);
      map.set(String(m.slug).toLowerCase(), pct > 0 && pct <= 100 ? Math.round((w * pct) / 100) : w);
    }
  } catch {
    /* Codex not installed or the cache is not readable */
  }
  codexCache = { at: now, map };
  return map;
}

/**
 * Context window of a Claude model id, 0 when the id is not a Claude model the table knows. Gateway ids ("kr/claude-sonnet-4.5-thinking")
 * and Bedrock / Vertex ids ("anthropic.claude-opus-4-6-v1:0", "claude-haiku-4-5@20251001") are reduced to the Claude API form first.
 *   1M    Fable, Mythos, Opus 4.6+, Sonnet 4.6+ (1M is their default, no beta header)
 *   200k  everything else: Haiku, Opus 4.5 and older, Sonnet 4.5 and older, Claude 3.x
 */
export function claudeWindow(model) {
  const id = String(model ?? '')
    .toLowerCase()
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .replace(/^.*[/.](?=claude-)/, '')
    .replace(/(\d)\.(\d)/g, '$1-$2')
    .replace(/[@:].*$/, '');
  if (/^claude-(?:fable|mythos)\b/.test(id)) return ONE_M;
  const m = id.match(/^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d{1,2})(?!\d))?/);
  if (m) {
    const [, family, major, minor] = m;
    if (family === 'haiku') return TWO_HUNDRED_K;
    const v = Number(major) + Number(minor || 0) / 100;
    return v >= 4.06 ? ONE_M : TWO_HUNDRED_K;
  }
  return /^claude-(?:\d|instant|haiku|sonnet|opus)/.test(id) ? TWO_HUNDRED_K : 0;
}

/** Context window of any model the monitor knows: a "[1m]" suffix, Codex's own list, then the Claude table. 0 when unknown. */
export function modelWindow(model) {
  const id = String(model ?? '').trim();
  if (!id) return 0;
  if (/\[1m\]|[-_]1m\b|1m-context/i.test(id)) return ONE_M;
  return codexWindows().get(id.toLowerCase().replace(/^.*\//, '')) || claudeWindow(id);
}
