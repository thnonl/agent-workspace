import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { RoomLayout, WallDecor } from '../world/layout';
import { FOOT } from '../world/layout';
import { useStore } from '../store';
import { ACHIEVEMENTS, levelOf, useProgress } from '../progress';
import { frame } from '../sim/frame';
import { env } from '../env';
import { G, M, shade } from './kit';
import { Ms, RB } from './furniture';

const ASPECT = 1.6;
const FIT_BW = 1.5;
const FIT_BH = FIT_BW / ASPECT;
const FIT_BY = 1.78;

export interface BoardPlan {
  wall: 'back' | 'left';
  pos: number;
  y: number;
  /** board width (height = width / ASPECT) */
  w: number;
  /** the wall decoration the board takes the place of */
  replaces: WallDecor | null;
}

const plans = new WeakMap<RoomLayout, BoardPlan | null>();

/** The board takes over a pin board / whiteboard / kanban / screen of the room; with none of those it needs a clear stretch of wall. */
export function boardPlan(layout: RoomLayout): BoardPlan | null {
  if (plans.has(layout)) return plans.get(layout) ?? null;
  const kinds = new Set(['cork', 'whiteboard', 'kanban', 'tv', 'frame']);
  const take = layout.wallDecor
    .filter((d) => kinds.has(d.kind) && d.w >= 1.2 && d.w / d.h > 1.2 && d.w / d.h < 1.9)
    .sort((a, b) => b.w - a.w)[0];
  let plan: BoardPlan | null = null;
  if (take) plan = { wall: take.wall, pos: take.pos, y: take.y, w: Math.min(1.9, Math.max(1.4, take.w)), replaces: take };
  else {
    const spot = boardSpot(layout);
    if (spot) plan = { wall: spot.wall, pos: spot.pos, y: FIT_BY, w: FIT_BW, replaces: null };
  }
  plans.set(layout, plan);
  return plan;
}

/** A clear stretch of wall for the board: away from windows, the door, posters, the sign and tall furniture. */
function boardSpot(layout: RoomLayout): { wall: 'back' | 'left'; pos: number } | null {
  const { width: W, depth: D } = layout;
  const BW = FIT_BW;
  const BH = FIT_BH;
  const BY = FIT_BY;
  for (const wall of ['back', 'left'] as const) {
    const len = wall === 'back' ? W : D;
    const blocks: [number, number][] = []; // [centre, half width]
    for (const w of layout.windows) if (w.wall === wall) blocks.push([w.pos, w.w / 2 + (w.curtain ? 0.55 : 0.2)]);
    if (layout.door.wall === wall) blocks.push([layout.door.pos, layout.door.width / 2 + 0.3]);
    for (const d of layout.wallDecor) {
      if (d.wall !== wall) continue;
      if (Math.abs(d.y - BY) < d.h / 2 + BH / 2 + 0.05) blocks.push([d.pos, d.w / 2 + 0.1]);
    }
    if (layout.signPos?.wall === wall) blocks.push([layout.signPos.pos, 1.5]);
    for (const p of layout.props) {
      const [fw, fd, fh] = FOOT[p.kind];
      if (fh < 1.0) continue;
      const r = Math.max(fw, fd) / 2;
      const near = wall === 'back' ? p.z - r < -D / 2 + 0.9 : p.x - r < -W / 2 + 0.9;
      if (near) blocks.push([wall === 'back' ? p.x : p.z, r + 0.1]);
    }
    // nearest to the middle of the wall first
    const steps = Math.floor((len - 2 * (BW / 2 + 0.5)) / 0.2);
    for (let i = 0; i <= steps; i++) {
      for (const sign of [1, -1]) {
        const pos = sign * i * 0.1;
        if (Math.abs(pos) > len / 2 - BW / 2 - 0.5) continue;
        if (!blocks.some(([c, h]) => Math.abs(pos - c) < h + BW / 2)) return { wall, pos };
      }
    }
  }
  return null;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const W_PX = 608;
const H_PX = Math.round(W_PX / ASPECT);

/** Wall board with the facts of the office: this room, the level of the whole office and its trophies. Redrawn when a number changes. */
export function StatsBoard({ roomId, layout }: { roomId: string; layout: RoomLayout }) {
  const spot = useMemo(() => boardPlan(layout), [layout]);
  const canvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = W_PX;
    c.height = H_PX;
    return c;
  }, []);
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [canvas]);
  useEffect(() => () => tex.dispose(), [tex]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.35 }), [tex]);
  useEffect(() => () => mat.dispose(), [mat]);
  const last = useRef('');
  const tick = useRef(0);
  const { theme } = layout;

  const draw = () => {
    const st = useStore.getState();
    const room = st.rooms[roomId];
    if (!room) return;
    const pr = useProgress.getState();
    const lv = levelOf(pr.xp);
    let subs = 0;
    for (const t of Object.values(st.tasks)) if (t.sessionId === roomId && t.source === 'sub' && !t.done) subs++;
    let people = 0;
    for (const p of Object.values(st.people)) if (p.sessionId === roomId && p.present) people++;
    const trophies = ACHIEVEMENTS.filter((a) => pr.unlocked[a.id]).length;
    const key = `${room.project}|${room.tasksDone}|${room.reports}|${subs}|${people}|${pr.xp}|${trophies}`;
    if (key === last.current) return;
    last.current = key;
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, W_PX, H_PX);
    g.fillStyle = '#fffdf6';
    roundRect(g, 0, 0, W_PX, H_PX, 26);
    g.fill();
    // header band
    g.fillStyle = theme.accent;
    roundRect(g, 0, 0, W_PX, 88, 26);
    g.fill();
    g.fillRect(0, 50, W_PX, 38);
    g.fillStyle = '#ffffff';
    g.font = '800 38px Nunito Variable, Nunito, system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    const name = (room.project || room.title || 'Office').replace(/\s+/g, ' ');
    g.fillText(name.length > 18 ? `${name.slice(0, 17)}…` : name, 26, 46);
    g.textAlign = 'right';
    g.font = '800 30px Nunito Variable, Nunito, system-ui, sans-serif';
    g.fillText(`Lv ${lv.level} · ${lv.title}`, W_PX - 26, 46);
    // numbers
    const cells: [string, string, string][] = [
      [String(room.tasksDone), 'tasks done', theme.accent],
      [String(room.reports), 'reports', theme.accent2],
      [String(subs), 'sub-agents on it', theme.accent3],
      [String(people), 'in the office', '#5a4b8a'],
    ];
    cells.forEach(([num, label, col], i) => {
      const x = 26 + (i % 2) * 290;
      const y = 100 + Math.floor(i / 2) * 92;
      g.textAlign = 'left';
      g.fillStyle = col;
      g.font = '900 64px Nunito Variable, Nunito, system-ui, sans-serif';
      g.fillText(num, x, y + 30);
      g.fillStyle = '#6a6084';
      g.font = '700 25px Nunito Variable, Nunito, system-ui, sans-serif';
      g.fillText(label, x, y + 72);
    });
    // xp bar and trophies
    g.fillStyle = '#ece4fb';
    roundRect(g, 26, H_PX - 62, 200, 14, 7);
    g.fill();
    g.fillStyle = '#ffb020';
    roundRect(g, 26, H_PX - 62, Math.max(14, 200 * (lv.into / lv.need)), 14, 7);
    g.fill();
    g.textAlign = 'left';
    g.font = '700 21px Nunito Variable, Nunito, system-ui, sans-serif';
    g.fillStyle = '#6a6084';
    g.fillText(`${pr.xp.toLocaleString('en-US')} XP`, 26, H_PX - 24);
    const show = lv.level >= 3;
    const total = Math.min(ACHIEVEMENTS.length, 8);
    for (let i = 0; i < total; i++) {
      const cx = W_PX - 40 - (total - 1 - i) * 42;
      const cy = H_PX - 42;
      const got = show && i < trophies;
      g.fillStyle = got ? '#ffd166' : '#ece4fb';
      g.beginPath();
      g.arc(cx, cy, 17, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = got ? '#b87300' : '#cfc3ea';
      g.font = '900 22px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('★', cx, cy + 1);
    }
    tex.needsUpdate = true;
  };

  useEffect(() => {
    last.current = '';
    draw();
    // (fonts load late: draw once more when they are there)
    void document.fonts?.ready.then(() => {
      last.current = '';
      draw();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, theme]);

  useFrame(() => {
    if (!spot || !frame.animRooms.has(roomId)) return;
    if (++tick.current % 20 === 0) draw();
    const k = 1 - 0.22 * env.night;
    mat.color.setRGB(k, k, k);
  });

  if (!spot) return null;
  const { width: W, depth: D } = layout;
  const BW = spot.w;
  const BH = BW / ASPECT;
  const pos: [number, number, number] = spot.wall === 'back' ? [spot.pos, spot.y, -D / 2] : [-W / 2, spot.y, spot.pos];
  return (
    <group position={pos} rotation={[0, spot.wall === 'back' ? 0 : Math.PI / 2, 0]}>
      <RB size={[BW + 0.16, BH + 0.16, 0.07]} pos={[0, 0, 0.0]} color={shade(theme.trim, -0.05)} r={0.03} />
      <mesh geometry={G.plane(BW, BH)} material={mat} position={[0, 0, 0.04]} />
      <Ms geo={G.cyl(0.012, 0.012, 0.5, 6)} mat={M('#b9b3c9', { metal: 0.3 })} pos={[0, -BH / 2 - 0.1, 0.05]} rot={[0, 0, Math.PI / 2]} cast={false} />
    </group>
  );
}
