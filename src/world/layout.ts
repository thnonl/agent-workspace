import { Rng } from '../util/rng';
import { NavGrid, V2 } from './nav';
import { RoomTheme, themeFor } from './palettes';

export type PropKind =
  | 'bookshelf' | 'plant' | 'tallPlant' | 'cactus' | 'cooler' | 'coffee' | 'sofa' | 'beanbag' | 'floorLamp'
  | 'printer' | 'bin' | 'fishtank' | 'coatRack' | 'armchair'
  | 'fileCabinet' | 'copier' | 'meetingSet' | 'whiteboardStand' | 'boxes' | 'serverRack' | 'fridge' | 'vending'
  | 'trolley' | 'recycle' | 'loungeSet' | 'credenza' | 'sink';

export interface Prop {
  kind: PropKind;
  x: number;
  z: number;
  rot: number;
  variant: number;
  color: string;
  color2: string;
}

export type WallDecorKind = 'poster' | 'clock' | 'whiteboard' | 'frame' | 'pennant' | 'shelf' | 'tv' | 'cork' | 'kanban' | 'calendar' | 'motto' | 'sconce';
export interface WallDecor {
  kind: WallDecorKind;
  wall: 'back' | 'left';
  pos: number;
  y: number;
  w: number;
  h: number;
  color: string;
  color2: string;
  variant: number;
}

export interface WindowSpec {
  wall: 'back' | 'left';
  pos: number;
  w: number;
  h: number;
  sill: number;
  curtain: boolean;
  panes: 1 | 2 | 4;
  /** two sashes: this half (+1 = the +x half of the wall, -1 = the -x half) stands open, the other one is closed */
  openSide: 1 | -1;
}

export interface DoorSpec {
  wall: 'back' | 'left';
  pos: number;
  width: number;
  height: number;
  /** point on the wall line */
  threshold: V2;
  /** first point inside the room */
  inside: V2;
  /** point out of sight, on the porch */
  outside: V2;
  /** unit vector pointing into the room */
  dir: V2;
}

export type DeskDecor =
  | 'mug' | 'plant' | 'notes' | 'lamp' | 'pencils' | 'donut' | 'books' | 'cactus'
  | 'phone' | 'photo' | 'papers' | 'bottle' | 'notepad' | 'headphones' | 'tissue' | 'stapler';

export interface DeskItem {
  kind: DeskDecor;
  /** desk-local position (x across, z towards the director) */
  x: number;
  z: number;
  rot: number;
}

export interface DeskSlot {
  index: number;
  x: number;
  z: number;
  /** yaw of the seated worker – the desk faces the director */
  rot: number;
  w: number;
  seat: V2;
  approach: V2;
  /** +1 / -1: which lateral side of the chair the worker walks in from */
  approachSide: number;
  laptop: V2;
  color: string;
  items: DeskItem[];
  chairColor: string;
  /** yaw of the empty chair (relative to `rot`) */
  chairTurn: number;
  /** thin divider on the right edge (bench seating) */
  partition: boolean;
  drawerSide: number;
}

export interface DirectorSpec {
  desk: V2;
  seat: V2;
  approach: V2;
  approachSide: number;
  laptop: V2;
  visitors: V2[];
  waiting: V2[];
}

export type DecalKind = 'paper' | 'ball' | 'sticky' | 'cable' | 'stain' | 'pen';
export interface FloorDecal {
  kind: DecalKind;
  x: number;
  z: number;
  rot: number;
  color: string;
  size: number;
}

export interface CatWindow {
  /** index into `windows` */
  index: number;
  wall: 'back' | 'left';
  /** on the outside ledge */
  out: V2;
  /** on the inner sill */
  sill: V2;
  /** free floor point in front of the window */
  land: V2;
  /** yaw when looking into the room */
  yaw: number;
  sillY: number;
}

/** Things people like to do when there is nothing to work on. */
export type StationKind = 'drink' | 'read' | 'fish' | 'wash' | 'water';

/** A spot in front of something (water cooler, bookshelf, fish tank, sink, plant) where a person can spend a moment. */
export interface Station {
  kind: StationKind;
  prop: PropKind;
  /** where the person stands */
  stand: V2;
  /** yaw while standing there (looking at the thing) */
  yaw: number;
  /** the thing itself (floor position) */
  target: V2;
  /** sink: where the water comes out of the tap */
  tap?: V2;
}

/** Places to sit / lie down: sofas, beanbags, the director's desk, a patch of sun. */
export interface Spot {
  kind: 'sofa' | 'armchair' | 'beanbag' | 'desk' | 'sun';
  x: number;
  z: number;
  y: number;
  yaw: number;
  approach: V2;
}

export interface RoomLayout {
  seed: number;
  kind: string;
  seating: 'fan' | 'bench';
  width: number;
  depth: number;
  wallHeight: number;
  theme: RoomTheme;
  door: DoorSpec;
  windows: WindowSpec[];
  desks: DeskSlot[];
  director: DirectorSpec;
  props: Prop[];
  wallDecor: WallDecor[];
  decals: FloorDecal[];
  rug: { x: number; z: number; w: number; d: number; shape: 'round' | 'rect'; color: string; color2: string } | null;
  signPos: { wall: 'back' | 'left'; pos: number; y: number } | null;
  catWindows: CatWindow[];
  spots: Spot[];
  stations: Station[];
  catCount: number;
  nav: NavGrid;
  fitDistance: number;
}

interface SizeKind {
  name: string;
  w: number;
  d: number;
  arcs: number;
  rows: number;
  weight: number;
}

const KINDS: SizeKind[] = [
  { name: 'cozy', w: 16, d: 12.5, arcs: 2, rows: 2, weight: 3 },
  { name: 'wide', w: 19, d: 12.5, arcs: 2, rows: 2, weight: 2 },
  { name: 'grand', w: 17, d: 15, arcs: 3, rows: 3, weight: 2 },
];

const DESK_D = 1.0;
/** one desk per possible staff member (the director has their own desk) */
export const MAX_DESKS = 7;
/** the random generators try for more than we need, then the best seats are kept */
const DESK_CANDIDATES = 14;

/** footprint [width along the wall, depth, height] of every prop */
const FOOT: Record<PropKind, [number, number, number]> = {
  bookshelf: [2.0, 0.6, 2.0],
  plant: [0.75, 0.75, 1.0],
  tallPlant: [0.95, 0.95, 1.7],
  cactus: [0.55, 0.55, 1.05],
  cooler: [0.6, 0.6, 1.45],
  coffee: [1.7, 0.65, 1.4],
  sink: [1.0, 0.55, 1.0],
  sofa: [2.2, 1.0, 0.9],
  beanbag: [0.95, 0.95, 0.65],
  floorLamp: [0.45, 0.45, 1.75],
  printer: [1.1, 0.7, 1.0],
  bin: [0.45, 0.45, 0.45],
  fishtank: [1.3, 0.7, 1.35],
  coatRack: [0.6, 0.6, 1.85],
  armchair: [1.0, 1.0, 0.9],
  fileCabinet: [0.62, 0.7, 1.15],
  copier: [1.3, 0.85, 1.1],
  meetingSet: [3.3, 3.3, 0.8],
  whiteboardStand: [1.8, 0.6, 1.9],
  boxes: [1.1, 0.95, 1.0],
  serverRack: [0.75, 0.85, 1.75],
  fridge: [0.75, 0.75, 1.5],
  vending: [1.0, 0.85, 1.85],
  trolley: [0.85, 0.6, 1.0],
  recycle: [1.35, 0.5, 0.75],
  loungeSet: [2.9, 2.5, 0.9],
  credenza: [1.9, 0.55, 0.9],
};

/** furniture tall enough to hide posters / boards behind it */
const BLOCKS_WALL = new Set<PropKind>(['bookshelf', 'vending', 'serverRack', 'fridge', 'coffee', 'cooler', 'fishtank', 'sink']);

const ITEM_KINDS: DeskDecor[] = [
  'mug', 'plant', 'notes', 'lamp', 'pencils', 'donut', 'books', 'cactus', 'phone', 'photo', 'papers', 'bottle', 'notepad', 'headphones', 'tissue', 'stapler',
];

// ------------------------------------------------------------------ oriented rectangles
interface OR {
  x: number;
  z: number;
  w: number;
  d: number;
  /** local +z axis = (sin rot, cos rot) */
  rot: number;
}

export const rot2 = (lx: number, lz: number, rot: number): V2 => ({ x: lx * Math.cos(rot) + lz * Math.sin(rot), z: -lx * Math.sin(rot) + lz * Math.cos(rot) });

function corners(r: OR): V2[] {
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([a, b]) => {
    const p = rot2((a * r.w) / 2, (b * r.d) / 2, r.rot);
    return { x: r.x + p.x, z: r.z + p.z };
  });
}

function overlapOR(a: OR, b: OR, pad = 0): boolean {
  const A = { ...a, w: a.w + pad * 2, d: a.d + pad * 2 };
  const B = { ...b, w: b.w + pad * 2, d: b.d + pad * 2 };
  const ca = corners(A);
  const cb = corners(B);
  for (const rc of [A, B]) {
    for (const axis of [rot2(1, 0, rc.rot), rot2(0, 1, rc.rot)]) {
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const p of ca) {
        const t = p.x * axis.x + p.z * axis.z;
        minA = Math.min(minA, t);
        maxA = Math.max(maxA, t);
      }
      for (const p of cb) {
        const t = p.x * axis.x + p.z * axis.z;
        minB = Math.min(minB, t);
        maxB = Math.max(maxB, t);
      }
      if (maxA < minB || maxB < minA) return false;
    }
  }
  return true;
}

function propRect(p: Prop): OR {
  const [w, d] = FOOT[p.kind];
  return { x: p.x, z: p.z, w, d, rot: p.rot };
}

interface RawDesk {
  x: number;
  z: number;
  rot: number;
  w: number;
  group: number;
  seatInGroup: number;
  groupSize: number;
}

export function buildLayout(seed: number, themeIndex: number): RoomLayout {
  const r = new Rng(seed);
  const theme = themeFor(themeIndex);
  const kind = r.weighted(KINDS.map((k) => [k, k.weight] as const));
  const seating: 'fan' | 'bench' = r.chance(0.55) ? 'fan' : 'bench';
  const W = kind.w;
  const D = kind.d;
  const wallHeight = 3.1;

  // ------------------------------------------------------------------ door
  const doorOnLeft = r.chance(0.68);
  const doorWidth = 1.5;
  const door: DoorSpec = doorOnLeft
    ? (() => {
        const z = D / 2 - r.range(2.3, 3.4);
        return {
          wall: 'left' as const, pos: z, width: doorWidth, height: 2.4,
          threshold: { x: -W / 2, z }, inside: { x: -W / 2 + 1.0, z }, outside: { x: -W / 2 - 2.7, z }, dir: { x: 1, z: 0 },
        };
      })()
    : (() => {
        const x = W / 2 - 1.7;
        return {
          wall: 'back' as const, pos: x, width: doorWidth, height: 2.4,
          threshold: { x, z: -D / 2 }, inside: { x, z: -D / 2 + 1.0 }, outside: { x, z: -D / 2 - 2.7 }, dir: { x: 0, z: 1 },
        };
      })();

  // -------------------------------------------------------------- director
  const dirX = doorOnLeft ? r.range(-0.6, 1.4) : r.range(-2.0, 0.2);
  const dirDeskZ = -D / 2 + 2.05;
  const director: DirectorSpec = {
    desk: { x: dirX, z: dirDeskZ },
    seat: { x: dirX, z: -D / 2 + 1.25 },
    approach: { x: dirX + 1.3, z: -D / 2 + 0.8 },
    approachSide: 1,
    laptop: { x: dirX, z: dirDeskZ - 0.16 },
    visitors: [
      { x: dirX, z: dirDeskZ + 1.15 },
      { x: dirX - 1.15, z: dirDeskZ + 1.15 },
      { x: dirX + 1.15, z: dirDeskZ + 1.15 },
    ],
    waiting: [
      { x: dirX, z: dirDeskZ + 2.1 },
      { x: dirX - 1.15, z: dirDeskZ + 2.1 },
      { x: dirX + 1.15, z: dirDeskZ + 2.1 },
    ],
  };
  const dirRect: OR = { x: dirX, z: dirDeskZ, w: 3.0, d: 1.2, rot: 0 };

  // ------------------------------------------------------------- staff desks
  // every desk faces the director; two seating styles keep rooms from looking alike
  const xmL = door.wall === 'left' ? 2.7 : 1.5;
  const xmR = door.wall === 'back' ? 2.7 : 1.5;
  const deskORs = (d: RawDesk): OR[] => {
    const seat = rot2(0, -0.72, d.rot);
    return [
      { x: d.x, z: d.z, w: d.w, d: DESK_D, rot: d.rot },
      { x: d.x + seat.x, z: d.z + seat.z, w: 0.8, d: 0.8, rot: d.rot },
    ];
  };
  const inBounds = (d: RawDesk) => {
    for (const rc of deskORs(d)) {
      for (const c of corners(rc)) {
        if (c.x < -W / 2 + xmL || c.x > W / 2 - xmR || c.z > D / 2 - 1.5 || c.z < dirDeskZ + (Math.abs(c.x - dirX) > 3.4 ? 0.5 : 1.9)) return false;
      }
    }
    return true;
  };
  const raw: RawDesk[] = [];
  const visitorArea: OR = { x: dirX, z: dirDeskZ + 1.6, w: 3.6, d: 2.4, rot: 0 };
  const fits = (d: RawDesk) => {
    if (!inBounds(d)) return false;
    const mine = deskORs(d);
    for (const o of raw) {
      if (o.group === d.group && o.seatInGroup !== d.seatInGroup) continue; // seats of one bench touch
      for (const a of mine) for (const b of deskORs(o)) if (overlapOR(a, b, 0.06)) return false;
    }
    return !overlapOR(visitorArea, mine[0], 0.1);
  };

  if (seating === 'fan') {
    const r0 = r.range(4.2, 4.8);
    const ringGap = r.range(3.0, 3.35);
    let group = 0;
    for (let i = 0; i < kind.arcs; i++) {
      const rad = r0 + i * ringGap;
      const gap = r.range(0.4, 0.75);
      const step = (1.9 + gap) / (rad - 0.5);
      const a0 = r.range(-0.1, 0.1) + (i % 2 ? step / 2 : 0);
      for (let k = -8; k <= 8; k++) {
        const a = a0 + k * step + r.range(-0.04, 0.04);
        if (Math.abs(a) > 1.4) continue;
        const rr = rad + r.range(-0.15, 0.15);
        const d: RawDesk = {
          x: dirX + rr * Math.sin(a),
          z: dirDeskZ + rr * Math.cos(a),
          rot: a + Math.PI + r.range(-0.05, 0.05),
          w: r.pick([1.7, 1.9, 1.9, 2.1]),
          group: group++,
          seatInGroup: 0,
          groupSize: 1,
        };
        if (raw.length < DESK_CANDIDATES && fits(d) && !r.chance(0.06)) raw.push(d);
      }
    }
  } else {
    let group = 0;
    const rowGap = 3.2;
    for (let i = 0; i < kind.rows; i++) {
      const z = dirDeskZ + 4.4 + i * rowGap + r.range(-0.12, 0.12);
      let x = -W / 2 + xmL + r.range(0.2, 1.4) + (i % 2) * r.range(0.4, 1.2);
      while (x < W / 2 - xmR) {
        const size = r.pick([2, 2, 3, 3, 4]);
        for (let s = 0; s < size; s++) {
          const w = 1.9;
          const d: RawDesk = { x: x + w / 2, z, rot: Math.PI, w, group, seatInGroup: s, groupSize: size };
          x += w + 0.02;
          if (raw.length < DESK_CANDIDATES && fits(d)) raw.push(d);
        }
        group++;
        x += r.range(1.3, 1.9);
      }
    }
  }
  // fall back to a plain grid facing the director if the random layout came out too small
  if (raw.length < MAX_DESKS) {
    raw.length = 0;
    const x0 = -W / 2 + xmL + 1.05;
    const x1 = W / 2 - xmR - 1.05;
    const cols = Math.max(1, Math.floor((x1 - x0) / 3) + 1);
    const left = (x0 + x1) / 2 - ((cols - 1) * 3) / 2;
    for (let i = 0; i < 3; i++) {
      for (let c = 0; c < cols; c++) {
        const d: RawDesk = { x: left + c * 3, z: dirDeskZ + 4.6 + i * 3.2, rot: Math.PI, w: 1.9, group: i * 8 + c, seatInGroup: 0, groupSize: 1 };
        if (fits(d)) raw.push(d);
      }
    }
  }

  // room for exactly MAX_DESKS staff: keep the seats that face the director best
  if (raw.length > MAX_DESKS) {
    const score = (d: RawDesk) => Math.abs(Math.atan2(d.x - dirX, d.z - dirDeskZ)) * 2.2 + Math.hypot(d.x - dirX, d.z - dirDeskZ) * 0.12;
    raw.sort((a, b) => score(a) - score(b));
    raw.length = MAX_DESKS;
    if (seating === 'bench') {
      // benches lost some seats: renumber them so dividers only stand between neighbours
      raw.sort((a, b) => Math.round(a.z * 2) - Math.round(b.z * 2) || a.x - b.x);
      let g = -1;
      raw.forEach((d, i) => {
        const prev = raw[i - 1];
        if (!(prev && Math.abs(prev.z - d.z) < 0.3 && d.x - prev.x < d.w + 0.15)) g++;
        d.group = g;
      });
      for (const d of raw) {
        const mates = raw.filter((o) => o.group === d.group);
        d.groupSize = mates.length;
        d.seatInGroup = mates.indexOf(d);
      }
    }
  }

  // --------------------------------------------------- finalise desks (+ nav for approach sides)
  const colors = [theme.accent, theme.accent2, theme.accent3, theme.desk];
  const chairColors = [theme.chair, theme.accent, theme.accent2, theme.accent3, '#4b4f63', '#8a93a8'];
  const desks: DeskSlot[] = [];
  const baseNav = new NavGrid(W, D);
  baseNav.blockBorder(0.2);
  for (const d of raw) {
    baseNav.blockOriented(d.x, d.z, d.w, DESK_D, d.rot, 0.22);
    const s = rot2(0, -0.72, d.rot);
    baseNav.blockOriented(d.x + s.x, d.z + s.z, 0.6, 0.6, d.rot, 0.16);
  }
  baseNav.blockRect({ x: dirX, z: dirDeskZ, w: 3.0, d: 1.2 }, 0.22);
  baseNav.blockRect({ x: director.seat.x, z: director.seat.z, w: 0.7, d: 0.7 }, 0.12);
  const itemSpots: [number, number][] = [[-0.72, 0.14], [-0.72, -0.3], [-0.46, 0.36], [0.72, 0.14], [0.72, -0.3], [0.46, 0.36], [0, 0.38]];
  const groupColor = new Map<number, string>();
  for (const d of raw) {
    const f = rot2(0, 1, d.rot);
    const lat = rot2(1, 0, d.rot);
    const seat = { x: d.x - f.x * 0.72, z: d.z - f.z * 0.72 };
    let best: { side: number; p: V2; len: number } | null = null;
    for (const side of [1, -1]) {
      const p = { x: seat.x + lat.x * side * 0.98 - f.x * 0.26, z: seat.z + lat.z * side * 0.98 - f.z * 0.26 };
      if (baseNav.isBlocked(p.x, p.z)) continue;
      const path = baseNav.findPath(door.inside, p);
      if (!path) continue;
      let len = 0;
      let prev: V2 = door.inside;
      for (const q of path) {
        len += Math.hypot(q.x - prev.x, q.z - prev.z);
        prev = q;
      }
      if (!best || len < best.len) best = { side, p, len };
    }
    if (!best) continue; // unreachable seat – skip the desk
    const inset = d.w / 1.9;
    const items: DeskItem[] = [];
    const used = new Set<DeskDecor>();
    for (const [sx, sz] of r.shuffle(itemSpots).slice(0, r.int(3, 5))) {
      let it = r.pick(ITEM_KINDS);
      for (let t = 0; t < 6 && used.has(it); t++) it = r.pick(ITEM_KINDS);
      used.add(it);
      items.push({ kind: it, x: sx * inset + r.range(-0.05, 0.05), z: sz + r.range(-0.04, 0.04), rot: r.range(-0.7, 0.7) });
    }
    let color = r.pick(colors);
    if (seating === 'bench') {
      // benches share one colour so they read as a single long desk
      if (!groupColor.has(d.group)) groupColor.set(d.group, color);
      color = groupColor.get(d.group)!;
    }
    desks.push({
      index: desks.length,
      x: d.x, z: d.z, rot: d.rot, w: d.w,
      seat, approach: best.p, approachSide: best.side,
      // dead centre in front of the seated worker so the typing hands sit right on the keyboard
      laptop: { x: d.x - f.x * 0.14, z: d.z - f.z * 0.14 },
      color,
      items,
      chairColor: r.pick(chairColors),
      chairTurn: r.range(-0.7, 0.7),
      partition: seating === 'bench' && d.seatInGroup < d.groupSize - 1,
      drawerSide: r.chance(0.5) ? 1 : -1,
    });
  }

  // --------------------------------------------------------------- windows
  const windows: WindowSpec[] = [];
  // which sash stands open (left or right) is random per window; own generator so the rest of the room is unaffected
  const sideRng = new Rng((seed ^ 0x5bd1e995) >>> 0);
  const sideOf = (): 1 | -1 => (sideRng.chance(0.5) ? 1 : -1);
  const winCount = r.pick([2, 3, 3]);
  const winW = 2.3;
  const backWinX = winCount === 2 ? [dirX - 3.6, dirX + 3.6] : [dirX - 4.9, dirX, dirX + 4.9];
  for (const x of backWinX) {
    if (Math.abs(x) > W / 2 - 1.6) continue;
    if (door.wall === 'back' && Math.abs(x - door.pos) < 2.4) continue;
    windows.push({ wall: 'back', pos: x, w: winW, h: 1.6, sill: 1.05, curtain: r.chance(0.7), panes: r.pick([2, 4, 4] as const), openSide: sideOf() });
  }
  for (const z of [-D / 2 + 3.4, -D / 2 + 7.0]) {
    if (z > D / 2 - 1.6) continue;
    if (door.wall === 'left' && Math.abs(z - door.pos) < 2.3) continue;
    if (r.chance(0.85)) windows.push({ wall: 'left', pos: z, w: winW, h: 1.6, sill: 1.05, curtain: r.chance(0.6), panes: r.pick([2, 4] as const), openSide: sideOf() });
  }
  // a room never has all of its windows open on the same side
  if (windows.length > 1 && windows.every((w) => w.openSide === windows[0].openSide)) {
    windows[windows.length - 1].openSide = (windows[windows.length - 1].openSide * -1) as 1 | -1;
  }

  // ----------------------------------------------------------------- props
  const props: Prop[] = [];
  const placed: OR[] = [];
  const colorsAll = [theme.accent, theme.accent2, theme.accent3, theme.desk];
  const reserved: OR[] = [
    ...desks.flatMap((d) => [
      { x: d.x, z: d.z, w: d.w + 0.5, d: DESK_D + 0.5, rot: d.rot },
      { x: d.x + (d.seat.x - d.x) * 1.5, z: d.z + (d.seat.z - d.z) * 1.5, w: 1.5, d: 1.7, rot: d.rot },
    ]),
    { x: dirX, z: dirDeskZ, w: 4.4, d: 3.2, rot: 0 },
    { x: dirX + 1.3, z: -D / 2 + 0.85, w: 1.8, d: 1.4, rot: 0 },
    { x: dirX, z: dirDeskZ + 1.7, w: 3.8, d: 2.6, rot: 0 },
    door.wall === 'left'
      ? { x: -W / 2 + 1.7, z: door.pos, w: 3.4, d: 2.8, rot: 0 }
      : { x: door.pos, z: -D / 2 + 1.7, w: 2.8, d: 3.4, rot: 0 },
  ];
  // keep the floor under every window free so the office cats can hop in and out
  for (const wn of windows) {
    reserved.push(wn.wall === 'back' ? { x: wn.pos, z: -D / 2 + 0.95, w: 1.5, d: 1.9, rot: 0 } : { x: -W / 2 + 0.95, z: wn.pos, w: 1.9, d: 1.5, rot: 0 });
  }
  const add = (kindName: PropKind, x: number, z: number, rot: number, pad = 0.18): boolean => {
    const p: Prop = { kind: kindName, x, z, rot, variant: r.int(0, 3), color: r.pick(colorsAll), color2: r.pick(colorsAll) };
    const rect = propRect(p);
    for (const c of corners(rect)) if (c.x < -W / 2 + 0.05 || c.x > W / 2 - 0.05 || c.z < -D / 2 + 0.05 || c.z > D / 2 - 0.05) return false;
    if (reserved.some((q) => overlapOR(rect, q))) return false;
    if (placed.some((q) => overlapOR(rect, q, pad))) return false;
    placed.push(rect);
    props.push(p);
    return true;
  };

  /** try to put a prop against a wall (front faces into the room) */
  const tryWall = (k: PropKind, walls: ('back' | 'left' | 'right' | 'front')[] = ['back', 'left', 'right']): boolean => {
    const [w, d] = FOOT[k];
    for (let t = 0; t < 26; t++) {
      const wall = r.pick(walls);
      if (wall === 'back') {
        if (add(k, r.range(-W / 2 + w / 2 + 0.3, W / 2 - w / 2 - 0.3), -D / 2 + d / 2 + 0.06, 0)) return true;
      } else if (wall === 'left') {
        if (add(k, -W / 2 + d / 2 + 0.06, r.range(-D / 2 + w / 2 + 0.4, D / 2 - w / 2 - 0.4), Math.PI / 2)) return true;
      } else if (wall === 'right') {
        if (add(k, W / 2 - d / 2 - 0.05, r.range(-D / 2 + w / 2 + 0.4, D / 2 - w / 2 - 0.4), -Math.PI / 2)) return true;
      } else if (add(k, r.range(-W / 2 + w / 2 + 0.5, W / 2 - w / 2 - 0.5), D / 2 - d / 2 - 0.05, Math.PI)) return true;
    }
    return false;
  };
  /** try to put a prop somewhere on the open floor */
  const tryFloor = (k: PropKind, rots: number[] = [0, Math.PI / 2, Math.PI, -Math.PI / 2]): boolean => {
    for (let t = 0; t < 40; t++) {
      if (add(k, r.range(-W / 2 + 1.4, W / 2 - 1.4), r.range(dirDeskZ + 2.6, D / 2 - 1.0), r.pick(rots), 0.3)) return true;
    }
    return false;
  };

  if (door.wall === 'left') add('coatRack', -W / 2 + 0.45, door.pos - 1.5, Math.PI / 2);
  else add('coatRack', door.pos - 1.5, -D / 2 + 0.45, 0);

  // big, characterful pieces first
  const lounge = r.pick(['loungeSet', 'meetingSet', 'both', 'meetingSet'] as const);
  if (lounge !== 'meetingSet') tryFloor('loungeSet', [0, Math.PI / 2, -Math.PI / 2]);
  if (lounge !== 'loungeSet') tryFloor('meetingSet', [0, Math.PI / 4]);
  const wallWants: PropKind[] = [
    'coffee', 'copier', 'bookshelf', 'bookshelf', 'fridge', 'cooler', 'fileCabinet', 'fileCabinet', 'fileCabinet',
    ...(r.chance(0.6) ? (['serverRack'] as PropKind[]) : []),
    ...(r.chance(0.55) ? (['vending'] as PropKind[]) : []),
    ...(r.chance(0.5) ? (['credenza'] as PropKind[]) : []),
    ...(r.chance(0.5) ? (['fishtank'] as PropKind[]) : []),
    ...(r.chance(0.5) ? (['recycle'] as PropKind[]) : []),
    ...(r.chance(0.85) ? (['sink'] as PropKind[]) : []),
    ...(r.chance(0.4) ? (['printer'] as PropKind[]) : []),
  ];
  for (const k of r.shuffle(wallWants)) tryWall(k);
  const floorWants: PropKind[] = ['whiteboardStand', 'boxes', ...(r.chance(0.6) ? (['boxes'] as PropKind[]) : []), 'trolley', ...(r.chance(0.5) ? (['beanbag'] as PropKind[]) : [])];
  for (const k of floorWants) tryFloor(k);
  const small: PropKind[] = ['tallPlant', 'tallPlant', 'plant', 'plant', 'plant', 'cactus', 'floorLamp', 'floorLamp', 'bin', 'bin', 'bin'];
  for (const k of r.shuffle(small)) {
    if (!tryWall(k, ['back', 'left', 'right', 'front'])) tryFloor(k, [0]);
  }

  // ----------------------------------------------------------- wall decor
  const wallDecor: WallDecor[] = [];
  // intervals along each wall that tall furniture / windows / the door already use
  const busy: Record<'back' | 'left', [number, number][]> = { back: [], left: [] };
  for (const wn of windows) busy[wn.wall].push([wn.pos - wn.w / 2 - 0.3, wn.pos + wn.w / 2 + 0.3]);
  busy[door.wall].push([door.pos - doorWidth / 2 - 0.4, door.pos + doorWidth / 2 + 0.4]);
  for (const p of props) {
    if (!BLOCKS_WALL.has(p.kind)) continue;
    const cs = corners(propRect(p));
    const xs = cs.map((c) => c.x);
    const zs = cs.map((c) => c.z);
    if (Math.min(...zs) < -D / 2 + 1.0) busy.back.push([Math.min(...xs) - 0.2, Math.max(...xs) + 0.2]);
    if (Math.min(...xs) < -W / 2 + 1.0) busy.left.push([Math.min(...zs) - 0.2, Math.max(...zs) + 0.2]);
  }
  const isFree = (wall: 'back' | 'left', pos: number, w: number) =>
    !busy[wall].some(([a, b]) => pos + w / 2 > a && pos - w / 2 < b) &&
    (wall === 'back' ? pos - w / 2 > -W / 2 + 0.4 && pos + w / 2 < W / 2 - 0.4 : pos - w / 2 > -D / 2 + 0.4 && pos + w / 2 < D / 2 - 0.4);
  let signPos: RoomLayout['signPos'] = null;
  if (isFree('back', dirX, 3.4)) {
    signPos = { wall: 'back', pos: dirX, y: windows.filter((w) => w.wall === 'back').length === 3 ? 2.62 : 2.4 };
    busy.back.push([dirX - 1.7, dirX + 1.7]);
  }
  const DECOR: { kind: WallDecorKind; w: number; h: number; y: number; weight: number }[] = [
    { kind: 'tv', w: 2.2, h: 1.25, y: 1.9, weight: 1.2 },
    { kind: 'kanban', w: 2.4, h: 1.4, y: 1.8, weight: 1.6 },
    { kind: 'cork', w: 1.5, h: 1.05, y: 1.75, weight: 1.6 },
    { kind: 'calendar', w: 0.7, h: 0.95, y: 1.75, weight: 1 },
    { kind: 'motto', w: 1.7, h: 0.6, y: 2.25, weight: 1.2 },
    { kind: 'whiteboard', w: 2.4, h: 1.4, y: 1.85, weight: 1 },
    { kind: 'poster', w: 1.0, h: 1.3, y: 1.8, weight: 1.6 },
    { kind: 'frame', w: 1.2, h: 0.9, y: 1.85, weight: 1 },
    { kind: 'clock', w: 0.7, h: 0.7, y: 2.4, weight: 0.9 },
    { kind: 'pennant', w: 0.8, h: 1.0, y: 1.8, weight: 0.7 },
    { kind: 'shelf', w: 1.5, h: 0.2, y: 1.95, weight: 0.8 },
  ];
  const usedKinds = new Map<WallDecorKind, number>();
  for (let t = 0; t < 300 && wallDecor.length < 9; t++) {
    const dcr = r.weighted(DECOR.map((x) => [x, x.weight / (1 + (usedKinds.get(x.kind) ?? 0) * 1.5)] as const));
    const wall = r.chance(0.6) ? 'back' : 'left';
    const len = wall === 'back' ? W : D;
    const pos = r.range(-len / 2 + dcr.w / 2 + 0.5, len / 2 - dcr.w / 2 - 0.5);
    if (!isFree(wall, pos, dcr.w)) continue;
    busy[wall].push([pos - dcr.w / 2 - 0.1, pos + dcr.w / 2 + 0.1]);
    usedKinds.set(dcr.kind, (usedKinds.get(dcr.kind) ?? 0) + 1);
    wallDecor.push({ kind: dcr.kind, wall, pos, y: dcr.y, w: dcr.w, h: dcr.h, color: r.pick(colorsAll), color2: r.pick(colorsAll), variant: r.int(0, 3) });
  }

  // wall lights: they glow when the room lights come on
  for (let t = 0, n = 0; t < 80 && n < 4; t++) {
    const wall = r.chance(0.55) ? 'back' : 'left';
    const len = wall === 'back' ? W : D;
    const pos = r.range(-len / 2 + 1, len / 2 - 1);
    if (!isFree(wall, pos, 0.6)) continue;
    busy[wall].push([pos - 0.3, pos + 0.3]);
    wallDecor.push({ kind: 'sconce', wall, pos, y: 2.3, w: 0.3, h: 0.4, color: r.pick(colorsAll), color2: '#ffe8a8', variant: 0 });
    n++;
  }

  // ------------------------------------------------------------------- rug
  const rug = r.chance(0.85)
    ? r.chance(0.5)
      ? { x: dirX, z: dirDeskZ + 0.5, w: 4.6, d: 3.4, shape: 'rect' as const, color: theme.rug, color2: theme.accent3 }
      : { x: dirX, z: dirDeskZ + 0.6, w: 4.2, d: 4.2, shape: 'round' as const, color: theme.rug, color2: theme.accent }
    : null;

  // ------------------------------------------------------------- nav grid
  const buildNav = (list: Prop[]) => {
    const nav = new NavGrid(W, D);
    nav.blockBorder(0.2);
    for (const d of desks) {
      nav.blockOriented(d.x, d.z, d.w, DESK_D, d.rot, 0.22);
      nav.blockOriented(d.seat.x, d.seat.z, 0.6, 0.6, d.rot, 0.16);
    }
    nav.blockRect(dirRect, 0.22);
    nav.blockRect({ x: director.seat.x, z: director.seat.z, w: 0.7, d: 0.7 }, 0.12);
    for (const p of list) {
      const [w, d] = FOOT[p.kind];
      nav.blockOriented(p.x, p.z, w, d, p.rot, 0.2);
    }
    return nav;
  };
  // make sure everything is reachable; drop props (last placed first) until it is
  let nav = buildNav(props);
  const targets = [...desks.map((d) => d.approach), director.approach, ...director.visitors, ...director.waiting];
  const reachable = (n: NavGrid) => targets.every((t) => n.findPath(door.inside, t));
  while (!reachable(nav) && props.length) {
    props.pop();
    nav = buildNav(props);
  }

  // ---------------------------------------------------------- floor clutter
  const decals: FloorDecal[] = [];
  const decalKinds: DecalKind[] = ['paper', 'paper', 'paper', 'ball', 'ball', 'sticky', 'stain', 'pen'];
  for (let t = 0; t < 120 && decals.length < 20; t++) {
    const x = r.range(-W / 2 + 0.8, W / 2 - 0.8);
    const z = r.range(-D / 2 + 0.8, D / 2 - 0.8);
    if (nav.isBlocked(x, z)) continue;
    if (Math.hypot(x - door.inside.x, z - door.inside.z) < 1.6) continue;
    const k = r.pick(decalKinds);
    decals.push({ kind: k, x, z, rot: r.range(0, Math.PI * 2), color: k === 'sticky' ? r.pick(colorsAll) : k === 'stain' ? '#8a5a3a' : k === 'cable' ? '#3a3d50' : '#ffffff', size: r.range(0.7, 1.2) });
  }

  // ------------------------------------------- cats: windows they can use, places to nap
  const WT = 0.28;
  const catWindows: CatWindow[] = [];
  windows.forEach((wn, index) => {
    const back = wn.wall === 'back';
    const pt = (d: number, lat = 0): V2 => (back ? { x: wn.pos + lat, z: -D / 2 + d } : { x: -W / 2 + d, z: wn.pos + lat });
    // the cats go through the open sash: its centre is 0.59 off the window's centre (wall x runs along room -z on the left wall)
    const wl = (back ? 1 : -1) * wn.openSide * 0.59;
    for (const [d, lat] of [[0.55, 0], [1.0, 0], [1.0, 0.4], [1.0, -0.4]] as const) if (nav.isBlocked(pt(d, wl + lat).x, pt(d, wl + lat).z)) return;
    catWindows.push({ index, wall: wn.wall, out: pt(-(WT + 0.4), wl), sill: pt(0.12, wl), land: pt(1.0, wl), yaw: back ? 0 : Math.PI / 2, sillY: wn.sill - 0.1 });
  });
  const freeNear = (p: V2): V2 | null => {
    if (!nav.isBlocked(p.x, p.z)) return p;
    for (let rr = 0.25; rr <= 0.9; rr += 0.25) {
      for (let a = 0; a < 8; a++) {
        const q = { x: p.x + Math.cos((a / 8) * Math.PI * 2) * rr, z: p.z + Math.sin((a / 8) * Math.PI * 2) * rr };
        if (!nav.isBlocked(q.x, q.z)) return q;
      }
    }
    return null;
  };
  const spots: Spot[] = [];
  for (const p of props) {
    // [seat x, seat z, seat height, approach x, approach z] in prop-local coordinates
    const seats: [number, number, number, number, number][] =
      p.kind === 'sofa' ? [[-0.45, 0.06, 0.47, -0.45, 0.98], [0.45, 0.06, 0.47, 0.45, 0.98]]
      : p.kind === 'loungeSet' ? [[-0.45, -0.69, 0.47, -1.95, -0.69], [0.45, -0.69, 0.47, 1.95, -0.69]]
      : p.kind === 'armchair' ? [[0, 0.06, 0.47, 0, 0.98]]
      : p.kind === 'beanbag' ? [[0, 0.05, 0.6, 0, 0.95]]
      : [];
    for (const [lx, lz, y, ax, az] of seats) {
      const c = rot2(lx, lz, p.rot);
      const ap = rot2(ax, az, p.rot);
      const a = freeNear({ x: p.x + ap.x, z: p.z + ap.z });
      if (a) spots.push({ kind: (p.kind === 'loungeSet' ? 'sofa' : p.kind) as Spot['kind'], x: p.x + c.x, z: p.z + c.z, y, yaw: p.rot, approach: a });
    }
  }
  spots.push({ kind: 'desk', x: dirX + 0.5, z: dirDeskZ + 0.12, y: 0.76, yaw: 0, approach: director.visitors[2] });
  for (const cw of catWindows) {
    if (cw.wall !== 'back') continue;
    const sx = windows[cw.index].pos + 0.75;
    const a = freeNear({ x: sx, z: -D / 2 + 1.9 });
    if (a) spots.push({ kind: 'sun', x: a.x, z: a.z, y: 0.03, yaw: r.range(0, Math.PI * 2), approach: a });
  }
  const catCount = catWindows.length ? (r.chance(0.5) ? 2 : 1) : 0;

  // ------------- things to do when there is time: get a drink, read a book, watch the fish, wash, water the plants
  const stations: Station[] = [];
  const stationOf: Partial<Record<PropKind, [StationKind, number]>> = {
    cooler: ['drink', 0.5], coffee: ['drink', 0.5], bookshelf: ['read', 0.5], fishtank: ['fish', 0.55], sink: ['wash', 0.36],
    plant: ['water', 0.5], tallPlant: ['water', 0.55], cactus: ['water', 0.5],
  };
  const perKind = new Map<StationKind, number>();
  for (const pr of props) {
    const info = stationOf[pr.kind];
    if (!info) continue;
    const [kindSt, gap] = info;
    if ((perKind.get(kindSt) ?? 0) >= (kindSt === 'water' ? 3 : 2)) continue;
    const [fw, fd] = FOOT[pr.kind];
    const options: V2[] = [];
    if (kindSt === 'water') {
      // any side of a plant will do: prefer the one that faces the middle of the room
      const rad = Math.max(fw, fd) / 2 + gap;
      for (let k = 0; k < 4; k++) options.push({ x: pr.x + Math.cos((k * Math.PI) / 2) * rad, z: pr.z + Math.sin((k * Math.PI) / 2) * rad });
      options.sort((a, b) => Math.hypot(a.x, a.z - 1) - Math.hypot(b.x, b.z - 1));
    } else {
      const lat = pr.kind === 'coffee' ? -0.5 : pr.kind === 'bookshelf' ? r.range(-0.6, 0.6) : 0;
      for (const extra of [0, 0.15, 0.3]) {
        const o = rot2(lat, fd / 2 + gap + extra, pr.rot);
        options.push({ x: pr.x + o.x, z: pr.z + o.z });
      }
    }
    const stand = options.find((o) => Math.abs(o.x) < W / 2 - 0.5 && Math.abs(o.z) < D / 2 - 0.5 && !nav.isBlocked(o.x, o.z) && nav.findPath(door.inside, o));
    if (!stand) continue;
    const st: Station = {
      kind: kindSt, prop: pr.kind, stand, target: { x: pr.x, z: pr.z },
      yaw: kindSt === 'water' ? Math.atan2(pr.x - stand.x, pr.z - stand.z) : pr.rot + Math.PI,
    };
    if (pr.kind === 'sink') {
      const t = rot2(0, -0.06, pr.rot);
      st.tap = { x: pr.x + t.x, z: pr.z + t.z };
    }
    stations.push(st);
    perKind.set(kindSt, (perKind.get(kindSt) ?? 0) + 1);
  }

  return {
    seed, kind: kind.name, seating, width: W, depth: D, wallHeight, theme, door, windows, desks, director, props, wallDecor, decals, rug, signPos, catWindows, spots, stations, catCount, nav,
    fitDistance: Math.hypot(W, D) * 1.2 + 3.5,
  };
}

const cache = new Map<string, RoomLayout>();
export function getLayout(seed: number, themeIndex: number): RoomLayout {
  const key = `${seed}:${themeIndex}`;
  let l = cache.get(key);
  if (!l) {
    l = buildLayout(seed, themeIndex);
    cache.set(key, l);
    if (cache.size > 40) cache.delete(cache.keys().next().value!);
  }
  return l;
}

export const DESK_DEPTH = DESK_D;
