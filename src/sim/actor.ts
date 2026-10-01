import type { PersonRec, SpeechKind, TaskRec } from '../types';
import { FOOT, rot2, type RoomLayout, type Spot, type Station, type StationKind } from '../world/layout';
import type { V2 } from '../world/nav';
import { sfx, type Sfx } from '../audio';
import { env } from '../env';
import { frame, SLOW_MAX_DT } from './frame';
import { CHAT_SCRIPTS, TABLE_LINES, eatLine, goodbyeLine, greetingLine, reportLine, serveLine, thoughts } from './phrases';
import { kickDummy, takeDumbbells } from './gym';
import { notePet } from '../progress';
import { claimLate, commitDelivery, debugFlags, lateAvailable, movedIfAny, movedOf, notifyMoved, dismissIdle, enqueueSpeech, greet, parcelDone, releaseLate, roomRuntime, tickParcel, sims, simsInRoom, spotOwners, type CatSim, type Phase, type RoomRuntime, type SimState } from './registry';
import { commitMove, findTidySpot, standBeside, untidyProps, type Place } from './tidy';

export interface Pose {
  bob: number;
  lean: number;
  roll: number;
  twist: number;
  headX: number;
  headY: number;
  headZ: number;
  armLx: number;
  armLz: number;
  armRx: number;
  armRz: number;
  foreLx: number;
  foreRx: number;
  thighLx: number;
  thighRx: number;
  kneeLx: number;
  kneeRx: number;
  happy: number;
  lookUp: number;
  /** 0..1: eyes shut */
  sleep: number;
  mouth: 'smile' | 'o' | 'sad';
}

export function neutralPose(): Pose {
  return {
    bob: 0, lean: 0, roll: 0, twist: 0, headX: 0, headY: 0, headZ: 0,
    armLx: 0, armLz: 0.1, armRx: 0, armRz: 0.1, foreLx: -0.15, foreRx: -0.15,
    thighLx: 0, thighRx: 0, kneeLx: 0, kneeRx: 0, happy: 0, lookUp: 0, sleep: 0, mouth: 'smile',
  };
}

export interface ActorCtx {
  layout: RoomLayout;
  rt: RoomRuntime;
  person: PersonRec;
  /** the task this person works on (staff) */
  task: TaskRec | null;
  now: number;
  lastSayAge: number;
  lastKind: SpeechKind | null;
  queueLen: number;
  /** other characters in this room (for gentle collision avoidance while walking) */
  others: readonly SimState[];
  /** the office cats (people like to pet them) */
  cats: readonly CatSim[];
  /** colleagues currently typing at their desks (worth watching over their shoulder) */
  workers: readonly SimState[];
  /** colleagues sitting at their desks with nothing to do (good for a chat) */
  idlers: readonly SimState[];
  onReport: () => void;
  /** the task is handed over for good: free for the next one */
  onRelease: () => void;
  onDoneSpeech: (text: string, failed: boolean) => void;
  /** a "what I am doing" bubble (icon names: read, drink, coffee, fish, wash, water, cook, eat, chat, sofa, pet, window, walk, watch, wait, home, wave) */
  say: (text: string, icon: string) => void;
  /** name of the character with this sim key */
  nameOf: (simKey: string) => string;
}

/** what somebody does at the desk when there is no work: listen to music with headphones on, watch a video, type something of their own */
export type DeskAct = 'music' | 'video' | 'browse' | 'game' | 'call' | 'shop' | 'mail';

type ActivityKind = DeskAct | 'wander' | 'sofa' | 'watch' | 'window' | 'pet' | 'stay' | 'chat' | 'parcel' | 'tidy' | 'sleep' | 'toilet' | 'table' | StationKind;

/** activities that sit down on a spot (sofa, toilet, chair at the round table) */
const SEATED = new Set<ActivityKind>(['sofa', 'toilet', 'table']);
/** who talks at which round table: speaker, until when, and the earliest time of the next line (sim clock) */
const tableTalk = new Map<string, { by: string; until: number; next: number }>();
/** distance of the chair-side standing point from the seat (round table chairs are entered from the side) */
const CHAIR_STAND = 0.72;
/** the hips sit this far forward of the chair seat point */
const CHAIR_FWD = 0.02;
/** seconds the toilet visitor waits for a free sink before giving up */
const SINK_WAIT_MAX = 18;

const pickOne = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

const BOOKS = [
  'Clean Code', 'The Pragmatic Programmer', 'Refactoring', 'Code Complete', 'The Mythical Man-Month', 'Designing Data-Intensive Applications',
  'A Philosophy of Software Design', 'Don’t Make Me Think', 'The Phoenix Project', 'Domain-Driven Design', 'Working Effectively with Legacy Code',
  'Structure and Interpretation of Computer Programs', 'The Little Prince', 'The Hitchhiker’s Guide to the Galaxy', 'Where the Wild Things Are',
  'Sherlock Holmes', 'The Cat Who Walked by Herself', 'Alice in Wonderland', 'Kitchen', 'The Alchemist',
];
const ZZZ = ['Z', 'Z z', 'Z z z'] as const;
/** distance from the door line to where somebody stands on the porch to pick up the box (DoorView puts the box 0.5 further out) */
export const PORCH_STAND = 1.0;
/** bending down for the parcel on the porch: arms reach out, then it is lifted to the chest */
const PARCEL_KEYS: Key[] = [
  { t: 0 }, { t: 0.4 },
  { t: 1.3, rx: -0.9, rz: -0.3, fr: -0.35, lx: -0.9, lz: -0.3, fl: -0.35, lean: 0.55, hx: 0.3 },
  { t: 1.9, rx: -0.9, rz: -0.3, fr: -0.35, lx: -0.9, lz: -0.3, fl: -0.35, lean: 0.55, hx: 0.3 },
  { t: 2.7, rx: -1.15, rz: -0.45, fr: -0.7, lx: -1.15, lz: -0.45, fl: -0.7, lean: 0.08 },
];
/** one drag of a cigarette: seconds, and the arm keys (right hand up to the mouth and back down) */
const SMOKE_CYCLE = 9.5;
const SMOKE_KEYS: Key[] = [
  { t: 0, rx: 0.15, rz: 0.12, fr: -0.6 }, { t: 1.0, rx: 0.15, rz: 0.12, fr: -0.6 },
  { t: 2.4, rx: -0.85, rz: -0.55, fr: -2.05 }, { t: 4.4, rx: -0.85, rz: -0.55, fr: -2.05 },
  { t: 5.6, rx: 0.15, rz: 0.12, fr: -0.6 }, { t: SMOKE_CYCLE, rx: 0.15, rz: 0.12, fr: -0.6 },
];
/** at most this many people of a room are away from their desk on a break at the same time */
const MAX_WALKERS = 2;
/**
 * No movement inside the room (a walk, sitting down, getting up) starts within this many seconds of the last one. Coming in and going out
 * have a gap of their own (ENTRY_GAP_MIN: they are not counted here, and this gap does not hold them back). Rooms are loaded ahead in
 * the quiet moments between any movements (see frame.loadOk).
 */
const MOTION_GAP_S = 5;
/** ...and this one (also for going home) once no other room is left to load ahead (frame.loading) */
const MOTION_GAP_FREE_S = 1;
/** ...except the next step of the same person's own action (stand up, then walk away): within this many seconds */
const MOTION_CONTINUE_S = 3;
/** a walk that has been held back this long (seconds) starts anyway, so nobody can wait for ever */
const WALK_WAIT_MAX = 120;
/** chance that somebody on the sofa scrolls a phone instead of just resting */
const SOFA_PHONE_CHANCE = 0.45;
/** seconds between two smile bumps / swipe sounds while scrolling the phone */
const PHONE_BUMP_S = 13;
const PHONE_SWIPE_S = 11;
/** seconds per line of a chat */
const CHAT_LINE_S = 3.6;

/** how long the greeting at the door stays up before the task is shown */
const GREET_MS = 5000;
/** the door lets the next person in this long (seconds) after the previous one, so a room fills up one by one */
/** at least this long (s) between two people coming in or going out of a room, in either direction */
const ENTRY_GAP_MIN = 15;
const ENTRY_GAP_SPAN = 8;

/**
 * What a character thinks the moment it decides on a break – shown at once, while it is still at its
 * desk, and complete (which book, which plant…), so nothing has to wait until they arrive.
 */
function thoughtOf(a: Activity, name: string): [string, string] | null {
  switch (a.kind) {
    case 'wander': return [thoughts.wander(), 'walk'];
    case 'sofa': return a.sleep ? [thoughts.sleep(), 'sleep'] : a.phone ? [thoughts.phone(), 'phone'] : [thoughts.sofa(), 'sofa'];
    case 'watch': return [thoughts.watch(name), 'watch'];
    case 'window': return a.smoke ? [thoughts.smoke(), 'smoke'] : [thoughts.window(), 'window'];
    case 'parcel': return [thoughts.parcel(), 'parcel'];
    case 'music': return [thoughts.music(), 'music'];
    case 'video': return [thoughts.video(), 'video'];
    case 'browse': return [thoughts.browse(), 'browse'];
    case 'game': return [thoughts.game(), 'game'];
    case 'call': return [thoughts.call(), 'call'];
    case 'shop': return [thoughts.shop(), 'shop'];
    case 'mail': return [thoughts.mail(), 'mail'];
    case 'tidy': return [thoughts.tidy(), 'tidy'];
    case 'sleep': return [thoughts.sleep(), 'sleep'];
    case 'pet': return [thoughts.pet(), 'pet'];
    case 'drink': return a.station?.prop === 'coffee' ? [thoughts.coffee(), 'coffee'] : [thoughts.water(), 'drink'];
    case 'read': return [thoughts.read(a.detail ?? pickOne(BOOKS)), 'read'];
    case 'fish': return [thoughts.fish(), 'fish'];
    case 'wash': return [thoughts.wash(), 'wash'];
    case 'water': return [thoughts.plants(), 'water'];
    case 'cook': return [thoughts.cook(), 'cook'];
    case 'box': return [thoughts.box(), 'box'];
    case 'lift': return [thoughts.lift(), 'lift'];
    case 'chat': return [thoughts.chat(name), 'chat'];
    case 'toilet': return [thoughts.toilet(a.toiletMode ?? 'none', !!a.hurry), 'toilet'];
    case 'table': return a.meal === 'coffee' ? [thoughts.tableCoffee(), 'coffee'] : [thoughts.tableMeal(), 'eat'];
    default: return null;
  }
}

/** what a character holds in the right hand */
export type HeldKind = 'none' | 'cup' | 'book' | 'can' | 'bowl' | 'dumbbell' | 'parcel' | 'pot' | 'cig' | 'phone';

/** arm/body key pose of a station activity (missing values fall back to the relaxed pose) */
interface Key {
  t: number;
  rx?: number;
  rz?: number;
  fr?: number;
  lx?: number;
  lz?: number;
  fl?: number;
  lean?: number;
  hx?: number;
}
const RELAXED = { rx: 0, rz: 0.1, fr: -0.15, lx: 0, lz: 0.1, fl: -0.15, lean: 0, hx: 0 };

// key poses of the boxing / lifting breaks (module constants: nothing is built inside the frame loop)
const K_NONE: Key = { t: 0 };
const K_GUARD: Key = { t: 0, rx: -0.95, rz: -0.15, fr: -2.0, lx: -0.95, lz: -0.15, fl: -2.0, lean: 0.08, hx: 0.05 };
const K_CHEER: Key = { t: 0, rx: -2.6, rz: 0.45, fr: -0.5, lx: -2.6, lz: 0.45, fl: -0.5, lean: -0.05, hx: -0.15 };
const K_BOW: Key = { t: 0, rx: 0.55, rz: 0.1, fr: -0.1, lx: 0.55, lz: 0.1, fl: -0.1, lean: 0.75, hx: 0.2 };
const K_ARMS_DOWN: Key = { t: 0, rx: 0.05, rz: 0.12, fr: -0.3, lx: 0.05, lz: 0.12, fl: -0.3 };
/** seconds per punch / per dumbbell curl */
const PUNCH_S = 0.5;
const CURL_S = 2.2;

/** What somebody does while there is nothing to work on: the director waiting for the team, staff waiting for the next task. */
interface Activity {
  kind: ActivityKind;
  target: V2;
  yaw: number;
  dur: number;
  points?: V2[];
  spot?: number;
  catKey?: string;
  watchKey?: string;
  /** get a drink / read / watch the fish / wash / water the plants */
  station?: Station;
  stationKey?: string;
  /** book title, name of the colleague being watched… (for the speech bubble) */
  detail?: string;
  /** petting a cat that sleeps on the desk – the director stays in the chair */
  atDesk?: boolean;
  /** window: smoke a cigarette while looking out; sofa: sleep there (eyes shut, drooping head) */
  smoke?: boolean;
  sleep?: boolean;
  /** sofa: scroll a phone while sitting there */
  phone?: boolean;
  /** the target is on the porch: the way there leads through the door (see routeOut) */
  outdoor?: boolean;
  /** chat: the colleague at the desk and what is said */
  partnerKey?: string;
  script?: readonly string[];
  /** music / video / browse: stays in the chair for `dur` seconds */
  deskAct?: DeskAct;
  /** tidy: index into the room's moved-props list of the plant / carton to carry, and where to */
  tidy?: number;
  tidyTo?: Place;
  /** tidy: the carton is a parcel – it is carried to `tidyTo` (where this thing of layout.late stands) and opened there; -1 when it was opened */
  openRank?: number;
  /** toilet: what is done in there, and whether it is an emergency (fast walk, short visit) */
  toiletMode?: 'phone' | 'book' | 'none';
  hurry?: boolean;
  /** table: what is on the table in front of the seat */
  meal?: 'coffee' | 'noodles';
}

/** height of the hip above the floor for an appearance scale of 1 (model hip * rig scale) */
const HIP = 0.47 * 0.85;
/** thigh radius at the hip relative to the hip height (the sofa cushion carries the underside of the thigh) */
const THIGH_R = 0.098 / 0.47;
/** on a sofa the person sits this far forward of the seat point (the cushion is deeper than the legs are long) */
const SOFA_FWD = 0.14;
/** knee bend on a sofa relative to a chair: the lower legs point forward and down over the front edge */
const SOFA_KNEE = 0.4;
/** where the person stands in front of the sofa seat while turning round (distance from the seat; clear of the sofa and of a coffee table) */
const SOFA_STAND = 0.6;
/** seconds: turning on the spot in front of the sofa, lowering onto the cushion */
const SOFA_TURN_S2 = 0.65;
const SOFA_SIT_S2 = 1.05;
// (sofa scenes: walk to the spot opposite the seat, turn round, lean and lower onto the cushion; getting up is the same backwards)
/** seconds: leaning forward before getting up, rising, and stepping away from the sofa */
const SOFA_LEAN_S = 0.3;
const SOFA_RISE_S = 0.85;

/** the desk chair slides this far straight back out of the desk when somebody sits down or gets up */
export const CHAIR_PULL = 0.5;
/**
 * Sitting down at a desk. A tucked chair: walk next to it, pull it out (SIT_STEP, SIT_PULL), then swivel the chair, turn round and sit in one go (SIT_SWING).
 * A chair left pulled out by the last person who got up: walk straight to it (SIT_NEAR), then turn round and sit in one go (SIT_SWING_OUT).
 * Last: chair and sitter slide back to the desk (SIT_IN_S seconds).
 */
const SIT_STEP = 0.4;
const SIT_PULL = SIT_STEP + 0.55;
const SIT_NEAR = 0.45;
const SIT_SWING = 0.95;
const SIT_SWING_OUT = 0.8;
const SIT_IN_S = 0.6;
/** getting up: slide out with the chair while it swivels and rise already while it moves; the chair is left as it is and the walk goes on from the standing turn */
const UP_OUT = 0.55;
const UP_RISE = 0.3;
const UP_END = 1.1;
/** size and clearance of a pulled-out chair in the walking grid */
const CHAIR_BLOCK = 0.56;
const CHAIR_BLOCK_PAD = 0.1;
/** arm raise (shoulder angle) while holding the chair back */
const CHAIR_ARM = -1.15;

/** top of the staff desks (the director's desk is 2 cm higher) */
export const DESK_Y = 0.74;
/** the desk chairs, and the people in them, are lifted by this much: the shoulders then sit above the desk so the hands can rest on it */
export const SEAT_LIFT = 0.07;
/** distance from the seat to the centre of the laptop on the desk (the layout puts it deeper into the desk than short arms reach) */
export const laptopDist = (director: boolean) => (director ? 0.5 : 0.47);

/**
 * Arm angles that put the hand just above the laptop keys (2-link IK from the rig's own segment lengths, so it holds for every body scale).
 * Returns the shoulder angle and the forearm angle (rotation.x of the joints).
 */
function deskReach(scale: number, director: boolean, lift: number): { arm: number; fore: number } {
  const L1 = 0.22;
  const L2 = 0.215;
  const ws = 0.85 * scale;
  const shoulderY = lift + ws * 0.969;
  const handY = DESK_Y + (director ? 0.02 : 0) + 0.042 + 0.078 * ws + 0.046;
  const ty = (handY - shoulderY) / ws;
  const fw = Math.min(laptopDist(director) - 0.095, 0.93 * (L1 + L2) * ws) / ws;
  const d = Math.min(Math.hypot(fw, ty), 0.97 * (L1 + L2));
  const g = Math.acos(Math.max(-1, Math.min(1, (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2))));
  const phi = Math.atan2(fw, -ty);
  const a = phi - Math.atan2(L2 * Math.sin(g), L1 + L2 * Math.cos(g));
  return { arm: -a, fore: -g };
}
const WALK_SPEED = 2.15;
const MIN_WORK = 3.2;
/** a tool call keeps the person at the laptop at least this long */
const MIN_CALL = 2.2;
const smooth = (t: number) => {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const seg = (t: number, a: number, b: number) => smooth((t - a) / (b - a));
const angleDiff = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

const polyLen = (pts: V2[]) => {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return len;
};
/** the point at distance `d` along a polyline and the heading of the segment there (null when that segment is too short to tell) */
const polyAt = (pts: V2[], d: number): { x: number; z: number; yaw: number | null } => {
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dz = pts[i].z - pts[i - 1].z;
    const len = Math.hypot(dx, dz);
    if (d <= len || i === pts.length - 1) {
      const u = len > 1e-6 ? Math.min(1, d / len) : 1;
      return { x: pts[i - 1].x + dx * u, z: pts[i - 1].z + dz * u, yaw: len > 0.02 ? Math.atan2(dx, dz) : null };
    }
    d -= len;
  }
  return { x: pts[0].x, z: pts[0].z, yaw: null };
};

export class Actor {
  readonly sim: SimState;
  readonly pose: Pose = neutralPose();
  readonly isDirector: boolean;

  /** progress of the laptop: 0 in bag → 1 in hands → 2 on desk */
  lapP = 0;
  lid = 0;
  /** 0 bag on back → 1 bag on the floor next to the chair */
  bagT = 0;
  /** 0 hidden → 1 in hands → 2 flying to the pile → 3 delivered */
  folderP = 0;
  folderT = 0;
  typing = 0;

  private path: V2[] = [];
  private pi = 0;
  private walkPhase = 0;
  /** the walk is held back: no free walking slot in the room yet (the walk pose stays off) */
  private gated = false;
  private gatedFor = 0;
  /** walking back to the desk after a report (a priority walk, unlike the way home from a break) */
  private reportReturn = false;
  private t = 0;
  private workTime = 0;
  private drain = 0;
  private waveT = 0;
  private waveDone = new Set<number>();
  private from: V2 = { x: 0, z: 0 };
  private blinkT = 2;
  private blinkOpen = 1;
  private clock = Math.random() * 10;
  private failed = false;
  // --- director breaks
  private restT = 0;
  private nextIdleAt = 8 + Math.random() * 5;
  /** a task came in while they were on a break: the task they work on where they stand, and the break they pick up afterwards */
  private awayTask = '';
  private resumeAct: Activity | null = null;
  private act: Activity | null = null;
  private actStage = 0;
  /** yaw at the start of a turn on the spot (null = not turning yet) and which way round it goes when it is a half turn */
  private turnFrom: number | null = null;
  private turnDir = 1;
  /** away from the desk with the laptop left open (break or report) */
  private strolling = false;
  private resume = false;
  /** the chair was left pulled out by the last time somebody got up: no pulling out, no swivelling */
  private chairWasOut = false;
  /** where the chair stands in the walking grid while it is left pulled out (null = tucked in, covered by the desk's own block) */
  private chairBlock: { x: number; z: number; rot: number } | null = null;
  /** seconds until a walk may look for a way round a new obstacle again */
  private detourCool = 0;
  /** direction of the first leg of the walk after getting up (found once per getting up) */
  private standHead: number | null = null;
  private deskPetT = -1;
  /** napping in the desk chair (seconds so far, -1 = awake) */
  private sleepT = -1;
  /** last "Z z z" bubble step that was shown */
  private zzzStep = -1;
  /** 0..1: strength of the smoke puffs at the mouth (drawn by the character component) */
  smoke = 0;
  /** what the right hand holds (drawn by the character component) */
  held: HeldKind = 'none';
  /** 0..1: the watering can is tilted and pouring */
  pour = 0;
  /** tilt of the held item about the character's x axis (radians, positive = leaning forward) */
  heldTilt = 0;
  /** size of the held plant / carton relative to the model */
  heldScale = 1;
  /** 0..1: the book is open */
  bookOpen = 0;
  /** running water at a sink tap: room position and strength 0..1 */
  tap: V2 | null = null;
  tapFlow = 0;
  /** steam over the pan of the stove: room position and strength 0..1 */
  steamAt: V2 | null = null;
  steam = 0;
  /** previous value of `t` (a sound cue fires when `t` passes its time) */
  private prevT = -1;
  private chatLine = -1;
  private bites = 0;
  private ate = false;
  private served = false;
  /** a person restored by a page load was put at their desk already (later arrivals walk in) */
  private restoredDone = false;
  /** the delivery run: where the thing in the parcel goes (the parcel is opened there); null: the parcel is opened at the desk */
  private deliverTo: V2 | null = null;
  /** at the desk without work: headphones on / a video / typing something of their own, for deskActDur seconds so far deskActT */
  private deskAct: DeskAct | null = null;
  private deskActT = 0;
  private deskActDur = 0;
  /** standing and waiting for a free walking slot with the phone in the hand (set by walkPose) */
  private phoneWait = false;
  /** the phone in the hand is the one the user's message came on (see messagePose) */
  private msgPhone = false;
  /** nothing to do and no break planned: what the laptop is used for meanwhile (changes now and then), and when it was last needed */
  private idleAct: DeskAct = 'browse';
  private idleActAt = -1;
  private idleActUntil = 0;
  private idleSeen = -99;
  /** the room was built (again) while this person was already in the office: they sit at their desk from the first frame, like after a page load */
  warm = false;
  /** key of the task the current work timers belong to */
  private curTask = '';
  /** the last "what I am doing" bubble, so the same words are not said twice in a row */
  private lastSaid = '';
  /** on the way to the director with a report */
  private reporting = false;
  /** height of this character's hip (sitting on a sofa) */
  private readonly hip: number;
  /** arm angles that put the hands on the laptop keys (see deskReach) */
  private readonly reach: { arm: number; fore: number };

  /** the layout of the room (the runs that have to give a claim back need it) */
  private layoutRef: RoomLayout;

  constructor(key: string, roomId: string, isDirector: boolean, layout: RoomLayout, desk: number, scale: number) {
    this.layoutRef = layout;
    this.isDirector = isDirector;
    this.hip = HIP * scale;
    this.reach = deskReach(scale, isDirector, SEAT_LIFT);
    this.sim = { key, roomId, x: layout.door.outside.x, z: layout.door.outside.z, yaw: 0, phase: 'waiting', sitT: 0, y: 0, onStage: false, desk, busy: false, slot: -1, walking: false, chatBy: null, quiet: false };
  }

  get phase(): Phase {
    return this.sim.phase;
  }

  /** what the person does at the desk right now when there is no work (drawn by the character component) */
  get deskMode(): DeskAct | null {
    // (between the breaks somebody who has nothing to do is busy with the laptop all the same: see the resting pose of workPose)
    return this.deskAct ?? (this.clock - this.idleSeen < 0.5 ? this.idleAct : null);
  }

  eyeOpen(): number {
    return this.blinkOpen;
  }

  // ------------------------------------------------------------------ helpers
  private seatOf(ctx: ActorCtx): V2 {
    return this.isDirector ? ctx.layout.director.seat : ctx.layout.desks[this.sim.desk].seat;
  }
  private approachOf(ctx: ActorCtx): V2 {
    return this.isDirector ? ctx.layout.director.approach : ctx.layout.desks[this.sim.desk].approach;
  }

  /** Geometry of the desk chair for the sit-down / get-up scenes: `at(out, lateral, back)` is a floor point relative to the tucked-in seat. */
  private chairRig(ctx: ActorCtx) {
    const seat = this.seatOf(ctx);
    const rot = this.seatYaw(ctx);
    const f = { x: Math.sin(rot), z: Math.cos(rot) };
    const lat = { x: Math.cos(rot), z: -Math.sin(rot) };
    const desk = this.isDirector ? null : ctx.layout.desks[this.sim.desk];
    const side = this.isDirector ? ctx.layout.director.approachSide : desk!.approachSide;
    const gd = this.isDirector ? 0.78 : 0.62;
    const at = (out: number, lateral = 0, back = 0): V2 => ({
      x: seat.x - f.x * (CHAIR_PULL * out + back) + lat.x * side * lateral,
      z: seat.z - f.z * (CHAIR_PULL * out + back) + lat.z * side * lateral,
    });
    return {
      rot,
      side,
      /** swivel of the chair turned towards the person who stands beside it */
      half: (Math.PI / 2) * side,
      /** angle of the empty chair */
      casual: desk ? desk.chairTurn : 0,
      at,
      /** beside the tucked-in chair, level with its back */
      beside: at(0, gd, 0.28),
      /** in front of the chair once it is pulled out and turned */
      front: at(1, gd, 0),
    };
  }

  /** Direction of the first leg of the walk that follows getting up (so the turn can happen while standing up). */
  private standHeading(ctx: ActorCtx, from: V2): number {
    const { layout } = ctx;
    const goal = this.strolling && this.act ? (this.act.outdoor ? layout.door.inside : this.act.target) : this.reporting ? layout.director.visitors[0] : layout.door.inside;
    const path = layout.nav.findPath(from, goal) ?? [goal];
    const p = path.find((q) => Math.hypot(q.x - from.x, q.z - from.z) > 0.15) ?? goal;
    return Math.atan2(p.x - from.x, p.z - from.z);
  }

  /** Sets the yaw at once, on the same turn as before (so a quarter turn per frame never jumps by a full circle). */
  private setYaw(yaw: number) {
    this.sim.yaw += angleDiff(this.sim.yaw, yaw);
  }

  /** the seated worker looks at the director (desks are placed to face the director's desk) */
  seatYaw(ctx: ActorCtx): number {
    return this.isDirector ? 0 : ctx.layout.desks[this.sim.desk].rot;
  }

  private setPhase(p: Phase) {
    this.sim.phase = p;
    this.t = 0;
    this.prevT = -1;
    this.sim.walkWait = 0;
    this.gated = false;
    this.gatedFor = 0;
    if (p !== 'returning') this.reportReturn = false;
    if (p === 'sitting') this.chairWasOut = (this.sim.chairOut ?? 0) > 0.5;
    if (p === 'standing') this.standHead = null;
    // back at the desk, reporting or gone: no longer on a break of its own
    if (p === 'working' || p === 'waiting' || p === 'leaving' || p === 'packing' || p === 'toBoss') this.sim.onBreak = false;
    if (p === 'activity') {
      this.chatLine = -1;
      this.zzzStep = -1;
      this.bites = 0;
      this.ate = false;
      this.served = false;
    }
  }

  /** Plays a sound once, when the running scene passes `at` seconds. */
  private cue(name: Sfx, at: number) {
    if (this.prevT < at && this.t >= at) sfx(name, this.sim.roomId);
  }

  /** A chair left pulled out is an obstacle for everybody else's walks; a tucked chair is already covered by the desk. */
  private setChairBlock(ctx: ActorCtx, on: boolean) {
    const nav = ctx.layout.nav;
    if (!on) {
      if (!this.chairBlock) return;
      const b = this.chairBlock;
      nav.unblockOriented(b.x, b.z, CHAIR_BLOCK, CHAIR_BLOCK, b.rot, CHAIR_BLOCK_PAD);
      this.chairBlock = null;
      return;
    }
    if (this.chairBlock) return;
    const R = this.chairRig(ctx);
    const c = R.at(1);
    this.chairBlock = { x: c.x, z: c.z, rot: R.rot + R.half };
    nav.blockOriented(c.x, c.z, CHAIR_BLOCK, CHAIR_BLOCK, R.rot + R.half, CHAIR_BLOCK_PAD);
  }

  private startPath(points: V2[]) {
    this.path = points;
    this.pi = 0;
  }

  private routeIn(ctx: ActorCtx, target: V2): V2[] {
    const { door, nav } = ctx.layout;
    const inner = nav.findPath(door.inside, target) ?? [target];
    return [door.threshold, door.inside, ...inner];
  }

  /** out of the door and over the porch to `end` (default: out of sight) */
  private routeOut(ctx: ActorCtx, end?: V2): V2[] {
    const { door, nav } = ctx.layout;
    const s = this.sim;
    const inner = nav.findPath({ x: s.x, z: s.z }, door.inside) ?? [door.inside];
    return [...inner, door.threshold, end ?? door.outside];
  }

  /** standing on the porch (the nav grid only knows the room: paths from here must lead through the door first) */
  private onPorch(ctx: ActorCtx): boolean {
    const { threshold, dir } = ctx.layout.door;
    return (this.sim.x - threshold.x) * dir.x + (this.sim.z - threshold.z) * dir.z < -0.05;
  }

  /** walks that go before the idle ones: people coming in, going home, bringing a report to the director */
  private priorityWalk(): boolean {
    const p = this.sim.phase;
    return p === 'entering' || p === 'leaving' || p === 'toBoss' || (p === 'returning' && this.reportReturn);
  }

  /**
   * Is there a walking slot for `s` right now? At most MAX_WALKERS people of a room walk at once, and while somebody
   * with a priority walk is waiting for a slot, idle walks do not start. Marks `s` as waiting when the answer is no.
   */
  private walkSlotOpen(ctx: ActorCtx, s: SimState, priority: boolean): boolean {
    let walkers = 0;
    let priorityWaits = false;
    for (const o of simsInRoom(s.roomId)) {
      if (o === s || !o.onStage) continue;
      if (o.walking) walkers++;
      else if (o.walkWait === 2) priorityWaits = true;
    }
    // (no other movement within MOTION_GAP_S of the last one in the room; the next step of one's own action goes on at once;
    // the way in and out has its own spacing, see ENTRY_GAP_MIN)
    const quiet = ctx.now - ctx.rt.motionAt >= this.motionGap();
    const goingOn = ctx.rt.motionBy === s.key && ctx.now - ctx.rt.motionAt < MOTION_CONTINUE_S;
    const spaced = quiet || goingOn || this.atDoor();
    const open = spaced && walkers < MAX_WALKERS && (priority || !priorityWaits);
    s.walkWait = open ? 0 : priority ? 2 : 1;
    return open;
  }

  /** On the way in or out (these walks are spaced by the door gap, not by the one inside the room). */
  private atDoor(): boolean {
    const p = this.sim.phase;
    return p === 'waiting' || p === 'entering' || p === 'leaving';
  }

  /** The gap between two movements in the room: short once nothing is left to load ahead. */
  private motionGap(): number {
    return frame.loading ? MOTION_GAP_S : MOTION_GAP_FREE_S;
  }

  /** May a movement start now? Not within the motion gap of the last one in the room, nor while rooms are being loaded ahead. */
  private motionOpen(ctx: ActorCtx): boolean {
    if (frame.aheadBuilding > 0 && this.sim.roomId === frame.activeId) return false;
    return ctx.now - ctx.rt.motionAt >= this.motionGap();
  }

  private claimMotion(ctx: ActorCtx) {
    ctx.rt.motionAt = ctx.now;
    ctx.rt.motionBy = this.sim.key;
  }

  /** Claims the next walking slot (and starts the gap for everybody else) when one is open; a walk held back for WALK_WAIT_MAX starts anyway. */
  private takeWalkSlot(ctx: ActorCtx, dt: number, priority = this.priorityWalk()): boolean {
    const s = this.sim;
    // (rooms are being loaded ahead: no walk starts meanwhile, they only take a moment)
    if (frame.aheadBuilding > 0 && s.roomId === frame.activeId && dt > 0) return false;
    let open = this.walkSlotOpen(ctx, s, priority);
    if (!open) {
      this.gatedFor += dt;
      open = this.gatedFor > WALK_WAIT_MAX;
    }
    if (!open) return false;
    this.gatedFor = 0;
    s.walkWait = 0;
    if (!this.atDoor()) {
      ctx.rt.motionAt = ctx.now;
      ctx.rt.motionBy = s.key;
    }
    return true;
  }

  /** Move along the current path. Returns true once the end is reached. */
  private walk(dt: number, ctx: ActorCtx, speedMul = 1): boolean {
    const s = this.sim;
    if (this.pi >= this.path.length) {
      s.walking = false;
      return true;
    }
    // the room has only MAX_WALKERS walking slots and starts walks at a minimum gap: a new walk waits standing until it may go
    this.gated = !s.walking && !this.takeWalkSlot(ctx, dt);
    if (this.gated) return false;
    let target = this.path[this.pi];
    // something new (a chair somebody pulled out) lies across the way: walk round it
    this.detourCool -= dt;
    if (this.detourCool <= 0) {
      const nav = ctx.layout.nav;
      if (!nav.isBlocked(s.x, s.z) && !nav.isBlocked(target.x, target.z) && !nav.lineFree(s, target)) {
        this.detourCool = 0.5;
        const around = nav.findPath({ x: s.x, z: s.z }, target);
        if (around) {
          this.path = [...this.path.slice(0, this.pi), ...around, ...this.path.slice(this.pi + 1)];
          target = this.path[this.pi];
        }
      }
    }
    const dx = target.x - s.x;
    const dz = target.z - s.z;
    const dist = Math.hypot(dx, dz);
    const step = WALK_SPEED * speedMul * dt;
    s.walking = true;
    if (dist <= step) {
      s.x = target.x;
      s.z = target.z;
      this.pi++;
    } else {
      s.x += (dx / dist) * step;
      s.z += (dz / dist) * step;
    }
    this.avoid(dt, ctx);
    const heading = Math.atan2(dx, dz);
    s.yaw += angleDiff(s.yaw, heading) * Math.min(1, dt * 11);
    this.walkPhase += dt * WALK_SPEED * speedMul * 4.6;
    if (this.pi >= this.path.length) {
      s.walking = false;
      return true;
    }
    return false;
  }

  /** Nudge sideways when another walking character is in the way. */
  private avoid(dt: number, ctx: ActorCtx) {
    dt = Math.min(dt, 0.1); // (a slow room's long step must not shove anybody through a neighbour)
    const s = this.sim;
    for (const c of ctx.cats) {
      if (!c.onStage || c.y > 0.3) continue;
      const dx = s.x - c.x;
      const dz = s.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.001 || d > 0.7) continue;
      const push = (0.7 - d) * 3.4 * dt;
      const nx = s.x + (dx / d) * push;
      const nz = s.z + (dz / d) * push;
      if (!ctx.layout.nav.isBlocked(nx, nz)) {
        s.x = nx;
        s.z = nz;
      }
    }
    for (const o of ctx.others) {
      if (o === s || !o.onStage || o.sitT > 0.3) continue;
      const dx = s.x - o.x;
      const dz = s.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.001 || d > 0.62) continue;
      const push = (0.62 - d) * 3.2 * dt;
      const nx = s.x + (dx / d) * push;
      const nz = s.z + (dz / d) * push;
      if (!ctx.layout.nav.isBlocked(nx, nz)) {
        s.x = nx;
        s.z = nz;
      }
    }
  }

  private faceYaw(yaw: number, dt: number, rate = 9) {
    this.sim.yaw += angleDiff(this.sim.yaw, yaw) * Math.min(1, dt * rate);
  }

  // -------------------------------------------------------------- state machine
  update(dt: number, ctx: ActorCtx) {
    dt = Math.min(dt, SLOW_MAX_DT); // (callers already cap the active room at ACTIVE_MAX_DT; slow rooms hand in one long step)
    this.clock += dt;
    this.t += dt;
    const s = this.sim;
    const { person, layout, rt } = ctx;
    const pose = this.targetPose();
    this.typing = 0;
    s.busy = false;
    // deliveries: one timer per room, compared with the clock (whoever is on stage advances it)
    // (a room that is not the active one stands still: dt is 0, see PersonActor)
    if (dt > 0 && s.onStage && tickParcel(rt, ctx.now, s.roomId, layout)) sfx('doorbell', s.roomId);
    // a nap only lasts in the chair; a finished break leaves nothing of the smoke behind
    if (s.phase !== 'working') this.wake();
    if (s.phase !== 'activity') this.smoke = 0;

    // the room notes the last movement (walking, sitting down, getting up): no other one starts within MOTION_GAP_S of it
    if (dt > 0 && s.onStage && !this.atDoor() && (s.walking || s.phase === 'sitting' || s.phase === 'standing' || (s.sitT > 0.01 && s.sitT < 0.99))) {
      rt.motionAt = ctx.now;
      rt.motionBy = s.key;
    }

    switch (s.phase) {
      case 'waiting': {
        s.onStage = false;
        s.walking = false;
        s.x = layout.door.outside.x;
        s.z = layout.door.outside.z;
        s.sitT = 0;
        this.lapP = 0;
        this.lid = 0;
        this.bagT = 0;
        this.folderP = 0;
        s.walkWait = 0;
        if (!person.present) break;
        if (!this.isDirector && s.desk < 0) break;
        if ((person.restored || this.warm) && !this.restoredDone) {
          // the page opened (or the room was built) while the session was already working: they have been at their desk all along
          this.restoredDone = true;
          const seat = this.seatOf(ctx);
          s.x = seat.x;
          s.z = seat.z;
          s.yaw = this.seatYaw(ctx);
          s.sitT = 1;
          s.onStage = true;
          this.waveDone.clear();
          this.resume = false;
          this.strolling = false;
          this.reporting = false;
          this.act = null;
          this.curTask = '';
          this.lastSaid = '';
          this.restT = 0;
          this.deskPetT = -1;
          this.nextIdleAt = 12 + Math.random() * 8;
          this.setPhase('working');
          break;
        }
        if (dt <= 0 || ctx.now < rt.doorFreeAt) break;
        // (the way in is a priority walk: it waits for a free slot, and idle walks give way to it meanwhile)
        if (!this.takeWalkSlot(ctx, dt, true)) break;
        rt.doorFreeAt = ctx.now + ENTRY_GAP_MIN + Math.random() * ENTRY_GAP_SPAN;
        this.startPath(this.routeIn(ctx, this.approachOf(ctx)));
        this.waveDone.clear();
        this.resume = false;
        this.strolling = false;
        this.reporting = false;
        this.act = null;
        this.curTask = '';
        this.lastSaid = '';
        this.restT = 0;
        this.deskPetT = -1;
        this.nextIdleAt = debugFlags.activity ? 1.5 : 12 + Math.random() * 8;
        // at the door: a greeting first, the job they came for follows five seconds later
        greet(s.key, greetingLine(this.isDirector, Math.floor(env.hour), this.colleaguesHere(ctx)), 'wave', GREET_MS);
        sfx('door', s.roomId);
        s.onStage = true;
        s.yaw = Math.atan2(layout.door.dir.x, layout.door.dir.z);
        this.setPhase('entering');
        break;
      }

      case 'entering': {
        this.stepWave(dt, 1, true);
        if (this.waveT <= 0 && this.walk(dt, ctx)) {
          this.from = { x: s.x, z: s.z };
          this.setPhase('sitting');
        }
        this.walkPose(pose, 1);
        if (this.waveT > 0) this.wavePose(pose);
        break;
      }

      case 'sitting': {
        // tucked chair: step up, pull it out, swivel it while turning round and sitting down; chair left out: turn round and sit straight away; then slide back to the desk
        const R = this.chairRig(ctx);
        const t = this.t;
        const out = this.chairWasOut;
        this.setChairBlock(ctx, false);
        const tA = out ? SIT_NEAR : SIT_PULL;
        const tS = tA + (out ? SIT_SWING_OUT : SIT_SWING);
        const tE = tS + SIT_IN_S;
        const lookAtChair = () => {
          const c = R.at(s.chairOut ?? 0);
          this.faceYaw(Math.atan2(c.x - s.x, c.z - s.z), dt, 12);
        };
        if (!this.resume) this.bagT = seg(t, 0.1, tS - 0.2);
        if (out && t < SIT_NEAR) {
          const u = smooth(t / SIT_NEAR);
          s.x = lerp(this.from.x, R.front.x, u);
          s.z = lerp(this.from.z, R.front.z, u);
          s.sitT = 0;
          s.chairOut = 1;
          s.chairSwivel = R.half;
          lookAtChair();
          this.walkPhase += dt * 5;
          this.walkPose(pose, 0.7);
        } else if (!out && t < SIT_STEP) {
          const u = smooth(t / SIT_STEP);
          s.x = lerp(this.from.x, R.beside.x, u);
          s.z = lerp(this.from.z, R.beside.z, u);
          s.sitT = 0;
          s.chairOut = 0;
          s.chairSwivel = R.casual;
          lookAtChair();
          this.walkPhase += dt * 5;
          this.walkPose(pose, 0.5);
        } else if (!out && t < SIT_PULL) {
          // both hands on the back of the chair: step back and pull it out of the desk
          const u = smooth((t - SIT_STEP) / (SIT_PULL - SIT_STEP));
          s.x = lerp(R.beside.x, R.front.x, u);
          s.z = lerp(R.beside.z, R.front.z, u);
          s.sitT = 0;
          s.chairOut = u;
          s.chairSwivel = R.casual;
          lookAtChair();
          this.idlePose(pose);
          this.reachPose(pose, 1);
          pose.lean = 0.1;
        } else if (t < tS) {
          // the chair swivels while the person turns round on the spot and lowers onto the seat (the turn leads, the sitting follows)
          const u = (t - tA) / (tS - tA);
          const sw = out ? 1 : seg(u, 0, 0.5);
          const turn = seg(u, out ? 0 : 0.1, 0.7);
          const sit = seg(u, out ? 0.2 : 0.3, 1);
          const c = R.at(1);
          s.x = lerp(R.front.x, c.x, sit);
          s.z = lerp(R.front.z, c.z, sit);
          s.sitT = sit;
          s.chairOut = 1;
          s.chairSwivel = lerp(R.casual, R.half, sw);
          this.setYaw(R.rot - R.half + R.side * Math.PI * turn);
          this.idlePose(pose);
          if (sit < 0.05) {
            this.walkPhase += dt * 4;
            this.walkPose(pose, 0.3 * (1 - turn));
          }
          this.seatedPose(pose, sit);
          if (!out) this.reachPose(pose, 1 - seg(u, 0, 0.35));
          const dip = Math.sin(sit * Math.PI);
          pose.lean = 0.22 * dip;
          pose.armLx -= 0.3 * dip;
          pose.armRx -= 0.3 * dip;
        } else {
          // chair and sitter roll back up to the desk, the chair turns the person to face it
          const u = smooth(Math.min(1, (t - tS) / (tE - tS)));
          const c = R.at(1 - u);
          s.x = c.x;
          s.z = c.z;
          s.sitT = 1;
          s.chairOut = 1 - u;
          s.chairSwivel = R.half * (1 - u);
          this.setYaw(R.rot + s.chairSwivel);
          this.seatedPose(pose, 1);
          pose.lean = 0.1 * Math.sin(u * Math.PI);
        }
        if (t >= tE) {
          s.x = R.at(0).x;
          s.z = R.at(0).z;
          s.chairOut = 0;
          s.chairSwivel = 0;
          this.setYaw(R.rot);
          if (this.resume) {
            // back from a break: the laptop is still open on the desk
            this.resume = false;
            this.restT = 0;
            this.nextIdleAt = debugFlags.activity ? 1.5 : 20 + Math.random() * 16;
            this.setPhase('working');
          } else this.setPhase('unpacking');
        }
        break;
      }

      case 'unpacking': {
        const t = this.t;
        s.sitT = 1;
        this.bagT = 1;
        this.faceYaw(this.seatYaw(ctx), dt);
        this.lapP = t < 0.25 ? 0 : t < 1.0 ? seg(t, 0.25, 1.0) : 1 + seg(t, 1.0, 1.75);
        this.lid = seg(t, 1.75, 2.3);
        this.seatedPose(pose, 1);
        if (t < 1.0) {
          pose.lean = 0.28;
          pose.armRx = 0.1;
          pose.armRz = 0.7;
          pose.headX = 0.25;
        } else if (t < 1.75) {
          // carrying the laptop down onto the desk: the hands come down to the typing spot
          pose.armLx = pose.armRx = this.reach.arm - 0.3 * (1 - seg(t, 1.0, 1.75));
          pose.armLz = pose.armRz = -0.2;
          pose.foreLx = pose.foreRx = this.reach.fore;
          pose.headX = 0.15;
        } else {
          this.typePose(pose, 16, 0.6);
        }
        if (t >= 2.4) {
          this.curTask = '';
          this.setPhase('working');
        }
        break;
      }

      case 'working': {
        s.sitT = 1;
        this.bagT = 1;
        this.lapP = 2;
        this.lid = 1;
        this.faceYaw(this.seatYaw(ctx), dt);
        this.seatedPose(pose, 1);
        const task = ctx.task;
        s.quiet = person.present && (this.isDirector ? this.isResting(ctx) : !task);
        if (!person.present) {
          // the office is closing: pack the laptop and go home
          this.workPose(pose, ctx);
          this.announce(ctx, [goodbyeLine(this.isDirector, this.colleaguesHere(ctx)), 'home']);
          this.setPhase('packing');
        } else if (this.isDirector) {
          this.workPose(pose, ctx);
          this.idleBehaviour(dt, ctx);
        } else if (task) {
          if (task.key !== this.curTask) {
            // a new task: start the clock, the previous one is forgotten
            this.curTask = task.key;
            this.workTime = 0;
            this.drain = 0;
            this.restT = 0;
            this.deskPetT = -1;
            this.deskAct = null;
          }
          s.busy = true;
          this.workTime += dt;
          this.workPose(pose, ctx);
          if (task.done && this.workTime >= (task.source === 'sub' ? MIN_WORK : MIN_CALL)) {
            if (ctx.queueLen > 0 && this.drain < 4) this.drain += dt; // let the last bubbles finish first
            else if (task.source === 'sub' && this.motionOpen(ctx)) {
              // hand the report to the director (once no one else is on the move, see MOTION_GAP_S)
              this.claimMotion(ctx);
              this.failed = task.failed;
              this.reporting = true;
              this.strolling = true;
              this.setPhase('standing');
            } else if (task.source !== 'sub') ctx.onRelease();
          }
        } else {
          // nothing to do until the next task comes round: sit tight, or take a little break
          this.curTask = '';
          this.workPose(pose, ctx);
          if (s.chatBy) {
            // a colleague is chatting with them: nod along
            pose.headX = Math.sin(this.clock * 3.1) * 0.07;
            pose.happy = 0.5;
          }
          this.idleBehaviour(dt, ctx);
        }
        break;
      }

      case 'packing': {
        const t = this.t;
        s.sitT = 1;
        this.faceYaw(this.seatYaw(ctx), dt);
        this.lid = 1 - seg(t, 0, 0.5);
        this.lapP = t < 0.5 ? 2 : t < 1.1 ? 2 - seg(t, 0.5, 1.1) : 1 - seg(t, 1.1, 1.7);
        this.seatedPose(pose, 1);
        if (t < 0.5) this.typePose(pose, 10, 0.5);
        else if (t < 1.1) {
          pose.armLx = pose.armRx = this.reach.arm - 0.3 * seg(t, 0.5, 1.1);
          pose.armLz = pose.armRz = -0.2;
          pose.foreLx = pose.foreRx = this.reach.fore;
        } else {
          pose.lean = 0.28;
          pose.armRx = 0.1;
          pose.armRz = 0.7;
          pose.headX = 0.25;
        }
        // going home: while rooms are loaded ahead the way in and out is spaced together (ENTRY_GAP_MIN), afterwards people go home one second after another
        if (t >= 1.8 && this.motionOpen(ctx) && ctx.now >= (frame.loading ? rt.doorFreeAt : rt.leaveFreeAt)) {
          this.claimMotion(ctx);
          rt.leaveFreeAt = ctx.now + MOTION_GAP_FREE_S;
          if (frame.loading) rt.doorFreeAt = ctx.now + ENTRY_GAP_MIN + Math.random() * ENTRY_GAP_SPAN; // (the next one in or out waits for this one)
          this.lapP = 0;
          this.lid = 0;
          this.setPhase('standing');
        }
        break;
      }

      case 'standing': {
        // slide out of the desk with the chair while it swivels, rise from the seat while turning towards the way out, and walk on: the chair stays where it is
        const R = this.chairRig(ctx);
        const t = this.t;
        const head = (this.standHead ??= this.standHeading(ctx, R.front));
        const uo = smooth(Math.min(1, t / UP_OUT));
        const w = seg(t, UP_RISE, UP_END);
        const cs = R.at(uo);
        s.x = lerp(cs.x, R.front.x, w);
        s.z = lerp(cs.z, R.front.z, w);
        s.sitT = 1 - w;
        s.chairOut = uo;
        s.chairSwivel = R.half * uo;
        const base = R.rot + s.chairSwivel;
        this.setYaw(base + angleDiff(base, head) * seg(t, UP_RISE + 0.1, UP_END));
        if (!this.strolling) this.bagT = 1 - seg(t, UP_RISE, UP_END);
        this.idlePose(pose);
        if (w > 0.7) {
          this.walkPhase += dt * 4;
          this.walkPose(pose, 0.3 * seg(w, 0.7, 1));
        }
        this.seatedPose(pose, s.sitT);
        pose.lean = -0.05 * Math.sin(uo * Math.PI) + 0.25 * Math.sin(w * Math.PI);
        pose.armLx = pose.armRx = -0.3 * Math.sin(w * Math.PI);
        if (t >= UP_END) {
          s.x = R.front.x;
          s.z = R.front.z;
          s.sitT = 0;
          s.chairOut = 1;
          s.chairSwivel = R.half;
          this.setChairBlock(ctx, true);
          if (this.strolling && this.act) {
            this.startPath(this.act.outdoor ? this.routeOut(ctx, this.act.target) : layout.nav.findPath({ x: s.x, z: s.z }, this.act.target) ?? [this.act.target]);
            this.setPhase('stroll');
          } else if (this.reporting) {
            this.setPhase('toBoss');
          } else {
            this.bagT = 0;
            this.startPath(this.routeOut(ctx));
            this.waveDone.clear();
            this.setPhase('leaving');
          }
        }
        break;
      }

      case 'stroll': {
        if (!this.act?.outdoor && this.awayWork(dt, ctx, pose)) break;
        const hurry = !!this.act?.hurry;
        this.walkPose(pose, hurry ? 1.25 : 1);
        s.y = 0;
        if (this.shouldReturn(ctx)) this.goHome(ctx);
        else if (this.walk(dt, ctx, hurry ? 1.55 : 1)) {
          this.actStage = 0;
          this.from = { x: s.x, z: s.z };
          this.setPhase('activity');
        }
        break;
      }

      case 'activity': {
        this.activity(dt, ctx, pose);
        break;
      }

      case 'returning': {
        this.walkPose(pose, 1);
        s.y = 0;
        if (this.walk(dt, ctx)) {
          this.from = { x: s.x, z: s.z };
          this.resume = true;
          this.strolling = false;
          this.setPhase('sitting');
        }
        break;
      }

      case 'toBoss': {
        const dir = layout.director;
        if (s.slot < 0) {
          const free = rt.visitors.findIndex((v) => v === null);
          if (free >= 0) {
            s.slot = free;
            rt.visitors[free] = s.key;
            const target = dir.visitors[free];
            this.startPath(layout.nav.findPath({ x: s.x, z: s.z }, target) ?? [target]);
          } else {
            // everybody is queueing – idle politely
            this.faceYaw(Math.PI, dt);
            this.idlePose(pose);
            break;
          }
        }
        if (this.walk(dt, ctx)) this.setPhase('handover');
        this.walkPose(pose, 1);
        break;
      }

      case 'handover': {
        const t = this.t;
        this.faceYaw(Math.PI, dt, 12);
        this.idlePose(pose);
        this.folderT = t;
        if (t < 1.0) {
          this.folderP = 1;
          pose.armLx = pose.armRx = -1.25;
          pose.armLz = pose.armRz = -0.15;
          pose.foreLx = pose.foreRx = -0.25;
          pose.lean = 0.2 * seg(t, 0.3, 0.9);
          pose.headX = 0.1;
        } else {
          if (this.folderP === 1) {
            this.folderP = 2;
            ctx.onDoneSpeech(ctx.task?.summary || reportLine(this.failed), this.failed);
          }
          const h = t - 1.0;
          if (h > 0.55 && this.folderP === 2) {
            this.folderP = 3;
            ctx.onReport();
            rt.receivedAt = ctx.now;
          }
          pose.happy = this.failed ? 0 : 1;
          pose.mouth = this.failed ? 'sad' : 'smile';
          pose.armLx = pose.armRx = lerp(-1.25, this.failed ? 0.1 : -0.1, seg(h, 0, 0.35));
          if (!this.failed) {
            pose.armRx = -2.6 + Math.sin(h * 11) * 0.3;
            pose.armRz = 0.45;
            pose.foreRx = -0.5;
            pose.bob = Math.abs(Math.sin(h * 7)) * 0.07;
          } else {
            pose.headX = 0.25;
          }
        }
        if (t >= 2.7) {
          if (s.slot >= 0) rt.visitors[s.slot] = null;
          s.slot = -1;
          this.folderP = 0;
          this.reporting = false;
          // the task is done for good
          ctx.onRelease();
          this.curTask = '';
          if (this.resumeAct && ctx.person.present) {
            // they were on a break when the task came in: go back to it
            const back = this.resumeAct;
            this.resumeAct = null;
            this.act = back;
            s.onBreak = back.kind !== 'parcel';
            this.startPath(layout.nav.findPath({ x: s.x, z: s.z }, back.target) ?? [back.target]);
            this.setPhase('stroll');
            break;
          }
          this.resumeAct = null;
          // back to the desk to wait for the next one
          const app = this.approachOf(ctx);
          this.startPath(layout.nav.findPath({ x: s.x, z: s.z }, app) ?? [app]);
          this.setPhase('returning');
          this.reportReturn = true;
        }
        break;
      }

      case 'leaving': {
        this.stepWave(dt, 2, false);
        if (this.waveT <= 0 && this.walk(dt, ctx)) {
          s.onStage = false;
          s.walking = false;
          sfx('door', s.roomId);
          this.setPhase('waiting');
        }
        this.walkPose(pose, 1);
        if (this.waveT > 0) this.wavePose(pose);
        break;
      }
    }

    // the director deals with the user's message while it is on screen: a message scrolled on the smartphone (in the chair, or wherever a break has brought him) or an email read at the laptop
    const msgOn = this.isDirector && (s.msgUntil ?? 0) > ctx.now && !s.walking;
    if (msgOn && s.msgVia !== 'email' && (s.phase === 'working' || s.phase === 'activity')) this.messagePose(pose);
    else {
      if (this.msgPhone) {
        this.msgPhone = false;
        if (this.held === 'phone') this.held = 'none';
        this.heldTilt = 0;
      }
      if (msgOn && s.msgVia === 'email' && s.phase === 'working') this.mailPose(pose);
    }
    // a question of the agent is waiting for the user: the director looks up and waves for attention (wakes him, over a break's hand pose)
    if (this.isDirector && ctx.rt.askAt > 0 && !s.walking) {
      if (this.sleepT >= 0) this.wake();
      if (!msgOn && (s.phase === 'working' || s.phase === 'activity')) this.askPose(pose, (ctx.now - ctx.rt.askAt) % 4);
    }
    this.updateWc(ctx);
    this.blink(dt);
    this.copyPose(pose);
  }

  // ------------------------------------------------------------ breaks
  /** The director has nothing to say (the staff carry out the work) and staff have no task: sit tight, walk around, sit on the sofa, watch a colleague, look out of the window, pet a cat. */
  private idleBehaviour(dt: number, ctx: ActorCtx) {
    if (this.sim.chatBy) {
      // somebody came over for a chat: no break of their own now
      this.restT = 0;
      this.deskAct = null;
      return;
    }
    if (!this.isResting(ctx)) {
      if (this.deskPetT >= 0 || this.deskAct) dismissIdle(this.sim.key);
      this.wake();
      this.restT = 0;
      this.deskPetT = -1;
      this.deskAct = null;
      return;
    }
    if (this.deskAct) {
      this.deskActT += dt;
      if (this.deskActT > this.deskActDur) {
        dismissIdle(this.sim.key);
        this.deskAct = null;
        this.restT = 0;
        this.nextIdleAt = 12 + Math.random() * 12;
        this.act = null;
      }
      return;
    }
    if (this.sleepT >= 0) {
      // napping in the chair: "Z z z" now and then, up again when the time is over
      this.sleepT += dt;
      this.zzz(ctx, this.sleepT);
      if (this.sleepT > (this.act?.dur ?? 30)) this.wake();
      return;
    }
    if (this.deskPetT >= 0) {
      this.deskPetT += dt;
      const cat = this.act?.catKey ? ctx.cats.find((c) => c.key === this.act!.catKey) : undefined;
      if (cat) {
        if (cat.petUntil < ctx.now && !ctx.person.demo) notePet();
        cat.petUntil = ctx.now + 0.6;
      }
      if (this.deskPetT > (this.act?.dur ?? 6) || !cat || !cat.onStage) {
        dismissIdle(this.sim.key);
        this.deskPetT = -1;
        this.restT = 0;
        this.nextIdleAt = 20 + Math.random() * 14;
        this.act = null;
      }
      return;
    }
    this.restT += dt;
    // the doorbell rang: whoever sits at the desk without work goes for the parcel soon
    if (ctx.rt.parcel === 'waiting' && !ctx.rt.parcelBy && this.nextIdleAt > this.restT + 6) this.nextIdleAt = this.restT + 2 + Math.random() * 4;
    if (this.restT < this.nextIdleAt) return;
    if (!this.motionOpen(ctx)) return; // (somebody else is on the move, or was a moment ago)
    const a = this.pickActivity(ctx);
    if (!a) {
      this.nextIdleAt = this.restT + 3 + Math.random() * 3;
      return;
    }
    if (a.kind === 'stay') {
      // stay in the chair a while longer
      this.restT = 0;
      this.nextIdleAt = 18 + Math.random() * 16;
      return;
    }
    this.act = a;
    // the thought appears right away – the character is still in the chair
    this.announce(ctx, thoughtOf(a, a.detail ?? ''));
    if (a.atDesk) {
      this.deskPetT = 0;
    } else if (a.deskAct) {
      this.deskAct = a.deskAct;
      this.deskActT = 0;
      this.deskActDur = a.dur;
    } else if (a.kind === 'sleep') {
      this.sleepT = 0;
      this.zzzStep = -1;
      this.sim.asleep = true;
    } else {
      this.strolling = true;
      this.claimMotion(ctx);
      // claim a break slot at once, so nobody else decides on one in the same frame (a parcel run is no break)
      this.sim.onBreak = a.kind !== 'parcel';
      this.setPhase('standing');
    }
  }

  /** up from a nap in the chair: eyes open (the pose resets every frame), the dozing bubble goes away */
  private wake() {
    if (this.sleepT < 0) return;
    this.sleepT = -1;
    this.sim.asleep = false;
    this.zzzStep = -1;
    this.act = null;
    this.restT = 0;
    this.nextIdleAt = 20 + Math.random() * 14;
    dismissIdle(this.sim.key);
  }

  /** a floating "Z z z" that grows a letter every 4 seconds (the speech bubble changes at most that often) */
  private zzz(ctx: ActorCtx, t: number) {
    if (t < 3) return;
    const step = Math.floor((t - 3) / 4);
    if (step === this.zzzStep) return;
    this.zzzStep = step;
    this.announce(ctx, [ZZZ[step % 3], 'sleep']);
  }

  /** how many other staff (not the director, not me) are in the office right now: who a greeting or goodbye is meant for */
  private colleaguesHere(ctx: ActorCtx): number {
    let n = 0;
    for (const o of ctx.others) if (o !== this.sim && o.onStage && o.desk >= 0) n++;
    return n;
  }

  /** the director rests while nobody needs him; the staff rest while they have no task */
  private isResting(ctx: ActorCtx): boolean {
    return this.isDirector ? ctx.lastSayAge > 8 : !ctx.task;
  }

  /** Something needs attention (a report to receive, closing time): cut the break short. Staff with a new task do not walk back: they work where they are (see awayWork). */
  private shouldReturn(ctx: ActorCtx): boolean {
    if (!ctx.person.present) return true;
    if (this.isDirector) return ctx.rt.visitors.some((v) => v !== null);
    return false;
  }

  /**
   * A task arrives while somebody is away from the desk: they do it right there (the break is paused) and go on with
   * the break afterwards. A finished sub-agent task still needs a report to the director – after that they come back
   * to what they were doing. Returns true while they are busy with the task.
   */
  private awayWork(dt: number, ctx: ActorCtx, pose: Pose): boolean {
    const task = ctx.task;
    if (this.isDirector || !task || !ctx.person.present) {
      this.awayTask = '';
      return false;
    }
    const s = this.sim;
    if (task.key !== this.awayTask) {
      this.awayTask = task.key;
      this.workTime = 0;
      this.drain = 0;
    }
    this.t -= dt; // the paused break does not run on
    s.walking = false;
    this.workTime += dt;
    this.held = 'none';
    this.smoke = 0;
    this.pour = 0;
    this.tapFlow = 0;
    this.steam = 0;
    this.heldTilt = 0;
    this.bookOpen = 0;
    this.awayPose(pose);
    if (task.done && this.workTime >= (task.source === 'sub' ? MIN_WORK : MIN_CALL)) {
      if (ctx.queueLen > 0 && this.drain < 4) this.drain += dt; // let the last bubbles finish first
      else if (task.source === 'sub') {
        // off to the director with the report, then back to the break
        this.failed = task.failed;
        this.reporting = true;
        this.resumeAct = this.act;
        this.awayTask = '';
        s.y = 0;
        s.sitT = 0;
        this.setPhase('toBoss');
      } else {
        ctx.onRelease();
        this.awayTask = '';
      }
    }
    return true;
  }

  /** working on a task standing up (or sitting on the sofa): head down over a tablet-sized nothing */
  private awayPose(p: Pose) {
    const c = this.clock;
    this.idlePose(p);
    if (this.sim.sitT > 0.5) this.seatedPose(p, this.sim.sitT, SOFA_KNEE);
    p.lean = 0.1;
    p.headX = 0.32 + Math.sin(c * 1.3) * 0.04;
    p.headY = Math.sin(c * 0.5) * 0.1;
    p.armRx = -1.0 + Math.sin(c * 17) * 0.05;
    p.armLx = -1.0 + Math.sin(c * 15 + 1) * 0.05;
    p.armRz = p.armLz = -0.2;
    p.foreRx = p.foreLx = -1.3;
  }

  private announce(ctx: ActorCtx, line: [string, string] | null) {
    if (!line || line[0] === this.lastSaid) return;
    this.lastSaid = line[0];
    ctx.say(line[0], line[1]);
  }

  private releaseSpot() {
    if (this.act?.spot !== undefined) {
      const k = `${this.sim.roomId}#${this.act.spot}`;
      if (spotOwners.get(k) === this.sim.key) spotOwners.delete(k);
    }
    if (this.act?.stationKey && spotOwners.get(this.act.stationKey) === this.sim.key) spotOwners.delete(this.act.stationKey);
    // an interrupted carton run: the thing in it is next in line again
    if (this.act?.openRank !== undefined && this.act.openRank >= 0 && this.layoutRef) {
      releaseLate(this.sim.roomId, this.layoutRef, this.act.openRank);
      this.act.openRank = undefined;
    }
    // an interrupted delivery run: the box goes back on the porch for the next one to fetch
    const prt = roomRuntime.get(this.sim.roomId);
    if (prt && prt.parcelBy === this.sim.key) {
      prt.parcelBy = null;
      if (prt.parcel === 'carried') prt.parcel = 'waiting';
    }
    // an interrupted tidy-up: the plant / carton is back in its old place, a claimed one is free again
    const mrt = movedIfAny(this.sim.roomId);
    if (mrt) {
      let changed = false;
      for (const it of mrt) {
        if (it.by !== this.sim.key) continue;
        if (it.state === 'carried') changed = true;
        it.state = 'placed';
        it.by = null;
        it.to = null;
      }
      if (changed) notifyMoved(this.sim.roomId);
    }
    this.heldScale = 1;
    this.smoke = 0;
    this.held = 'none';
    this.pour = 0;
    this.heldTilt = 0;
    this.bookOpen = 0;
    this.tap = null;
    this.tapFlow = 0;
  }

  private goHome(ctx: ActorCtx) {
    dismissIdle(this.sim.key); // the break is over: the thought about it goes away
    this.resumeAct = null;
    if (this.act?.partnerKey) {
      const friend = sims.get(this.act.partnerKey);
      if (friend?.chatBy === this.sim.key) friend.chatBy = null;
      dismissIdle(this.act.partnerKey);
    }
    this.steam = 0;
    this.steamAt = null;
    this.releaseSpot();
    const s = this.sim;
    s.y = 0;
    s.sitT = 0;
    const app = this.approachOf(ctx);
    // from the porch the way back leads through the door (the nav grid stops at the wall)
    this.startPath(this.onPorch(ctx) ? this.routeIn(ctx, app) : ctx.layout.nav.findPath({ x: s.x, z: s.z }, app) ?? [app]);
    this.act = null;
    this.setPhase('returning');
  }

  private randomFloorPoint(ctx: ActorCtx, ref: V2): V2 | null {
    const { width: W, depth: D, nav } = ctx.layout;
    for (let i = 0; i < 40; i++) {
      const p = { x: (Math.random() - 0.5) * (W - 2.4), z: (Math.random() - 0.5) * (D - 2.4) };
      const d = Math.hypot(p.x - ref.x, p.z - ref.z);
      if (d > 2 && d < 9 && !nav.isBlocked(p.x, p.z) && nav.reachable(ref, p)) return p;
    }
    return null;
  }

  private pickActivity(ctx: ActorCtx): Activity | null {
    const { layout, cats, workers } = ctx;
    const s = this.sim;
    // no break starts while the room's walking slots are taken (the retry comes 3-6 s later)
    if (!debugFlags.activity && !this.walkSlotOpen(ctx, s, false)) return null;
    const from = { x: s.x, z: s.z };
    const free = (p: V2) => !layout.nav.isBlocked(p.x, p.z);
    const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
    const seats = layout.spots.map((sp, i) => ({ sp, i })).filter(({ sp, i }) => (sp.kind === 'sofa' || sp.kind === 'armchair') && !sp.off && !spotOwners.has(`${s.roomId}#${i}`));
    // a cat asleep on the director's desk can only be reached from the director's chair
    const petCats = cats.filter((c) => c.onStage && c.still && c.petUntil < ctx.now && (this.isDirector || layout.spots[c.spot]?.kind !== 'desk'));
    const watchable = workers.filter((w) => w.desk >= 0 && w.busy && w.key !== s.key);
    const staff = !this.isDirector;
    const chatters = ctx.idlers.filter((w) => w.key !== s.key && !w.chatBy && !w.asleep && w.onStage && w.phase === 'working' && !w.busy && w.desk >= 0);
    const untidy = layout.movable.length ? untidyProps(s.roomId, layout, ctx.now) : [];
    // (cartons to open: they are parcels that have been waiting in the room)
    const openable = untidy.length > 0 && lateAvailable(s.roomId, layout) && movedOf(s.roomId, layout).some((it, i) => untidy.includes(i) && layout.props[it.prop].kind === 'boxes');
    const parcelFree = ctx.rt.parcel === 'waiting' && (!ctx.rt.parcelBy || !sims.get(ctx.rt.parcelBy)?.onStage);
    const rr = layout.restroom;
    const toiletFree = !!rr && !spotOwners.has(`${s.roomId}#${rr.spot}`);
    const chairsFree = layout.spots.map((sp, i) => ({ sp, i })).filter(({ sp, i }) => sp.kind === 'chair' && !sp.off && !spotOwners.has(`${s.roomId}#${i}`));
    /** people already sitting at round table `ti` (a table with company is more inviting) */
    const seated = (ti: number) => layout.tables[ti].seats.filter((i) => spotOwners.has(`${s.roomId}#${i}`)).length;
    const stationsOf = (k: StationKind) => layout.stations.map((st, i) => ({ st, i })).filter(({ st, i }) => st.kind === k && !st.off && !spotOwners.has(`${s.roomId}@${i}`));
    const options: [ActivityKind, number][] = [
      ['wander', staff ? 0.4 : 0.9], ['sofa', seats.length ? (staff ? 4 : 3) : 0], ['watch', watchable.length ? (staff ? 1.5 : 4) : 0],
      ['window', layout.catWindows.length ? (staff ? 1.5 : 2.5) : 0], ['pet', petCats.length ? (staff ? 4.5 : 5) : 0], ['stay', staff ? 5 : 0],
      ['drink', stationsOf('drink').length ? 4 : 0], ['read', stationsOf('read').length ? 3.5 : 0], ['fish', stationsOf('fish').length ? 3.5 : 0],
      ['wash', stationsOf('wash').length ? 2.5 : 0], ['water', stationsOf('water').length ? 3.5 : 0],
      ['cook', stationsOf('cook').length ? 3.5 : 0],
      ['box', stationsOf('box').length ? 2.5 : 0], ['lift', stationsOf('lift').length ? 2.5 : 0],
      ['chat', chatters.length ? (staff ? 4 : 2.5) : 0],
      ['music', staff ? 3.2 : 1.6], ['video', staff ? 3.2 : 1.4], ['browse', staff ? 2.4 : 1.4], ['game', staff ? 3 : 0.8], ['call', staff ? 2 : 1],
      ['shop', staff ? 2.4 : 1], ['mail', staff ? 2.4 : 1.6],
      ['toilet', toiletFree ? (staff ? 3 : 2) : 0], ['table', chairsFree.length ? (staff ? 3.5 : 2.5) * (1 + 0.9 * Math.max(...chairsFree.map(({ sp }) => seated(sp.table ?? 0)))) : 0],
      // a box on the porch: the first to roll it goes (nobody else is on the way); a nap is likelier at night
      ['parcel', parcelFree ? 150 : 0], ['tidy', untidy.length ? (openable ? (staff ? 9 : 6) : staff ? 4 : 2.5) : 0], ['sleep', staff || !ctx.rt.visitors.some((v) => v !== null) ? 2 * (1 + env.night) : 0],
    ];
    let roll = Math.random() * options.reduce((a, [, w]) => a + w, 0);
    let kind: ActivityKind = 'wander';
    const forced = debugFlags.activity as ActivityKind | undefined;
    if (forced && options.some(([k, w]) => k === forced && w > 0)) roll = -1;
    for (const [k, w] of options) {
      if (forced && roll === -1) {
        kind = forced;
        break;
      }
      roll -= w;
      if (roll <= 0 && w > 0) {
        kind = k;
        break;
      }
    }
    switch (kind) {
      case 'stay':
        return { kind, target: from, yaw: 0, dur: 0 };
      case 'drink':
      case 'read':
      case 'fish':
      case 'wash':
      case 'water':
      case 'box':
      case 'lift':
      case 'cook': {
        const { st, i } = pick(stationsOf(kind));
        const stationKey = `${s.roomId}@${i}`;
        spotOwners.set(stationKey, s.key);
        const dur = kind === 'drink' ? 15 : kind === 'read' ? 26 + Math.random() * 10 : kind === 'fish' ? 22 + Math.random() * 10 : kind === 'wash' ? 14 : kind === 'cook' ? 34 + Math.random() * 6 : kind === 'box' ? 18 + Math.random() * 10 : kind === 'lift' ? 20 + Math.random() * 10 : 20 + Math.random() * 6;
        return { kind, target: st.stand, yaw: st.yaw, dur, station: st, stationKey, detail: kind === 'read' ? pickOne(BOOKS) : undefined };
      }
      case 'toilet': {
        // a quick dash or a long sit; phone, book or nothing at all
        const i = rr!.spot;
        spotOwners.set(`${s.roomId}#${i}`, s.key);
        const hurry = Math.random() < 0.3;
        let mode: 'phone' | 'book' | 'none' = pick(['phone', 'phone', 'book', 'none', 'none'] as const);
        if (hurry && mode === 'book') mode = 'none';
        const dur = hurry ? 5 + Math.random() * 3 : mode === 'none' ? 14 + Math.random() * 12 : 26 + Math.random() * 24;
        return { kind, target: layout.spots[i].approach, yaw: layout.spots[i].yaw, dur, spot: i, toiletMode: mode, hurry };
      }
      case 'table': {
        // sit where somebody already sits when there is such a table
        const weighted = chairsFree.flatMap((c) => Array.from({ length: 1 + 2 * seated(c.sp.table ?? 0) }, () => c));
        const { sp, i } = pick(weighted);
        spotOwners.set(`${s.roomId}#${i}`, s.key);
        const meal = Math.random() < 0.62 ? 'coffee' : 'noodles';
        return { kind, target: sp.approach, yaw: sp.yaw, dur: meal === 'coffee' ? 30 + Math.random() * 16 : 36 + Math.random() * 14, spot: i, meal };
      }
      case 'sofa': {
        const { sp, i } = pick(seats);
        spotOwners.set(`${s.roomId}#${i}`, s.key);
        return { kind, target: sp.approach, yaw: sp.yaw, dur: 24 + Math.random() * 24, spot: i, phone: Math.random() < SOFA_PHONE_CHANCE };
      }
      case 'watch': {
        const w = pick(watchable);
        const d = layout.desks[w.desk];
        const f = rot2(0, 1, d.rot);
        const lat = rot2(1, 0, d.rot);
        for (const off of [0.45, -0.45, 0]) {
          const target = { x: d.seat.x - f.x * 0.95 + lat.x * off, z: d.seat.z - f.z * 0.95 + lat.z * off };
          if (free(target)) return { kind, target, yaw: d.rot, dur: 13 + Math.random() * 11, watchKey: w.key, detail: ctx.nameOf(w.key) };
        }
        return null;
      }
      case 'chat': {
        const w = pick(chatters);
        const d = layout.desks[w.desk];
        const f = rot2(0, 1, d.rot);
        const lat = rot2(1, 0, d.rot);
        for (const off of [0.95, -0.95]) {
          const target = { x: d.seat.x + lat.x * off - f.x * 0.25, z: d.seat.z + lat.z * off - f.z * 0.25 };
          if (!free(target)) continue;
          const script = pick(CHAT_SCRIPTS);
          w.chatBy = s.key; // the colleague stays put until the chat is over
          return { kind, target, yaw: Math.atan2(d.seat.x - target.x, d.seat.z - target.z), dur: script.length * CHAT_LINE_S + 2.5, partnerKey: w.key, script, detail: ctx.nameOf(w.key) };
        }
        return null;
      }
      case 'window': {
        const cw = pick(layout.catWindows);
        // about a third of them smoke while they look out (two drags instead of a long look)
        const smoke = Math.random() < 0.35;
        return { kind, target: cw.land, yaw: cw.yaw + Math.PI, dur: smoke ? 20 + Math.random() * 6 : 15 + Math.random() * 13, smoke };
      }
      case 'tidy': {
        // a plant or carton that stands in the middle of the room goes to a tidier place along a wall
        const items = movedOf(s.roomId, layout);
        // a carton that waits to be opened is carried to the place of the thing that is in it (it stands there as soon as the carton is open)
        for (const idx of untidy.filter((i) => layout.props[items[i].prop].kind === 'boxes').sort(() => Math.random() - 0.5)) {
          if (!lateAvailable(s.roomId, layout)) break;
          const it = items[idx];
          const stand = standBeside(layout, 'boxes', it.x, it.z, from);
          if (!stand) continue;
          const rank = claimLate(s.roomId, layout);
          if (rank < 0) break;
          const lp = layout.props[layout.late[rank]];
          const to: Place = { x: lp.x, z: lp.z, rot: lp.rot };
          it.by = s.key;
          it.to = to;
          return { kind, target: stand, yaw: Math.atan2(it.x - stand.x, it.z - stand.z), dur: 0, tidy: idx, tidyTo: to, openRank: rank };
        }
        for (const idx of untidy.sort(() => Math.random() - 0.5).slice(0, 3)) {
          const it = items[idx];
          const to = findTidySpot(s.roomId, layout, idx);
          const stand = to ? standBeside(layout, layout.props[it.prop].kind, it.x, it.z, from) : null;
          if (!to || !stand) continue;
          it.by = s.key;
          it.to = to;
          return { kind, target: stand, yaw: Math.atan2(it.x - stand.x, it.z - stand.z), dur: 0, tidy: idx, tidyTo: to };
        }
        return null;
      }
      case 'music':
      case 'video':
      case 'browse':
      case 'game':
      case 'call':
      case 'shop':
      case 'mail':
        return { kind, target: from, yaw: 0, dur: 18 + Math.random() * 24, deskAct: kind };
      case 'parcel': {
        // a spot on the porch in front of the box, looking at it
        const { threshold, dir } = layout.door;
        ctx.rt.parcelBy = s.key;
        return { kind, target: { x: threshold.x - dir.x * PORCH_STAND, z: threshold.z - dir.z * PORCH_STAND }, yaw: Math.atan2(-dir.x, -dir.z), dur: 0, outdoor: true };
      }
      case 'sleep': {
        const dur = 25 + Math.random() * 20;
        if (seats.length && Math.random() < 0.5) {
          // on a free sofa / armchair: the sofa flow does the walking, sitting down and getting up
          const { sp, i } = pick(seats);
          spotOwners.set(`${s.roomId}#${i}`, s.key);
          return { kind: 'sofa', target: sp.approach, yaw: sp.yaw, dur, spot: i, sleep: true };
        }
        return { kind, target: from, yaw: 0, dur };
      }
      case 'pet': {
        const c = pick(petCats);
        const spot = c.spot >= 0 ? layout.spots[c.spot] : null;
        if (spot?.kind === 'desk') return { kind, target: from, yaw: 0, dur: 11 + Math.random() * 5, catKey: c.key, atDesk: true };
        let target: V2 | null = null;
        if (spot && (spot.kind === 'sofa' || spot.kind === 'armchair' || spot.kind === 'beanbag' || spot.kind === 'box')) target = spot.approach;
        else {
          let best = Infinity;
          for (let a = 0; a < 12; a++) {
            const q = { x: c.x + Math.cos((a / 12) * Math.PI * 2) * 0.75, z: c.z + Math.sin((a / 12) * Math.PI * 2) * 0.75 };
            const d = Math.hypot(q.x - from.x, q.z - from.z);
            if (free(q) && d < best) {
              best = d;
              target = q;
            }
          }
        }
        if (!target) return null;
        return { kind, target, yaw: Math.atan2(c.x - target.x, c.z - target.z), dur: 11 + Math.random() * 6, catKey: c.key };
      }
      default: {
        const pts: V2[] = [];
        for (let n = 0; n < 3; n++) {
          const q = this.randomFloorPoint(ctx, pts[pts.length - 1] ?? from);
          if (q) pts.push(q);
        }
        if (!pts.length) return null;
        return { kind: 'wander', target: pts[0], yaw: 0, dur: 0, points: pts.slice(1) };
      }
    }
  }

  private activity(dt: number, ctx: ActorCtx, pose: Pose) {
    const a = this.act;
    const s = this.sim;
    if (!a) {
      this.goHome(ctx);
      return;
    }
    // (getting up from / sitting down on the sofa is finished first)
    if (a.kind !== 'parcel' && (!SEATED.has(a.kind) || this.actStage === 1) && this.awayWork(dt, ctx, pose)) return;
    const t = this.t;
    const back = this.shouldReturn(ctx);
    switch (a.kind) {
      case 'wander': {
        this.idlePose(pose);
        if (back || t > 0.9) {
          const next = a.points?.shift();
          if (!back && next) {
            this.startPath(ctx.layout.nav.findPath({ x: s.x, z: s.z }, next) ?? [next]);
            this.setPhase('stroll');
          } else this.goHome(ctx);
        }
        break;
      }
      case 'sofa':
      case 'toilet':
      case 'table': {
        const spot = ctx.layout.spots[a.spot!];
        const chair = spot.kind === 'chair';
        // (a sofa is deep and low: the shins stick out forward; on a chair or a toilet they hang straight down)
        const knee = a.kind === 'sofa' ? SOFA_KNEE : 1;
        // the thighs lie on the cushion (not in it) and the knees hang over the front edge
        const yOn = spot.y - this.hip + this.hip * THIGH_R;
        const k = this.hip / HIP;
        const fwdOff = chair ? CHAIR_FWD : SOFA_FWD;
        const seatX = spot.x + Math.sin(spot.yaw) * fwdOff * k;
        const seatZ = spot.z + Math.cos(spot.yaw) * fwdOff * k;
        // the sofa's front is +spot.yaw; the person sits facing the same way, with the back to the cushion
        const fx = Math.sin(spot.yaw);
        const fz = Math.cos(spot.yaw);
        // (a chair at the round table is entered from the side: the table is in front of it)
        const side = { x: spot.approach.x - seatX, z: spot.approach.z - seatZ };
        const sideLen = Math.hypot(side.x, side.z) || 1;
        const stand = chair
          ? { x: seatX + (side.x / sideLen) * CHAIR_STAND, z: seatZ + (side.z / sideLen) * CHAIR_STAND }
          : { x: seatX + fx * SOFA_STAND, z: seatZ + fz * SOFA_STAND };
        /** the route between the spot where the walk ends (`end`) and the standing point in front of the seat: out to the standing distance, then along the front */
        const route = (end: V2): V2[] => {
          const lat = chair ? 0 : (end.x - seatX) * fz - (end.z - seatZ) * fx;
          if (Math.abs(lat) < 0.05) return [end, stand];
          return [end, { x: stand.x + fz * lat, z: stand.z - fx * lat }, stand];
        };
        if (this.actStage === 0) {
          // walk up to the spot opposite the seat, turn round on the spot, then back down onto the cushion
          const pts = route(this.from);
          const len = polyLen(pts);
          const walkT = Math.max(0.3, len / (WALK_SPEED * 0.8));
          const turnEnd = walkT + SOFA_TURN_S2;
          s.y = 0;
          if (t < walkT) {
            const u = t / walkT;
            const p = polyAt(pts, len * (1 - (1 - u) * (1 - u)));
            s.x = p.x;
            s.z = p.z;
            s.sitT = 0;
            if (p.yaw !== null) this.faceYaw(p.yaw, dt, 11);
            this.walkPhase += dt * WALK_SPEED * 0.8 * 4.6;
            this.walkPose(pose, 0.8);
          } else if (t < turnEnd) {
            if (this.turnFrom === null) {
              this.turnFrom = s.yaw;
              this.turnDir = Math.random() < 0.5 ? 1 : -1;
            }
            const u = smooth((t - walkT) / SOFA_TURN_S2);
            let delta = angleDiff(this.turnFrom, spot.yaw);
            if (Math.abs(delta) > 2.8) delta = this.turnDir * Math.PI;
            s.x = stand.x;
            s.z = stand.z;
            s.sitT = 0;
            this.setYaw(this.turnFrom + delta * u);
            this.idlePose(pose);
            this.walkPhase += dt * 4.5;
            this.walkPose(pose, 0.3 * Math.sin(u * Math.PI));
          } else {
            // lean forward a little, lower the hips back onto the seat (sideways first, then down)
            const u = Math.min(1, (t - turnEnd) / SOFA_SIT_S2);
            const h = smooth(u / 0.7);
            const v = smooth(u);
            s.x = lerp(stand.x, seatX, h);
            s.z = lerp(stand.z, seatZ, h);
            s.y = lerp(0, yOn, v);
            s.sitT = v;
            this.setYaw(spot.yaw);
            this.seatedPose(pose, v, knee);
            pose.lean = 0.22 * Math.sin(u * Math.PI);
            pose.armLx = pose.armRx = -0.3 * Math.sin(u * Math.PI);
            if (u >= 1) {
              this.actStage = 1;
              this.turnFrom = null;
              this.t = 0;
            }
          }
        } else if (this.actStage === 1) {
          s.sitT = 1;
          this.faceYaw(spot.yaw, dt);
          this.seatedPose(pose, 1, knee);
          if (a.kind === 'toilet') this.toiletSeat(pose, a, t);
          else if (a.kind === 'table') this.tableSeat(pose, a, ctx, dt, t, spot);
          else if (a.sleep) {
            this.sleepPose(pose, true);
            this.zzz(ctx, t);
          } else if (a.phone) {
            this.held = 'phone';
            this.phonePose(pose, t);
            for (let at = 3; at < a.dur - 2; at += PHONE_SWIPE_S) this.cue('swipe', at);
          } else this.sofaPose(pose);
          if (back || t >= a.dur) {
            this.actStage = 2;
            this.t = 0;
          }
        } else if (this.actStage === 2) {
          // lean forward, push up, then step away along the front of the sofa
          this.held = 'none';
          this.heldTilt = 0;
          this.bookOpen = 0;
          if (a.kind === 'toilet') this.cue('flush', 0.4);
          const riseEnd = SOFA_LEAN_S + SOFA_RISE_S;
          if (t < riseEnd) {
            const u = smooth((t - SOFA_LEAN_S) / SOFA_RISE_S);
            const h = smooth(u * 1.2);
            s.x = lerp(seatX, stand.x, h);
            s.z = lerp(seatZ, stand.z, h);
            s.y = lerp(yOn, 0, u);
            s.sitT = 1 - u;
            this.setYaw(spot.yaw);
            this.seatedPose(pose, s.sitT, knee);
            pose.lean = 0.3 * (t < SOFA_LEAN_S ? smooth(t / SOFA_LEAN_S) : 1 - u * 0.8);
            pose.armLx = pose.armRx = -0.3 * Math.sin(Math.min(1, t / riseEnd) * Math.PI);
          } else {
            const pts = route(spot.approach).reverse();
            const len = polyLen(pts);
            const walkT = Math.max(0.25, len / (WALK_SPEED * 0.8));
            const u = Math.min(1, (t - riseEnd) / walkT);
            const p = polyAt(pts, len * u);
            s.x = p.x;
            s.z = p.z;
            s.y = 0;
            s.sitT = 0;
            if (p.yaw !== null) this.faceYaw(p.yaw, dt, 11);
            this.walkPhase += dt * WALK_SPEED * 0.8 * 4.6;
            this.walkPose(pose, 0.8);
            if (u >= 1) this.leaveSeat(ctx, a, back);
          }
        } else {
          // toilet: waiting at the cubicle for a free sink
          this.idlePose(pose);
          this.held = 'none';
          if (back || t > SINK_WAIT_MAX) this.goHome(ctx);
          else this.startWash(ctx);
        }
        break;
      }
      case 'watch': {
        const w = ctx.workers.find((x) => x.key === a.watchKey);
        this.faceYaw(a.yaw, dt, 6);
        this.watchPose(pose);
        if (back || t > a.dur || !w || !w.busy) this.goHome(ctx);
        break;
      }
      case 'window': {
        this.faceYaw(a.yaw, dt, 5);
        if (a.smoke) {
          this.held = 'cig';
          this.smokePose(pose);
          for (let at = 2.4; at < a.dur - 3; at += SMOKE_CYCLE) this.cue('inhale', at);
          for (let at = 5.0; at < a.dur - 2; at += SMOKE_CYCLE) this.cue('exhale', at);
        } else this.lookOutPose(pose);
        if (back || t > a.dur) this.goHome(ctx);
        break;
      }
      case 'tidy': {
        this.tidyRun(dt, ctx, pose, a, back);
        break;
      }
      case 'parcel': {
        this.parcelRun(dt, ctx, pose, a, back);
        break;
      }
      case 'pet': {
        const cat = ctx.cats.find((c) => c.key === a.catKey);
        if (cat) {
          if (cat.petUntil < ctx.now && !ctx.person.demo) notePet();
          cat.petUntil = ctx.now + 0.6;
          this.faceYaw(Math.atan2(cat.x - s.x, cat.z - s.z), dt, 8);
        }
        this.petPose(pose);
        this.cue('meow', 1.4);
        if (back || t > a.dur || !cat || !cat.onStage || !cat.still) this.goHome(ctx);
        break;
      }
      case 'drink':
      case 'read':
      case 'fish':
      case 'wash':
      case 'water':
      case 'box':
      case 'lift':
      case 'cook': {
        this.faceYaw(a.yaw, dt, 7);
        this.idlePose(pose);
        this.stationPose(a, pose, ctx);
        if (back || t > a.dur) this.goHome(ctx);
        break;
      }
      case 'chat': {
        const friend = a.partnerKey ? sims.get(a.partnerKey) : undefined;
        const ok = !!friend && friend.onStage && friend.phase === 'working' && !friend.busy;
        if (friend) this.faceYaw(Math.atan2(friend.x - s.x, friend.z - s.z), dt, 7);
        // one line at a time: mine first, then theirs
        const line = Math.floor((t - 0.9) / CHAT_LINE_S);
        const script = a.script ?? [];
        if (line !== this.chatLine && line >= 0 && line < script.length && ok && a.partnerKey) {
          this.chatLine = line;
          enqueueSpeech(line % 2 === 0 ? s.key : a.partnerKey, { kind: 'idle', text: script[line], tool: 'talk' }, true);
          sfx('talk', s.roomId);
        }
        this.chatPose(pose, line >= 0 && line < script.length && line % 2 === 0);
        if (back || !ok || t > a.dur) this.goHome(ctx);
        break;
      }
    }
    this.prevT = t;
  }

  /** on the toilet: scrolling the phone, reading a book, or just sitting (hands on the knees); an emergency taps a foot */
  private toiletSeat(p: Pose, a: Activity, t: number) {
    const c = this.clock;
    this.held = 'none';
    this.heldTilt = 0;
    this.bookOpen = 0;
    const mode = a.toiletMode ?? 'none';
    if (mode === 'phone') {
      this.held = 'phone';
      this.phonePose(p, t, 1);
      for (let at = 3; at < a.dur - 2; at += PHONE_SWIPE_S) this.cue('swipe', at);
    } else if (mode === 'book') {
      this.held = 'book';
      this.bookOpen = seg(t, 0.3, 0.9);
      this.heldTilt = -0.95 * seg(t, 0.2, 0.9);
      p.lean = 0.08;
      p.armRx = -1.0;
      p.armRz = -0.4;
      p.foreRx = -1.55;
      p.armLx = -0.95 + Math.max(0, Math.sin(c * 0.7)) ** 8 * -0.25;
      p.armLz = -0.4;
      p.foreLx = -1.55;
      p.headX = 0.34;
      p.headY = Math.sin(c * 0.5) * 0.1;
      for (let at = 4; at < a.dur - 2; at += 5.5) this.cue('page', at);
    } else {
      // hands on the knees, looking at the door, the floor, the ceiling…
      p.lean = a.hurry ? 0.2 : 0.12;
      p.armRx = p.armLx = -0.55;
      p.armRz = p.armLz = 0.15;
      p.foreRx = p.foreLx = -0.7;
      p.headX = 0.15 + Math.sin(c * 0.8) * 0.06;
      p.headY = Math.sin(c * 0.45) * 0.35;
      if (a.hurry) {
        p.kneeRx += Math.max(0, Math.sin(c * 16)) * 0.14;
        p.headX = 0.3;
        p.mouth = 'o';
      } else p.happy = 0.2 + 0.2 * Math.max(0, Math.sin(c * 0.3));
    }
  }

  /** at the round table: sip a coffee or eat a bowl of noodles; with company, somebody says something every few seconds and the others listen */
  private tableSeat(p: Pose, a: Activity, ctx: ActorCtx, dt: number, t: number, spot: Spot) {
    const s = this.sim;
    const c = this.clock;
    const now = ctx.now;
    const coffee = a.meal === 'coffee';
    this.held = coffee ? 'cup' : 'bowl';
    this.heldTilt = 0;
    this.bookOpen = 0;
    // the others at this table
    const mates: SimState[] = [];
    for (const i of ctx.layout.tables[spot.table ?? 0]?.seats ?? []) {
      const key = spotOwners.get(`${s.roomId}#${i}`);
      if (!key || key === s.key) continue;
      const m = sims.get(key);
      if (m && m.onStage && m.phase === 'activity' && m.sitT > 0.9) mates.push(m);
    }
    const tk = `${s.roomId}#t${spot.table ?? 0}`;
    let talk = tableTalk.get(tk);
    if (mates.length && t > 2.5 && (!talk || now > talk.until) && now > (talk?.next ?? 0) && Math.random() < dt * 0.3) {
      talk = { by: s.key, until: now + 3.4, next: now + 4.5 + Math.random() * 4 };
      tableTalk.set(tk, talk);
      enqueueSpeech(s.key, { kind: 'idle', text: pickOne(TABLE_LINES), tool: 'talk' }, true);
      sfx('talk', s.roomId);
    }
    const speaking = !!talk && talk.by === s.key && now < talk.until;
    const speaker = talk && talk.by !== s.key && now < talk.until ? sims.get(talk.by) : undefined;
    // sip / bite every few seconds: the cup or bowl comes up to the mouth and goes back down to the table
    const period = coffee ? 8 : 6.5;
    const cyc = t > 2 ? (t - 2) / period : -1;
    const u = cyc >= 0 ? cyc % 1 : 0;
    const raise = cyc >= 0 ? seg(u, 0, 0.16) * (1 - seg(u, 0.4, 0.58)) : 0;
    if (cyc >= 0 && u > 0.28 && Math.floor(cyc) >= this.bites) {
      this.bites = Math.floor(cyc) + 1;
      sfx(coffee ? 'sip' : 'bite', s.roomId);
    }
    if (!coffee && cyc >= 0 && !this.ate && !mates.length) {
      this.ate = true;
      this.announce(ctx, [eatLine(), 'eat']);
    }
    p.lean = 0.06;
    // right hand: the cup / bowl (on the table, up to the mouth); left hand: on the table, or talking
    p.armRx = lerp(this.reach.arm + 0.12, -0.85, raise);
    p.armRz = lerp(-0.12, -0.55, raise);
    p.foreRx = lerp(this.reach.fore - 0.2, -2.05, raise);
    p.armLx = this.reach.arm;
    p.armLz = -0.12;
    p.foreLx = this.reach.fore;
    this.heldTilt = coffee ? -0.55 * raise : -0.35 * raise;
    p.headX = 0.08 - 0.18 * raise;
    p.headY = mates.length ? Math.sin(c * 0.35) * 0.4 : Math.sin(c * 0.4) * 0.3;
    p.happy = 0.3 + 0.5 * raise;
    if (speaking) {
      p.armLx = -0.6 + Math.sin(c * 4.2) * 0.25;
      p.armLz = -0.25;
      p.foreLx = -1.0 + Math.sin(c * 4.2 + 1) * 0.3;
      p.headX += Math.sin(c * 5) * 0.05;
      p.happy = 0.8;
      p.mouth = Math.sin(c * 13) > 0 ? 'o' : 'smile';
    } else if (speaker) {
      // listen: look at whoever talks, nod
      const bearing = angleDiff(s.yaw, Math.atan2(speaker.x - s.x, speaker.z - s.z));
      p.headY = Math.max(-1.1, Math.min(1.1, bearing));
      p.headX += Math.sin(c * 3.1) * 0.04;
      p.happy = Math.max(p.happy, 0.45);
    }
  }

  /** the seat is free again; after the toilet one goes and washes their hands, anything else goes home */
  private leaveSeat(ctx: ActorCtx, a: Activity, back: boolean) {
    if (a.kind === 'toilet' && !back) {
      if (this.startWash(ctx)) return;
      if (ctx.layout.stations.some((st) => st.kind === 'wash' && !st.off)) {
        // all sinks busy: wait here, politely
        this.actStage = 3;
        this.t = 0;
        return;
      }
    }
    this.goHome(ctx);
  }

  /** walk to the nearest free sink (the one next to the cubicle first) and wash up; false when every sink is taken */
  private startWash(ctx: ActorCtx): boolean {
    const L = ctx.layout;
    const s = this.sim;
    const rr = L.restroom;
    let pick = -1;
    let bestD = Infinity;
    L.stations.forEach((st, i) => {
      if (st.kind !== 'wash' || st.off || spotOwners.has(`${s.roomId}@${i}`)) return;
      const d = Math.hypot(st.stand.x - s.x, st.stand.z - s.z) - (rr && rr.wash === i ? 3 : 0);
      if (d < bestD) {
        bestD = d;
        pick = i;
      }
    });
    if (pick < 0) return false;
    const st = L.stations[pick];
    const key = `${s.roomId}@${pick}`;
    this.releaseSpot();
    spotOwners.set(key, s.key);
    this.act = { kind: 'wash', target: st.stand, yaw: st.yaw, dur: 11, station: st, stationKey: key };
    this.announce(ctx, [thoughts.washHands(), 'wash']);
    this.startPath(L.nav.findPath({ x: s.x, z: s.z }, st.stand) ?? [st.stand]);
    s.y = 0;
    s.sitT = 0;
    this.setPhase('stroll');
    return true;
  }

  /** tells the cubicle door what is going on: 1 = somebody comes / goes through the doorway, 2 = somebody is inside (door shut), 3 = somebody on the way out */
  private updateWc(ctx: ActorCtx) {
    const s = this.sim;
    const a = this.act;
    const rr = ctx.layout.restroom;
    let v: 1 | 2 | 3 | undefined;
    if (a?.kind === 'toilet' && rr && s.onStage) {
      if (s.phase === 'stroll') {
        const ap = ctx.layout.spots[a.spot!].approach;
        if (Math.hypot(s.x - ap.x, s.z - ap.z) < 3) v = 1;
      } else if (s.phase === 'activity') {
        if (this.actStage === 0) v = s.z > rr.frontZ - 0.35 ? 1 : 2;
        else if (this.actStage === 1) v = 2;
        else if (this.actStage === 2) v = s.z < rr.frontZ + 0.9 ? 3 : undefined;
      }
    }
    s.wc = v;
  }

  /** on the sofa: head down over the phone, the thumb flicks the screen now and then, a smile at something funny */
  private phonePose(p: Pose, t: number, knee = SOFA_KNEE) {
    const c = this.clock;
    this.seatedPose(p, 1, knee);
    p.lean = 0.1;
    p.headX = 0.42 + Math.sin(c * 0.7) * 0.03;
    p.headY = Math.sin(c * 0.4) * 0.05;
    p.armRx = -1.05;
    p.armRz = -0.32;
    p.foreRx = -1.35;
    p.armLx = -0.95;
    p.armLz = -0.3;
    p.foreLx = -1.3;
    // thumb scroll: short flicks of the forearm, three to a bunch, then a pause
    const flick = Math.max(0, Math.sin(c * 7.5)) * (Math.sin(c * 0.9) > 0.1 ? 1 : 0);
    p.foreRx -= flick * 0.05;
    p.armRx -= flick * 0.02;
    const m = (t + 5) % PHONE_BUMP_S;
    const bump = seg(m, 0, 0.4) * (1 - seg(m, 1.4, 2.0));
    p.happy = 0.15 + 0.85 * bump;
    p.bob = Math.sin(c * 1.15) * 0.004;
  }

  /** standing, head down over the phone, a thumb flicking the screen */
  private standPhonePose(p: Pose) {
    const c = this.clock;
    p.lean = 0.06;
    p.headX = 0.4 + Math.sin(c * 0.7) * 0.03;
    p.headY = Math.sin(c * 0.4) * 0.04;
    p.armRx = -1.05;
    p.armRz = -0.32;
    p.foreRx = -1.35;
    p.armLx = -0.95;
    p.armLz = -0.3;
    p.foreLx = -1.3;
    const flick = Math.max(0, Math.sin(c * 7.5)) * (Math.sin(c * 0.9) > 0.1 ? 1 : 0);
    p.foreRx -= flick * 0.05;
    p.armRx -= flick * 0.02;
    p.happy = 0.2 + 0.4 * Math.max(0, Math.sin(c * 0.8));
    p.bob = Math.sin(c * 1.3) * 0.004;
  }

  /** the user's message on the smartphone: head down over it, a thumb scrolling (arms and head only, so it fits sitting and standing, over any other arm pose) */
  private messagePose(p: Pose) {
    this.held = 'phone';
    this.msgPhone = true;
    this.heldTilt = 0;
    this.typing = 0;
    this.standPhonePose(p);
  }

  /** waiting for an answer: the head up, the right arm raised in a slow wave for about 2 s of every 4 (arms and head only, so it fits sitting and standing) */
  private askPose(p: Pose, t: number) {
    const up = seg(t, 0, 0.35) * (1 - seg(t, 1.7, 2.1));
    if (up <= 0) return;
    const c = this.clock;
    this.typing = 0;
    p.armRx += (-2.6 - p.armRx) * up;
    p.armRz += (0.35 + Math.sin(c * 9) * 0.3 - p.armRz) * up;
    p.foreRx += (-0.3 - p.foreRx) * up;
    p.headX += (-0.12 - p.headX) * up;
    p.happy = Math.max(p.happy, 0.8 * up);
  }

  /** an email at the laptop: a little lean towards the screen, the head down and tilted, a slow nod now and then (over the seated typing pose, no item in the hand) */
  private mailPose(p: Pose) {
    const c = this.clock;
    p.lean = Math.max(p.lean, 0.1);
    p.headX = 0.26 + Math.sin(c * 1.9) * 0.05 * Math.max(0, Math.sin(c * 0.45));
    p.headZ = 0.08;
    p.headY = Math.sin(c * 0.6) * 0.05;
    p.happy = Math.max(p.happy, 0.2);
  }

  /** talking with a colleague: gestures while speaking, a little nod while listening */
  private chatPose(p: Pose, speaking: boolean) {
    const c = this.clock;
    this.idlePose(p);
    if (speaking) {
      p.armRx = -0.55 + Math.sin(c * 4.2) * 0.22;
      p.armRz = -0.25;
      p.foreRx = -1.0 + Math.sin(c * 4.2 + 1) * 0.3;
      p.armLx = -0.25 + Math.sin(c * 3.1) * 0.12;
      p.headX = Math.sin(c * 5) * 0.06;
      p.headY = Math.sin(c * 1.3) * 0.15;
      p.happy = 0.5;
      p.lean = 0.04;
    } else {
      p.headX = 0.05 + Math.sin(c * 3.1) * 0.07;
      p.armLx = p.armRx = 0.05;
      p.happy = 0.3;
    }
  }

  /** piecewise smooth interpolation between key poses */
  private keyed(pose: Pose, keys: Key[], t: number) {
    // no per-call allocation: missing channels fall back to RELAXED while reading
    const n = keys.length;
    let i = 0;
    while (i < n - 2 && t > keys[i + 1].t) i++;
    const a = keys[i];
    const b = keys[Math.min(i + 1, n - 1)];
    const u = b.t > a.t ? seg(t, a.t, b.t) : 1;
    pose.armRx = lerp(a.rx ?? RELAXED.rx, b.rx ?? RELAXED.rx, u);
    pose.armRz = lerp(a.rz ?? RELAXED.rz, b.rz ?? RELAXED.rz, u);
    pose.foreRx = lerp(a.fr ?? RELAXED.fr, b.fr ?? RELAXED.fr, u);
    pose.armLx = lerp(a.lx ?? RELAXED.lx, b.lx ?? RELAXED.lx, u);
    pose.armLz = lerp(a.lz ?? RELAXED.lz, b.lz ?? RELAXED.lz, u);
    pose.foreLx = lerp(a.fl ?? RELAXED.fl, b.fl ?? RELAXED.fl, u);
    pose.lean = lerp(a.lean ?? RELAXED.lean, b.lean ?? RELAXED.lean, u);
    pose.headX = lerp(a.hx ?? RELAXED.hx, b.hx ?? RELAXED.hx, u);
  }

  /** the little scenes: getting a drink, reading, watching the fish, washing up, watering a plant */
  private stationPose(a: Activity, pose: Pose, ctx: ActorCtx) {
    const t = this.t;
    const d = a.dur;
    const c = this.clock;
    this.held = 'none';
    this.pour = 0;
    this.tapFlow = 0;
    this.heldTilt = 0;
    this.bookOpen = 0;
    this.steam = 0;
    this.steamAt = null;
    switch (a.kind) {
      case 'drink': {
        this.keyed(pose, [
          { t: 0 }, { t: 0.7 },
          { t: 1.5, rx: -1.25, rz: -0.05, fr: -0.45, lean: 0.05 },
          { t: 3.4, rx: -1.25, rz: -0.05, fr: -0.45, lean: 0.08, hx: 0.12 },
          { t: 4.4, rx: -0.85, rz: -0.55, fr: -2.05, hx: -0.08 },
          { t: d - 1.9, rx: -0.85, rz: -0.55, fr: -2.05, hx: -0.08 },
          { t: d - 0.9, rx: -0.1, rz: 0.1, fr: -0.15 },
          { t: d },
        ], t);
        if (t > 1.0 && t < d - 1.0) this.held = 'cup';
        const sip = t > 4.4 && t < d - 1.9 ? Math.max(0, Math.sin(c * 2.3)) : 0;
        pose.headX -= 0.14 * sip;
        this.heldTilt = -0.55 * sip;
        if (t > d - 1.0) pose.happy = 1;
        for (let at = 4.8; at < d - 2.4; at += 2.9) this.cue('sip', at);
        break;
      }
      case 'read': {
        this.keyed(pose, [
          { t: 0 }, { t: 0.6 },
          { t: 1.6, rx: -1.35, rz: -0.1, fr: -0.25, lean: 0.05 },
          { t: 3.6, rx: -1.0, rz: -0.4, fr: -1.55, lx: -0.95, lz: -0.4, fl: -1.55, lean: 0.06, hx: 0.34 },
          { t: d - 2.6, rx: -1.0, rz: -0.4, fr: -1.55, lx: -0.95, lz: -0.4, fl: -1.55, lean: 0.06, hx: 0.34 },
          { t: d - 1.2, rx: -1.35, rz: -0.1, fr: -0.25, lean: 0.04 },
          { t: d },
        ], t);
        if (t > 2.0 && t < d - 0.7) this.held = 'book';
        this.heldTilt = -0.95 * seg(t, 2.2, 3.6) * (1 - seg(t, d - 2.6, d - 1.6));
        this.bookOpen = seg(t, 3.2, 3.8) * (1 - seg(t, d - 2.4, d - 1.8));
        for (let at = 4.6; at < d - 3; at += 5.5) this.cue('page', at);
        if (t > 3.6 && t < d - 2.6) {
          pose.headY = Math.sin(c * 0.5) * 0.12;
          // now and then a page is turned
          pose.armLx += Math.max(0, Math.sin(c * 0.7)) ** 8 * -0.25;
        }
        break;
      }
      case 'fish': {
        const point = seg(t, d * 0.45, d * 0.45 + 0.6) * (1 - seg(t, d * 0.45 + 1.6, d * 0.45 + 2.2));
        this.keyed(pose, [
          { t: 0 }, { t: 0.9, rx: 0.35, rz: -0.3, fr: 0, lx: 0.35, lz: -0.3, fl: 0, lean: 0.1, hx: 0.16 },
          { t: d - 0.9, rx: 0.35, rz: -0.3, fr: 0, lx: 0.35, lz: -0.3, fl: 0, lean: 0.1, hx: 0.16 }, { t: d },
        ], t);
        // pointing at a fish
        pose.armRx = lerp(pose.armRx, -1.2, point);
        pose.armRz = lerp(pose.armRz, 0.15, point);
        pose.foreRx = lerp(pose.foreRx, -0.25, point);
        pose.headY = Math.sin(c * 0.8) * 0.4;
        pose.happy = 0.6;
        for (let at = 2; at < d - 1; at += 3.1) this.cue('blip', at);
        break;
      }
      case 'wash': {
        const rub = Math.sin(c * 13) * 0.12;
        this.keyed(pose, [
          { t: 0 }, { t: 0.8, rx: -0.9, rz: -0.25, fr: -0.7, lx: -0.9, lz: -0.25, fl: -0.7, lean: 0.3, hx: 0.25 },
          { t: d - 4.6, rx: -0.9, rz: -0.25, fr: -0.7, lx: -0.9, lz: -0.25, fl: -0.7, lean: 0.3, hx: 0.25 },
          { t: d - 3.8, rx: -1.05, rz: -0.3, fr: -2.2, lx: -1.05, lz: -0.3, fl: -2.2, lean: 0.25, hx: 0.2 },
          { t: d - 2.4, rx: -1.05, rz: -0.3, fr: -2.2, lx: -1.05, lz: -0.3, fl: -2.2, lean: 0.25, hx: 0.2 },
          { t: d - 1.5, rx: -0.85, rz: -0.55, fr: -2.05, lean: 0.05, hx: -0.05 },
          { t: d - 0.4 }, { t: d },
        ], t);
        this.cue('water', 0.8);
        this.cue('water', d - 3.8);
        if (t > 0.8 && t < d - 4.6) {
          pose.foreRx += rub;
          pose.foreLx -= rub;
        } else if (t > d - 3.8 && t < d - 2.4) {
          pose.foreRx += rub * 0.8;
          pose.foreLx -= rub * 0.8;
        }
        this.tap = a.station?.tap ?? null;
        this.tapFlow = seg(t, 0.8, 1.1) * (1 - seg(t, d - 3.6, d - 3.3));
        if (t > d - 1.6) pose.happy = 1;
        break;
      }
      case 'water': {
        this.keyed(pose, [
          { t: 0 }, { t: 0.2, lean: 0.05 },
          { t: 0.7, rx: -0.3, rz: 0.05, fr: -0.1, lz: 0.5, lean: 0.55 },
          { t: 1.5, rx: -1.2, rz: -0.1, fr: -0.55, lz: 0.5, lean: 0.12, hx: 0.15 },
          { t: d - 2.2, rx: -1.2, rz: -0.1, fr: -0.55, lz: 0.5, lean: 0.12, hx: 0.28 },
          { t: d - 1.0, rx: -0.3, rz: 0.05, fr: -0.1, lz: 0.4, lean: 0.55 },
          { t: d - 0.2, lean: 0.2 }, { t: d },
        ], t);
        if (t > 0.45 && t < d - 0.5) this.held = 'can';
        this.cue('pour', 2.2);
        this.pour = seg(t, 2.0, 2.8) * (1 - seg(t, d - 3.0, d - 2.2));
        this.heldTilt = 0.9 * this.pour;
        pose.happy = 0.5;
        break;
      }
      case 'cook': {
        // stir the pan, serve the noodles into a bowl and eat them right there
        const cookEnd = d * 0.4;
        const eatAt = cookEnd + 2.6;
        const chest = { rx: -1.15, rz: -0.1, fr: -0.7 };
        this.keyed(pose, [
          { t: 0 }, { t: 1.2, rx: -1.1, rz: -0.15, fr: -0.5, lz: 0.3, lean: 0.1, hx: 0.25 },
          { t: cookEnd, rx: -1.1, rz: -0.15, fr: -0.5, lz: 0.3, lean: 0.1, hx: 0.25 },
          { t: cookEnd + 1.3, rx: -0.5, rz: 0.1, fr: -0.4, lean: 0.06, hx: 0.15 },
          { t: eatAt, ...chest, lean: 0.03 },
          { t: d - 1.6, ...chest, lean: 0.03 },
          { t: d - 0.6 }, { t: d },
        ], t);
        this.steamAt = a.station?.pan ?? null;
        this.steam = seg(t, 1.0, 2.2) * (1 - seg(t, cookEnd + 0.8, cookEnd + 2.2));
        if (t > 1.2 && t < cookEnd) {
          // stirring: the forearm circles over the pan
          pose.foreRx = -0.5 + Math.sin(c * 5.5) * 0.3;
          pose.armRz = -0.15 + Math.cos(c * 5.5) * 0.12;
          pose.headY = Math.sin(c * 0.6) * 0.1;
        }
        this.cue('sizzle', 1.2);
        this.cue('sizzle', cookEnd * 0.55);
        this.cue('clink', cookEnd + 1.3);
        if (t > cookEnd + 1.0 && t < d - 0.6) this.held = 'bowl';
        if (t > cookEnd + 0.3 && !this.served) {
          this.served = true;
          this.announce(ctx, [serveLine(), 'eat']);
        }
        if (t > eatAt && t < d - 1.6) {
          if (!this.ate) {
            this.ate = true;
            this.announce(ctx, [eatLine(), 'eat']);
          }
          // a bite every few seconds: the bowl comes up to the mouth, a little chewing, then it goes back down
          const u = ((t - eatAt) / 3.2) % 1;
          const raise = seg(u, 0, 0.22) * (1 - seg(u, 0.5, 0.72));
          const bite = Math.floor((t - eatAt) / 3.2);
          if (u > 0.25 && bite >= this.bites) {
            this.bites = bite + 1;
            sfx('bite', this.sim.roomId);
          }
          pose.armRx = lerp(chest.rx, -0.85, raise);
          pose.armRz = lerp(chest.rz, -0.55, raise);
          pose.foreRx = lerp(chest.fr, -2.05, raise);
          pose.headX = -0.1 * raise + (u > 0.3 && u < 0.72 ? Math.sin(c * 14) * 0.05 : 0);
          pose.happy = 0.4 + 0.6 * raise;
          this.heldTilt = -0.5 * raise;
        }
        break;
      }
      case 'box':
        this.boxPose(a, pose);
        break;
      case 'lift':
        this.liftPose(a, pose);
        break;
      default:
    }
  }

  /** key-pose blend with an explicit weight (same channels as `keyed`) */
  private mixKey(pose: Pose, a: Key, b: Key, u: number) {
    pose.armRx = lerp(a.rx ?? RELAXED.rx, b.rx ?? RELAXED.rx, u);
    pose.armRz = lerp(a.rz ?? RELAXED.rz, b.rz ?? RELAXED.rz, u);
    pose.foreRx = lerp(a.fr ?? RELAXED.fr, b.fr ?? RELAXED.fr, u);
    pose.armLx = lerp(a.lx ?? RELAXED.lx, b.lx ?? RELAXED.lx, u);
    pose.armLz = lerp(a.lz ?? RELAXED.lz, b.lz ?? RELAXED.lz, u);
    pose.foreLx = lerp(a.fl ?? RELAXED.fl, b.fl ?? RELAXED.fl, u);
    pose.lean = lerp(a.lean ?? RELAXED.lean, b.lean ?? RELAXED.lean, u);
    pose.headX = lerp(a.hx ?? RELAXED.hx, b.hx ?? RELAXED.hx, u);
  }

  /** boxing a punching dummy: guard, alternating jabs and crosses (torso twist, footwork), a breather now and then, a little victory dance */
  private boxPose(a: Activity, pose: Pose) {
    const t = this.t;
    const d = a.dur;
    const c = this.clock;
    const fightEnd = d - 3.2;
    const room = this.sim.roomId;
    if (t < 0.9) this.mixKey(pose, K_NONE, K_GUARD, seg(t, 0, 0.9));
    else if (t < fightEnd) this.mixKey(pose, K_GUARD, K_GUARD, 0);
    else if (t < d - 1.6) this.mixKey(pose, K_GUARD, K_CHEER, seg(t, fightEnd, fightEnd + 0.4));
    else this.mixKey(pose, K_CHEER, K_NONE, seg(t, d - 1.6, d - 0.6));
    // fighting stance: knees bent, light bouncing on the feet
    const stance = seg(t, 0, 0.9) * (1 - seg(t, fightEnd, fightEnd + 0.4));
    const fw = Math.sin(c * 6.5) * stance;
    pose.thighLx = -0.2 * stance + fw * 0.08;
    pose.thighRx = -0.2 * stance - fw * 0.08;
    pose.kneeLx = 0.3 * stance + Math.max(0, fw) * 0.1;
    pose.kneeRx = 0.3 * stance + Math.max(0, -fw) * 0.1;
    pose.bob = -0.05 * stance + Math.abs(fw) * 0.025;
    if (t >= 0.9 && t < fightEnd - 0.2) {
      pose.headY = Math.sin(c * 3.1) * 0.06;
      const ft = (t - 0.9) / PUNCH_S;
      const n = Math.floor(ft);
      // every seventh beat is a breather
      if (n % 7 !== 6) {
        const u = ft - n;
        const right = n % 2 === 0;
        const e = seg(u, 0, 0.28) * (1 - seg(u, 0.36, 0.75));
        if (right) {
          pose.armRx = lerp(K_GUARD.rx!, -1.5, e);
          pose.armRz = lerp(K_GUARD.rz!, -0.03, e);
          pose.foreRx = lerp(K_GUARD.fr!, -0.12, e);
        } else {
          pose.armLx = lerp(K_GUARD.lx!, -1.5, e);
          pose.armLz = lerp(K_GUARD.lz!, -0.03, e);
          pose.foreLx = lerp(K_GUARD.fl!, -0.12, e);
        }
        pose.twist = (right ? -0.38 : 0.38) * e;
        pose.lean += 0.07 * e;
        if (e > 0.5) pose.mouth = 'o';
        if (u > 0.28 && n >= this.bites) {
          this.bites = n + 1;
          kickDummy(room, 1.5 + Math.random() * 0.8);
          sfx('thud', room);
        }
      }
    } else if (t >= fightEnd) {
      // victory: fists up, hopping and shaking
      const h = t - fightEnd;
      const cheer = 1 - seg(t, d - 1.6, d - 0.6);
      pose.bob += Math.abs(Math.sin(h * 7)) * 0.07 * cheer;
      pose.twist = Math.sin(c * 12) * 0.1 * cheer;
      pose.armRx += Math.sin(c * 11) * 0.25 * cheer;
      pose.armLx += Math.cos(c * 11) * 0.25 * cheer;
      pose.happy = cheer;
      this.cue('huff', fightEnd);
    }
  }

  /** lifting small dumbbells: bend to the mat, pick up a pair, alternating then both-arm curls, rest, put them back */
  private liftPose(a: Activity, pose: Pose) {
    const t = this.t;
    const d = a.dur;
    const c = this.clock;
    const room = this.sim.roomId;
    const curlEnd = d - 6.0;
    const putAt = d - 2.6;
    let bow = 0;
    if (t < 2.7) {
      this.mixKey(pose, K_NONE, K_BOW, seg(t, 0, 0.9));
      if (t > 1.6) this.mixKey(pose, K_BOW, K_ARMS_DOWN, seg(t, 1.6, 2.7));
      bow = seg(t, 0, 0.9) * (1 - seg(t, 1.6, 2.7));
    } else if (t < d - 4.0) {
      this.mixKey(pose, K_ARMS_DOWN, K_ARMS_DOWN, 0);
    } else if (t < d - 2.2) {
      this.mixKey(pose, K_ARMS_DOWN, K_BOW, seg(t, d - 4.0, d - 3.0));
      bow = seg(t, d - 4.0, d - 3.0);
    } else {
      this.mixKey(pose, K_BOW, K_NONE, seg(t, d - 2.2, d - 1.0));
      bow = 1 - seg(t, d - 2.2, d - 1.0);
    }
    pose.bob = -0.1 * bow;
    pose.thighLx = pose.thighRx = -0.35 * bow;
    pose.kneeLx = pose.kneeRx = 0.6 * bow;
    if (t >= 1.2 && t < putAt) takeDumbbells(room);
    if (t > 1.3 && t < putAt) this.held = 'dumbbell';
    this.cue('clank', 1.2);
    this.cue('clank', putAt);
    if (t >= 3.0 && t < curlEnd) {
      const ct = t - 3.0;
      const w = (ct / CURL_S) * Math.PI * 2;
      const ramp = seg(t, 3.0, 3.6) * (1 - seg(t, curlEnd - 0.6, curlEnd));
      // the first reps alternate, then both arms curl together
      const sync = seg(ct, 5.5, 6.5);
      const cr = (0.5 + 0.5 * Math.sin(w)) * ramp;
      const cl = (0.5 + 0.5 * Math.sin(w + Math.PI * (1 - sync))) * ramp;
      pose.foreRx = lerp(-0.3, -2.2, cr);
      pose.foreLx = lerp(-0.3, -2.2, cl);
      pose.armRx = 0.05 - 0.18 * cr;
      pose.armLx = 0.05 - 0.18 * cl;
      pose.lean = -0.03 * (cr + cl) + Math.sin(c * 2.4) * 0.01;
      pose.headX = -0.05 * Math.max(cr, cl);
      if (Math.max(cr, cl) > 0.85) pose.mouth = 'o';
      const n = Math.floor(ct / CURL_S);
      if (ct / CURL_S - n > 0.3 && n >= this.bites) {
        this.bites = n + 1;
        if (n % 2 === 1) sfx('huff', room);
      }
    } else if (t >= curlEnd && t < d - 4.0) {
      // catching a breath
      pose.lean = Math.sin(c * 2.6) * 0.03;
      pose.headX = -0.1;
      pose.mouth = 'o';
      this.cue('huff', curlEnd + 0.4);
    }
    if (t > d - 1.0) pose.happy = 1;
  }

  private sofaPose(p: Pose) {
    const c = this.clock;
    p.lean = -0.14;
    p.armLx = p.armRx = -0.55;
    p.armLz = p.armRz = 0.55;
    p.foreLx = p.foreRx = -0.9;
    p.headY = Math.sin(c * 0.45) * 0.55;
    p.headX = -0.05 + Math.sin(c * 0.7) * 0.05;
  }

  private watchPose(p: Pose) {
    const c = this.clock;
    this.idlePose(p);
    p.armRx = -0.85;
    p.armRz = -0.55;
    p.foreRx = -2.05;
    p.armLx = -0.95;
    p.armLz = -0.55;
    p.foreLx = -1.35;
    p.headX = 0.22;
    p.headZ = 0.1 + Math.sin(c * 0.8) * 0.04;
    p.headY = Math.sin(c * 0.4) * 0.12;
    p.lean = 0.06;
  }

  /**
   * The delivery run (stage 0: bend down for the box on the porch, 1: carry it in to the place of the thing that is in it, 2: shake
   * it, have a look inside and open it – the thing stands there from then on). Anything that cuts the run short sends the person
   * home; the box goes back on the porch.
   */
  private parcelRun(dt: number, ctx: ActorCtx, pose: Pose, a: Activity, back: boolean) {
    const s = this.sim;
    const rt = ctx.rt;
    const t = this.t;
    const c = this.clock;
    const L = ctx.layout;
    if (back || rt.parcelBy !== s.key || ctx.task) {
      // (a box that is already inside is opened where it is rather than carried out again)
      if (this.actStage === 2) this.openParcel(ctx);
      this.goHome(ctx);
      return;
    }
    if (this.actStage === 0) {
      this.faceYaw(a.yaw, dt, 8);
      this.idlePose(pose);
      this.keyed(pose, PARCEL_KEYS, t);
      const crouch = seg(t, 0.4, 1.3) * (1 - seg(t, 1.9, 2.6));
      pose.thighLx = pose.thighRx = -0.35 * crouch;
      pose.kneeLx = pose.kneeRx = 0.6 * crouch;
      pose.bob = -0.04 * crouch;
      this.cue('paper', 1.6);
      if (t >= 1.6 && this.held !== 'parcel') {
        // the box is in the arms: it is gone from the porch (a big thing comes in a big box)
        this.held = 'parcel';
        this.heldScale = rt.parcelBig ? 1.7 : 1;
        rt.parcel = 'carried';
      }
      if (t >= 2.7) {
        // carry it to the spot where the thing in it is going to stand
        this.deliverTo = null;
        let route: V2[] | null = null;
        const prop = rt.parcelRank >= 0 ? L.props[L.late[rt.parcelRank]] : null;
        if (prop) {
          const stand = standBeside(L, prop.kind, prop.x, prop.z, L.door.inside);
          if (stand) {
            this.deliverTo = { x: prop.x, z: prop.z };
            route = this.routeIn(ctx, stand);
          }
        }
        this.actStage = 1;
        this.startPath(route ?? this.routeIn(ctx, this.approachOf(ctx)));
        this.setPhase('activity');
      }
    } else if (this.actStage === 1) {
      this.walkPose(pose, 0.85);
      this.holdBoxPose(pose);
      if (this.walk(dt, ctx, 0.9)) {
        this.actStage = 2;
        s.walking = false;
        this.setPhase('activity');
      }
    } else {
      const seat = this.deliverTo ?? this.seatOf(ctx);
      this.faceYaw(Math.atan2(seat.x - s.x, seat.z - s.z), dt, 6);
      this.idlePose(pose);
      this.holdBoxPose(pose);
      this.openBoxPose(pose, t, c);
      this.cue('paper', 1.4);
      if (t >= 3.3) {
        // opened: the thing stands there now
        this.openParcel(ctx);
        this.goHome(ctx);
      }
    }
  }

  /** shake the box, have a look inside (the arms, the lean and the look of someone who opens a parcel) */
  private openBoxPose(pose: Pose, t: number, c: number) {
    const shake = t < 1.2 ? Math.sin(c * 18) : 0;
    const peek = seg(t, 1.2, 1.7) * (1 - seg(t, 2.6, 3.0));
    pose.armRx += shake * 0.07 - 0.15 * peek;
    pose.lean = 0.25 * peek;
    pose.headX = 0.35 * peek;
    pose.happy = peek;
    if (peek > 0.5) pose.mouth = 'o';
    this.heldTilt = shake * 0.12 - 0.5 * peek;
  }

  /** the parcel of the porch is open: its thing is delivered, the next parcel is on its way */
  private openParcel(ctx: ActorCtx) {
    const rt = ctx.rt;
    this.held = 'none';
    this.heldTilt = 0;
    this.heldScale = 1;
    this.deliverTo = null;
    if (rt.parcelRank >= 0) commitDelivery(this.sim.roomId, ctx.layout, rt.parcelRank);
    parcelDone(rt, ctx.now);
  }

  /**
   * Carrying a plant or a carton of the room to a tidier place (stage 0: bend down and pick it up, 1: carry it there, 2: set it down
   * and look pleased). Anything that cuts it short sends the person home; the prop is back in its old place (see releaseSpot).
   */
  private tidyRun(dt: number, ctx: ActorCtx, pose: Pose, a: Activity, back: boolean) {
    const s = this.sim;
    const t = this.t;
    const items = movedOf(s.roomId, ctx.layout);
    const it = items[a.tidy ?? -1];
    const to = a.tidyTo;
    if (!it || !to || back || it.by !== s.key) {
      this.goHome(ctx);
      return;
    }
    const prop = ctx.layout.props[it.prop];
    const kind: HeldKind = prop.kind === 'boxes' ? 'parcel' : 'pot';
    // (a carton that is a parcel: it goes to the place of the thing that is in it, and is opened there)
    const open = a.openRank !== undefined && a.openRank >= 0;
    if (this.actStage === 0) {
      this.faceYaw(Math.atan2(it.x - s.x, it.z - s.z), dt, 8);
      this.idlePose(pose);
      this.keyed(pose, PARCEL_KEYS, t);
      const crouch = seg(t, 0.4, 1.3) * (1 - seg(t, 1.9, 2.6));
      pose.thighLx = pose.thighRx = -0.35 * crouch;
      pose.kneeLx = pose.kneeRx = 0.6 * crouch;
      pose.bob = -0.04 * crouch;
      this.cue('pickup', 1.6);
      if (t >= 1.6 && this.held !== kind) {
        // it is in the arms: gone from the floor
        this.held = kind;
        this.heldScale = prop.kind === 'boxes' ? 1.7 : prop.kind === 'tallPlant' ? 1.5 : prop.kind === 'cactus' ? 0.85 : 1.15;
        it.state = 'carried';
        notifyMoved(s.roomId);
      }
      if (t >= 2.7) {
        const stand = standBeside(ctx.layout, open ? ctx.layout.props[ctx.layout.late[a.openRank!]].kind : prop.kind, to.x, to.z, { x: s.x, z: s.z });
        if (!stand) {
          this.goHome(ctx);
          return;
        }
        this.startPath(ctx.layout.nav.findPath({ x: s.x, z: s.z }, stand) ?? [stand]);
        this.actStage = 1;
        this.setPhase('activity');
      }
    } else if (this.actStage === 1) {
      this.walkPose(pose, 0.85);
      this.holdBoxPose(pose);
      if (this.walk(dt, ctx, 0.9)) {
        this.actStage = 2;
        s.walking = false;
        this.setPhase('activity');
      }
    } else if (open) {
      // at the place: shake the carton, look inside, open it – the thing is there
      this.faceYaw(Math.atan2(to.x - s.x, to.z - s.z), dt, 7);
      this.idlePose(pose);
      if (this.held === kind) {
        this.holdBoxPose(pose);
        this.openBoxPose(pose, t, this.clock);
        this.cue('paper', 1.4);
        if (t >= 3.3) {
          const [fw, fd] = FOOT[prop.kind];
          this.held = 'none';
          this.heldTilt = 0;
          this.heldScale = 1;
          // the carton is used up: gone from the room, and what was in it stands where it goes
          ctx.layout.nav.unblockOriented(it.x, it.z, fw, fd, it.rot, 0.2);
          it.state = 'gone';
          it.by = null;
          it.to = null;
          notifyMoved(s.roomId);
          commitDelivery(s.roomId, ctx.layout, a.openRank!);
          a.openRank = undefined;
        }
      } else {
        pose.armLx = pose.armRx = 0.1;
        pose.armLz = pose.armRz = 0.14;
        pose.foreLx = pose.foreRx = -0.2;
        pose.happy = seg(t, 3.4, 3.8);
        if (t >= 4.6) this.goHome(ctx);
      }
    } else {
      this.faceYaw(Math.atan2(to.x - s.x, to.z - s.z), dt, 7);
      this.idlePose(pose);
      const down = seg(t, 0.2, 0.9) * (1 - seg(t, 1.5, 2.1));
      this.holdBoxPose(pose);
      pose.lean = 0.04 + 0.5 * down;
      pose.thighLx = pose.thighRx = -0.35 * down;
      pose.kneeLx = pose.kneeRx = 0.6 * down;
      pose.bob = -0.04 * down;
      if (t >= 1.1 && this.held === kind) {
        // set down: it stays there
        this.held = 'none';
        this.heldScale = 1;
        commitMove(s.roomId, ctx.layout, a.tidy!, to, ctx.now);
        this.cue('thud', 1.1);
      }
      if (this.held === 'none') {
        // arms drop, a pleased look at the tidy corner
        pose.armLx = pose.armRx = 0.1;
        pose.armLz = pose.armRz = 0.14;
        pose.foreLx = pose.foreRx = -0.2;
        pose.lean = 0.5 * down;
        pose.happy = seg(t, 1.2, 1.6);
      }
      if (t >= 2.6) this.goHome(ctx);
    }
  }

  /** both arms in front of the chest around a box */
  private holdBoxPose(p: Pose) {
    p.armLx = p.armRx = -1.15;
    p.armLz = p.armRz = -0.45;
    p.foreLx = p.foreRx = -0.7;
    p.lean = 0.04;
  }

  /** asleep: eyes shut, slow breathing; in the chair the head tips back and to the side, on the sofa it droops and the arms hang slack */
  private sleepPose(p: Pose, sofa: boolean) {
    const c = this.clock;
    const breath = Math.sin(c * 1.15);
    p.sleep = 1;
    p.lean = (sofa ? -0.2 : -0.16) + breath * 0.015;
    p.headX = sofa ? 0.3 + breath * 0.02 : -0.3 + breath * 0.03;
    p.headZ = sofa ? 0.5 : 0.28;
    p.headY = 0;
    p.armLx = p.armRx = sofa ? -0.3 : -0.6;
    p.armLz = p.armRz = sofa ? 0.3 : -0.4;
    p.foreLx = p.foreRx = sofa ? -0.5 : -1.5;
    p.bob = breath * 0.006;
  }

  /** looking out of the window with a cigarette: hand at the hip, up to the mouth, a long drag, down again, and the smoke drifts out */
  private smokePose(p: Pose) {
    const c = this.clock;
    const u = this.t % SMOKE_CYCLE;
    this.lookOutPose(p);
    this.keyed(p, SMOKE_KEYS, u);
    p.headX = -0.05 + (u > 2.4 && u < 4.4 ? -0.12 : 0);
    p.armLx = 0.28;
    p.armLz = 0.1;
    p.foreLx = -0.25;
    p.headY = Math.sin(c * 0.5) * 0.18;
    p.lean = Math.sin(c * 0.9) * 0.02 - 0.02;
    this.smoke = seg(u, 5.0, 5.7) * (1 - seg(u, 7.4, 8.6));
  }

  private lookOutPose(p: Pose) {
    const c = this.clock;
    p.armLx = p.armRx = 0.28;
    p.armLz = p.armRz = 0.1;
    p.foreLx = p.foreRx = -0.25;
    p.headX = -0.1;
    p.lookUp = 0.6;
    p.headY = Math.sin(c * 0.5) * 0.18;
    p.lean = Math.sin(c * 0.9) * 0.02 - 0.02;
  }

  private petPose(p: Pose) {
    const c = this.clock;
    p.lean = 0.55;
    p.bob = -0.04;
    p.thighLx = p.thighRx = -0.35;
    p.kneeLx = p.kneeRx = 0.6;
    p.headX = 0.3;
    p.armRx = -0.75 + Math.sin(c * 4) * 0.08;
    p.armRz = -0.1 + Math.sin(c * 4) * 0.25;
    p.foreRx = -0.45;
    p.armLx = -0.35;
    p.armLz = 0.2;
    p.foreLx = -0.4;
    p.happy = 0.8;
  }

  private target: Pose = neutralPose();

  private targetPose(): Pose {
    const p = this.target;
    Object.assign(p, neutralPose());
    return p;
  }

  private copyPose(p: Pose) {
    Object.assign(this.pose, p);
  }

  private walkPose(p: Pose, amp: number) {
    if (this.gated) {
      // held back (the motion gap, or rooms being loaded), standing: has a look at the phone meanwhile (or, with something in the hands, just waits)
      if (this.held === 'none') {
        this.held = 'phone';
        this.phoneWait = true;
      }
      if (this.held === 'phone') this.standPhonePose(p);
      else this.idlePose(p);
      return;
    }
    if (this.phoneWait) {
      this.phoneWait = false;
      if (this.held === 'phone') this.held = 'none';
    }
    const w = this.walkPhase;
    const sn = Math.sin(w);
    p.thighLx = -sn * 0.8 * amp;
    p.thighRx = sn * 0.8 * amp;
    p.kneeLx = 0.12 + Math.max(0, Math.cos(w)) * 0.85 * amp;
    p.kneeRx = 0.12 + Math.max(0, -Math.cos(w)) * 0.85 * amp;
    p.armLx = sn * 0.7 * amp;
    p.armRx = -sn * 0.7 * amp;
    p.armLz = p.armRz = 0.12;
    p.foreLx = -0.35 - Math.max(0, -sn) * 0.3;
    p.foreRx = -0.35 - Math.max(0, sn) * 0.3;
    p.bob = Math.abs(sn) * 0.06 * amp;
    p.roll = Math.sin(w) * 0.05;
    p.twist = -Math.sin(w) * 0.12;
    p.headY = Math.sin(w) * 0.04;
    p.lean = 0.06;
  }

  private stepWave(dt: number, index: number, greet: boolean) {
    // wave once when reaching the door line (hello when entering, bye when leaving)
    if (this.waveT > 0) {
      this.waveT -= dt;
      this.sim.walking = false;
      return;
    }
    const trigger = greet ? 1 : this.path.length - 1; // just past the threshold (enter) / at the threshold (leave)
    if (this.pi === trigger && !this.waveDone.has(index)) {
      this.waveDone.add(index);
      this.waveT = 0.85;
    }
  }

  private wavePose(p: Pose) {
    const w = this.clock * 14;
    p.thighLx = p.thighRx = p.kneeLx = p.kneeRx = 0;
    p.bob = 0;
    p.armRx = -2.7;
    p.armRz = 0.35 + Math.sin(w) * 0.35;
    p.foreRx = -0.3;
    p.armLx = 0;
    p.happy = 1;
    p.headZ = Math.sin(this.clock * 3) * 0.08;
    p.lean = 0;
    p.roll = 0;
    p.twist = 0;
  }

  private idlePose(p: Pose) {
    const c = this.clock;
    p.lean = Math.sin(c * 1.6) * 0.015;
    p.headY = Math.sin(c * 0.7) * 0.12;
    p.armLz = p.armRz = 0.1 + Math.sin(c * 1.6) * 0.02;
  }

  /** both hands out in front on the back of a chair (k = 0 arms down .. 1 hands on it) */
  private reachPose(p: Pose, k: number) {
    p.armLx = p.armRx = CHAIR_ARM * k;
    p.armLz = p.armRz = 0.1 - 0.25 * k;
    p.foreLx = p.foreRx = -0.35 * k;
  }

  /** `kneeBend` 1 = the shins hang straight down (a chair); less = the lower legs stick out forward (a low, deep sofa) */
  private seatedPose(p: Pose, sit: number, kneeBend = 1) {
    const l = -Math.PI / 2 * sit;
    const k = Math.PI / 2 * sit * kneeBend;
    p.thighLx = l;
    p.thighRx = l;
    p.kneeLx = k;
    p.kneeRx = k;
    if (sit > 0.98) {
      const c = this.clock;
      p.thighLx += Math.sin(c * 1.7) * 0.03;
      p.kneeRx += Math.max(0, Math.sin(c * 2.3)) * 0.12;
    }
  }

  private typePose(p: Pose, freq: number, amp: number) {
    const c = this.clock;
    this.typing = amp;
    p.armLx = p.armRx = this.reach.arm;
    p.armLz = p.armRz = -0.12;
    p.foreLx = this.reach.fore + Math.sin(c * freq) * 0.06 * amp;
    p.foreRx = this.reach.fore + Math.sin(c * freq + 2.1) * 0.06 * amp;
    p.armLx += Math.sin(c * freq * 0.5 + 1) * 0.03 * amp;
    p.armRx += Math.sin(c * freq * 0.5) * 0.03 * amp;
    p.headX = 0.14 + Math.sin(c * 1.3) * 0.03;
    p.lean = 0.06 + Math.sin(c * 2) * 0.01;
  }

  private workPose(p: Pose, ctx: ActorCtx) {
    const c = this.clock;
    const age = ctx.lastSayAge;
    const resting = this.isResting(ctx);
    if (this.sleepT >= 0) {
      // a task, a visitor at the director's desk or a closing office wakes the sleeper at once
      if (!resting || ctx.rt.visitors.some((v) => v !== null) || !ctx.person.present) this.wake();
      else {
        this.sleepPose(p, false);
        this.typing = 0;
        return;
      }
    }
    if (this.deskPetT >= 0) {
      // stroking the cat that naps on the desk, without getting up
      p.lean = 0.16;
      p.armRx = -1.0 + Math.sin(c * 4) * 0.08;
      p.armRz = -0.15 + Math.sin(c * 4) * 0.2;
      p.foreRx = -0.55;
      p.armLx = this.reach.arm;
      p.armLz = -0.12;
      p.foreLx = this.reach.fore;
      p.headX = 0.3;
      p.headY = 0.55;
      p.happy = 0.7;
      this.typing = 0;
      return;
    }
    if (this.deskAct && resting) {
      this.deskPose(p, this.deskAct, this.deskActT, this.deskActDur);
      return;
    }
    const recv = this.isDirector ? ctx.now - ctx.rt.receivedAt : 99;
    if (recv < 1.8) {
      // just received a report: happy nod + thumbs up
      p.happy = 1;
      p.headX = 0.12 + Math.sin(recv * 10) * 0.14;
      p.armLx = p.armRx = this.reach.arm;
      p.armLz = p.armRz = -0.12;
      p.foreLx = this.reach.fore;
      p.foreRx = this.reach.fore;
      p.armRx = -1.9 + Math.sin(recv * 9) * 0.1;
      p.foreRx = -1.1;
      p.lean = 0.02;
      this.typing = 0;
      return;
    }
    if (resting) {
      // nothing to do right now: something else on the laptop – music, a video, a game, a call, shopping, mail, or just typing – and a different one after a while (no looking around)
      if (this.idleActAt < 0 || this.clock >= this.idleActUntil) {
        const all: DeskAct[] = ['music', 'video', 'browse', 'game', 'call', 'shop', 'mail'];
        const pool = all.filter((k) => k !== this.idleAct);
        this.idleAct = pool[Math.floor(Math.random() * pool.length)];
        this.idleActAt = this.clock;
        this.idleActUntil = this.clock + 14 + Math.random() * 18;
      }
      this.idleSeen = this.clock;
      this.deskPose(p, this.idleAct, this.clock - this.idleActAt, this.idleActUntil - this.idleActAt);
      return;
    }
    if (ctx.lastKind === 'thinking' && age < 5) {
      // hand on chin
      p.armRx = -0.85;
      p.armRz = -0.55;
      p.foreRx = -2.05;
      p.armLx = this.reach.arm;
      p.armLz = -0.12;
      p.foreLx = this.reach.fore;
      p.headZ = 0.14;
      p.headX = -0.08;
      p.headY = Math.sin(c * 1.1) * 0.12;
      p.lookUp = 1;
      p.mouth = 'o';
      p.lean = -0.03;
      this.typing = 0;
      return;
    }
    if (age > 10) {
      // nothing to say for a while: slow typing
      this.typePose(p, 7, 0.4);
      p.headX = 0.02;
      p.headY = 0;
      return;
    }
    this.typePose(p, ctx.lastKind === 'tool' ? 24 : 17, 1);
    if (ctx.lastKind === 'text') p.mouth = 'o';
  }

  /** at the desk with nothing to do: nodding to the music, watching a video (and laughing now and then), or typing something of their own */
  private deskPose(p: Pose, act: DeskAct, t: number, dur: number) {
    const c = this.clock;
    if (act === 'music') {
      // eyes half shut, head swaying to the beat, a hand drumming on the desk
      p.lean = -0.05;
      p.armLx = p.armRx = this.reach.arm;
      p.armLz = p.armRz = -0.12;
      p.foreLx = this.reach.fore;
      p.foreRx = this.reach.fore + Math.max(0, Math.sin(c * 8.4)) * 0.1;
      p.headX = 0.04 + Math.sin(c * 8.4) * 0.05;
      p.headZ = Math.sin(c * 4.2) * 0.13;
      p.headY = Math.sin(c * 2.1) * 0.06;
      p.sleep = 0.5;
      p.happy = 0.55;
      this.typing = 0;
    } else if (act === 'video') {
      // leaning towards the screen, a hand on the trackpad; every so often a burst of laughter
      const laugh = Math.max(0, Math.sin(c * 0.43 + 1.3) - 0.72) / 0.28;
      p.lean = 0.12;
      p.armLx = p.armRx = this.reach.arm;
      p.armLz = p.armRz = -0.12;
      p.foreLx = p.foreRx = this.reach.fore;
      p.headX = 0.2 + Math.sin(c * 0.8) * 0.02;
      p.headY = 0;
      p.happy = 0.35 + 0.65 * laugh;
      if (laugh > 0.3) {
        p.mouth = 'o';
        p.bob = Math.abs(Math.sin(c * 14)) * 0.03 * laugh;
        p.headX = 0.12 - Math.sin(c * 14) * 0.06 * laugh;
      }
      this.typing = 0;
    } else if (act === 'game') {
      // leaning right in, keys hammered, a fist pump now and then, a groan when it goes wrong
      this.typePose(p, 26, 1);
      p.lean = 0.2;
      p.headX = 0.18 + Math.sin(c * 9) * 0.02;
      const win = Math.max(0, Math.sin(c * 0.31 + 0.7) - 0.8) / 0.2;
      const lose = Math.max(0, Math.sin(c * 0.23 + 2) - 0.9) / 0.1;
      if (win > 0.2) {
        p.happy = 1;
        p.mouth = 'o';
        p.armRx = -2.6 + Math.sin(c * 12) * 0.25;
        p.armRz = 0.35;
        p.foreRx = -0.4;
        this.typing = 0.3;
      } else if (lose > 0.3) {
        p.mouth = 'sad';
        p.headX = 0.3;
        p.happy = 0;
      }
    } else if (act === 'call') {
      // a video call: a wave to say hello and goodbye, otherwise talking and nodding with the hands on the desk
      const talk = Math.sin(c * 0.9) > 0;
      p.lean = 0.02;
      p.armLx = p.armRx = this.reach.arm;
      p.armLz = p.armRz = -0.12;
      p.foreLx = p.foreRx = this.reach.fore;
      p.headX = 0.02 + Math.sin(c * 2.3) * 0.05;
      p.headY = 0;
      p.happy = 0.6;
      p.mouth = talk && Math.sin(c * 11) > 0 ? 'o' : 'smile';
      if (t < 2.2 || dur - t < 2.2) {
        p.armRx = -2.4 + Math.sin(c * 9) * 0.35;
        p.armRz = 0.3;
        p.foreRx = -0.3;
        p.happy = 1;
      }
      this.typing = 0;
    } else if (act === 'shop') {
      // a hand on the trackpad, scrolling; an "ooh" when something nice turns up
      const nice = Math.max(0, Math.sin(c * 0.37 + 0.4) - 0.8) / 0.2;
      p.lean = 0.1;
      p.armLx = this.reach.arm;
      p.armLz = -0.12;
      p.foreLx = this.reach.fore;
      p.armRx = this.reach.arm - 0.1;
      p.armRz = -0.12;
      p.foreRx = this.reach.fore + Math.sin(c * 2.2) * 0.06;
      p.headX = 0.16 + Math.sin(c * 1.1) * 0.03;
      p.headY = 0;
      p.happy = 0.3 + 0.7 * nice;
      if (nice > 0.3) {
        p.mouth = 'o';
        p.lookUp = 0.4;
      }
      this.typing = 0;
    } else if (act === 'mail') {
      // reading the inbox, then bashing out a reply, over and over
      if (Math.sin(c * 0.35) > 0.2) {
        this.typePose(p, 14, 0.9);
        p.headX = 0.1;
      } else {
        p.lean = 0.08;
        p.armLx = p.armRx = this.reach.arm;
        p.armLz = p.armRz = -0.12;
        p.foreLx = p.foreRx = this.reach.fore;
        p.headX = 0.15 + Math.sin(c * 0.9) * 0.03;
        p.headY = 0;
        this.typing = 0;
      }
    } else {
      // typing away at something that is not a task: steady
      this.typePose(p, 12, 0.8);
      p.headY = 0;
    }
  }

  private blink(dt: number) {
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinkT = 2 + Math.random() * 3.5;
      this.blinkOpen = 0;
    }
    this.blinkOpen = Math.min(1, this.blinkOpen + dt * 9);
  }
}
