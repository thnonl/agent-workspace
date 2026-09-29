/** Split a long message into bubble-sized chunks, preferring sentence boundaries. */
export function chunkText(text: string, max = 130, maxChunks = 2): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  const parts = clean.match(/[^.!?。\n]+[.!?。]*\s*/g) ?? [clean];
  const chunks: string[] = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + p).length > max && cur) {
      chunks.push(cur.trim());
      cur = '';
    }
    cur += p;
    if (chunks.length >= maxChunks) break;
  }
  if (chunks.length < maxChunks && cur.trim()) chunks.push(cur.trim());
  const res = chunks.slice(0, maxChunks).map((c) => (c.length > max ? c.slice(0, max - 1).trimEnd() + '…' : c));
  if (res.length === maxChunks && clean.length > res.join(' ').length) {
    const last = res[res.length - 1];
    if (!last.endsWith('…')) res[res.length - 1] = last.replace(/[.!?]?$/, '…');
  }
  return res;
}

export function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}

export function shortPath(p: string): string {
  const parts = p.split(/[\/]/).filter(Boolean);
  return parts.slice(-2).join('/') || p;
}
