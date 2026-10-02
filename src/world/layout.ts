import { Rng } from '../util/rng';
import { NavGrid, V2 } from './nav';
import { RoomTheme, themeFor } from './palettes';

export type PropKind =
  | 'bookshelf' | 'plant' | 'tallPlant' | 'cactus' | 'cooler' | 'coffee' | 'sofa' | 'beanbag' | 'floorLamp'
  | 'printer' | 'bin' | 'fishtank' | 'coatRack' | 'armchair'
  | 'fileCabinet' | 'copier' | 'meetingSet' | 'whiteboardStand' | 'boxes' | 'serverRack' | 'fridge' | 'vending'
  | 'trolley' | 'recycle' | 'loungeSet' | 'credenza' | 'sink' | 'stove' | 'punchDummy' | 'dumbbells' | 'toilet';

export interface Prop {
  kind: PropKind;
  x: number;
  z: number;
  rot: number;
  variant: number;
  color: string;
  color2: string;
}

export type WallDecorKind = 'poster' | 'clock' | 'whiteboard' | 'worldmap' | 'slogan' | 'pennant' | 'shelf' | 'tv' | 'cork' | 'kanban' | 'calendar' | 'motto' | 'sconce';
export interface WallDecor {
  kind: WallDecorKind;
  wall: 'back' | 'left';
  pos: number;
  y: number;
  w: number;
  h: number;
  /** a round picture (w is its diameter) */
  round?: boolean;
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

/** straight = the plain desk; L / U = extra wings (a return on one side, a pair of side wings); oval = rounded top; hutch = a pinboard shelf at the far edge */
export type DeskShape = 'straight' | 'L' | 'U' | 'oval' | 'hutch';

/** An extra piece of desktop (desk-local centre: x across, z towards the director; the worker sits at z = -0.72). */
export interface DeskWing {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface DeskSlot {
  index: number;
  shape: DeskShape;
  wings: DeskWing[];
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
export type StationKind = 'drink' | 'read' | 'fish' | 'wash' | 'water' | 'cook' | 'box' | 'lift' | 'fridge';

/** A spot in front of something (water cooler, bookshelf, fish tank, sink, plant) where a person can spend a moment. */
export interface Station {
  kind: StationKind;
  prop: PropKind;
  /** index into `props` of the thing it is at; `off` while that thing has not been delivered yet (see RoomLayout.late) */
  propIdx: number;
  off?: boolean;
  /** where the person stands */
  stand: V2;
  /** yaw while standing there (looking at the thing) */
  yaw: number;
  /** the thing itself (floor position) */
  target: V2;
  /** sink: where the water comes out of the tap */
  tap?: V2;
  /** stove: the pan on the hob (floor position) */
  pan?: V2;
}

/** Things for the cats: a cardboard box to curl up in (also a `Spot`), a scratching post, a ball of yarn and a toy mouse that get batted around. */
export interface Toy {
  kind: 'box' | 'post' | 'yarn' | 'mouse';
  x: number;
  z: number;
  rot: number;
  /** floor position cats stand at to use it (box / post) */
  approach?: V2;
}

/** Places to sit / lie down: sofas, beanbags, the director's desk, a patch of sun. */
export interface Spot {
  /** index into `props` of the furniture it belongs to; `off` while that has not been delivered yet (see RoomLayout.late) */
  propIdx?: number;
  off?: boolean;
  kind: 'sofa' | 'armchair' | 'beanbag' | 'desk' | 'sun' | 'box' | 'toilet' | 'chair';
  x: number;
  z: number;
  y: number;
  yaw: number;
  approach: V2;
  /** chair: index into `tables` */
  table?: number;
}

/** The toilet cubicle in a back corner: low partitions, a door that swings, a tiled floor; the sink stands right next to it. */
export interface Restroom {
  /** the cubicle (world rectangle, axis aligned) */
  x: number;
  z: number;
  w: number;
  d: number;
  /** which back corner: the partitions stand on the side that faces the room */
  corner: 'backLeft' | 'backRight';
  /** the partition with the doorway runs along z = frontZ; the closed one along x = sideX */
  frontZ: number;
  sideX: number;
  /** doorway: centre x on the front partition and its width; the leaf swings about its hinge (x) */
  doorX: number;
  doorW: number;
  hingeX: number;
  /** index into `spots` of the toilet seat and into `stations` of the sink to wash at afterwards (-1: none) */
  spot: number;
  wash: number;
}

/** A round table with chairs round it (where people sit to drink, eat and talk). */
export interface TableSpec {
  x: number;
  z: number;
  /** indices into `spots` of the chairs */
  seats: number[];
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
  restroom: Restroom | null;
  tables: TableSpec[];
  toys: Toy[];
  /** indices into `props` of the plants and cartons that people carry to a tidier place (see sim/tidy.ts) */
  movable: number[];
  /**
   * A new room is sparse: most of its things (indices into `props`, in the order they were chosen to arrive) come by delivery, in a
   * parcel from the porch or in one of the cartons that stand in the room. `lateDone[k]`: the k-th of them is in the room now (see
   * commitDelivery in sim/registry.ts). Until then a late prop is not drawn, does not block the walking grid, and the stations and
   * seats that belong to it are `off`.
   */
  late: number[];
  /** per entry of `late`: arrives in a big parcel (a big thing) or a small one */
  lateBig: boolean[];
  /** per prop: its place in `late`, -1 when it was there from the start */
  lateRank: number[];
  lateDone: boolean[];
  /** the walking grid takes the prop in / lets it go (counted, like every other block) */
  blockProp: (idx: number) => void;
  unblockProp: (idx: number) => void;
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
/** the toilet cubicle in the back corner is this wide and deep */
const RESTROOM = 1.75;
/** the wall next to the cubicle that is kept free of windows for the sink (metres) */
const SINK_SPAN = 1.6;
/** the area in front of the cubicle door that nothing may stand in: half width and depth (metres) */
const APRON_HALF = 1.15;
const APRON_DEPTH = 1.9;
/** nothing hangs on the wall (decor, windows) this far beside the cubicle */
const WALL_CLEAR = 0.9;
/** is (x, z) in the walk-up area in front of the cubicle door? (exported for the tidy-up and the festive decorations) */
export function inRestroomApron(rr: Restroom, x: number, z: number, pad = 0): boolean {
  return Math.abs(x - rr.doorX) < APRON_HALF + pad && z > rr.frontZ - 0.05 - pad && z < rr.frontZ - 0.05 + APRON_DEPTH + pad;
}
/** round table: the chairs stand on a circle of this radius round the table's middle */
const TABLE_CHAIR_R = 1.18;
/** height of the chair seats of the round table */
const TABLE_SEAT_Y = 0.44;
/** one desk per possible staff member (the director has their own desk) */
export const MAX_DESKS = 6;
/** the random generators try for more than we need, then the best seats are kept */
const DESK_CANDIDATES = 14;
/** the big room offers more candidates so seats farther from the director make it into the choice */
const DESK_CANDIDATES_GRAND = 30;

/** footprint [width along the wall, depth, height] of every prop */
export const FOOT: Record<PropKind, [number, number, number]> = {
  bookshelf: [2.0, 0.6, 2.0],
  plant: [0.75, 0.75, 1.0],
  tallPlant: [0.95, 0.95, 1.7],
  cactus: [0.55, 0.55, 1.05],
  cooler: [0.6, 0.6, 1.45],
  coffee: [1.7, 0.65, 1.4],
  sink: [1.0, 0.55, 1.0],
  stove: [1.0, 0.6, 1.0],
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
  meetingSet: [3.0, 3.0, 0.8],
  whiteboardStand: [1.8, 0.6, 1.9],
  boxes: [1.1, 0.95, 1.0],
  serverRack: [0.75, 0.85, 1.75],
  fridge: [0.75, 0.75, 1.5],
  vending: [1.0, 0.85, 1.85],
  trolley: [0.85, 0.6, 1.0],
  recycle: [1.35, 0.5, 0.75],
  loungeSet: [2.9, 2.5, 0.9],
  credenza: [1.9, 0.55, 0.9],
  punchDummy: [0.62, 0.62, 1.7],
  dumbbells: [0.9, 0.5, 0.3],
  toilet: [0.62, 0.8, 0.8],
};

/** props taller than this stay on the back / left walls (the default camera looks at those from the front) */
const TALL_PROP = 1.1;

/** furniture tall enough to hide posters / boards behind it */
const BLOCKS_WALL = new Set<PropKind>(['bookshelf', 'vending', 'serverRack', 'fridge', 'coffee', 'cooler', 'fishtank', 'sink', 'stove']);

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
  // the door stays in the top corner (left wall, next to the back wall) or the right corner (back wall, next to the right wall) of the picture
  const doorOnLeft = r.chance(0.68);
  const doorWidth = 1.5;
  const door: DoorSpec = doorOnLeft
    ? (() => {
        const z = -D / 2 + r.range(1.8, 2.6);
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

  // ------------------------------------------------------- toilet cubicle
  // in the back corner the door does not use (the camera looks at the back and left walls from the front)
  const rrCorner: 'backLeft' | 'backRight' = door.wall === 'left' ? 'backRight' : 'backLeft';
  const rrSign = rrCorner === 'backRight' ? 1 : -1;
  const rrX = rrSign * (W / 2 - RESTROOM / 2);
  const rrZ = -D / 2 + RESTROOM / 2;
  const restRect: OR = { x: rrX, z: rrZ, w: RESTROOM, d: RESTROOM, rot: 0 };
  /** the stall plus the walk-up area in front of its doorway */
  const restZone: OR[] = [
    { x: rrX, z: rrZ, w: RESTROOM + 0.3, d: RESTROOM + 0.3, rot: 0 },
    { x: rrX, z: -D / 2 + RESTROOM + 0.9 - 0.05, w: 2 * APRON_HALF, d: APRON_DEPTH, rot: 0 },
  ];
  /** is (x, z) in the walk-up area in front of the cubicle door (where the door swings and people walk in and out)? */
  const inApron = (x: number, z: number, pad = 0) =>
    Math.abs(x - rrX) < APRON_HALF + pad && z > -D / 2 + RESTROOM - 0.05 - pad && z < -D / 2 + RESTROOM - 0.05 + APRON_DEPTH + pad;

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
  const orInBounds = (rc: OR) => {
    for (const c of corners(rc)) {
      if (c.x < -W / 2 + xmL || c.x > W / 2 - xmR || c.z > D / 2 - 1.5 || c.z < dirDeskZ + (Math.abs(c.x - dirX) > 3.4 ? 0.5 : 1.9)) return false;
    }
    return true;
  };
  const inBounds = (d: RawDesk) => {
    for (const rc of deskORs(d)) {
      if (!orInBounds(rc) || restZone.some((q) => overlapOR(rc, q))) return false;
    }
    return true;
  };
  const raw: RawDesk[] = [];
  const maxCandidates = kind.name === 'grand' ? DESK_CANDIDATES_GRAND : DESK_CANDIDATES;
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
        if (raw.length < maxCandidates && fits(d) && !r.chance(0.06)) raw.push(d);
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
          if (raw.length < maxCandidates && fits(d)) raw.push(d);
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
    if (kind.name === 'grand') {
      // spread the staff over the rows (two per row) instead of crowding the director: the front half of the big room stays lively
      const rowOf = (d: RawDesk) => Math.max(0, Math.min(kind.rows - 1, Math.floor(((seating === 'bench' ? d.z - dirDeskZ : Math.hypot(d.x - dirX, d.z - dirDeskZ)) - 3.3) / 3.2)));
      const quota = Math.ceil(MAX_DESKS / kind.rows);
      const taken = new Map<number, number>();
      const chosen: RawDesk[] = [];
      for (const d of raw) {
        const row = rowOf(d);
        if ((taken.get(row) ?? 0) >= quota) continue;
        taken.set(row, (taken.get(row) ?? 0) + 1);
        chosen.push(d);
      }
      for (const d of raw) if (chosen.length < MAX_DESKS && !chosen.includes(d)) chosen.push(d);
      raw.length = 0;
      raw.push(...chosen.slice(0, MAX_DESKS));
    }
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

  // ------------------------------------------------------------ desk shapes
  // own generator: the desks stand where they always stood, some of them just get an L or U shape, a rounded top or a pinboard shelf
  const shapeRng = new Rng((seed ^ 0x3c6ef372) >>> 0);
  interface ShapePlan {
    shape: DeskShape;
    wings: DeskWing[];
    /** L: the side (desk-local x sign) the return stands on */
    side: number;
  }
  const plans = new Map<RawDesk, ShapePlan>();
  const wingOR = (d: RawDesk, wg: DeskWing): OR => {
    const p = rot2(wg.x, wg.z, d.rot);
    return { x: d.x + p.x, z: d.z + p.z, w: wg.w, d: wg.d, rot: d.rot };
  };
  const seatBox = (d: RawDesk): OR => {
    const p = rot2(0, -0.72, d.rot);
    return { x: d.x + p.x, z: d.z + p.z, w: 0.6, d: 0.6, rot: d.rot };
  };
  {
    const taken: OR[] = [];
    for (const d of raw) {
      const kindOf = shapeRng.weighted([['straight', 3.4], ['L', 3.2], ['U', 1.8], ['oval', 1.5], ['hutch', 1.5]] as const);
      const divider = seating === 'bench' && d.seatInGroup < d.groupSize - 1;
      let wings: DeskWing[] = [];
      let side = 0;
      if (kindOf === 'L') {
        side = divider ? -1 : shapeRng.chance(0.5) ? 1 : -1;
        wings = [{ x: side * (d.w / 2 - 0.25), z: -0.875, w: 0.5, d: 0.75 }];
      } else if (kindOf === 'U' && !divider) {
        wings = [-1, 1].map((sd) => ({ x: sd * (d.w / 2 - 0.2), z: -0.7, w: 0.4, d: 0.4 }));
      }
      const ors = wings.map((wg) => wingOR(d, wg));
      const others = raw.filter((o) => o !== d).flatMap((o) => [...deskORs(o), seatBox(o)]);
      const ok = ors.every((o) => orInBounds(o) && !restZone.some((q) => overlapOR(o, q)) && !overlapOR(visitorArea, o, 0.1) && !others.some((q) => overlapOR(o, q, 0.04)) && !taken.some((q) => overlapOR(o, q, 0.04)));
      if (wings.length && !ok) {
        plans.set(d, { shape: 'straight', wings: [], side: 0 });
        continue;
      }
      taken.push(...ors);
      plans.set(d, { shape: wings.length ? (kindOf as DeskShape) : kindOf === 'U' || kindOf === 'L' ? 'straight' : (kindOf as DeskShape), wings, side });
    }
  }
  const baseNavFor = (): NavGrid => {
    const nv = new NavGrid(W, D);
    nv.blockBorder(0.2);
    for (const d of raw) {
      nv.blockOriented(d.x, d.z, d.w, DESK_D, d.rot, 0.22);
      const s = rot2(0, -0.72, d.rot);
      nv.blockOriented(d.x + s.x, d.z + s.z, 0.6, 0.6, d.rot, 0.16);
      for (const wg of plans.get(d)?.wings ?? []) {
        const o = wingOR(d, wg);
        nv.blockOriented(o.x, o.z, o.w, o.d, o.rot, 0.2);
      }
    }
    nv.blockRect({ x: dirX, z: dirDeskZ, w: 3.0, d: 1.2 }, 0.22);
    nv.blockRect({ x: director.seat.x, z: director.seat.z, w: 0.7, d: 0.7 }, 0.12);
    nv.blockRect(restRect, 0.02);
    return nv;
  };
  /** where the worker of `d` walks up to the chair from: the side with the shortest way from the door that is free */
  const findApproach = (nv: NavGrid, d: RawDesk): { side: number; p: V2; len: number } | null => {
    const f = rot2(0, 1, d.rot);
    const lat = rot2(1, 0, d.rot);
    const seat = { x: d.x - f.x * 0.72, z: d.z - f.z * 0.72 };
    let best: { side: number; p: V2; len: number } | null = null;
    for (const side of [1, -1]) {
      const back = plans.get(d)?.shape === 'U' ? 0.8 : 0.26;
      const p = { x: seat.x + lat.x * side * 0.98 - f.x * back, z: seat.z + lat.z * side * 0.98 - f.z * back };
      if (nv.isBlocked(p.x, p.z)) continue;
      const path = nv.findPath(door.inside, p);
      if (!path) continue;
      let len = 0;
      let prev: V2 = door.inside;
      for (const q of path) {
        len += Math.hypot(q.x - prev.x, q.z - prev.z);
        prev = q;
      }
      if (!best || len < best.len) best = { side, p, len };
    }
    return best;
  };
  // a desk with wings whose chair can no longer be reached (or that shuts in a neighbour) goes back to the plain shape
  for (let pass = 0; pass < 8; pass++) {
    const nv = baseNavFor();
    let changed = false;
    for (const d of raw) {
      if (findApproach(nv, d)) continue;
      const near = raw.filter((o) => Math.hypot(o.x - d.x, o.z - d.z) < 3.6 && plans.get(o)?.wings.length);
      for (const o of near) plans.set(o, { shape: 'straight', wings: [], side: 0 });
      if (near.length) changed = true;
    }
    if (!changed) break;
  }

  // --------------------------------------------------- finalise desks (+ nav for approach sides)
  const colors = [theme.accent, theme.accent2, theme.accent3, theme.desk];
  const chairColors = [theme.chair, theme.accent, theme.accent2, theme.accent3, '#4b4f63', '#8a93a8'];
  const desks: DeskSlot[] = [];
  const baseNav = baseNavFor();
  const itemSpots: [number, number][] = [[-0.72, 0.14], [-0.72, -0.3], [-0.46, 0.36], [0.72, 0.14], [0.72, -0.3], [0.46, 0.36], [0, 0.38]];
  const groupColor = new Map<number, string>();
  for (const d of raw) {
    const f = rot2(0, 1, d.rot);
    const seat = { x: d.x - f.x * 0.72, z: d.z - f.z * 0.72 };
    const best = findApproach(baseNav, d);
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
    const plan = plans.get(d) ?? { shape: 'straight' as DeskShape, wings: [], side: 0 };
    const drawerRoll = r.chance(0.5) ? 1 : -1;
    desks.push({
      index: desks.length,
      shape: plan.shape,
      wings: plan.wings,
      x: d.x, z: d.z, rot: d.rot, w: d.w,
      seat, approach: best.p, approachSide: best.side,
      // dead centre in front of the seated worker so the typing hands sit right on the keyboard
      laptop: { x: d.x - f.x * 0.14, z: d.z - f.z * 0.14 },
      color,
      items,
      chairColor: r.pick(chairColors),
      chairTurn: r.range(-0.7, 0.7),
      partition: seating === 'bench' && d.seatInGroup < d.groupSize - 1,
      // (the drawers face the chair: the return of an L desk would stand in front of them)
      drawerSide: plan.shape === 'L' ? -plan.side : drawerRoll,
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
    // (nothing above the cubicle or the sink next to it, and no curtains in the sink's way)
    if (rrSign * (x - (rrX - rrSign * (RESTROOM / 2 + SINK_SPAN))) + winW / 2 + 0.9 > 0) continue;
    windows.push({ wall: 'back', pos: x, w: winW, h: 1.6, sill: 1.05, curtain: r.chance(0.7), panes: r.pick([2, 4, 4] as const), openSide: sideOf() });
  }
  for (const z of [-D / 2 + 3.4, -D / 2 + 7.0]) {
    if (z > D / 2 - 1.6) continue;
    if (door.wall === 'left' && Math.abs(z - door.pos) < 2.3) continue;
    if (rrCorner === 'backLeft' && z - winW / 2 < -D / 2 + RESTROOM + SINK_SPAN) continue;
    if (r.chance(0.85)) windows.push({ wall: 'left', pos: z, w: winW, h: 1.6, sill: 1.05, curtain: r.chance(0.6), panes: r.pick([2, 4] as const), openSide: sideOf() });
  }
  // every room has two or three windows: more than three are never kept, and where the usual places gave fewer, other places along the walls are tried
  // (the same rules: not at the door, not above the cubicle or its sink, not on top of another window; own generator so the rest of the room is unaffected)
  windows.splice(3);
  if (windows.length < 2) {
    const room = new Rng((seed ^ 0x2f6a9c1d) >>> 0);
    const clear = (wall: 'back' | 'left', pos: number) => windows.every((w) => w.wall !== wall || Math.abs(w.pos - pos) >= winW + 0.7);
    const spare: { wall: 'back' | 'left'; pos: number }[] = [];
    for (let x = dirX - 7.4; x <= dirX + 7.4; x += 1.2) {
      if (Math.abs(x) > W / 2 - 1.6) continue;
      if (door.wall === 'back' && Math.abs(x - door.pos) < 2.4) continue;
      if (rrSign * (x - (rrX - rrSign * (RESTROOM / 2 + SINK_SPAN))) + winW / 2 + 0.9 > 0) continue;
      spare.push({ wall: 'back', pos: x });
    }
    for (let z = -D / 2 + 3.4; z <= D / 2 - 1.6; z += 1.2) {
      if (door.wall === 'left' && Math.abs(z - door.pos) < 2.3) continue;
      if (rrCorner === 'backLeft' && z - winW / 2 < -D / 2 + RESTROOM + SINK_SPAN) continue;
      spare.push({ wall: 'left', pos: z });
    }
    for (const c of room.shuffle(spare)) {
      if (windows.length >= 2) break;
      if (!clear(c.wall, c.pos)) continue;
      windows.push({ wall: c.wall, pos: c.pos, w: winW, h: 1.6, sill: 1.05, curtain: room.chance(0.6), panes: room.pick([2, 4] as const), openSide: sideOf() });
    }
  }
  // a room never has all of its windows open on the same side
  if (windows.length > 1 && windows.every((w) => w.openSide === windows[0].openSide)) {
    windows[windows.length - 1].openSide = (windows[windows.length - 1].openSide * -1) as 1 | -1;
  }
  // the strip in front of a window that curtains and sill plants occupy (nothing stands in it)
  const curtainZone = (wn: WindowSpec): OR =>
    wn.wall === 'back' ? { x: wn.pos, z: -D / 2 + 0.35, w: wn.w + 1.2, d: 0.7, rot: 0 } : { x: -W / 2 + 0.35, z: wn.pos, w: 0.7, d: wn.w + 1.2, rot: 0 };
  // a desk or the director's chair that stands in that strip: no curtains there (they would hang through it)
  for (const wn of windows) {
    if (!wn.curtain) continue;
    const zone = curtainZone(wn);
    const blockers: OR[] = [
      ...desks.map((d) => ({ x: d.x, z: d.z, w: d.w, d: DESK_D, rot: d.rot })),
      { x: dirX, z: dirDeskZ, w: 3.0, d: 1.2, rot: 0 },
      { x: director.seat.x, z: director.seat.z, w: 0.9, d: 0.9, rot: 0 },
    ];
    if (blockers.some((q) => overlapOR(zone, q, 0.1))) wn.curtain = false;
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
    ...desks.flatMap((d) => d.wings.map((wg) => { const p = rot2(wg.x, wg.z, d.rot); return { x: d.x + p.x, z: d.z + p.z, w: wg.w + 0.3, d: wg.d + 0.3, rot: d.rot }; })),
    ...restZone,
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
    reserved.push(curtainZone(wn));
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
    const [w, d, h] = FOOT[k];
    // tall furniture on the right / front wall would show its back to the camera and hide whoever uses it (or the desks behind it)
    if (h > TALL_PROP) walls = walls.filter((x) => x === 'back' || x === 'left');
    if (!walls.length) return false;
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
    // the random places did not fit: look along the walls for any gap that does (no random numbers: rooms that were furnished before keep their layout)
    for (const wall of walls) {
      for (let u = 0; u <= 1.0001; u += 0.025) {
        if (wall === 'back' && add(k, -W / 2 + w / 2 + 0.3 + u * (W - w - 0.6), -D / 2 + d / 2 + 0.06, 0)) return true;
        if (wall === 'left' && add(k, -W / 2 + d / 2 + 0.06, -D / 2 + w / 2 + 0.4 + u * (D - w - 0.8), Math.PI / 2)) return true;
        if (wall === 'right' && add(k, W / 2 - d / 2 - 0.05, -D / 2 + w / 2 + 0.4 + u * (D - w - 0.8), -Math.PI / 2)) return true;
      }
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

  if (door.wall === 'left') add('coatRack', -W / 2 + 0.45, door.pos + 1.5, Math.PI / 2);
  else add('coatRack', door.pos - 1.5, -D / 2 + 0.45, 0);

  // the toilet stands against the back wall in its cubicle; the sink (wash hands, wash face) next to it
  const restRng = new Rng((seed ^ 0x1b873593) >>> 0);
  const toilet: Prop = { kind: 'toilet', x: rrX, z: -D / 2 + 0.43, rot: 0, variant: restRng.int(0, 3), color: '#f6f8fb', color2: restRng.pick(colorsAll) };
  props.push(toilet);
  placed.push(restRect);
  let restSink: Prop | null = null;
  for (const gap of [0.2, 0.45, 0.8, 1.2, 1.7]) {
    const n = props.length;
    if (add('sink', rrX - rrSign * (RESTROOM / 2 + gap + 0.5), -D / 2 + 0.34, 0, 0.1)) {
      restSink = props[n];
      break;
    }
  }

  // big, characterful pieces first
  // every office gets a lounge sofa (the sofa breaks are a favourite); three of four also get a meeting table
  const lounge = r.pick(['both', 'both', 'both', 'loungeSet'] as const);
  tryFloor('loungeSet', [0, Math.PI / 2, -Math.PI / 2]);
  if (lounge !== 'loungeSet') tryFloor('meetingSet', [0, Math.PI / 4]);
  // the big rooms have room for a second lounge corner
  if (kind.name !== 'cozy' && r.chance(0.4)) tryFloor('loungeSet', [0, Math.PI / 2, -Math.PI / 2]);
  // the pieces that make an office kitchen and library (they are there from the start) get their place on the walls first
  const firstWall: PropKind[] = ['coffee', 'bookshelf', 'fridge', ...(r.chance(0.85) ? (['stove'] as PropKind[]) : [])];
  for (const k of firstWall) tryWall(k);
  const wallWants: PropKind[] = [
    'copier', 'bookshelf', 'cooler', 'fileCabinet', 'fileCabinet', 'fileCabinet',
    ...(r.chance(0.6) ? (['serverRack'] as PropKind[]) : []),
    ...(r.chance(0.55) ? (['vending'] as PropKind[]) : []),
    ...(r.chance(0.5) ? (['credenza'] as PropKind[]) : []),
    ...(r.chance(0.5) ? (['fishtank'] as PropKind[]) : []),
    ...(r.chance(0.5) ? (['recycle'] as PropKind[]) : []),
    ...(r.chance(0.85) ? (['sink'] as PropKind[]) : []),
    ...(r.chance(0.4) ? (['printer'] as PropKind[]) : []),
  ];
  for (const k of r.shuffle(wallWants)) tryWall(k);
  const floorWants: PropKind[] = ['whiteboardStand', 'boxes', ...(r.chance(0.6) ? (['boxes'] as PropKind[]) : []), 'trolley', 'beanbag', ...(r.chance(0.4) ? (['beanbag'] as PropKind[]) : [])];
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
  busy.back.push([rrX - RESTROOM / 2 - WALL_CLEAR, rrX + RESTROOM / 2 + WALL_CLEAR]);
  if (rrCorner === 'backLeft') busy.left.push([-D / 2, -D / 2 + RESTROOM + WALL_CLEAR]);
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
  // everything big on a wall (screens, boards, pictures) is as tall as everything else and hangs at the same height, so the rows line up;
  // only the width and the shape change (standing, lying, square, round). The clock, the shelf and the small banner are fixtures of their own.
  const PIC_H = 1.2;
  const PIC_Y = 1.85;
  const DECOR: { kind: WallDecorKind; w: number; h: number; y: number; weight: number; round?: boolean }[] = [
    { kind: 'tv', w: 2.1, h: PIC_H, y: PIC_Y, weight: 1.2 },
    { kind: 'kanban', w: 2.2, h: PIC_H, y: PIC_Y, weight: 1.6 },
    { kind: 'cork', w: 1.5, h: PIC_H, y: PIC_Y, weight: 1.6 },
    { kind: 'calendar', w: 0.9, h: PIC_H, y: PIC_Y, weight: 1 },
    { kind: 'motto', w: 1.7, h: 0.6, y: 2.25, weight: 1.2 },
    { kind: 'whiteboard', w: 2.2, h: PIC_H, y: PIC_Y, weight: 1 },
    { kind: 'poster', w: 0.92, h: PIC_H, y: PIC_Y, weight: 0.5 },
    { kind: 'poster', w: 1.7, h: PIC_H, y: PIC_Y, weight: 0.35 },
    { kind: 'poster', w: PIC_H, h: PIC_H, y: PIC_Y, weight: 0.4 },
    { kind: 'poster', w: PIC_H, h: PIC_H, y: PIC_Y, weight: 0.35, round: true },
    { kind: 'slogan', w: 0.86, h: PIC_H, y: PIC_Y, weight: 0.55 },
    { kind: 'slogan', w: 1.9, h: PIC_H, y: PIC_Y, weight: 0.5 },
    { kind: 'slogan', w: PIC_H, h: PIC_H, y: PIC_Y, weight: 0.35 },
    { kind: 'slogan', w: PIC_H, h: PIC_H, y: PIC_Y, weight: 0.35, round: true },
    { kind: 'worldmap', w: 2.4, h: PIC_H, y: PIC_Y, weight: 0.75 },
    { kind: 'worldmap', w: PIC_H, h: PIC_H, y: PIC_Y, weight: 0.3, round: true },
    { kind: 'clock', w: 0.7, h: 0.7, y: 2.4, weight: 0.9 },
    { kind: 'pennant', w: 0.96, h: PIC_H, y: PIC_Y, weight: 0.7 },
    { kind: 'shelf', w: 1.5, h: 0.2, y: 1.95, weight: 0.8 },
  ];
  const usedKinds = new Map<WallDecorKind, number>();
  // (pictures of one shape are not hung side by side in a row: a room gets a mix of standing, lying, square and round ones)
  const shapeOf = (x: { kind: WallDecorKind; w: number; h: number; round?: boolean }) =>
    x.kind !== 'poster' && x.kind !== 'slogan' && x.kind !== 'worldmap' ? '' : x.round ? 'round' : x.w === x.h ? 'square' : x.w > x.h ? 'wide' : 'tall';
  const usedShapes = new Map<string, number>();
  for (let t = 0; t < 300 && wallDecor.length < 9; t++) {
    const dcr = r.weighted(DECOR.map((x) => [x, x.weight / (1 + (usedKinds.get(x.kind) ?? 0) * 1.5) / (1 + (usedShapes.get(shapeOf(x)) ?? 0) * 1.2)] as const));
    const wall = r.chance(0.6) ? 'back' : 'left';
    const len = wall === 'back' ? W : D;
    const pos = r.range(-len / 2 + dcr.w / 2 + 0.5, len / 2 - dcr.w / 2 - 0.5);
    if (!isFree(wall, pos, dcr.w)) continue;
    busy[wall].push([pos - dcr.w / 2 - 0.1, pos + dcr.w / 2 + 0.1]);
    usedKinds.set(dcr.kind, (usedKinds.get(dcr.kind) ?? 0) + 1);
    if (shapeOf(dcr)) usedShapes.set(shapeOf(dcr), (usedShapes.get(shapeOf(dcr)) ?? 0) + 1);
    wallDecor.push({ kind: dcr.kind, wall, pos, y: dcr.y, w: dcr.w, h: dcr.h, round: dcr.round, color: r.pick(colorsAll), color2: r.pick(colorsAll), variant: r.int(0, 3) });
  }

  // one clock is enough, and no two posters / slogans / maps in a room are the same
  {
    const VARIANTS: Partial<Record<WallDecorKind, number>> = { poster: 6, slogan: 14, worldmap: 2 };
    const seen = new Map<WallDecorKind, Set<number>>();
    let clocks = 0;
    for (let i = wallDecor.length - 1; i >= 0; i--) {
      const dc = wallDecor[i];
      if (dc.kind === 'clock' && ++clocks > 1) wallDecor.splice(i, 1);
    }
    for (const dc of wallDecor) {
      const n = VARIANTS[dc.kind];
      if (!n) continue;
      const used = seen.get(dc.kind) ?? new Set<number>();
      seen.set(dc.kind, used);
      let v = r.int(0, n - 1);
      for (let k = 0; k < n && used.has(v); k++) v = (v + 1) % n;
      used.add(v);
      dc.variant = v;
    }
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

  /** the walking grid under a prop (a round table blocks its top and its chairs, not the whole square); `delta` -1 takes it back */
  const blockProp = (nv: NavGrid, p: Prop, delta: 1 | -1 = 1) => {
    if (p.kind === 'toilet') return; // (the cubicle is blocked as a whole)
    const mark = delta > 0 ? nv.blockOriented.bind(nv) : nv.unblockOriented.bind(nv);
    if (p.kind === 'meetingSet') {
      mark(p.x, p.z, 1.4, 1.4, p.rot, 0.1);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.25;
        const c = rot2(Math.sin(a) * TABLE_CHAIR_R, Math.cos(a) * TABLE_CHAIR_R, p.rot);
        mark(p.x + c.x, p.z + c.z, 0.5, 0.5, p.rot + a + Math.PI, 0.08);
      }
      return;
    }
    const [w, d] = FOOT[p.kind];
    mark(p.x, p.z, w, d, p.rot, 0.2);
  };

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
    for (const d of desks) {
      for (const wg of d.wings) {
        const q = rot2(wg.x, wg.z, d.rot);
        nav.blockOriented(d.x + q.x, d.z + q.z, wg.w, wg.d, d.rot, 0.2);
      }
    }
    nav.blockRect(dirRect, 0.22);
    nav.blockRect({ x: director.seat.x, z: director.seat.z, w: 0.7, d: 0.7 }, 0.12);
    nav.blockRect(restRect, 0.02);
    for (const p of list) blockProp(nav, p);
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

  // ------------------------------------------------ a sofa for every room that has space
  // own generator and placed after everything else: rooms that already had a lounge set keep exactly what they had
  if (!props.some((q) => q.kind === 'loungeSet' || q.kind === 'sofa')) {
    const sofaRng = new Rng((seed ^ 0x2c1b3a6d) >>> 0);
    const [sw, sd] = FOOT.sofa;
    // the last tries may clear small clutter (bins, plants, boxes...) out of the way
    const REMOVABLE = new Set<PropKind>(['bin', 'plant', 'cactus', 'boxes', 'trolley', 'beanbag', 'floorLamp', 'tallPlant', 'recycle', 'printer']);
    for (let t = 0; t < 320; t++) {
      const removeOk = t >= 120;
      const side = t % 3 === 2 ? 'floor' : sofaRng.pick(['back', 'left', 'right', 'front'] as const);
      let sx: number, sz: number, srot: number;
      if (side === 'back') { sx = sofaRng.range(-W / 2 + sw / 2 + 0.3, W / 2 - sw / 2 - 0.3); sz = -D / 2 + sd / 2 + 0.06; srot = 0; }
      else if (side === 'left') { sx = -W / 2 + sd / 2 + 0.06; sz = sofaRng.range(-D / 2 + sw / 2 + 0.4, D / 2 - sw / 2 - 0.4); srot = Math.PI / 2; }
      else if (side === 'right') { sx = W / 2 - sd / 2 - 0.05; sz = sofaRng.range(-D / 2 + sw / 2 + 0.4, D / 2 - sw / 2 - 0.4); srot = -Math.PI / 2; }
      else if (side === 'front') { sx = sofaRng.range(-W / 2 + sw / 2 + 0.5, W / 2 - sw / 2 - 0.5); sz = D / 2 - sd / 2 - 0.05; srot = Math.PI; }
      else { sx = sofaRng.range(-W / 2 + 1.6, W / 2 - 1.6); sz = sofaRng.range(dirDeskZ + 2.6, D / 2 - 1.2); srot = sofaRng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]); }
      const rect: OR = { x: sx, z: sz, w: sw, d: sd, rot: srot };
      if (!corners(rect).every((c) => c.x > -W / 2 + 0.05 && c.x < W / 2 - 0.05 && c.z > -D / 2 + 0.05 && c.z < D / 2 - 0.05)) continue;
      // the floor in front of the seats must be free (that is where one walks up to it)
      const o = rot2(0, sd / 2 + 0.6, srot);
      const clear: OR = { x: sx + o.x, z: sz + o.z, w: 1.8, d: 0.8, rot: srot };
      if (!corners(clear).every((c) => c.x > -W / 2 + 0.3 && c.x < W / 2 - 0.3 && c.z > -D / 2 + 0.3 && c.z < D / 2 - 0.3)) continue;
      if (reserved.some((q) => overlapOR(rect, q) || overlapOR(clear, q))) continue;
      const drop = props.filter((q) => {
        const pr = propRect(q);
        return overlapOR(rect, pr, 0.18) || overlapOR(clear, pr);
      });
      if (drop.length && (!removeOk || drop.some((q) => !REMOVABLE.has(q.kind)))) continue;
      if (placed.some((q) => !drop.some((dq) => { const pr = propRect(dq); return pr.x === q.x && pr.z === q.z && pr.w === q.w && pr.d === q.d && pr.rot === q.rot; }) && (overlapOR(rect, q, 0.18) || overlapOR(clear, q)))) continue;
      const kept = props.filter((q) => !drop.includes(q));
      const trial = [...kept, { kind: 'sofa' as const, x: sx, z: sz, rot: srot, variant: sofaRng.int(0, 3), color: sofaRng.pick(colorsAll), color2: sofaRng.pick(colorsAll) }];
      const nv = buildNav(trial);
      if (!reachable(nv)) continue;
      for (const dq of drop) {
        const pr = propRect(dq);
        const at = placed.findIndex((q) => q.x === pr.x && q.z === pr.z && q.w === pr.w && q.d === pr.d && q.rot === pr.rot);
        if (at >= 0) placed.splice(at, 1);
      }
      placed.push(rect, clear);
      props.length = 0;
      props.push(...trial);
      nav = nv;
      break;
    }
  }

  // ------------------------------------------------ a round table for every room that has space
  // own generator and placed after everything else: rooms that already had a table keep exactly what they had
  /** seat of chair `i` of the round table `p` and the way it faces (towards the middle of the table) */
  const chairSeat = (p: Prop, i: number) => {
    const a = (i / 4) * Math.PI * 2 + 0.25;
    const c = rot2(Math.sin(a) * TABLE_CHAIR_R, Math.cos(a) * TABLE_CHAIR_R, p.rot);
    return { x: p.x + c.x, z: p.z + c.z, yaw: p.rot + a + Math.PI + (i % 2 ? 0.2 : -0.15) };
  };
  /** where one walks up to a chair from: beside it (never in front of it, the table is there); null when neither side is free */
  const chairApproach = (nv: NavGrid, cs: { x: number; z: number; yaw: number }): V2 | null => {
    const lat = { x: Math.cos(cs.yaw), z: -Math.sin(cs.yaw) };
    let best: V2 | null = null;
    let bestD = Infinity;
    for (const side of [1, -1]) {
      const stand = { x: cs.x + lat.x * side * 0.72, z: cs.z + lat.z * side * 0.72 };
      const p = { x: cs.x + lat.x * side * 1.45, z: cs.z + lat.z * side * 1.45 };
      if (nv.isBlocked(stand.x, stand.z) || nv.isBlocked(p.x, p.z) || !nv.reachable(door.inside, p)) continue;
      const dd = Math.hypot(p.x - door.inside.x, p.z - door.inside.z);
      if (dd < bestD) {
        bestD = dd;
        best = p;
      }
    }
    return best;
  };
  if (!props.some((q) => q.kind === 'meetingSet')) {
    const tableRng = new Rng((seed ^ 0x6a09e667) >>> 0);
    // (the footprint is the circle the chairs stand on plus a little: the table itself is much smaller)
    const tw = 2.75;
    const td = 2.75;
    const REMOVABLE_T = new Set<PropKind>(['bin', 'plant', 'cactus', 'boxes', 'trolley', 'beanbag', 'floorLamp', 'tallPlant', 'recycle', 'printer', 'whiteboardStand', 'fileCabinet', 'credenza']);
    const same = (a: OR, b: OR) => a.x === b.x && a.z === b.z && a.w === b.w && a.d === b.d && a.rot === b.rot;
    for (let t = 0; t < 900; t++) {
      const removeOk = t >= 300;
      const tx = tableRng.range(-W / 2 + tw / 2 + 0.6, W / 2 - tw / 2 - 0.6);
      const tz = tableRng.range(-D / 2 + td / 2 + 0.6, D / 2 - td / 2 - 0.3);
      const trot = tableRng.pick([0, Math.PI / 4, 0, Math.PI / 2]);
      const rect: OR = { x: tx, z: tz, w: tw, d: td, rot: trot };
      if (!corners(rect).every((c) => c.x > -W / 2 + 0.3 && c.x < W / 2 - 0.3 && c.z > -D / 2 + 0.3 && c.z < D / 2 - 0.3)) continue;
      if (reserved.some((q) => overlapOR(rect, q))) continue;
      const drop = props.filter((q) => overlapOR(rect, propRect(q), 0.05));
      if (drop.length && (!removeOk || drop.some((q) => !REMOVABLE_T.has(q.kind)))) continue;
      const dropRects = drop.map(propRect);
      if (placed.some((q) => !dropRects.some((dr) => same(dr, q)) && overlapOR(rect, q, 0.05))) continue;
      const kept = props.filter((q) => !drop.includes(q));
      const table: Prop = { kind: 'meetingSet', x: tx, z: tz, rot: trot, variant: tableRng.int(0, 3), color: tableRng.pick(colorsAll), color2: tableRng.pick(colorsAll) };
      const trial = [...kept, table];
      const nv = buildNav(trial);
      if (!reachable(nv)) continue;
      // at least three of the four chairs must be reachable
      if ([0, 1, 2, 3].filter((i) => chairApproach(nv, chairSeat(table, i))).length < 3) continue;
      for (const dr of dropRects) {
        const at = placed.findIndex((q) => same(dr, q));
        if (at >= 0) placed.splice(at, 1);
      }
      placed.push(rect);
      props.length = 0;
      props.push(...trial);
      nav = nv;
      break;
    }
  }

  // ------------------------------------------------ exercise corner (punching dummy, dumbbells)
  // own generator and placed last, so every room keeps exactly the furniture it had before these props existed
  {
    const gymRng = new Rng((seed ^ 0x7f4a7c15) >>> 0);
    const base = props.length;
    for (const gk of ['punchDummy', 'dumbbells'] as const) {
      if (!gymRng.chance(0.7)) continue;
      const [gw, gd] = FOOT[gk];
      for (let t = 0; t < 80; t++) {
        let side = gymRng.int(0, 3);
        if (side === 2 && FOOT[gk][2] > TALL_PROP) side = 1;
        let gx: number, gz: number, grot: number;
        if (side === 0) { gx = gymRng.range(-W / 2 + gw / 2 + 0.3, W / 2 - gw / 2 - 0.3); gz = -D / 2 + gd / 2 + 0.06; grot = 0; }
        else if (side === 1) { gx = -W / 2 + gd / 2 + 0.06; gz = gymRng.range(-D / 2 + gw / 2 + 0.4, D / 2 - gw / 2 - 0.4); grot = Math.PI / 2; }
        else if (side === 2) { gx = W / 2 - gd / 2 - 0.05; gz = gymRng.range(-D / 2 + gw / 2 + 0.4, D / 2 - gw / 2 - 0.4); grot = -Math.PI / 2; }
        else { gx = gymRng.range(-W / 2 + 1.4, W / 2 - 1.4); gz = gymRng.range(dirDeskZ + 2.6, D / 2 - 1.0); grot = gymRng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]); }
        const rect: OR = { x: gx, z: gz, w: gw, d: gd, rot: grot };
        // the floor in front of it must be free too (that is where the person stands)
        const o = rot2(0, gd / 2 + 0.5, grot);
        const clear: OR = { x: gx + o.x, z: gz + o.z, w: 0.9, d: 0.8, rot: grot };
        const inside = (q: OR) => corners(q).every((c) => c.x > -W / 2 + 0.3 && c.x < W / 2 - 0.3 && c.z > -D / 2 + 0.3 && c.z < D / 2 - 0.3);
        if (!corners(rect).every((c) => c.x > -W / 2 + 0.05 && c.x < W / 2 - 0.05 && c.z > -D / 2 + 0.05 && c.z < D / 2 - 0.05) || !inside(clear)) continue;
        if (reserved.some((q) => overlapOR(rect, q) || overlapOR(clear, q))) continue;
        if (placed.some((q) => overlapOR(rect, q, 0.25) || overlapOR(clear, q))) continue;
        placed.push(rect, clear);
        props.push({ kind: gk, x: gx, z: gz, rot: grot, variant: gymRng.int(0, 3), color: gymRng.pick(colorsAll), color2: gymRng.pick(colorsAll) });
        break;
      }
    }
    if (props.length > base) {
      nav = buildNav(props);
      if (!reachable(nav)) {
        props.length = base;
        nav = buildNav(props);
      }
    }
  }

  // ---------------------------------------------------------- floor clutter
  const decals: FloorDecal[] = [];
  const decalKinds: DecalKind[] = ['paper', 'paper', 'paper', 'ball', 'ball', 'sticky', 'stain', 'pen'];
  for (let t = 0; t < 120 && decals.length < 20; t++) {
    const x = r.range(-W / 2 + 0.8, W / 2 - 0.8);
    const z = r.range(-D / 2 + 0.8, D / 2 - 0.8);
    if (nav.isBlocked(x, z) || inApron(x, z, 0.1)) continue;
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
      // (a seat nobody can walk up to is no seat)
      if (a && nav.reachable(door.inside, a)) spots.push({ kind: (p.kind === 'loungeSet' ? 'sofa' : p.kind) as Spot['kind'], x: p.x + c.x, z: p.z + c.z, y, yaw: p.rot, approach: a, propIdx: props.indexOf(p) });
    }
  }
  // the chairs of the round tables
  const tables: TableSpec[] = [];
  for (const p of props) {
    if (p.kind !== 'meetingSet') continue;
    const seats: number[] = [];
    for (let i = 0; i < 4; i++) {
      const cs = chairSeat(p, i);
      const ap = chairApproach(nav, cs);
      if (!ap) continue;
      seats.push(spots.length);
      spots.push({ kind: 'chair', x: cs.x, z: cs.z, y: TABLE_SEAT_Y, yaw: cs.yaw, approach: ap, table: tables.length, propIdx: props.indexOf(p) });
    }
    if (seats.length) tables.push({ x: p.x, z: p.z, seats });
  }
  // the toilet seat: one walks up to it through the doorway of the cubicle
  let restroom: Restroom | null = null;
  {
    const frontZ = -D / 2 + RESTROOM;
    const approach = { x: rrX, z: frontZ + 0.5 };
    if (!nav.isBlocked(approach.x, approach.z) && nav.reachable(door.inside, approach)) {
      spots.push({ kind: 'toilet', x: toilet.x, z: toilet.z - 0.05, y: 0.42, yaw: 0, approach });
      restroom = {
        x: rrX, z: rrZ, w: RESTROOM, d: RESTROOM, corner: rrCorner, frontZ, sideX: rrSign * (W / 2 - RESTROOM),
        doorX: rrX, doorW: 0.84, hingeX: rrX + rrSign * 0.42, spot: spots.length - 1, wash: -1,
      };
    }
  }
  spots.push({ kind: 'desk', x: dirX + 0.5, z: dirDeskZ + 0.12, y: 0.76, yaw: 0, approach: director.visitors[2] });
  for (const cw of catWindows) {
    if (cw.wall !== 'back') continue;
    const sx = windows[cw.index].pos + 0.75;
    const a = freeNear({ x: sx, z: -D / 2 + 1.9 });
    if (a) spots.push({ kind: 'sun', x: a.x, z: a.z, y: 0.03, yaw: r.range(0, Math.PI * 2), approach: a });
  }
  // (a second cat is rare: one room in ten)
  const catCount = catWindows.length ? (r.chance(0.1) ? 2 : 1) : 0;

  // ------------- things to do when there is time: get a drink, read a book, watch the fish, wash, water the plants
  const stations: Station[] = [];
  const stationOf: Partial<Record<PropKind, [StationKind, number]>> = {
    cooler: ['drink', 0.5], coffee: ['drink', 0.5], fridge: ['fridge', 0.5], bookshelf: ['read', 0.5], fishtank: ['fish', 0.55], sink: ['wash', 0.36], stove: ['cook', 0.42], punchDummy: ['box', 0.32], dumbbells: ['lift', 0.4],
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
      const lat = pr.kind === 'coffee' ? -0.5 : pr.kind === 'stove' ? -0.2 : pr.kind === 'bookshelf' ? r.range(-0.6, 0.6) : 0;
      for (const extra of [0, 0.15, 0.3]) {
        const o = rot2(lat, fd / 2 + gap + extra, pr.rot);
        options.push({ x: pr.x + o.x, z: pr.z + o.z });
      }
    }
    const stand = options.find((o) => Math.abs(o.x) < W / 2 - 0.5 && Math.abs(o.z) < D / 2 - 0.5 && !nav.isBlocked(o.x, o.z) && nav.findPath(door.inside, o));
    if (!stand) continue;
    const st: Station = {
      kind: kindSt, prop: pr.kind, propIdx: props.indexOf(pr), stand, target: { x: pr.x, z: pr.z },
      yaw: kindSt === 'water' ? Math.atan2(pr.x - stand.x, pr.z - stand.z) : pr.rot + Math.PI,
    };
    if (pr.kind === 'sink') {
      const t = rot2(0, -0.06, pr.rot);
      st.tap = { x: pr.x + t.x, z: pr.z + t.z };
    }
    if (pr.kind === 'stove') {
      const t = rot2(-0.2, 0.02, pr.rot);
      st.pan = { x: pr.x + t.x, z: pr.z + t.z };
    }
    stations.push(st);
    perKind.set(kindSt, (perKind.get(kindSt) ?? 0) + 1);
  }

  if (restroom) {
    // the sink next to the cubicle, or else the nearest one
    const ref = restSink ?? { x: rrX, z: rrZ };
    let bestD = Infinity;
    stations.forEach((st, i) => {
      if (st.kind !== 'wash') return;
      const dd = Math.hypot(st.target.x - ref.x, st.target.z - ref.z);
      if (dd < bestD) {
        bestD = dd;
        restroom!.wash = i;
      }
    });
  }

  // ------------- cat toys: a box to curl up in, a scratching post, a ball of yarn, a toy mouse (only in rooms the cats can visit)
  const toys: Toy[] = [];
  if (catWindows.length) {
    const ring = (x: number, z: number, rad: number) => Array.from({ length: 8 }, (_, k) => [x + Math.cos((k / 8) * Math.PI * 2) * rad, z + Math.sin((k / 8) * Math.PI * 2) * rad]);
    // open floor all around: blocking the middle of it cannot seal anybody off
    const roomy = (x: number, z: number, rad: number) => !nav.isBlocked(x, z) && ring(x, z, rad).every(([qx, qz]) => !nav.isBlocked(qx, qz));
    const clear = (x: number, z: number) => !inApron(x, z, 0.5) && Math.hypot(x - door.inside.x, z - door.inside.z) > 2.4 && toys.every((t) => Math.hypot(t.x - x, t.z - z) > 1.6)
      && stations.every((st) => Math.hypot(st.stand.x - x, st.stand.z - z) > 1) && spots.every((sp) => Math.hypot(sp.approach.x - x, sp.approach.z - z) > 1);
    const cand: V2[] = [];
    for (let k = 0; k < 90; k++) cand.push({ x: r.range(-W / 2 + 1.1, W / 2 - 1.1), z: r.range(-D / 2 + 1.1, D / 2 - 1.1) });
    const take = (rad: number, edge: boolean) => {
      const hit = cand.find((c) => clear(c.x, c.z) && roomy(c.x, c.z, rad) && (!edge || Math.min(W / 2 - Math.abs(c.x), D / 2 - Math.abs(c.z)) < 2.3));
      if (hit) cand.splice(cand.indexOf(hit), 1);
      return hit;
    };
    const box = take(1.0, true);
    if (box) {
      const approach = { x: box.x, z: box.z + 0.8 };
      if (roomy(approach.x, approach.z, 0.25) && nav.reachable(door.inside, approach)) {
        nav.blockRect({ x: box.x, z: box.z, w: 0.8, d: 0.7 });
        toys.push({ kind: 'box', x: box.x, z: box.z, rot: 0, approach });
        spots.push({ kind: 'box', x: box.x, z: box.z, y: 0.05, yaw: r.range(-0.5, 0.5), approach });
      }
    }
    const post = take(0.95, true);
    if (post) {
      const approach = { x: post.x, z: post.z + 0.62 };
      if (roomy(approach.x, approach.z, 0.2) && nav.reachable(door.inside, approach)) {
        nav.blockRect({ x: post.x, z: post.z, w: 0.55, d: 0.55 });
        toys.push({ kind: 'post', x: post.x, z: post.z, rot: 0, approach });
      }
    }
    const yarn = take(0.6, false);
    if (yarn) toys.push({ kind: 'yarn', x: yarn.x, z: yarn.z, rot: r.range(0, Math.PI * 2) });
    const mouse = take(0.6, false);
    if (mouse) toys.push({ kind: 'mouse', x: mouse.x, z: mouse.z, rot: r.range(0, Math.PI * 2) });
  }

  // ------------- a new room is sparse: the coat rack, the toilet, its sink, the cartons and one file cabinet, bin and plant are there from the
  // start, everything else arrives by delivery (the cartons are parcels people open when they carry them to their place) (own generator: the rest of the room is unaffected)
  const keep = new Set<number>();
  props.forEach((p, i) => {
    if (p.kind === 'coatRack' || p.kind === 'toilet' || p.kind === 'boxes' || p === restSink) keep.add(i);
  });
  // (the big things that make a room are there from the start as well: a stove, the coffee machine, a fridge, a bookshelf, the sofa and the round table)
  for (const k of ['fileCabinet', 'bin', 'plant', 'stove', 'coffee', 'fridge', 'bookshelf', 'loungeSet', 'sofa', 'meetingSet'] as const) {
    const i = props.findIndex((p, j) => p.kind === k && !keep.has(j));
    if (i >= 0) keep.add(i);
  }
  const late = new Rng((seed ^ 0x3c6ef372) >>> 0).shuffle(props.map((_, i) => i).filter((i) => !keep.has(i)));
  const lateRank: number[] = props.map(() => -1);
  late.forEach((pi, k) => (lateRank[pi] = k));
  // big things come in big parcels
  const lateBig = late.map((pi) => {
    const [fw, fd, fh] = FOOT[props[pi].kind];
    return fw * fd >= 0.9 || fh >= 1.4;
  });
  for (const pi of late) blockProp(nav, props[pi], -1);
  for (const st of stations) st.off = lateRank[st.propIdx] >= 0;
  for (const sp of spots) if (sp.propIdx !== undefined) sp.off = lateRank[sp.propIdx] >= 0;

  // ------------- plants and cartons that nobody's break depends on: they can be carried to a tidier place
  const movable: number[] = [];
  props.forEach((pr, i) => {
    if (lateRank[i] >= 0) return;
    if (pr.kind !== 'plant' && pr.kind !== 'tallPlant' && pr.kind !== 'cactus' && pr.kind !== 'boxes') return;
    if (stations.some((st) => Math.hypot(st.target.x - pr.x, st.target.z - pr.z) < 0.05)) return;
    movable.push(i);
  });

  return {
    seed, kind: kind.name, seating, width: W, depth: D, wallHeight, theme, door, windows, desks, director, props, wallDecor, decals, rug, signPos, catWindows, spots, restroom, tables, toys, movable, stations, catCount, nav,
    late, lateBig, lateRank, lateDone: late.map(() => false), blockProp: (i) => blockProp(nav, props[i], 1), unblockProp: (i) => blockProp(nav, props[i], -1),
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
