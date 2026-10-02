/**
 * Draws the speech / thought bubbles that are on screen onto the photo canvas (photo.ts).
 * The bubbles are HTML, so they are not in the WebGL canvas: each one is redrawn from its DOM – the outline from the svg paths the layout
 * loop wrote, frames (code chips) from their computed style, text one grapheme at a time from the rectangles the browser laid it out in
 * (so wrapping, clamping and fonts come out exactly as on screen).
 */

type Rect = { left: number; top: number; right: number; bottom: number };

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

const px = (v: string) => parseFloat(v) || 0;
const transparent = (c: string) => !c || c === 'transparent' || /^rgba?\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)$/.test(c);

function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.roundRect(x, y, w, h, k);
}

/** the crown next to a director's name is an svg: drawn here the way Crown() in BubbleLayer.tsx draws it */
function drawCrown(g: CanvasRenderingContext2D, el: Element) {
  const r = el.getBoundingClientRect();
  g.save();
  g.translate(r.left, r.top);
  g.scale(r.width / 24, r.height / 24);
  g.fillStyle = '#ffb020';
  g.strokeStyle = '#c77a00';
  g.lineWidth = 1.3;
  g.lineJoin = 'round';
  const p = new Path2D('M3 19 2 8l5.5 4.5L12 5l4.5 7.5L22 8l-1 11z');
  g.fill(p);
  g.stroke(p);
  g.fillStyle = '#fff3c4';
  g.beginPath();
  g.arc(12, 14.2, 1.7, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** the frame of an element (code chip, dot): one box per line of an inline element */
function drawBox(g: CanvasRenderingContext2D, el: Element, cs: CSSStyleDeclaration) {
  const bg = cs.backgroundColor;
  const bw = [px(cs.borderTopWidth), px(cs.borderRightWidth), px(cs.borderBottomWidth), px(cs.borderLeftWidth)];
  const hasBg = !transparent(bg);
  const hasBorder = bw[0] > 0 && cs.borderTopStyle !== 'none';
  if (!hasBg && !hasBorder) return;
  const radius = px(cs.borderTopLeftRadius);
  for (const r of Array.from(el.getClientRects())) {
    if (r.width < 1 || r.height < 1) continue;
    if (hasBg) {
      g.fillStyle = bg;
      rrect(g, r.left, r.top, r.width, r.height, radius);
      g.fill();
    }
    if (!hasBorder) continue;
    g.save();
    rrect(g, r.left, r.top, r.width, r.height, radius);
    g.clip();
    g.strokeStyle = cs.borderTopColor;
    g.lineWidth = bw[0] * 2;
    rrect(g, r.left, r.top, r.width, r.height, radius);
    g.stroke();
    // (a thicker bar on the left: shell commands and code blocks)
    if (bw[3] > bw[0]) {
      g.fillStyle = cs.borderLeftColor;
      g.fillRect(r.left, r.top, bw[3], r.height);
    }
    g.restore();
  }
}

/** the text of one text node, drawn where the browser put each character */
function drawText(g: CanvasRenderingContext2D, node: Text, cs: CSSStyleDeclaration, clips: Rect[]) {
  const text = node.nodeValue ?? '';
  if (!text.trim()) return;
  g.font = cs.font || `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  g.fillStyle = cs.color;
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  if ('letterSpacing' in g) (g as unknown as { letterSpacing: string }).letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
  const range = document.createRange();
  const parts = segmenter ? Array.from(segmenter.segment(text), (s) => ({ s: s.segment, at: s.index })) : Array.from(text, (s, i) => ({ s, at: i }));
  let run = '';
  let rx = 0;
  let ry = 0;
  let rEnd = 0;
  let rAsc = 0;
  let lastX = 0;
  let lastY = 0;
  let clipped = false;
  let drew = false;
  const flush = () => {
    if (!run) return;
    g.fillText(run, rx, ry + rAsc);
    lastX = rEnd;
    lastY = ry + rAsc;
    drew = true;
    run = '';
  };
  for (const part of parts) {
    range.setStart(node, part.at);
    range.setEnd(node, part.at + part.s.length);
    const r = range.getClientRects()[0];
    // (spaces the browser collapsed or wrapped away have no box)
    if (!r || r.width < 0.1) continue;
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2;
    if (clips.some((c) => cx < c.left - 1 || cx > c.right + 1 || cy < c.top - 1 || cy > c.bottom + 1)) {
      // (cut off by a clamped or ellipsised box: not drawn)
      clipped = true;
      flush();
      continue;
    }
    if (run && (Math.abs(r.top - ry) > 2 || r.left < rEnd - 1.5 || r.left > rEnd + 8)) flush();
    if (!run) {
      rx = r.left;
      ry = r.top;
      rAsc = g.measureText(part.s).fontBoundingBoxAscent || r.height * 0.8;
    }
    run += part.s;
    rEnd = r.right;
  }
  flush();
  // the "…" a line clamp / text-overflow puts at the cut
  if (clipped && drew) g.fillText('…', lastX, lastY);
}

function walk(g: CanvasRenderingContext2D, el: Element, clips: Rect[], alpha: number) {
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      g.globalAlpha = alpha;
      drawText(g, node as Text, getComputedStyle(el), clips);
      continue;
    }
    if (!(node instanceof Element) || node.classList.contains('bubble-shape')) continue;
    const cs = getComputedStyle(node);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const a = alpha * (parseFloat(cs.opacity) || 0);
    g.globalAlpha = a;
    if (node.tagName.toLowerCase() === 'svg') {
      if (node.classList.contains('crown')) drawCrown(g, node);
      continue;
    }
    drawBox(g, node, cs);
    let inner = clips;
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
      const r = node.getBoundingClientRect();
      inner = [...clips, { left: r.left, top: r.top, right: r.right, bottom: r.bottom }];
    }
    walk(g, node, inner, a);
  }
}

/** the outline of one bubble: the ring path (wide stroke, only the outer rim shows), the fill path on top of it, and the puffs of a thought */
function drawShape(g: CanvasRenderingContext2D, bubble: HTMLElement, scale: number) {
  const shape = bubble.querySelector('.bubble-shape');
  if (!shape) return;
  const box = bubble.getBoundingClientRect();
  g.save();
  g.translate(box.left, box.top);
  for (const [n, child] of Array.from(shape.children).entries()) {
    const cs = getComputedStyle(child);
    const tag = child.tagName.toLowerCase();
    let path: Path2D | null = null;
    if (tag === 'path') {
      const d = child.getAttribute('d');
      if (d) path = new Path2D(d);
    } else if (tag === 'circle') {
      const r = px(child.getAttribute('r') ?? '0');
      if (r > 0) {
        path = new Path2D();
        path.arc(px(child.getAttribute('cx') ?? '0'), px(child.getAttribute('cy') ?? '0'), r, 0, Math.PI * 2);
      }
    }
    if (!path) continue;
    const fill = cs.fill !== 'none' && !transparent(cs.fill);
    const stroke = cs.stroke !== 'none';
    if (n === 0) {
      // (the soft shadow under the bubble: canvas shadows ignore the transform, so the sizes are in canvas pixels)
      g.shadowColor = 'rgba(70, 50, 110, 0.22)';
      g.shadowBlur = 7 * scale;
      g.shadowOffsetY = 7 * scale;
    }
    if (fill) {
      g.fillStyle = cs.fill;
      g.fill(path);
    }
    if (stroke) {
      g.strokeStyle = cs.stroke;
      g.lineWidth = px(cs.strokeWidth) || 1;
      g.lineJoin = 'round';
      g.stroke(path);
    }
    g.shadowColor = 'transparent';
    g.shadowBlur = 0;
    g.shadowOffsetY = 0;
    // (an email: the coloured strip along the top, cut to the shape of the paper)
    if (n === 1 && bubble.classList.contains('bubble-email') && tag === 'path') {
      g.save();
      g.clip(path);
      g.fillStyle = getComputedStyle(bubble).getPropertyValue('--accent').trim() || '#e0a020';
      g.fillRect(0, 0, box.width, 4);
      g.restore();
    }
  }
  g.restore();
}

/** the pill of a name tag: white, a soft shadow and a ring of the character's colour along the inside */
function drawTag(g: CanvasRenderingContext2D, tag: HTMLElement, scale: number) {
  const r = tag.getBoundingClientRect();
  const cs = getComputedStyle(tag);
  const radius = Math.min(px(cs.borderTopLeftRadius), r.height / 2);
  g.save();
  g.shadowColor = 'rgba(70, 50, 110, 0.2)';
  g.shadowBlur = 8 * scale;
  g.shadowOffsetY = 3 * scale;
  g.fillStyle = cs.backgroundColor;
  rrect(g, r.left, r.top, r.width, r.height, radius);
  g.fill();
  g.restore();
  g.save();
  rrect(g, r.left, r.top, r.width, r.height, radius);
  g.clip();
  g.strokeStyle = cs.getPropertyValue('--accent').trim() || '#b9a8e8';
  g.lineWidth = 4;
  rrect(g, r.left, r.top, r.width, r.height, radius);
  g.stroke();
  g.restore();
}

/** Draws every visible bubble and name tag onto `g`. `gl` is the canvas the picture is made from (its screen position and pixel size give the scale). */
export function drawBubbles(g: CanvasRenderingContext2D, gl: HTMLCanvasElement) {
  const at = gl.getBoundingClientRect();
  if (!at.width || !at.height) return;
  const scale = gl.width / at.width;
  const list = Array.from(document.querySelectorAll<HTMLElement>('.bubble-pos'))
    .filter((p) => p.style.visibility === 'visible')
    .map((p) => ({ p, z: parseInt(p.style.zIndex || '0', 10) || 0 }))
    .sort((a, b) => a.z - b.z);
  for (const { p } of list) {
    // a bubble, or the name tag of somebody who says nothing
    const bubble = p.querySelector<HTMLElement>('.bubble');
    const tag = bubble ? null : p.querySelector<HTMLElement>('.nametag');
    const el = bubble ?? tag;
    if (!el) continue;
    // the entrance animation, the tilt of a note and the hop of a question would put the text rectangles somewhere else than the outline:
    // the bubble is measured standing still (all in one task, nothing is painted in between)
    el.style.setProperty('animation', 'none', 'important');
    el.style.setProperty('transform', 'none', 'important');
    g.save();
    g.setTransform(scale, 0, 0, scale, -at.left * scale, -at.top * scale);
    try {
      if (bubble) drawShape(g, bubble, scale);
      else drawTag(g, el, scale);
      walk(g, el, [], 1);
    } finally {
      g.restore();
      el.style.removeProperty('animation');
      el.style.removeProperty('transform');
    }
  }
}
