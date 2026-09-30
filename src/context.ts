import type { ContextInfo } from './types';

/** The user's idea of the context window of sessions whose window the monitor can only guess (Claude Code): auto, or fixed. */
export const CONTEXT_WINDOWS = ['auto', '200k', '1m'] as const;
export type ContextWindowPref = (typeof CONTEXT_WINDOWS)[number];
const PREF_TOKENS: Record<Exclude<ContextWindowPref, 'auto'>, number> = { '200k': 200_000, '1m': 1_000_000 };

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

export interface ContextShare {
  used: number;
  window: number;
  /** 0-100 (more than 100 when the window was guessed too small) */
  pct: number;
  level: 'ok' | 'warn' | 'hot';
  /** "506k / 1M · 51%" */
  text: string;
  /** a longer description for a tooltip */
  title: string;
}

/** How full the context is. A window the monitor knows (Codex, OpenCode config) is used as it is; a guessed one follows the user's pick. */
export function contextShare(c: ContextInfo | undefined, pref: ContextWindowPref): ContextShare | null {
  if (!c || !(c.used > 0) || !(c.window > 0)) return null;
  let window = c.window;
  if (!c.exact && pref !== 'auto' && c.used <= PREF_TOKENS[pref]) window = PREF_TOKENS[pref];
  const pct = Math.round((c.used / window) * 100);
  const level = pct >= 85 ? 'hot' : pct >= 60 ? 'warn' : 'ok';
  const text = `${fmtTokens(c.used)} / ${fmtTokens(window)} · ${pct}%`;
  const title = `Context: ${c.used.toLocaleString('en-US')} of ${window.toLocaleString('en-US')} tokens (${pct}%)${c.model ? ` · ${c.model}` : ''}${c.exact ? '' : ' · window size is an estimate (Settings can change it)'}`;
  return { used: c.used, window, pct, level, text, title };
}
