import { Rng } from '../util/rng';
import { NavGrid, V2 } from './nav';
import { RoomTheme, themeFor } from './palettes';

export type PropKind =
  | 'bookshelf' | 'plant' | 'tallPlant' | 'cactus' | 'cooler' | 'coffee' | 'sofa' | 'beanbag' | 'floorLamp'
  | 'printer' | 'bin' | 'fishtank' | 'coatRack' | 'armchair'
  | 'fileCabinet' | 'copier' | 'meetingSet' | 'whiteboardStand' | 'boxes' | 'serverRack' | 'fridge' | 'vending'
  | 'trolley' | 'recycle' | 'loungeSet' | 'credenza' | 'sink' | 'stove' | 'punchDummy' | 'dumbbells' | 'toilet'
  // game machines (a room has at most one, see GAMES)
  | 'arcade' | 'arcadeDuo' | 'pinball' | 'clawMachine' | 'airHockey' | 'foosball' | 'danceMachine' | 'consoleTv' | 'racingSim' | 'vrStation' | 'pingPong' | 'hoops' | 'psConsole' | 'psWall';

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
  /**
   * 2 sashes: the half on `openSide` (+1 = the +x half of the wall, -1 = the -x half) stands open, the other one is closed;
   * 1 sash (a narrow window): it always stands open, hinged on the `openSide` jamb
   */
  sashes: 1 | 2;
  openSide: 1 | -1;
}

export interface DoorSpec {
  /** back / left: in a wall that is drawn; front / right: in one of the lower walls of the picture, which are cut away (a door frame with a bit of wall) */
  wall: 'back' | 'left' | 'front' | 'right';
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

/** where the director sits: along the back wall, or (preferred) along one of the lower edges of the picture (front, right) or across the bottom corner */
export type DirSide = 'back' | 'front' | 'right' | 'corner';

export interface DirectorSpec {
  side: DirSide;
  /** yaw the director faces (0 = +z, into the room from the back wall); the staff desks face the director */
  rot: number;
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
export type StationKind = 'drink' | 'read' | 'fish' | 'wash' | 'water' | 'cook' | 'box' | 'lift' | 'fridge' | 'play';

/** A spot in front of something (water cooler, bookshelf, fish tank, sink, plant) where a person can spend a moment. */
export interface Station {
  kind: StationKind;
  prop: PropKind;
  /** a place at a game machine: which player (0, 1) and whether one sits there (the racing seat) */
  game?: { slot: number; seated: boolean };
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

/**
 * The toilet cubicle in a corner of the room (or in an alcove behind the back or left wall): partitions, a door that swings, a tiled
 * floor; the sink stands right next to it. Its own frame: local +z is the way the doorway faces (into the room), local x runs along it.
 */
export interface Restroom {
  /** the middle of the cubicle (room coordinates) */
  x: number;
  z: number;
  /** width along the doorway wall (local x) and depth (local z) */
  w: number;
  d: number;
  /** yaw the doorway faces: 0 = from the back wall into the room, PI/2 = from the left wall */
  rot: number;
  /** the cubicle sticks out behind the wall (its doorway is in the wall) instead of standing in the corner of the room */
  alcove: boolean;
  /** partitions at the local -x / +x side (none where a wall of the room stands, nor for an alcove: it has walls of its own) */
  sides: [boolean, boolean];
  /** the side (local x sign) the door is hinged on; the sink stands on the other side */
  hinge: 1 | -1;
  doorW: number;
  /** its look (colours of the walls, the door and the floor tiles), 0..3 */
  style: number;
  /** a long or wide alcove has its own sink inside: where one stands to wash (room coordinates), the way one looks, the tap */
  sink?: { stand: V2; yaw: number; tap: V2 };
  /** index into `spots` of the toilet seat and into `stations` of the sink to wash at afterwards (-1: none) */
  spot: number;
  wash: number;
}

/** a point of the cubicle's own frame in room coordinates */
export function rrWorld(rr: Restroom, lx: number, lz: number): V2 {
  const o = rot2(lx, lz, rr.rot);
  return { x: rr.x + o.x, z: rr.z + o.z };
}
/** a room point in the cubicle's own frame */
export function rrLocal(rr: Restroom, x: number, z: number): V2 {
  return rot2(x - rr.x, z - rr.z, -rr.rot);
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
  /** the director's corner did not fit anywhere (an attempt of buildLayout that is only kept when no other one is better) */
  cramped?: boolean;
  /** a console with a TV facing the sofa of a lounge corner: the prop and the sofa seats (indices into `spots`) one plays from */
  couch: { console: number; sofa: number; seats: number[] } | null;
  /** an L-shaped (V) room: the corner nearest to the camera (front right) is cut away, this wide (x) and deep (z); null = the whole rectangle */
  notch: { w: number; d: number } | null;
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
  { name: 'square', w: 15.5, d: 15.5, arcs: 3, rows: 3, weight: 2 },
];

const DESK_D = 1.0;
/** the sizes a toilet cubicle comes in: width along its doorway wall, depth */
const RR_SIZES: readonly [number, number][] = [[1.75, 1.75], [2.2, 1.75], [1.75, 2.2], [2.4, 2.0]];
/** ...and behind the wall (an alcove): a long box reaching far out, or a wide one along the wall */
const ALCOVE_SIZES: readonly [number, number][] = [[1.8, 2.9], [1.75, 3.4], [3.0, 1.8], [3.4, 2.0], [2.4, 2.4]];
/** an L-shaped room is this much wider (x) and deeper (z) than the rectangle of its size kind, before its corner is cut away */
const L_GROW_W = 4;
const L_GROW_D = 3.5;
/** an alcove cubicle stands this far in from the corner of the room */
const ALCOVE_IN = 0.6;
/** the wall next to the cubicle that is kept free of windows for the sink (metres) */
const SINK_SPAN = 1.6;
/** the area in front of the cubicle door that nothing may stand in: half width and depth (metres) */
const APRON_HALF = 1.15;
const APRON_DEPTH = 1.9;
/** nothing hangs on the wall (decor, windows) this far beside the cubicle */
const WALL_CLEAR = 0.9;
/** is (x, z) in the walk-up area in front of the cubicle door? (exported for the tidy-up and the festive decorations) */
export function inRestroomApron(rr: Restroom, x: number, z: number, pad = 0): boolean {
  const l = rrLocal(rr, x, z);
  return Math.abs(l.x) < APRON_HALF + pad && l.z > rr.d / 2 - 0.05 - pad && l.z < rr.d / 2 - 0.05 + APRON_DEPTH + pad;
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
  bookshelf: [1.3, 0.6, 2.0],
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
  arcade: [0.8, 0.75, 1.85],
  arcadeDuo: [1.3, 0.8, 1.85],
  pinball: [0.75, 1.4, 1.6],
  clawMachine: [0.9, 0.9, 1.95],
  airHockey: [1.1, 2.0, 0.85],
  foosball: [1.4, 0.8, 0.95],
  danceMachine: [1.6, 0.6, 2.1],
  consoleTv: [1.5, 0.5, 1.4],
  racingSim: [0.9, 0.7, 1.2],
  vrStation: [0.7, 0.5, 1.6],
  pingPong: [1.5, 2.6, 0.8],
  hoops: [1.0, 2.2, 2.4],
  psConsole: [1.5, 0.45, 1.3],
  psWall: [1.45, 0.32, 1.8],
};

/**
 * The game machines. `players`: where each player stands (machine-local x, z: +z is the front) and the way they look (local yaw);
 * `wall`: it stands with its back to a wall (else anywhere on the open floor); `front`: floor in front of the footprint that belongs to it
 * (the dance pads, the racing seat, the room to move in); `seated`: one sits to play.
 */
export interface GameSpec {
  players: [number, number, number][];
  wall: boolean;
  front: number;
  seated?: boolean;
  /** a console with a big TV that stands facing the sofa of a lounge corner: one plays sitting on the sofa (no places of its own) */
  couch?: boolean;
}
export const GAMES: Partial<Record<PropKind, GameSpec>> = {
  arcade: { players: [[0, 0.8, Math.PI]], wall: true, front: 0.9 },
  arcadeDuo: { players: [[-0.33, 0.82, Math.PI], [0.33, 0.82, Math.PI]], wall: true, front: 0.9 },
  pinball: { players: [[0, 1.05, Math.PI]], wall: true, front: 0.8 },
  clawMachine: { players: [[0, 0.85, Math.PI]], wall: true, front: 0.9 },
  airHockey: { players: [[0, 1.35, Math.PI], [0, -1.35, 0]], wall: false, front: 0 },
  foosball: { players: [[0, 0.78, Math.PI], [0, -0.78, 0]], wall: false, front: 0 },
  danceMachine: { players: [[-0.42, 0.88, Math.PI], [0.42, 0.88, Math.PI]], wall: true, front: 1.4 },
  consoleTv: { players: [[-0.45, 1.65, Math.PI], [0.45, 1.65, Math.PI]], wall: true, front: 1.9 },
  racingSim: { players: [[0, 0.92, Math.PI]], wall: true, front: 1.2, seated: true },
  vrStation: { players: [[0, 1.25, Math.PI]], wall: true, front: 1.7 },
  pingPong: { players: [[0, 1.75, Math.PI], [0, -1.75, 0]], wall: false, front: 0 },
  hoops: { players: [[0, 1.5, Math.PI]], wall: true, front: 0.9 },
  psConsole: { players: [], wall: false, front: 0, couch: true },
  // (the same console with the TV on the wall and the console on the floor: where there is no room for the cabinet)
  psWall: { players: [], wall: true, front: 0, couch: true },
};
const GAME_KINDS = (Object.keys(GAMES) as PropKind[]).filter((k) => k !== 'psWall');
/** the share of the rooms that get a game machine */
const GAME_CHANCE = 0.85;
/** a console stands this far in front of the lounge corner / sofa it faces (the nearest that fits; the coffee table is in between) */
const COUCH_GAPS = [0.35, 0.6, 0.9, 1.4];
/** the seats one plays the console from: a lounge corner's sofa or a sofa of its own */
const COUCH_KINDS = new Set<PropKind>(['loungeSet', 'sofa']);
/** where a console in front of seat prop `sp` stands (gap `gap`), turned to face it */
function couchSpot(sp: Prop, gap: number): OR {
  const [cw, cd] = FOOT.psConsole;
  const o = rot2(0, FOOT[sp.kind][1] / 2 + gap + cd / 2, sp.rot);
  return { x: sp.x + o.x, z: sp.z + o.z, w: cw, d: cd, rot: sp.rot + Math.PI };
}

/** width of a narrow window with a single sash (a two-sash one is 2.3) */
const WIN_W1 = 1.25;

/** props taller than this stay on the back / left walls (the default camera looks at those from the front)... */
const TALL_PROP = 1.1;
/** ...except these, which do not hide much: they may stand against the lower walls (right, front) too */
const LOWER_WALL_OK = new Set<PropKind>(['coffee', 'fileCabinet']);

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

/** a point on the director's desk in room coordinates (desk-local x along the desk, z the way the director looks) */
export function onDirectorDesk(layout: RoomLayout, lx: number, lz: number): { x: number; z: number } {
  const { desk, rot } = layout.director;
  return { x: desk.x + lx * Math.cos(rot) + lz * Math.sin(rot), z: desk.z - lx * Math.sin(rot) + lz * Math.cos(rot) };
}

/** a room seats at least this many staff: a shape that leaves fewer desks (or no reachable toilet, or no place for the director) is tried again with other choices (door, toilet, director side, then no cut-away corner) */
const MIN_DESKS = 5;

export function buildLayout(seed: number, themeIndex: number): RoomLayout {
  let best: RoomLayout | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const l = buildLayoutTry(seed, themeIndex, attempt);
    // (good: enough desks, the director's corner fits, the toilet can be reached, and there is a game machine)
    const ok = (x: RoomLayout) => !x.cramped && !!x.restroom && x.props.some((p) => GAMES[p.kind]);
    if (l.desks.length >= MIN_DESKS && ok(l)) return l;
    if (!best || (!ok(best) && ok(l)) || (ok(best) === ok(l) && l.desks.length > best.desks.length)) best = l;
  }
  return best!;
}

function buildLayoutTry(seed: number, themeIndex: number, attempt: number): RoomLayout {
  const r = new Rng(seed);
  const theme = themeFor(themeIndex);
  const kind = r.weighted(KINDS.map((k) => [k, k.weight] as const));
  const seating: 'fan' | 'bench' = r.chance(0.55) ? 'fan' : 'bench';
  const wallHeight = 3.1;
  // the shape of the room: own generator, so the rest of the room keeps its randomness
  // (another attempt, see MIN_DESKS: other choices for the shape, the door and the director)
  const roomRng = new Rng((seed ^ 0x6a09e667 ^ Math.imul(attempt, 0x9e3779b9)) >>> 0);
  // an L (V) shaped room: the front right corner (nearest to the camera) is cut away – not in the small rooms. Its sides reach further
  // (L_GROW_W / L_GROW_D), so the two wings are roomy: the room is bigger than its rectangle, not smaller
  const isL = kind.name !== 'cozy' && roomRng.chance(0.3) && attempt < 2;
  const W = kind.w + (isL ? L_GROW_W : 0);
  const D = kind.d + (isL ? L_GROW_D : 0);
  const notch = isL ? { w: Math.round(W * 0.36 * 2) / 2, d: Math.round(D * 0.36 * 2) / 2 } : null;
  const notchOR: OR | null = notch ? { x: W / 2 - notch.w / 2, z: D / 2 - notch.d / 2, w: notch.w, d: notch.d, rot: 0 } : null;
  // half of the rooms have the toilet cubicle sticking out behind the back wall instead of standing in a corner of the room
  const alcove = roomRng.chance(0.5);
  // a third of the doors are in one of the lower walls (front, right)
  const lowerDoor: 'front' | 'right' | null = roomRng.chance(0.3) ? (roomRng.chance(0.5) ? 'front' : 'right') : null;

  // ------------------------------------------------------------------ door
  // the door stays in the top corner (left wall, next to the back wall) or the right corner (back wall, next to the right wall) of the picture
  const doorOnLeft = r.chance(0.68);
  const doorWidth = 1.5;
  const door: DoorSpec = lowerDoor === 'front'
    ? (() => {
        const x = -W / 2 + roomRng.range(2.4, 4.4);
        return {
          wall: 'front' as const, pos: x, width: doorWidth, height: 2.4,
          threshold: { x, z: D / 2 }, inside: { x, z: D / 2 - 1.0 }, outside: { x, z: D / 2 + 2.7 }, dir: { x: 0, z: -1 },
        };
      })()
    : lowerDoor === 'right'
    ? (() => {
        const z = D / 2 - (notch ? notch.d : 0) - roomRng.range(2.4, 3.8);
        return {
          wall: 'right' as const, pos: z, width: doorWidth, height: 2.4,
          threshold: { x: W / 2, z }, inside: { x: W / 2 - 1.0, z }, outside: { x: W / 2 + 2.7, z }, dir: { x: -1, z: 0 },
        };
      })()
    : doorOnLeft
    ? (() => {
        // (next to the back corner, or half of the time further along the wall)
        const z = -D / 2 + r.range(1.8, 2.6) + (roomRng.chance(0.5) ? roomRng.range(0, Math.max(0, D - (notch ? notch.d : 0) - 6.5)) : 0);
        return {
          wall: 'left' as const, pos: z, width: doorWidth, height: 2.4,
          threshold: { x: -W / 2, z }, inside: { x: -W / 2 + 1.0, z }, outside: { x: -W / 2 - 2.7, z }, dir: { x: 1, z: 0 },
        };
      })()
    : (() => {
        // (next to the right corner, or half of the time further along the wall)
        const x = W / 2 - 1.7 - (roomRng.chance(0.5) ? roomRng.range(0, W / 2) : 0);
        return {
          wall: 'back' as const, pos: x, width: doorWidth, height: 2.4,
          threshold: { x, z: -D / 2 }, inside: { x, z: -D / 2 + 1.0 }, outside: { x, z: -D / 2 - 2.7 }, dir: { x: 0, z: 1 },
        };
      })();

  // ------------------------------------------------------- toilet cubicle
  // In a corner of the room: the top one (against the back wall or against the left wall), the right one (back wall) or the left one (left
  // wall) – the corners the door leaves free – in the corner itself or in an alcove behind the wall. Several sizes and looks.
  const [rrW, rrD] = roomRng.pick(alcove ? ALCOVE_SIZES : RR_SIZES);
  /** a long or a wide alcove has room for the sink inside (the wide one beside the toilet, the long one on a side wall near the door) */
  const innerSink: 'wide' | 'long' | null = !alcove ? null : rrW >= 3.0 ? 'wide' : rrD >= 2.9 ? 'long' : null;
  const sinkSpan = innerSink ? 0 : SINK_SPAN;
  const rrStyle = roomRng.int(0, 3);
  /** the floor inside a door in the back or left wall */
  const backDoorFloor: OR | null = door.wall === 'left' ? { x: -W / 2 + 1.7, z: door.pos, w: 3.4, d: 2.8, rot: 0 }
    : door.wall === 'back' ? { x: door.pos, z: -D / 2 + 1.7, w: 2.8, d: 3.4, rot: 0 } : null;
  /** a place for the cubicle: its middle, the way the doorway faces, the side (local x) its sink stands on */
  interface RrPlace { x: number; z: number; rot: number; sink: 1 | -1 }
  const inset = alcove ? ALCOVE_IN : 0;
  const atBack = alcove ? -D / 2 - rrD / 2 : -D / 2 + rrD / 2;
  const atLeft = alcove ? -W / 2 - rrD / 2 : -W / 2 + rrD / 2;
  const rrPlaces: RrPlace[] = [
    { x: -W / 2 + rrW / 2 + inset, z: atBack, rot: 0, sink: 1 }, // top corner, along the back wall
    { x: W / 2 - rrW / 2 - inset, z: atBack, rot: 0, sink: -1 }, // right corner
    { x: atLeft, z: -D / 2 + rrW / 2 + inset, rot: Math.PI / 2, sink: -1 }, // top corner, along the left wall
    { x: atLeft, z: D / 2 - rrW / 2 - inset, rot: Math.PI / 2, sink: 1 }, // left corner
  ];
  const placeOR = (p: RrPlace, lx: number, lz: number, w: number, d: number): OR => { const o = rot2(lx, lz, p.rot); return { x: p.x + o.x, z: p.z + o.z, w, d, rot: p.rot }; };
  /** the cubicle, its sink and the walk-up area in front of it, as one area */
  const footprint = (p: RrPlace): OR => {
    const x0 = p.sink > 0 ? -rrW / 2 : -rrW / 2 - sinkSpan;
    const x1 = p.sink > 0 ? rrW / 2 + sinkSpan : rrW / 2;
    const z0 = alcove ? rrD / 2 - 0.1 : -rrD / 2;
    const z1 = rrD / 2 + APRON_DEPTH;
    return placeOR(p, (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0);
  };
  const lowerDoorFloor: OR | null = door.wall === 'front' ? { x: door.pos, z: D / 2 - 1.6, w: 3.0, d: 3.2, rot: 0 }
    : door.wall === 'right' ? { x: W / 2 - 1.6, z: door.pos, w: 3.2, d: 3.0, rot: 0 } : null;
  const rrOk = (p: RrPlace): boolean => {
    const fp = footprint(p);
    return ![backDoorFloor, lowerDoorFloor, notchOR].some((q) => q && overlapOR(fp, q, 0.2));
  };
  const rrP = roomRng.shuffle(rrPlaces).find(rrOk) ?? rrPlaces[door.wall === 'left' ? 1 : 0];
  const rrX = rrP.x;
  const rrZ = rrP.z;
  const rrRot = rrP.rot;
  /** a point / an area in the cubicle's frame */
  const rrAt = (lx: number, lz: number): V2 => { const o = rot2(lx, lz, rrRot); return { x: rrX + o.x, z: rrZ + o.z }; };
  const rrOR = (lx: number, lz: number, w: number, d: number): OR => placeOR(rrP, lx, lz, w, d);
  const restRect: OR = rrOR(0, 0, rrW, rrD);
  /** the stall plus the walk-up area in front of its doorway */
  const restZone: OR[] = [
    ...(alcove ? [] : [rrOR(0, 0, rrW + 0.3, rrD + 0.3)]),
    rrOR(0, rrD / 2 + 0.9 - 0.05, 2 * APRON_HALF, APRON_DEPTH),
  ];
  /** is (x, z) in the walk-up area in front of the cubicle door (where the door swings and people walk in and out)? */
  const inApron = (x: number, z: number, pad = 0) => {
    const l = rot2(x - rrX, z - rrZ, -rrRot);
    return Math.abs(l.x) < APRON_HALF + pad && l.z > rrD / 2 - 0.05 - pad && l.z < rrD / 2 - 0.05 + APRON_DEPTH + pad;
  };
  /** the stretches of the back and left walls the cubicle and its sink take (no window, no picture there) */
  const rrWall: Record<'back' | 'left', [number, number][]> = { back: [], left: [] };
  {
    const x0 = rrP.sink > 0 ? -rrW / 2 : -rrW / 2 - sinkSpan;
    const x1 = rrP.sink > 0 ? rrW / 2 + sinkSpan : rrW / 2;
    const cs = corners(rrOR((x0 + x1) / 2, 0, x1 - x0, rrD));
    const xs = cs.map((c) => c.x);
    const zs = cs.map((c) => c.z);
    if (Math.min(...zs) <= -D / 2 + 0.05) rrWall.back.push([Math.min(...xs), Math.max(...xs)]);
    if (Math.min(...xs) <= -W / 2 + 0.05) rrWall.left.push([Math.min(...zs), Math.max(...zs)]);
  }
  const nearRestroom = (wall: 'back' | 'left', pos: number) => rrWall[wall].some(([a, b]) => pos + winW / 2 + 0.9 > a && pos - winW / 2 - 0.9 < b);
  /** the floor inside a door in one of the lower walls, where nothing else may stand */
  const doorZone: OR | null = lowerDoorFloor;

  // -------------------------------------------------------------- director
  // The director sits along one edge of the room and faces into it; preferably along one of the lower edges of the picture (front, right),
  // which leaves the back and left walls for windows, the door and the furniture. Everything round the director (seat, visitors, the staff
  // desks that face them) is laid out in the director's own frame: local +z is the way they look, local x runs along their desk.
  const dirOffset = lowerDoor ? r.range(-1.2, 1.2) : doorOnLeft ? r.range(-0.6, 1.4) : r.range(-2.0, 0.2);
  // (the bottom corner: sitting across it, looking at the top corner)
  const DIR_YAW = { back: 0, front: Math.PI, right: -Math.PI / 2, corner: Math.atan2(-1, -1) } as const;
  /** how far a cubicle reaches along an edge: the largest x (front edge) / z (right edge) of its walk-up area near that edge */
  const rrReach = (near: (c: V2) => boolean, of: (c: V2) => number, from: number): number =>
    Math.max(from, ...restZone.flatMap((q) => corners(q)).filter(near).map(of));
  const dirPlace = (side: DirSide): V2 => {
    if (side === 'back') return { x: dirOffset, z: -D / 2 + 2.05 };
    if (side === 'corner') return { x: W / 2 - 3.2, z: D / 2 - 3.2 };
    if (side === 'front') {
      // (along what is left of the front edge: clear of a cubicle in the left corner and of the cut-away corner of an L-shaped room)
      const x0 = rrReach((c) => c.z > D / 2 - 4.8, (c) => c.x, -W / 2);
      const x1 = W / 2 - (notch ? notch.w : 0);
      return { x: (x0 + x1) / 2 + Math.max(-1.5, Math.min(1.5, dirOffset)), z: D / 2 - 2.05 };
    }
    // (along the right edge, clear of a cubicle in the right corner)
    const z0 = rrReach((c) => c.x > W / 2 - 4.8, (c) => c.z, -D / 2);
    const z1 = D / 2 - (notch ? notch.d : 0);
    return { x: W / 2 - 2.05, z: (z0 + z1) / 2 + Math.max(-1.0, Math.min(1.0, dirOffset)) };
  };
  /** does the director's corner (desk, chair, the visitors in front) fit on that side? */
  const dirFits = (side: DirSide): boolean => {
    if (side === 'corner' && notch) return false;
    const p = dirPlace(side);
    const rot = DIR_YAW[side];
    const at = (lx: number, lz: number): V2 => { const o = rot2(lx, lz, rot); return { x: p.x + o.x, z: p.z + o.z }; };
    const c = at(0, 0.9);
    const area: OR = { x: c.x, z: c.z, w: 4.6, d: 4.6, rot };
    const blockers: OR[] = [...restZone, ...(doorZone ? [doorZone] : []), ...(notchOR ? [notchOR] : [])];
    if (blockers.some((q) => overlapOR(area, q, 0.2))) return false;
    // (inside the room, with room to walk round it)
    return corners(area).every((q) => q.x > -W / 2 + 0.3 && q.x < W / 2 - 0.3 && q.z > -D / 2 + 0.3 && q.z < D / 2 - 0.3);
  };
  let dirCramped = false;
  const dirSide: DirSide = (() => {
    const wish = roomRng.weighted([['front', 3.5], ['right', 3], ['corner', 2.2], ['back', 2]] as const);
    if (wish !== door.wall && dirFits(wish)) return wish;
    for (const sd of ['front', 'right', 'corner', 'back'] as const) if (sd !== door.wall && dirFits(sd)) return sd;
    // (nowhere fits: the next attempt tries other choices, see buildLayout)
    dirCramped = true;
    return 'back';
  })();
  const dirYaw = DIR_YAW[dirSide];
  const dirDesk = dirPlace(dirSide);
  /** a point in the director's frame (origin: the middle of the desk; +z: the way the director looks) */
  const dirAt = (lx: number, lz: number): V2 => {
    const o = rot2(lx, lz, dirYaw);
    return { x: dirDesk.x + o.x, z: dirDesk.z + o.z };
  };
  /** a room point in the director's frame */
  const dirLocal = (x: number, z: number): V2 => rot2(x - dirDesk.x, z - dirDesk.z, -dirYaw);
  const director: DirectorSpec = {
    side: dirSide,
    rot: dirYaw,
    desk: dirDesk,
    seat: dirAt(0, -0.8),
    approach: dirAt(1.3, -1.25),
    approachSide: 1,
    laptop: dirAt(0, -0.16),
    visitors: [dirAt(0, 1.15), dirAt(-1.15, 1.15), dirAt(1.15, 1.15)],
    waiting: [dirAt(0, 2.1), dirAt(-1.15, 2.1), dirAt(1.15, 2.1)],
  };
  /** an area in the director's frame (w along the desk, d the way the director looks) */
  const dirOR = (lx: number, lz: number, w: number, d: number): OR => ({ ...dirAt(lx, lz), w, d, rot: dirYaw });
  const dirRect: OR = dirOR(0, 0, 3.0, 1.2);
  /** along the back wall the director's x is where the sign hangs and no window goes; elsewhere the middle of the wall */
  const backMid = dirSide === 'back' ? dirDesk.x : 0;

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
    if (notchOR && overlapOR(rc, notchOR, 0.5)) return false;
    if (doorZone && overlapOR(rc, doorZone, 0.1)) return false;
    for (const c of corners(rc)) {
      if (c.x < -W / 2 + xmL || c.x > W / 2 - xmR || c.z > D / 2 - 1.5 || c.z < -D / 2 + (dirSide === 'back' ? 0.5 : 1.5)) return false;
      const l = dirLocal(c.x, c.z);
      if (l.z < (Math.abs(l.x) > 3.4 ? 0.5 : 1.9)) return false;
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
  const maxCandidates = kind.rows >= 3 ? DESK_CANDIDATES_GRAND : DESK_CANDIDATES;
  const visitorArea: OR = dirOR(0, 1.6, 3.6, 2.4);
  // the room as seen from the director: how far it reaches to either side of the desk (desk-local x)
  const roomCorners: V2[] = [{ x: -W / 2, z: -D / 2 }, { x: W / 2, z: -D / 2 }, { x: W / 2, z: D / 2 }, { x: -W / 2, z: D / 2 }].map((c) => dirLocal(c.x, c.z));
  const latMin = Math.min(...roomCorners.map((c) => c.x)) + 1.5;
  const latMax = Math.max(...roomCorners.map((c) => c.x)) - 1.5;
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
        const p = dirAt(rr * Math.sin(a), rr * Math.cos(a));
        const d: RawDesk = {
          x: p.x,
          z: p.z,
          rot: a + Math.PI + r.range(-0.05, 0.05) + dirYaw,
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
      const z = 4.4 + i * rowGap + r.range(-0.12, 0.12);
      let x = latMin + r.range(0.2, 1.4) + (i % 2) * r.range(0.4, 1.2);
      while (x < latMax) {
        const size = r.pick([2, 2, 3, 3, 4]);
        for (let s = 0; s < size; s++) {
          const w = 1.9;
          const p = dirAt(x + w / 2, z);
          const d: RawDesk = { x: p.x, z: p.z, rot: Math.PI + dirYaw, w, group, seatInGroup: s, groupSize: size };
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
    const x0 = latMin + 1.05;
    const x1 = latMax - 1.05;
    const cols = Math.max(1, Math.floor((x1 - x0) / 3) + 1);
    const left = (x0 + x1) / 2 - ((cols - 1) * 3) / 2;
    for (let i = 0; i < 3; i++) {
      for (let c = 0; c < cols; c++) {
        const p = dirAt(left + c * 3, 4.6 + i * 3.2);
        const d: RawDesk = { x: p.x, z: p.z, rot: Math.PI + dirYaw, w: 1.9, group: i * 8 + c, seatInGroup: 0, groupSize: 1 };
        if (fits(d)) raw.push(d);
      }
    }
  }

  // room for exactly MAX_DESKS staff: keep the seats that face the director best
  if (raw.length > MAX_DESKS) {
    const score = (d: RawDesk) => { const l = dirLocal(d.x, d.z); return Math.abs(Math.atan2(l.x, l.z)) * 2.2 + Math.hypot(l.x, l.z) * 0.12; };
    raw.sort((a, b) => score(a) - score(b));
    if (kind.rows >= 3) {
      // spread the staff over the rows (two per row) instead of crowding the director: the front half of the big room stays lively
      const rowOf = (d: RawDesk) => { const l = dirLocal(d.x, d.z); return Math.max(0, Math.min(kind.rows - 1, Math.floor(((seating === 'bench' ? l.z : Math.hypot(l.x, l.z)) - 3.3) / 3.2))); };
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
      // (rows and seats as the director sees them)
      const lo = (d: RawDesk) => dirLocal(d.x, d.z);
      raw.sort((a, b) => Math.round(lo(a).z * 2) - Math.round(lo(b).z * 2) || lo(a).x - lo(b).x);
      let g = -1;
      raw.forEach((d, i) => {
        const prev = raw[i - 1];
        if (!(prev && Math.abs(lo(prev).z - lo(d).z) < 0.3 && lo(d).x - lo(prev).x < d.w + 0.15)) g++;
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
    nv.blockOriented(dirDesk.x, dirDesk.z, 3.0, 1.2, dirYaw, 0.22);
    nv.blockRect({ x: director.seat.x, z: director.seat.z, w: 0.7, d: 0.7 }, 0.12);
    if (!alcove) nv.blockOriented(restRect.x, restRect.z, restRect.w, restRect.d, restRect.rot, 0.02);
    if (notchOR) nv.blockRect(notchOR, 0.2);
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
  // a third of the windows are narrow ones with a single sash (always open); own generator as well
  const sashRng = new Rng((seed ^ 0x510e527f) >>> 0);
  const sashOf = (): { sashes: 1 | 2; w: number } => (sashRng.chance(0.35) ? { sashes: 1, w: WIN_W1 } : { sashes: 2, w: winW });
  const winCount = r.pick([2, 3, 3]);
  const winW = 2.3;
  // never right behind the director's chair: the wall at the director's back stays plain (the office sign hangs there)
  const behindBoss = (x: number) => dirSide === 'back' && Math.abs(x - backMid) < winW / 2 + 1.2;
  const backWinX = winCount === 2 ? [backMid - 3.6, backMid + 3.6] : [backMid - 3.6, backMid + 3.6, backMid + (backMid > 0 ? -7.2 : 7.2)];
  for (const x of backWinX) {
    if (Math.abs(x) > W / 2 - 1.6 || behindBoss(x)) continue;
    if (door.wall === 'back' && Math.abs(x - door.pos) < 2.4) continue;
    // (nothing above the cubicle or the sink next to it, and no curtains in the sink's way)
    if (nearRestroom('back', x)) continue;
    windows.push({ wall: 'back', pos: x, h: 1.6, sill: 1.05, curtain: r.chance(0.7), panes: r.pick([2, 4, 4] as const), openSide: sideOf(), ...sashOf() });
  }
  for (const z of [-D / 2 + 3.4, -D / 2 + 7.0]) {
    if (z > D / 2 - 1.6) continue;
    if (door.wall === 'left' && Math.abs(z - door.pos) < 2.3) continue;
    if (nearRestroom('left', z)) continue;
    if (r.chance(0.85)) windows.push({ wall: 'left', pos: z, h: 1.6, sill: 1.05, curtain: r.chance(0.6), panes: r.pick([2, 4] as const), openSide: sideOf(), ...sashOf() });
  }
  // every room has two or three windows: more than three are never kept, and where the usual places gave fewer, other places along the walls are tried
  // (the same rules: not at the door, not above the cubicle or its sink, not on top of another window; own generator so the rest of the room is unaffected)
  windows.splice(3);
  const clearOfWindows = (wall: 'back' | 'left', pos: number) => windows.every((w) => w.wall !== wall || Math.abs(w.pos - pos) >= winW + 0.7);
  /**
   * Other places along the back and left walls a window may go (not at the door, above the cubicle or its sink, or behind the director).
   * `upper`: only the upper half of each wall in the picture (the left half of the back wall, the back half of the left wall): the
   * furniture keeps to the lower halves (see tryWall).
   */
  const sparePlaces = (upper: boolean): { wall: 'back' | 'left'; pos: number }[] => {
    const spare: { wall: 'back' | 'left'; pos: number }[] = [];
    for (let x = backMid - 7.4; x <= backMid + 7.4; x += 1.2) {
      if (Math.abs(x) > W / 2 - 1.6 || behindBoss(x) || (upper && x > 0)) continue;
      if (door.wall === 'back' && Math.abs(x - door.pos) < 2.4) continue;
      if (nearRestroom('back', x)) continue;
      spare.push({ wall: 'back', pos: x });
    }
    for (let z = -D / 2 + 3.4; z <= D / 2 - 1.6; z += 1.2) {
      if (door.wall === 'left' && Math.abs(z - door.pos) < 2.3) continue;
      if (nearRestroom('left', z)) continue;
      if (upper && z > 0) continue;
      spare.push({ wall: 'left', pos: z });
    }
    return spare;
  };
  // as many as the room was meant to have: at least two anywhere, a third only on the upper half of the walls
  if (windows.length < winCount) {
    const room = new Rng((seed ^ 0x2f6a9c1d) >>> 0);
    for (const c of [...room.shuffle(sparePlaces(true)), ...room.shuffle(sparePlaces(false))]) {
      if (windows.length >= winCount) break;
      if (windows.length >= 2 && c.pos > 0) continue; // (the third: upper half only)
      if (!clearOfWindows(c.wall, c.pos)) continue;
      windows.push({ wall: c.wall, pos: c.pos, h: 1.6, sill: 1.05, curtain: room.chance(0.6), panes: room.pick([2, 4] as const), openSide: sideOf(), ...sashOf() });
    }
  }
  // the strip in front of a window that curtains and sill plants occupy (nothing stands in it)
  const curtainZone = (wn: WindowSpec): OR =>
    wn.wall === 'back' ? { x: wn.pos, z: -D / 2 + 0.35, w: wn.w + 1.2, d: 0.7, rot: 0 } : { x: -W / 2 + 0.35, z: wn.pos, w: 0.7, d: wn.w + 1.2, rot: 0 };
  /** the floor under a window the office cats jump down to */
  const windowFloor = (wn: WindowSpec): OR => (wn.wall === 'back' ? { x: wn.pos, z: -D / 2 + 0.95, w: 1.5, d: 1.9, rot: 0 } : { x: -W / 2 + 0.95, z: wn.pos, w: 1.9, d: 1.5, rot: 0 });
  // a desk or the director's chair that stands in that strip: no curtains there (they would hang through it)
  for (const wn of windows) {
    if (!wn.curtain) continue;
    const zone = curtainZone(wn);
    const blockers: OR[] = [
      ...desks.map((d) => ({ x: d.x, z: d.z, w: d.w, d: DESK_D, rot: d.rot })),
      dirRect,
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
    dirOR(0, 0, 4.4, 3.2),
    dirOR(1.3, -1.2, 1.8, 1.4),
    dirOR(0, 1.7, 3.8, 2.6),
    doorZone ?? (door.wall === 'left'
      ? { x: -W / 2 + 1.7, z: door.pos, w: 3.4, d: 2.8, rot: 0 }
      : { x: door.pos, z: -D / 2 + 1.7, w: 2.8, d: 3.4, rot: 0 }),
    // (nothing stands in the cut-away corner)
    ...(notchOR ? [{ ...notchOR, w: notchOR.w + 0.3, d: notchOR.d + 0.3 }] : []),
  ];
  // keep the floor under every window free so the office cats can hop in and out
  for (const wn of windows) {
    reserved.push(windowFloor(wn));
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

  /**
   * Try to put a prop against a wall (front faces into the room). The walls at the bottom of the picture (right, front) come first, and on the back
   * and left walls the end nearer to the camera: the upper part of those walls stays free for windows and pictures.
   */
  const tryWall = (k: PropKind, walls: ('back' | 'left' | 'right' | 'front')[] = ['back', 'left', 'right', 'front']): boolean => {
    const [w, d, h] = FOOT[k];
    // tall furniture on the right / front wall would show its back to the camera and hide whoever uses it (or the desks behind it)
    if (h > TALL_PROP && !LOWER_WALL_OK.has(k)) walls = walls.filter((x) => x === 'back' || x === 'left');
    if (!walls.length) return false;
    const near = walls.filter((x) => x === 'right' || x === 'front');
    const far = walls.filter((x) => x === 'back' || x === 'left');
    /** 0..1 leaning towards 1: the lower end of the back wall (right) and of the left wall (front) */
    const low = () => Math.sqrt(r.next());
    for (let t = 0; t < 26; t++) {
      const wall = near.length && (t < 16 || !far.length) ? r.pick(near) : r.pick(far);
      if (wall === 'back') {
        if (add(k, -W / 2 + w / 2 + 0.3 + low() * (W - w - 0.6), -D / 2 + d / 2 + 0.06, 0)) return true;
      } else if (wall === 'left') {
        if (add(k, -W / 2 + d / 2 + 0.06, -D / 2 + w / 2 + 0.4 + low() * (D - w - 0.8), Math.PI / 2)) return true;
      } else if (wall === 'right') {
        if (add(k, W / 2 - d / 2 - 0.05, r.range(-D / 2 + w / 2 + 0.4, D / 2 - w / 2 - 0.4), -Math.PI / 2)) return true;
      } else if (add(k, r.range(-W / 2 + w / 2 + 0.5, W / 2 - w / 2 - 0.5), D / 2 - d / 2 - 0.05, Math.PI)) return true;
    }
    // the random places did not fit: look along the walls for any gap that does, the lower walls and lower ends first (no random numbers)
    for (const wall of [...near, ...far]) {
      for (let v = 0; v <= 1.0001; v += 0.025) {
        const u = 1 - v;
        if (wall === 'back' && add(k, -W / 2 + w / 2 + 0.3 + u * (W - w - 0.6), -D / 2 + d / 2 + 0.06, 0)) return true;
        if (wall === 'left' && add(k, -W / 2 + d / 2 + 0.06, -D / 2 + w / 2 + 0.4 + u * (D - w - 0.8), Math.PI / 2)) return true;
        if (wall === 'right' && add(k, W / 2 - d / 2 - 0.05, -D / 2 + w / 2 + 0.4 + u * (D - w - 0.8), -Math.PI / 2)) return true;
        if (wall === 'front' && add(k, -W / 2 + w / 2 + 0.5 + u * (W - w - 1.0), D / 2 - d / 2 - 0.05, Math.PI)) return true;
      }
    }
    return false;
  };
  /** the open floor starts in front of a director at the back wall, at the back wall otherwise (the reserved areas keep the director's corner free) */
  const floorZ0 = dirSide === 'back' ? dirDesk.z + 2.6 : -D / 2 + 1.6;
  /** try to put a prop somewhere on the open floor */
  const tryFloor = (k: PropKind, rots: number[] = [0, Math.PI / 2, Math.PI, -Math.PI / 2]): boolean => {
    for (let t = 0; t < 40; t++) {
      if (add(k, r.range(-W / 2 + 1.4, W / 2 - 1.4), r.range(floorZ0, D / 2 - 1.0), r.pick(rots), 0.3)) return true;
    }
    return false;
  };

  if (door.wall === 'left') add('coatRack', -W / 2 + 0.45, door.pos + 1.5, Math.PI / 2);
  else if (door.wall === 'back') add('coatRack', door.pos - 1.5, -D / 2 + 0.45, 0);

  // the toilet stands against the back wall in its cubicle; the sink (wash hands, wash face) next to it
  const restRng = new Rng((seed ^ 0x1b873593) >>> 0);
  // (in a wide alcove the toilet stands to one side, the sink on the other)
  const toiletX = innerSink === 'wide' ? -rrP.sink * 0.95 : 0;
  const toilet: Prop = { kind: 'toilet', ...rrAt(toiletX, -rrD / 2 + 0.43), rot: rrRot, variant: restRng.int(0, 3), color: '#f6f8fb', color2: restRng.pick(colorsAll) };
  props.push(toilet);
  placed.push(restRect);
  let restSink: Prop | null = null;
  /** the sink inside the cubicle: local place and yaw (into the cubicle) */
  let inner: { x: number; z: number; yaw: number } | null = null;
  if (innerSink === 'wide') inner = { x: rrP.sink * (rrW / 2 - 0.62), z: -rrD / 2 + 0.3, yaw: 0 };
  else if (innerSink === 'long') inner = { x: rrP.sink * (rrW / 2 - 0.3), z: rrD / 2 - 1.15, yaw: -rrP.sink * Math.PI / 2 };
  if (inner) {
    // (pushed straight in: the cubicle stands outside the room the furniture is placed in)
    const at = rrAt(inner.x, inner.z);
    restSink = { kind: 'sink', x: at.x, z: at.z, rot: rrRot + inner.yaw, variant: r.int(0, 3), color: r.pick(colorsAll), color2: r.pick(colorsAll) };
    props.push(restSink);
  }
  for (const gap of inner ? [] : [0.2, 0.45, 0.8, 1.2, 1.7]) {
    const n = props.length;
    // (against the wall beside the cubicle: the wall is the cubicle's back, or for an alcove its front)
    const sp = rrAt(rrP.sink * (rrW / 2 + gap + 0.5), (alcove ? rrD / 2 : -rrD / 2) + 0.34);
    if (add('sink', sp.x, sp.z, rrRot, 0.1)) {
      restSink = props[n];
      break;
    }
  }

  // big, characterful pieces first
  // every office gets a lounge sofa (the sofa breaks are a favourite); three of four also get a meeting table
  const lounge = r.pick(['both', 'both', 'both', 'loungeSet'] as const);
  tryFloor('loungeSet', [0, Math.PI / 2, -Math.PI / 2]);
  /** the first place in front of one of `couches` (nearest gap first) that is inside the room and free */
  const couchFit = (couches: Prop[]): (OR & { kind: PropKind }) | null => {
    for (const cp of couches) {
      for (const gap of COUCH_GAPS) {
        const rect = couchSpot(cp, gap);
        if (!corners(rect).every((c) => c.x > -W / 2 + 0.3 && c.x < W / 2 - 0.3 && c.z > -D / 2 + 0.3 && c.z < D / 2 - 0.3)) continue;
        if (reserved.some((q) => overlapOR(rect, q)) || placed.some((q) => overlapOR(rect, q, 0.1))) continue;
        return { ...rect, kind: 'psConsole' };
      }
    }
    // no room for the cabinet: the TV on the wall the sofa looks at (the back or the left one, the others are cut away), the console on the floor
    for (const cp of couches) {
      const f = rot2(0, 1, cp.rot);
      const toBack = f.z < -0.99;
      const toLeft = f.x < -0.99;
      if (!toBack && !toLeft) continue;
      const [ww, wd] = FOOT.psWall;
      const reach = toBack ? cp.z + D / 2 : cp.x + W / 2;
      const gap = reach - FOOT[cp.kind][1] / 2 - wd - 0.06;
      if (gap < 0.35 || gap > 3.2) continue;
      const o = rot2(0, FOOT[cp.kind][1] / 2 + gap + wd / 2, cp.rot);
      const rect: OR = { x: cp.x + o.x, z: cp.z + o.z, w: ww, d: wd, rot: cp.rot + Math.PI };
      const pos = toBack ? rect.x : rect.z;
      const wall = toBack ? 'back' : 'left';
      if (windows.some((wn) => wn.wall === wall && Math.abs(wn.pos - pos) < wn.w / 2 + ww / 2 + 0.3)) continue;
      if (door.wall === wall && Math.abs(door.pos - pos) < door.width / 2 + ww / 2 + 0.4) continue;
      if (reserved.some((q) => overlapOR(rect, q)) || placed.some((q) => overlapOR(rect, q, 0.05))) continue;
      return { ...rect, kind: 'psWall' };
    }
    return null;
  };
  /**
   * A gaming corner of its own (when no sofa has room for the console in front of it): the TV with the console against a wall, a sofa
   * facing it. Returns whether it found a place.
   */
  const gamingCorner = (rng: Rng): boolean => {
    const [cw, cd] = FOOT.psConsole;
    const [sw, sd] = FOOT.sofa;
    const inside = (q: OR) => corners(q).every((c) => c.x > -W / 2 + 0.05 && c.x < W / 2 - 0.05 && c.z > -D / 2 + 0.05 && c.z < D / 2 - 0.05);
    const look = () => ({ variant: rng.int(0, 3), color: rng.pick(colorsAll), color2: rng.pick(colorsAll) });
    for (let t = 0; t < 240; t++) {
      // (roomy first; later tries make do with the sofa nearer the TV and less floor round it)
      const tight = t >= 120;
      const gap = tight ? COUCH_GAPS[2] : COUCH_GAPS[3];
      const side = rng.int(0, 3);
      let x: number, z: number, rot: number;
      if (side === 0) { x = rng.range(-W / 2 + 1.6, W / 2 - 1.6); z = -D / 2 + cd / 2 + 0.06; rot = 0; }
      else if (side === 1) { x = -W / 2 + cd / 2 + 0.06; z = rng.range(-D / 2 + 1.6, D / 2 - 1.6); rot = Math.PI / 2; }
      else if (side === 2) { x = W / 2 - cd / 2 - 0.05; z = rng.range(-D / 2 + 1.6, D / 2 - 1.6); rot = -Math.PI / 2; }
      else { x = rng.range(-W / 2 + 1.6, W / 2 - 1.6); z = D / 2 - cd / 2 - 0.05; rot = Math.PI; }
      const tv: OR = { x, z, w: cw, d: cd, rot };
      const so = rot2(0, cd / 2 + gap + sd / 2, rot);
      const sofa: OR = { x: x + so.x, z: z + so.z, w: sw, d: sd, rot: rot + Math.PI };
      const mo = rot2(0, cd / 2 + gap / 2, rot);
      const between: OR = { x: x + mo.x, z: z + mo.z, w: sw, d: gap, rot };
      // (the seats are walked up to from the front of the sofa, and round it one walks past)
      const around: OR = { ...sofa, w: sw + (tight ? 0.6 : 1.2), d: sd + (tight ? 0.6 : 1.2) };
      if (!inside(tv) || !inside(sofa) || !inside(between)) continue;
      if (windows.some((wn) => (rot === 0 && wn.wall === 'back' && Math.abs(wn.pos - x) < wn.w / 2 + cw / 2 + 0.3) || (rot === Math.PI / 2 && wn.wall === 'left' && Math.abs(wn.pos - z) < wn.w / 2 + cw / 2 + 0.3))) continue;
      if ([tv, sofa, between, around].some((q) => reserved.some((r2) => overlapOR(q, r2)) || placed.some((r2) => overlapOR(q, r2, 0.05)))) continue;
      placed.push(tv, sofa, between);
      props.push({ kind: 'psConsole', x, z, rot, ...look() }, { kind: 'sofa', x: sofa.x, z: sofa.z, rot: sofa.rot, ...look() });
      return true;
    }
    return false;
  };
  // --------------------------------------------- a game machine (one per room)
  // own generator; placed right after the lounge corner, before the meeting table and the furniture along the walls take the room it needs
  {
    const gameRng = new Rng((seed ^ 0x2545f491) >>> 0);
    // (most rooms get one: the kind drawn first, and when it does not fit, the other kinds in turn)
    // (a room with a lounge corner often tries the console in front of its sofa first)
    const consoleFirst = gameRng.chance(0.3) && props.some((p) => p.kind === 'loungeSet');
    // (a room without another machine has the console: it is tried last of all, or alone)
    const others = gameRng.shuffle(GAME_KINDS.filter((k) => k !== 'psConsole'));
    const order: PropKind[] = !gameRng.chance(GAME_CHANCE) ? ['psConsole'] : consoleFirst ? ['psConsole', ...others] : [...others, 'psConsole'];
    for (const gk of order) {
      if (props.some((p) => GAMES[p.kind])) break;
      const spec = GAMES[gk]!;
      const [gw, gd, gh] = FOOT[gk];
      if (spec.couch) {
        // in front of a lounge corner (its sofa looks +z, the coffee table is in between), turned to face the sofa
        const rect = couchFit(props.filter((lp) => COUCH_KINDS.has(lp.kind)));
        if (rect) {
          placed.push(rect);
          props.push({ kind: rect.kind, x: rect.x, z: rect.z, rot: rect.rot, variant: gameRng.int(0, 3), color: gameRng.pick(colorsAll), color2: gameRng.pick(colorsAll) });
        }
        continue;
      }
      const inside = (q: OR, m: number) => corners(q).every((c) => c.x > -W / 2 + m && c.x < W / 2 - m && c.z > -D / 2 + m && c.z < D / 2 - m);
      for (let t = 0; t < 160; t++) {
        let gx: number, gz: number, grot: number;
        if (spec.wall) {
          // (a tall cabinet against the back or the left wall: its players and its screen face the camera's way; a low one anywhere)
          const side = gh > TALL_PROP && t < 100 ? gameRng.int(0, 1) : gameRng.int(0, 3);
          if (side === 0) { gx = gameRng.range(-W / 2 + gw / 2 + 0.3, W / 2 - gw / 2 - 0.3); gz = -D / 2 + gd / 2 + 0.06; grot = 0; }
          else if (side === 1) { gx = -W / 2 + gd / 2 + 0.06; gz = gameRng.range(-D / 2 + gw / 2 + 0.4, D / 2 - gw / 2 - 0.4); grot = Math.PI / 2; }
          else if (side === 2) { gx = W / 2 - gd / 2 - 0.05; gz = gameRng.range(-D / 2 + gw / 2 + 0.4, D / 2 - gw / 2 - 0.4); grot = -Math.PI / 2; }
          else { gx = gameRng.range(-W / 2 + gw / 2 + 0.5, W / 2 - gw / 2 - 0.5); gz = D / 2 - gd / 2 - 0.05; grot = Math.PI; }
        } else {
          gx = gameRng.range(-W / 2 + 1.8, W / 2 - 1.8);
          gz = gameRng.range(-D / 2 + 1.8, D / 2 - 1.8);
          grot = gameRng.pick([0, Math.PI / 2]);
        }
        const rect: OR = { x: gx, z: gz, w: gw, d: gd, rot: grot };
        // (a cabinet against the back or the left wall stands clear of its windows, frame and curtains included)
        if (spec.wall && (grot === 0 || grot === Math.PI / 2)) {
          const wall = grot === 0 ? 'back' : 'left';
          const pos = grot === 0 ? gx : gz;
          if (windows.some((wn) => wn.wall === wall && Math.abs(wn.pos - pos) < wn.w / 2 + gw / 2 + 0.45)) continue;
        }
        // the floor that belongs to it: in front (pads, seat, room to move), and round every player
        const keepFree: OR[] = spec.players.map(([lx, lz]) => { const o = rot2(lx, lz, grot); return { x: gx + o.x, z: gz + o.z, w: 0.95, d: 0.95, rot: grot }; });
        if (spec.front > 0) { const o = rot2(0, gd / 2 + spec.front / 2, grot); keepFree.push({ x: gx + o.x, z: gz + o.z, w: gw + 0.2, d: spec.front, rot: grot }); }
        if (!inside(rect, 0.05) || !keepFree.every((q) => inside(q, 0.3))) continue;
        if (reserved.some((q) => overlapOR(rect, q) || keepFree.some((k) => overlapOR(k, q)))) continue;
        if (placed.some((q) => overlapOR(rect, q, 0.25) || keepFree.some((k) => overlapOR(k, q)))) continue;
        placed.push(rect, ...keepFree);
        props.push({ kind: gk, x: gx, z: gz, rot: grot, variant: gameRng.int(0, 3), color: gameRng.pick(colorsAll), color2: gameRng.pick(colorsAll) });
        break;
      }
    }
  }

  // (no machine found a place: a gaming corner with the console and a sofa of its own)
  if (!props.some((p) => GAMES[p.kind])) gamingCorner(new Rng((seed ^ 0x1f83d9ab) >>> 0));
  // (still none – a small room: the lounge corner moves to another free spot, where the console fits in front of it)
  for (let k = 0; k < 12 && !props.some((p) => GAMES[p.kind]); k++) {
    const li = props.findIndex((p) => p.kind === 'loungeSet');
    if (li < 0) break;
    const old = props[li];
    const pr = propRect(old);
    const pi = placed.findIndex((q) => q.x === pr.x && q.z === pr.z && q.w === pr.w && q.d === pr.d);
    props.splice(li, 1);
    if (pi >= 0) placed.splice(pi, 1);
    if (!tryFloor('loungeSet', [0, Math.PI / 2, -Math.PI / 2])) {
      props.splice(li, 0, old);
      placed.push(pr);
      break;
    }
    const moved = props[props.length - 1];
    const rect = couchFit([moved]);
    if (rect) {
      placed.push(rect);
      props.push({ kind: rect.kind, x: rect.x, z: rect.z, rot: rect.rot, variant: k % 4, color: colorsAll[k % colorsAll.length], color2: colorsAll[(k + 1) % colorsAll.length] });
    }
  }
  // (the meeting table and a second lounge corner after the game machine: a console needs the floor in front of the first sofa)
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

  // (a narrow window with a single sash has no curtains)
  for (const wn of windows) if (wn.sashes === 1) wn.curtain = false;
  // a room never has all of its windows open on the same side
  if (windows.length > 1 && windows.every((w) => w.openSide === windows[0].openSide)) {
    windows[windows.length - 1].openSide = (windows[windows.length - 1].openSide * -1) as 1 | -1;
  }

  // ----------------------------------------------------------- wall decor
  const wallDecor: WallDecor[] = [];
  // intervals along each wall that tall furniture / windows / the door already use
  const busy: Record<'back' | 'left', [number, number][]> = { back: [], left: [] };
  for (const wn of windows) busy[wn.wall].push([wn.pos - wn.w / 2 - 0.3, wn.pos + wn.w / 2 + 0.3]);
  if (door.wall === 'back' || door.wall === 'left') busy[door.wall].push([door.pos - doorWidth / 2 - 0.4, door.pos + doorWidth / 2 + 0.4]);
  for (const wall of ['back', 'left'] as const) for (const [a, b] of rrWall[wall]) busy[wall].push([a - WALL_CLEAR, b + WALL_CLEAR]);
  for (const p of props) {
    // (and a game machine against a wall: nothing hangs behind it)
    if (!BLOCKS_WALL.has(p.kind) && !GAMES[p.kind]?.wall) continue;
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
  if (isFree('back', backMid, 3.4)) {
    signPos = { wall: 'back', pos: backMid, y: windows.filter((w) => w.wall === 'back').length === 3 ? 2.62 : 2.4 };
    busy.back.push([backMid - 1.7, backMid + 1.7]);
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
    ? r.chance(0.5) && dirSide !== 'corner'
      ? { ...dirAt(0, 0.5), w: dirSide === 'right' ? 3.4 : 4.6, d: dirSide === 'right' ? 4.6 : 3.4, shape: 'rect' as const, color: theme.rug, color2: theme.accent3 }
      : { ...dirAt(0, 0.6), w: 4.2, d: 4.2, shape: 'round' as const, color: theme.rug, color2: theme.accent }
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
    nav.blockOriented(dirDesk.x, dirDesk.z, 3.0, 1.2, dirYaw, 0.22);
    nav.blockRect({ x: director.seat.x, z: director.seat.z, w: 0.7, d: 0.7 }, 0.12);
    if (!alcove) nav.blockOriented(restRect.x, restRect.z, restRect.w, restRect.d, restRect.rot, 0.02);
    if (notchOR) nav.blockRect(notchOR, 0.2);
    for (const p of list) blockProp(nav, p);
    return nav;
  };
  // make sure everything is reachable; drop props (last placed first) until it is
  let nav = buildNav(props);
  const targets = [...desks.map((d) => d.approach), director.approach, ...director.visitors, ...director.waiting];
  const reachable = (n: NavGrid) => targets.every((t) => n.findPath(door.inside, t));
  // (a game machine that shuts off a way goes first: it is a bonus, the rest of the room is not)
  if (!reachable(nav)) {
    const gi = props.findIndex((p) => GAMES[p.kind]);
    if (gi >= 0) {
      props.splice(gi, 1);
      nav = buildNav(props);
    }
  }
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
      else { sx = sofaRng.range(-W / 2 + 1.6, W / 2 - 1.6); sz = sofaRng.range(floorZ0, D / 2 - 1.2); srot = sofaRng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]); }
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

  // ------------------------------------------- still no game machine: the console in front of any sofa (as long as the ways stay open)
  if (!props.some((p) => GAMES[p.kind])) {
    const lateRng = new Rng((seed ^ 0x1f83d9ab) >>> 0);
    const couches = props.filter((p) => COUCH_KINDS.has(p.kind));
    const tryAdd = (list: Prop[], rects: OR[]): boolean => {
      const base = props.length;
      props.push(...list);
      nav = buildNav(props);
      if (reachable(nav)) {
        placed.push(...rects);
        return true;
      }
      props.length = base;
      nav = buildNav(props);
      return false;
    };
    const look = () => ({ variant: lateRng.int(0, 3), color: lateRng.pick(colorsAll), color2: lateRng.pick(colorsAll) });
    const rect = couchFit(couches);
    let done = !!rect && tryAdd([{ kind: rect.kind, x: rect.x, z: rect.z, rot: rect.rot, ...look() }], [rect]);
    // a corner of its own (the ways must stay open); in a small, full room the meeting table makes way for it
    const corner = (): boolean => {
      const np = props.length;
      const nq = placed.length;
      if (!gamingCorner(lateRng)) return false;
      nav = buildNav(props);
      if (reachable(nav)) return true;
      props.length = np;
      placed.length = nq;
      nav = buildNav(props);
      return false;
    };
    if (!done) done = corner();
    const mi = props.findIndex((p) => p.kind === 'meetingSet');
    if (!done && mi >= 0) {
      const meeting = props[mi];
      const mr = propRect(meeting);
      const qi = placed.findIndex((q) => q.x === mr.x && q.z === mr.z && q.w === mr.w && q.d === mr.d);
      props.splice(mi, 1);
      if (qi >= 0) placed.splice(qi, 1);
      done = corner();
      if (!done) {
        props.splice(mi, 0, meeting);
        if (qi >= 0) placed.push(mr);
      }
      nav = buildNav(props);
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
        else { gx = gymRng.range(-W / 2 + 1.4, W / 2 - 1.4); gz = gymRng.range(floorZ0, D / 2 - 1.0); grot = gymRng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]); }
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
    const wl = wn.sashes === 1 ? 0 : (back ? 1 : -1) * wn.openSide * 0.59;
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
  // a console in front of a lounge corner: its sofa seats are where one plays
  let couch: { console: number; sofa: number; seats: number[] } | null = null;
  {
    const ci = props.findIndex((p) => GAMES[p.kind]?.couch);
    if (ci >= 0) {
      const cp = props[ci];
      const li = props.findIndex((lp) => {
        if (!COUCH_KINDS.has(lp.kind)) return false;
        const l = rot2(cp.x - lp.x, cp.z - lp.z, -lp.rot);
        return Math.abs(l.x) < 0.05 && l.z > 0 && l.z < 6 && Math.abs(Math.cos(cp.rot - lp.rot) + 1) < 0.01;
      });
      const seats = spots.map((sp, i) => (sp.propIdx === li && sp.kind === 'sofa' && li >= 0 ? i : -1)).filter((i) => i >= 0);
      if (li >= 0 && seats.length) couch = { console: ci, sofa: li, seats };
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
    const approach = rrAt(0, rrD / 2 + 0.5);
    if (!nav.isBlocked(approach.x, approach.z) && nav.reachable(door.inside, approach)) {
      spots.push({ kind: 'toilet', ...rrAt(toiletX, -rrD / 2 + 0.38), y: 0.42, yaw: rrRot, approach });
      // (a side of the cubicle needs a partition unless it stands on a wall of the room)
      const onWall = (sx: number) => {
        const p = rrAt(sx * rrW / 2, 0);
        return Math.abs(p.z + D / 2) < 0.05 || Math.abs(p.x + W / 2) < 0.05;
      };
      restroom = {
        x: rrX, z: rrZ, w: rrW, d: rrD, rot: rrRot, alcove,
        sides: alcove ? [false, false] : [!onWall(-1), !onWall(1)],
        hinge: (rrP.sink > 0 ? -1 : 1) as 1 | -1, doorW: 0.84, style: rrStyle, spot: spots.length - 1, wash: -1,
      };
      if (inner && restSink) {
        // one stands in front of it (0.64 from its middle: half its depth and a step), facing it; the tap at its back
        const f = rot2(0, 1, restSink.rot);
        restroom.sink = {
          stand: { x: restSink.x + f.x * 0.64, z: restSink.z + f.z * 0.64 },
          yaw: restSink.rot + Math.PI,
          tap: { x: restSink.x - f.x * 0.06, z: restSink.z - f.z * 0.06 },
        };
      }
    }
  }
  spots.push({ kind: 'desk', ...dirAt(0.5, 0.12), y: 0.76, yaw: dirYaw, approach: director.visitors[2] });
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
    const game = GAMES[pr.kind];
    if (game) {
      game.players.forEach(([lx, lz, ly], slot) => {
        const o = rot2(lx, lz, pr.rot);
        const stand = { x: pr.x + o.x, z: pr.z + o.z };
        if (Math.abs(stand.x) > W / 2 - 0.4 || Math.abs(stand.z) > D / 2 - 0.4 || nav.isBlocked(stand.x, stand.z) || !nav.findPath(door.inside, stand)) return;
        stations.push({ kind: 'play', prop: pr.kind, propIdx: props.indexOf(pr), stand, target: { x: pr.x, z: pr.z }, yaw: pr.rot + ly, game: { slot, seated: !!game.seated } });
      });
      continue;
    }
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
      const lat = pr.kind === 'coffee' ? -0.5 : pr.kind === 'stove' ? -0.2 : pr.kind === 'bookshelf' ? r.range(-0.3, 0.3) : 0;
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

  // ------------- a new room is sparse: the coat rack, the toilet, its sink, the cartons and one file cabinet, bin, plant and floor lamp are there from the
  // start, everything else arrives by delivery (the cartons are parcels people open when they carry them to their place) (own generator: the rest of the room is unaffected)
  const keep = new Set<number>();
  props.forEach((p, i) => {
    if (p.kind === 'coatRack' || p.kind === 'toilet' || p.kind === 'boxes' || p === restSink || GAMES[p.kind]) keep.add(i);
  });
  // (the big things that make a room are there from the start as well: a stove, the coffee machine, a fridge, a bookshelf, the sofa and the round table;
  // and one floor lamp)
  // (the sofa one plays the console from is there with it)
  if (couch) keep.add(couch.sofa);
  for (const k of ['fileCabinet', 'bin', 'plant', 'floorLamp', 'stove', 'coffee', 'fridge', 'bookshelf', 'loungeSet', 'sofa', 'meetingSet'] as const) {
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
    seed, kind: kind.name, notch, seating, cramped: dirCramped, couch, width: W, depth: D, wallHeight, theme, door, windows, desks, director, props, wallDecor, decals, rug, signPos, catWindows, spots, restroom, tables, toys, movable, stations, catCount, nav,
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
