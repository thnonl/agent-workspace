import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { themeFor } from '../world/palettes';
import { sfx } from '../audio';
import type { Speech } from '../types';
import { afterRender } from '../sim/frame';
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

/** fill colour of every bubble kind (the tail lives in another layer and needs it too) */
const BUBBLE_BG: Record<string, string> = {
  thinking: '#f4f0ff', text: '#ffffff', tool: '#262a44', task: '#fff5c2', done: '#e3fbea', error: '#ffffff', ask: '#fff7dc',
};

interface Item {
  root: HTMLDivElement;
  /** the tail / thought puffs of the current bubble (drawn below every bubble so it never covers text) */
  tail: () => HTMLDivElement | null;
  /** show: on screen; live: the character is inside the office */
  tick: (show: boolean, now: number, live: boolean) => void;
  /** size of the bubble box, kept up to date by a ResizeObserver (reading offsetWidth every frame forces a layout) */
  size: { w: number; h: number };
  /** a question for the user is pending: drawn above every other bubble */
  top?: boolean;
}
/** "idle" bubbles that are said out loud rather than thought */
const SPOKEN = new Set(['talk', 'wave', 'home', 'eat']);
/** how long the last bubble of somebody with nothing to do stays up */
const QUIET_MS = 4500;
const items = new Map<string, Item>();
const proj: Projected = { x: 0, y: 0, z: 0, dist: 0 };

interface Placed {
  key: string;
  sx: number;
  sy: number;
  dist: number;
  w: number;
  h: number;
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
  const list: Placed[] = [];
  const hidden: string[] = [];
  for (const [key, it] of items) {
    const a = anchors.get(key);
    let show = !!a?.live;
    let sx = 0;
    let sy = 0;
    let dist = 0;
    if (show && a) {
      view.project(a.x, a.y, a.z, proj);
      dist = proj.dist;
      show = proj.z < 1 && Math.abs(proj.x) < 1.2 && Math.abs(proj.y) < 1.25;
      sx = (proj.x * 0.5 + 0.5) * view.width;
      sy = (-proj.y * 0.5 + 0.5) * view.height;
    }
    it.tick(show, now, !!a?.live);
    if (!show) {
      hidden.push(key);
      continue;
    }
    list.push({ key, sx, sy, dist, w: it.size.w, h: it.size.h });
  }
  for (const key of hidden) {
    const it = items.get(key);
    if (!it) continue;
    setStyle(it.root, 'visibility', 'hidden');
    const tail = it.tail();
    if (tail) setStyle(tail, 'visibility', 'hidden');
  }
  list.sort((a, b) => a.dist - b.dist);
  const GAP = 8;
  list.forEach((p, i) => {
    const it = items.get(p.key)!;
    setStyle(it.root, 'visibility', 'visible');
    setStyle(it.root, 'transform', `translate3d(${(p.sx - p.w / 2).toFixed(1)}px, ${(p.sy - p.h - GAP).toFixed(1)}px, 0)`);
    setStyle(it.root, 'zIndex', String(9000 - i + (it.top ? 5000 : 0)));
    const tail = it.tail();
    if (tail) {
      // the tail starts at the bottom centre of the bubble
      setStyle(tail, 'visibility', 'visible');
      setStyle(tail, 'transform', `translate3d(${p.sx.toFixed(1)}px, ${(p.sy - GAP).toFixed(1)}px, 0)`);
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
const BubbleItem = memo(function BubbleItem({ personKey, tails }: { personKey: string; tails: HTMLElement | null }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);
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
    items.set(personKey, { root, tick, tail: () => tailRef.current, size });
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
  const tone = asking ? { ['--bg' as string]: BUBBLE_BG.ask, ['--accent' as string]: '#f59e0b' } : { ['--bg' as string]: isFail ? '#ffe6e6' : via === 'call' ? '#d8f3ff' : via === 'email' ? '#fff8e6' : BUBBLE_BG[look] ?? '#ffffff', ['--accent' as string]: look === 'done' ? (isFail ? '#ff6b6b' : '#35c27d') : via === 'call' ? '#2f9de4' : via === 'email' ? '#e0a020' : accent };
  return (
    <div ref={rootRef} className="bubble-pos" style={{ visibility: 'hidden', ['--accent' as string]: accent }}>
      {tails && (cur || asking)
        ? createPortal(
            <div key={asking ? `ask${askRec!.since}` : cur!.id} ref={tailRef} className="bubble-tail-pos" style={{ visibility: 'hidden', ...tone }}>
              {look === 'thinking' ? (
                <>
                  <i className="bubble-puff p1" />
                  <i className="bubble-puff p2" />
                </>
              ) : (
                <i className="bubble-tail" />
              )}
            </div>,
            tails,
          )
        : null}
      <div className="bubble-anchor">
        {asking ? (
          <div key={`ask${askRec!.since}`} className="bubble bubble-ask" title={askRec!.full ?? askRec!.text}>
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
  const [tails, setTails] = useState<HTMLDivElement | null>(null);
  return (
    <div className="bubble-layer">
      {/* every tail is drawn below every bubble, so the arrow of one bubble never covers the text of another */}
      <div className="bubble-tails" ref={setTails} />
      <div className="bubble-bodies">
        {keys.map((k) => (
          <BubbleItem key={k} personKey={k} tails={tails} />
        ))}
      </div>
    </div>
  );
}
