import { memo, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { themeFor } from '../world/palettes';
import { sfx } from '../audio';
import type { Speech } from '../types';
import { afterRender } from '../sim/frame';
import { floatingWindow } from '../pipHost';
import { anchors, holdTalk, sims, idleDismissedAt, nextSpeech, peekSpeech, queueLength, view, type Projected } from '../sim/registry';

const TOOL_ICONS: Record<string, string> = {
  Read: '📖', Edit: '✏️', MultiEdit: '✏️', NotebookEdit: '✏️', Write: '📝', Bash: '⌨️', PowerShell: '⌨️', Grep: '🔍', Glob: '🔍',
  WebFetch: '🌐', WebSearch: '🌐', TodoWrite: '✅', TaskCreate: '✅', TaskUpdate: '✅', Agent: '📨', Task: '📨',
};

/** icons of the "what I am doing" bubbles (Speech.tool) */
const IDLE_ICONS: Record<string, string> = {
  parcel: '📦', smoke: '🚬', sleep: '💤', box: '🥊', lift: '🏋️',
  read: '📖', drink: '🥤', coffee: '☕', fish: '🐟', wash: '🧼', water: '🪴', sofa: '🛋️', pet: '🐱', window: '🪟', walk: '🚶', watch: '👀', phone: '📱', wait: '⏳', home: '👋', wave: '👋', cook: '🍳', eat: '🍜', chat: '💬', talk: '💬',
};

/** a bubble stays until something new is said; after this long it shrinks to save space */
const SETTLE_MS = 9000;

function iconFor(s: Speech): string {
  switch (s.kind) {
    case 'idle': return IDLE_ICONS[s.tool ?? ''] ?? '💭';
    case 'thinking': return '💭';
    case 'text': return '💬';
    case 'task': return s.tool === 'call' ? '☎️' : s.tool === 'email' ? '✉️' : '📥';
    case 'done': return s.tool === 'failed' ? '😵' : '🎉';
    case 'error': return '⚠️';
    default:
      if (s.tool?.startsWith('mcp__')) return '🧩';
      return (s.tool && TOOL_ICONS[s.tool]) || '⚙️';
  }
}

interface Item {
  root: HTMLDivElement;
  /** show: on screen; live: the character is inside the office */
  tick: (show: boolean, now: number, live: boolean) => void;
  /** size of the bubble box, kept up to date by a ResizeObserver (reading offsetWidth every frame forces a layout) */
  size: { w: number; h: number };
  /** a question for the user is pending: drawn above every other bubble */
  top?: boolean;
  /** world position the bubble itself follows: it trails the head a little, only the tip of its tail is exactly on the head */
  sm?: { x: number; y: number; z: number };
  /** the bubble element that is drawn now, its outline (an svg inside it) and its corner radii */
  bub?: HTMLElement;
  shape?: Element | null;
  radii?: [number, number, number, number];
  /** a thought (puffs instead of a tail) */
  thought?: boolean;
  /** what the outline was drawn for (sizes and points in half pixels): it is only drawn again when one of them changed */
  shapeKey?: string;
  /** where the bubble was placed last time, for whom (the head's world position) and when its speech queue was last ticked */
  placed?: Placed;
  lastA?: [number, number, number];
  tickAt?: number;
}
/** "idle" bubbles that are said out loud rather than thought */
const SPOKEN = new Set(['talk', 'wave', 'home', 'eat']);
/** how long the last bubble of somebody with nothing to do stays up */
const QUIET_MS = 4500;
const items = new Map<string, Item>();
const proj: Projected = { x: 0, y: 0, z: 0, dist: 0 };
const projSm: Projected = { x: 0, y: 0, z: 0, dist: 0 };
let lastLayout = 0;
/** a number that changes whenever the camera or the screen size does (a bubble over somebody who stands still is only placed again then) */
let lastCamSig = 0;

/** space between a bubble and the head it belongs to, half the width of the tail's base, distance to the screen edge */
const GAP = 18;
/** a thought has no spike: two small round puffs lead from the bubble to the head, so it floats a little higher */
const GAP_THOUGHT = 25;
/** [how far along the way from the bubble to the head, radius] of the puffs of a thought */
const PUFFS: [number, number][] = [[0.36, 4.6], [0.76, 2.8]];
const TAIL_HALF = 9;
const EDGE = 6;
/** the speech queue of a bubble over somebody who stands still moves on at most this often (ms) – about 15 times a second */
const LAYOUT_STEP_MS = 66;
/** how fast the bubble follows a walking head (1/s); the camera moving does not lag: both are projected with the same camera */
const FOLLOW = 11;

interface Placed {
  key: string;
  /** the exact head (tip of the tail) and the point the bubble follows, in px */
  tx: number;
  ty: number;
  bx: number;
  by: number;
  dist: number;
  w: number;
  h: number;
  /** nothing changed since it was placed: only its stacking order is looked at */
  still?: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Radii = [number, number, number, number];

/** border radii (top-left, top-right, bottom-right, bottom-left) of a bubble, read from its style */
function readRadii(el: HTMLElement): Radii {
  const cs = (el.ownerDocument.defaultView ?? window).getComputedStyle(el);
  const v = (s: string) => parseFloat(s) || 0;
  return [v(cs.borderTopLeftRadius), v(cs.borderTopRightRadius), v(cs.borderBottomRightRadius), v(cs.borderBottomLeftRadius)];
}

const f = (n: number) => n.toFixed(1);

/**
 * The whole bubble as ONE outline: a rounded box whose bottom edge flows into a sharp, slightly curved tail that ends exactly at
 * (tx, ty). All in the bubble's own pixels (origin = its top-left corner). The tail's base is centred on bx; its two sides start along
 * the edge (so they join it smoothly, no seam) and pinch towards the tip.
 */
function bubblePath(w: number, h: number, r: Radii, bx: number, tx: number, ty: number, withTail = true): string {
  const [tl, tr, br, bl] = r.map((v) => Math.min(v, w / 2, h / 2)) as Radii;
  if (!withTail) return `M${f(tl)} 0H${f(w - tr)}A${f(tr)} ${f(tr)} 0 0 1 ${f(w)} ${f(tr)}V${f(h - br)}A${f(br)} ${f(br)} 0 0 1 ${f(w - br)} ${f(h)}H${f(bl)}A${f(bl)} ${f(bl)} 0 0 1 0 ${f(h - bl)}V${f(tl)}A${f(tl)} ${f(tl)} 0 0 1 ${f(tl)} 0Z`;
  const len = ty - h;
  const W = TAIL_HALF;
  const k = 0.4;
  const cx = tx + (bx - tx) * k;
  const cy = ty - len * k;
  return (
    `M${f(tl)} 0H${f(w - tr)}A${f(tr)} ${f(tr)} 0 0 1 ${f(w)} ${f(tr)}V${f(h - br)}A${f(br)} ${f(br)} 0 0 1 ${f(w - br)} ${f(h)}` +
    `H${f(bx + W)}C${f(bx + W - 7)} ${f(h)} ${f(cx + 1.6)} ${f(cy)} ${f(tx)} ${f(ty)}C${f(cx - 1.6)} ${f(cy)} ${f(bx - W + 7)} ${f(h)} ${f(bx - W)} ${f(h)}` +
    `H${f(bl)}A${f(bl)} ${f(bl)} 0 0 1 0 ${f(h - bl)}V${f(tl)}A${f(tl)} ${f(tl)} 0 0 1 ${f(tl)} 0Z`
  );
}

function setAttr(el: Element, name: string, value: string) {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/** Writes an inline style only when it changes (comparing is free, every write dirties the style of the element). */
function setStyle(el: HTMLElement, prop: 'visibility' | 'transform' | 'zIndex', value: string) {
  if (el.style[prop] !== value) el.style[prop] = value;
}

/**
 * Central loop: projects every character's head to the screen and puts its bubble right above it.
 * Bubbles are never moved out of the way – each one stays over its own character (nearer characters
 * are drawn on top when two overlap).
 */
function layoutLoop() {
  if (!view.project) return;
  const now = performance.now();
  const cam = view.camera;
  let sig = view.width * 7 + view.height * 13;
  if (cam) {
    const m = cam.matrixWorldInverse.elements;
    const p = cam.projectionMatrix.elements;
    for (let k = 0; k < 16; k += 3) sig += m[k] * (k + 1.3) + p[k] * (k + 2.1);
  }
  const camMoved = sig !== lastCamSig;
  lastCamSig = sig;
  const dtS = clamp((now - lastLayout) / 1000, 0.001, 0.1);
  lastLayout = now;
  const follow = 1 - Math.exp(-FOLLOW * dtS);
  const list: Placed[] = [];
  const hidden: string[] = [];
  const floating = !!floatingWindow();
  for (const [key, it] of items) {
    // (the size observers belong to the page, which does not hear about the floating window: measure the bubble directly there)
    if (floating) {
      const box = it.root.firstElementChild as HTMLElement | null;
      if (box) {
        it.size.w = box.offsetWidth || it.size.w;
        it.size.h = box.offsetHeight || it.size.h;
      }
    }
    const a = anchors.get(key);
    let show = !!a?.live;
    let tx = 0;
    let ty = 0;
    let bx = 0;
    let by = 0;
    let dist = 0;
    // a bubble over somebody who stands still (same head position, camera, size and bubble as when it was placed): there is nothing to
    // work out or write, only its speech queue still moves on – and not on every frame. Bubbles of people who move are placed on every frame.
    const here = it.root.firstElementChild?.firstElementChild;
    const placed = it.placed;
    const was = it.lastA;
    const sm0 = it.sm;
    if (show && a && !camMoved && placed && was && sm0 && here === it.bub && a.x === was[0] && a.y === was[1] && a.z === was[2] && Math.abs(sm0.x - a.x) + Math.abs(sm0.y - a.y) + Math.abs(sm0.z - a.z) < 0.006 && it.size.w === placed.w && it.size.h === placed.h) {
      if (now - (it.tickAt ?? 0) >= LAYOUT_STEP_MS) {
        it.tickAt = now;
        it.tick(true, now, true);
      }
      list.push({ ...placed, still: true });
      continue;
    }
    if (show && a) {
      view.project(a.x, a.y, a.z, proj);
      dist = proj.dist;
      show = proj.z < 1 && Math.abs(proj.x) < 1.2 && Math.abs(proj.y) < 1.25;
      tx = (proj.x * 0.5 + 0.5) * view.width;
      ty = (-proj.y * 0.5 + 0.5) * view.height;
      // the bubble trails the head (in the world, so the camera does not make it lag); somebody who appears or jumps is not followed from afar
      let sm = it.sm;
      if (!sm || Math.hypot(a.x - sm.x, a.z - sm.z) > 2.5) it.sm = sm = { x: a.x, y: a.y, z: a.z };
      else {
        sm.x += (a.x - sm.x) * follow;
        sm.y += (a.y - sm.y) * follow;
        sm.z += (a.z - sm.z) * follow;
      }
      view.project(sm.x, sm.y, sm.z, projSm);
      bx = (projSm.x * 0.5 + 0.5) * view.width;
      by = (-projSm.y * 0.5 + 0.5) * view.height;
    }
    it.tick(show, now, !!a?.live);
    if (!show) {
      hidden.push(key);
      it.sm = undefined;
      it.placed = undefined;
      continue;
    }
    const now2: Placed = { key, tx, ty, bx, by, dist, w: it.size.w, h: it.size.h };
    it.placed = now2;
    it.lastA = a ? [a.x, a.y, a.z] : undefined;
    it.tickAt = now;
    list.push(now2);
  }
  for (const key of hidden) {
    const it = items.get(key);
    if (!it) continue;
    setStyle(it.root, 'visibility', 'hidden');
  }
  list.sort((a, b) => a.dist - b.dist);
  list.forEach((p, i) => {
    const it = items.get(p.key)!;
    if (p.still) {
      setStyle(it.root, 'zIndex', String(9000 - i + (it.top ? 5000 : 0)));
      return;
    }
    setStyle(it.root, 'visibility', 'visible');
    // the bubble that is drawn now (if any) and its outline element: looked up once per bubble
    const bub = it.root.firstElementChild?.firstElementChild as HTMLElement | null | undefined;
    if (bub !== it.bub) {
      it.bub = bub ?? undefined;
      it.shape = bub?.classList.contains('bubble') ? bub.querySelector('.bubble-shape') : null;
      it.radii = it.shape && bub ? readRadii(bub) : undefined;
      it.thought = !!bub?.classList.contains('bubble-thinking');
      it.shapeKey = undefined;
    }
    // (on a narrow screen a bubble slides back into view)
    const left = clamp(p.bx - p.w / 2, EDGE, Math.max(EDGE, view.width - p.w - EDGE));
    const bottom = p.by - (it.thought ? GAP_THOUGHT : GAP);
    // (a bubble over a head near the top edge stays inside the picture)
    const top = Math.max(4, bottom - p.h);
    setStyle(it.root, 'transform', `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`);
    setStyle(it.root, 'zIndex', String(9000 - i + (it.top ? 5000 : 0)));
    const shape = it.shape;
    const radii = it.radii;
    if (!shape || !radii || p.w < 20) return;
    // the tip is exactly on the head; the tail leaves the bottom edge as near to it as the corners allow
    const w = p.w;
    const h = p.h;
    const tx = p.tx - left;
    const ty = Math.max(h + 12, p.ty - 3 - top);
    const pad = Math.min(TAIL_HALF + 8 + Math.max(radii[2], radii[3]), w / 2);
    const bx = clamp(tx, pad, w - pad);
    const key = `${Math.round(w * 2)}|${Math.round(h * 2)}|${Math.round(bx * 2)}|${Math.round(tx * 2)}|${Math.round(ty * 2)}|${it.thought ? 1 : 0}`;
    if (key === it.shapeKey) return;
    it.shapeKey = key;
    const d = bubblePath(w, h, radii, bx, tx, ty, !it.thought);
    setAttr(shape.children[0], 'd', d);
    setAttr(shape.children[1], 'd', d);
    if (it.thought) {
      // the puffs sit on the line from the bubble's bottom edge to the head
      PUFFS.forEach(([t, r], n) => {
        const c = shape.children[2 + n];
        if (!c) return;
        setAttr(c, 'cx', (bx + (tx - bx) * t).toFixed(1));
        setAttr(c, 'cy', (h + (ty - h) * t).toFixed(1));
        setAttr(c, 'r', String(r));
      });
    }
  });
}

// The layout runs right after the 3D scene has drawn a frame: the camera it projects with is then exactly the
// one on screen, and a calm (idle) scene costs no extra work.
let started = 0;
function startLoop() {
  if (started++ > 0) return;
  afterRender.add(layoutLoop);
}
function stopLoop() {
  if (--started > 0) return;
  afterRender.delete(layoutLoop);
}

/** The director's crown. Drawn, not an emoji: an emoji sits at a different height in every emoji font, a drawing is centred exactly. */
function Crown() {
  return (
    <svg className="crown" viewBox="0 0 24 24" aria-label="director" role="img">
      <path d="M3 19 2 8l5.5 4.5L12 5l4.5 7.5L22 8l-1 11z" fill="#ffb020" stroke="#c77a00" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="12" cy="14.2" r="1.7" fill="#fff3c4" />
    </svg>
  );
}

/** One speech bubble (or name tag) following a character on screen. */
const BubbleItem = memo(function BubbleItem({ personKey }: { personKey: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState<Speech | null>(null);
  const [settled, setSettled] = useState(false);
  const curRef = useRef<Speech | null>(null);
  /** earliest moment the current bubble may be replaced (a bubble is read for at least a few seconds) */
  const hideAt = useRef(0);
  const shownAt = useRef(0);
  const settledRef = useRef(false);
  /** the task title goes into the header of the first bubble of a task only (repeating it on every bubble just eats width) */
  const taskRef = useRef('');
  const lastTitled = useRef('');
  const titledId = useRef<string | number | null>(null);

  const { name, task, role, failed, selected, themeIndex, askRec } = useStore(
    useShallow((s) => {
      const p = s.people[personKey];
      const t = p?.taskKey ? s.tasks[p.taskKey] : undefined;
      return {
        name: p?.name ?? '',
        task: (p?.taskKey ? t?.label : '') ?? '',
        role: p?.role ?? 'staff',
        failed: (p?.taskKey ? t?.failed : false) ?? false,
        selected: s.selectedKey === personKey,
        themeIndex: p ? s.rooms[p.sessionId]?.themeIndex ?? 0 : 0,
        askRec: p?.role === 'director' ? s.asks[p.sessionId] : undefined,
      };
    }),
  );
  taskRef.current = task;
  const accent = role === 'director' ? '#ffb020' : themeFor(themeIndex).accent;
  // the agent waits for the user's answer: one persistent, highlighted bubble over the director until it is answered (the class is set once, the layout loop only positions it)
  const asking = !!askRec;
  useEffect(() => {
    const it = items.get(personKey);
    if (it) it.top = asking;
    return () => {
      const it2 = items.get(personKey);
      if (it2) it2.top = false;
    };
  }, [personKey, asking]);

  useEffect(() => {
    const root = rootRef.current!;
    const tick = (show: boolean, now: number, live: boolean) => {
      if (!live) {
        // left the office: the old bubble must not greet them when they come back
        if (curRef.current) {
          curRef.current = null;
          settledRef.current = false;
          setCur(null);
          setSettled(false);
        }
        lastTitled.current = '';
        return;
      }
      const c = curRef.current;
      // a break is over: the thought about it is switched off at once
      if (c?.kind === 'idle' && !c.hold && idleDismissedAt(personKey) > shownAt.current) {
        curRef.current = null;
        settledRef.current = false;
        setCur(null);
        setSettled(false);
        return;
      }
      // the speech queue only advances while the character is on screen
      if (!show) return;
      // nothing to do and nothing to say: no bubble
      if (c && (!c.hold || now >= hideAt.current) && sims.get(personKey)?.quiet && !peekSpeech(personKey) && now - shownAt.current > QUIET_MS) {
        curRef.current = null;
        settledRef.current = false;
        setCur(null);
        setSettled(false);
        return;
      }
      const head = peekSpeech(personKey);
      if (!head) {
        // nothing new to say: the bubble stays (it shows what they are doing) but gets smaller after a while
        if (c && !settledRef.current && now - shownAt.current > SETTLE_MS) {
          settledRef.current = true;
          setSettled(true);
        }
        return;
      }
      // a summary bubble is read to the end before anything else replaces it
      if (c?.hold && now < hideAt.current) return;
      const urgent = (head.kind === 'done' && c?.kind !== 'done') || head.kind === 'idle';
      if (c && !urgent && now < hideAt.current) return;
      const next = nextSpeech(personKey)!;
      const crowd = queueLength(personKey) >= 2 ? 0.62 : 1;
      hideAt.current = next.hold ? now + next.hold : now + Math.min(6800, Math.max(2500, 1800 + next.text.length * 42)) * crowd + (next.kind === 'done' ? 1200 : 0);
      if (next.hold && next.kind === 'text') holdTalk(personKey, hideAt.current);
      shownAt.current = now;
      // a soft sound for every new bubble (chat lines babble, tool calls stay silent)
      const roomId = useStore.getState().people[personKey]?.sessionId;
      const sim = sims.get(personKey);
      if (next.tool === 'call' || next.tool === 'email') {
        // the user's message arrives as a call on the desk phone (rings, is picked up) or as an email (new-mail chime) with the first chunk; the director is busy with it until the last chunk (and the answer) is shown
        const fresh = !sim || (sim.msgUntil ?? 0) * 1000 < now || sim.msgVia !== next.tool;
        sfx(fresh ? (next.tool === 'call' ? 'ring' : 'mail') : 'blip', roomId);
        if (sim) {
          sim.msgVia = next.tool;
          sim.msgUntil = (hideAt.current + 700) / 1000;
        }
      } else if (next.tool === 'talk') sfx('talk', roomId);
      else if (next.kind === 'done') sfx('ding', roomId);
      else if (next.kind !== 'tool' && next.tool !== 'wave') sfx('pop', roomId);
      // the answer to the call / email: the handset stays at the ear (the director stays at the laptop) until it has been read
      if (next.tool === 'ack' && sim && (sim.msgUntil ?? 0) * 1000 > now) sim.msgUntil = hideAt.current / 1000;
      curRef.current = next;
      if (taskRef.current !== lastTitled.current && next.kind !== 'idle') {
        titledId.current = next.id;
        lastTitled.current = taskRef.current;
      }
      settledRef.current = false;
      setSettled(false);
      setCur(next);
    };
    const size = { w: 80, h: 24 };
    const box = root.firstElementChild as HTMLElement | null;
    const ro = box
      ? new ResizeObserver(() => {
          size.w = box.offsetWidth || 80;
          size.h = box.offsetHeight || 24;
        })
      : null;
    if (box) {
      size.w = box.offsetWidth || 80;
      size.h = box.offsetHeight || 24;
      ro?.observe(box);
    }
    items.set(personKey, { root, tick, size });
    startLoop();
    return () => {
      ro?.disconnect();
      items.delete(personKey);
      stopLoop();
    };
  }, [personKey]);

  // what a character plans to do on a break is a thought, drawn like thinking
  const look = asking ? 'ask' : cur ? (cur.kind === 'idle' && !SPOKEN.has(cur.tool ?? '') ? 'thinking' : cur.kind === 'idle' ? 'text' : cur.kind) : '';
  const isFail = failed && look === 'done';
  const via = cur?.tool === 'call' || cur?.tool === 'email' ? cur.tool : null;
  // the outline of the bubble (box and tail in one path): set by the layout loop, every frame
  const outline = (
    <svg className="bubble-shape" aria-hidden="true">
      <path className="shape-ring" />
      <path className="shape-fill" />
      {look === 'thinking' ? (
        <>
          <circle className="puff" />
          <circle className="puff" />
        </>
      ) : null}
    </svg>
  );
  return (
    <div ref={rootRef} className="bubble-pos" style={{ visibility: 'hidden', ['--accent' as string]: accent }}>
      <div className="bubble-anchor">
        {asking ? (
          <div key={`ask${askRec!.since}`} className="bubble bubble-ask" title={askRec!.full ?? askRec!.text}>
            {outline}
            <div className="bubble-head">
              <span className="bubble-dot" />
              <span className="bubble-name">❓ {name} needs your input</span>
            </div>
            <div className="bubble-body">
              <span className="bubble-icon">❓</span>
              <span>{askRec!.text}</span>
            </div>
          </div>
        ) : cur ? (
          <div key={cur.id} className={`bubble bubble-${look}${via ? ` bubble-${via === 'call' ? 'phone' : 'email'}` : ''}${cur.hold && cur.kind === 'text' ? ' bubble-talk' : ''}${isFail ? ' bubble-failed' : ''}${settled && !cur.hold ? ' bubble-settled' : ''}`}>
            {outline}
            <div className="bubble-head">
              <span className="bubble-dot" />
              <span className="bubble-name">{via ? (via === 'call' ? '☎️ You (phone)' : '✉️ Email from You') : <>{role === 'director' ? <Crown /> : null}<span className="nm">{name}</span>{task && cur.kind !== 'idle' && titledId.current === cur.id ? <em className="nm"> · {task}</em> : null}</>}</span>
            </div>
            <div className={`bubble-body${cur.kind === 'tool' ? ' mono' : ''}`}>
              <span className="bubble-icon">{iconFor(cur)}</span>
              <span>{cur.text}</span>
            </div>
          </div>
        ) : (
          <button className={`nametag${selected ? ' selected' : ''}`} onClick={() => useStore.getState().select(personKey)}>
            {role === 'director' ? <Crown /> : null}<span className="nm">{name}</span>
          </button>
        )}
      </div>
    </div>
  );
});

export function BubbleLayer() {
  const keys = useStore(useShallow((s) => Object.keys(s.people)));
  return (
    <div className="bubble-layer">
      <div className="bubble-bodies">
        {keys.map((k) => (
          <BubbleItem key={k} personKey={k} />
        ))}
      </div>
    </div>
  );
}
