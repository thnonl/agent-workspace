import type { ReactNode } from 'react';
import type { Speech } from '../types';

/** a code block in a bubble shows one line only; the rest is "..." */
const BLOCK_MAX = 70;

/** ```fence``` (also one the chunking cut open) or `inline code` */
const CODE = /```[\w-]*\s*([\s\S]*?)(?:```|$)|`([^`\n]+)`/g;

/** the first line of a block of code, "..." when there is more */
function oneLine(code: string): string {
  const lines = code.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const first = (lines[0] ?? '').replace(/\s+/g, ' ');
  const cut = first.length > BLOCK_MAX;
  return `${cut ? first.slice(0, BLOCK_MAX - 1).trimEnd() : first}${cut || lines.length > 1 ? ' ...' : ''}`;
}

/** A shell command ("$ ...") in a frame of its own. */
function Command({ line }: { line: string }) {
  return (
    <code className="bubble-code bubble-cmd">
      <b className="ps">$</b> {line.replace(/^\$\s*/, '')}
    </code>
  );
}

/** "Reading a.ts", "Editing a.ts", "Writing a.ts", "Finding *.ts" (server/util.mjs toolSummary): the file (or pattern) is the framed part */
const FILE_LINE = /^(Reading|Editing|Writing|Finding) (.+)$/;

/** What a bubble says: code (shell commands, files, `inline` and ```fenced```) is drawn in a frame, the rest stays plain text. */
export function bubbleText(s: Pick<Speech, 'kind' | 'text' | 'tool'>): ReactNode {
  if (s.kind === 'tool' && s.text.startsWith('$ ')) return <Command line={s.text} />;
  if (s.kind === 'tool') {
    const m = FILE_LINE.exec(s.text);
    if (m) return <>{m[1]} <code className="bubble-code bubble-file">{m[2]}</code></>;
  }
  if (!s.text.includes('`')) return s.text;
  const out: ReactNode[] = [];
  let at = 0;
  let n = 0;
  for (const m of s.text.matchAll(CODE)) {
    const i = m.index ?? 0;
    if (i > at) out.push(s.text.slice(at, i));
    if (m[2] != null) out.push(<code key={n++} className="bubble-code">{m[2]}</code>);
    else if ((m[1] ?? '').trim()) out.push(<code key={n++} className="bubble-code bubble-block">{oneLine(m[1])}</code>);
    at = i + m[0].length;
  }
  if (at < s.text.length) out.push(s.text.slice(at));
  return out;
}
