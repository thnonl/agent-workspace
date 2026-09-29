import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { addAfterEffect } from '@react-three/fiber';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store';
import { themeFor } from '../world/palettes';
import type { Speech } from '../types';
import { anchors, nextSpeech, peekSpeech, queueLength, view } from '../sim/registry';

const TOOL_ICONS: Record<string, string> = {
  Read: '📖', Edit: '✏️', MultiEdit: '✏️', NotebookEdit: '✏️', Write: '📝', Bash: '⌨️', PowerShell: '⌨️', Grep: '🔍', Glob: '🔍',
  WebFetch: '🌐', WebSearch: '🌐', TodoWrite: '✅', TaskCreate: '✅', TaskUpdate: '✅', Agent: '📨', Task: '📨',
};

/** icons of the "what I am doing" bubbles (Speech.tool) */
const IDLE_ICONS: Record<string, string> = {
  read: '📖', drink: '🥤', coffee: '☕', fish: '🐟', wash: '🧼', water: '🪴', sofa: '🛋️', pet: '🐱', window: '🪟', walk: '🚶', watch: '👀', wait: '⏳', home: '👋',
};

/** a bubble stays until something new is said; after this long it shrinks to save space */
const SETTLE_MS = 9000;

function iconFor(s: Speech): string {
  switch (s.kind) {
    case 'idle': return IDLE_ICONS[s.tool ?? ''] ?? '💭';
    case 'thinking': return '💭';
    case 'text': return '💬';
    case 'task': return '📥';
    case 'done': return s.tool === 'failed' ? '😵' : '🎉';
    case 'error': return '⚠️';
    default:
      if (s.tool?.startsWith('mcp__')) return '🧩';
      return (s.tool && TOOL_ICONS[s.tool]) || '⚙️';
  }
}

/** fill colour of every bubble kind (the tail lives in another layer and needs it too) */
const BUBBLE_BG: Record<string, string> = {
  thinking: '#f4f0ff', text: '#ffffff', tool: '#262a44', task: '#fff5c2', done: '#e3fbea', error: '#ffffff',
};

interface Item {
  root: HTMLDivElement;
  /** the tail / thought puffs of the current bubble (drawn below every bubble so it never covers text) */
  tail: () => HTMLDivElement | null;
  /** show: on screen; live: the character is inside the office */
  tick: (show: boolean, now: number, live: boolean) => void;
  /** size of the bubble box, kept up to date by a ResizeObserver (reading offsetWidth every frame forces a layout) */
  size: { w: number; h: number };
}
const items = new Map<string, Item>();
const v3 = new THREE.Vector3();

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
  const cam = view.camera;
  if (!cam) return;
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
      v3.set(a.x, a.y, a.z);
      dist = cam.position.distanceTo(v3);
      v3.project(cam);
      show = v3.z < 1 && Math.abs(v3.x) < 1.2 && Math.abs(v3.y) < 1.25;
      sx = (v3.x * 0.5 + 0.5) * view.width;
      sy = (-v3.y * 0.5 + 0.5) * view.height;
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
    setStyle(it.root, 'zIndex', String(9000 - i));
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
let stopEffect: (() => void) | null = null;
function startLoop() {
  if (started++ > 0) return;
  stopEffect = addAfterEffect(() => layoutLoop());
}
function stopLoop() {
  if (--started > 0) return;
  stopEffect?.();
  stopEffect = null;
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

  const name = useStore((s) => s.people[personKey]?.name ?? '');
  const task = useStore((s) => {
    const p = s.people[personKey];
    return (p?.taskKey ? s.tasks[p.taskKey]?.label : '') ?? '';
  });
  const role = useStore((s) => s.people[personKey]?.role ?? 'staff');
  const failed = useStore((s) => {
    const p = s.people[personKey];
    return (p?.taskKey ? s.tasks[p.taskKey]?.failed : false) ?? false;
  });
  const selected = useStore((s) => s.selectedKey === personKey);
  const themeIndex = useStore((s) => {
    const p = s.people[personKey];
    return p ? s.rooms[p.sessionId]?.themeIndex ?? 0 : 0;
  });
  const accent = role === 'director' ? '#ffb020' : themeFor(themeIndex).accent;

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
        return;
      }
      // the speech queue only advances while the character is on screen
      if (!show) return;
      const c = curRef.current;
      const head = peekSpeech(personKey);
      if (!head) {
        // nothing new to say: the bubble stays (it shows what they are doing) but gets smaller after a while
        if (c && !settledRef.current && now - shownAt.current > SETTLE_MS) {
          settledRef.current = true;
          setSettled(true);
        }
        return;
      }
      const urgent = (head.kind === 'done' && c?.kind !== 'done') || head.kind === 'idle';
      if (c && !urgent && now < hideAt.current) return;
      const next = nextSpeech(personKey)!;
      const crowd = queueLength(personKey) >= 2 ? 0.62 : 1;
      hideAt.current = now + Math.min(6800, Math.max(2500, 1800 + next.text.length * 42)) * crowd + (next.kind === 'done' ? 1200 : 0);
      shownAt.current = now;
      curRef.current = next;
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
  const look = cur ? (cur.kind === 'idle' ? 'thinking' : cur.kind) : '';
  const isFail = failed && look === 'done';
  const tone = { ['--bg' as string]: isFail ? '#ffe6e6' : BUBBLE_BG[look] ?? '#ffffff', ['--accent' as string]: look === 'done' ? (isFail ? '#ff6b6b' : '#35c27d') : accent };
  return (
    <div ref={rootRef} className="bubble-pos" style={{ visibility: 'hidden', ['--accent' as string]: accent }}>
      {tails && cur
        ? createPortal(
            <div key={cur.id} ref={tailRef} className="bubble-tail-pos" style={{ visibility: 'hidden', ...tone }}>
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
        {cur ? (
          <div key={cur.id} className={`bubble bubble-${look}${isFail ? ' bubble-failed' : ''}${settled ? ' bubble-settled' : ''}`}>
            <div className="bubble-head">
              <span className="bubble-dot" />
              <span className="bubble-name">{role === 'director' ? '👑 ' : ''}{name}{task && cur.kind !== 'idle' ? <em> · {task}</em> : null}</span>
            </div>
            <div className={`bubble-body${cur.kind === 'tool' ? ' mono' : ''}`}>
              <span className="bubble-icon">{iconFor(cur)}</span>
              <span>{cur.text}</span>
            </div>
          </div>
        ) : (
          <button className={`nametag${selected ? ' selected' : ''}`} onClick={() => useStore.getState().select(personKey)}>
            {role === 'director' ? '👑 ' : ''}{name}
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
