import type { Speech } from '../types';
import { frame } from './frame';

/**
 * Non-reactive runtime state shared between scene components (characters, doors, chairs, bubbles).
 * It lives outside React/zustand on purpose: it changes every frame.
 */
export type Phase =
  | 'waiting' // off-stage, waiting for a free desk / for the door to be free
  | 'entering'
  | 'sitting'
  | 'unpacking'
  | 'working'
  | 'packing'
  | 'standing'
  | 'stroll'
  | 'activity'
  | 'returning'
  | 'toBoss'
  | 'handover'
  | 'leaving';

export interface SimState {
  key: string;
  roomId: string;
  x: number;
  z: number;
  yaw: number;
  phase: Phase;
  sitT: number;
  /** vertical offset of the root (sitting on a sofa) */
  y: number;
  /** true while the character is visible inside the room (or at the doorway) */
  onStage: boolean;
  /** the person's own desk (staff; -1 for the director) */
  desk: number;
  /** working on a task right now (typing at the desk) */
  busy: boolean;
  /** boss desk visitor slot currently claimed */
  slot: number;
  walking: boolean;
  /** key of the colleague who came over for a chat (they stay at their desk until it is over) */
  chatBy: string | null;
  /** sitting at the desk with nothing to do: a bubble that is still up goes away */
  quiet: boolean;
  /** dozing at the desk (nobody walks over for a chat) */
  asleep?: boolean;
  /** away from the desk on a break of its own (walking there, doing it, walking back) */
  onBreak?: boolean;
  /** waiting for a free walking slot of the room: 2 = a priority walk (entering, leaving, report), 1 = an idle one */
  walkWait?: 0 | 1 | 2;
  /** the director is busy with a message from the user until then: on the desk phone or reading an email at the laptop (performance.now()/1000, set by the bubble layer) */
  msgUntil?: number;
  /** how that message arrived (set by the bubble layer with the first chunk) */
  msgVia?: 'call' | 'email';
  /** the director holds the handset of the desk phone (the one on the desk is hidden meanwhile; cleared by the actor every frame it is not) */
  handsetUp?: boolean;
}

export const sims = new Map<string, SimState>();

export interface RoomRuntime {
  /** seconds (performance.now()/1000) after which the next character may enter */
  doorFreeAt: number;
  /** seconds (sim clock) before which nobody else may start a walk, and who started the last one (see Actor.walkSlotOpen) */
  walkFreeAt: number;
  walkBy: string | null;
  visitors: (string | null)[];
  /** the director is seated and awake */
  directorSeated: boolean;
  directorKey: string | null;
  /** last time a report was handed over (drives the director "receive" animation) */
  receivedAt: number;
  // --- office management (see store.ts)
  /** open burst of the main agent's own tool calls */
  burstKey: string | null;
  burstStart: number;
  lastToolAt: number;
  burstSeq: number;
  /** the latest user prompt (names the main agent's tasks) */
  prompt: string;
  /** when the office ran out of work (Date.now(), 0 = busy) */
  idleSince: number;
  /** everybody is on the way out */
  leaving: boolean;
  /** the office has been working since `runStart` (a summary is due when it stops) */
  wasBusy: boolean;
  /** when the last extra person was hired (Date.now()) */
  lastHire: number;
  runStart: number;
  /** the last full message of the main agent */
  lastText: string;
  /** the last closing message the monitor knows about (also from before this page was opened) */
  knownFinal: string;
  /** the director reads the summary aloud until then (Date.now()); a safety net for when nobody watches */
  talkDeadline: number;
  /** delivery at the door: 'waiting' = a box stands on the porch, 'carried' = somebody has it in their arms */
  parcel: 'none' | 'waiting' | 'carried';
  /** performance.now()/1000 of the next delivery (0 = not scheduled yet) */
  parcelAt: number;
  /** key of the character who is fetching the parcel */
  parcelBy: string | null;
  /** the main agent waits for the user's answer since then (performance.now()/1000, 0 = no question pending): the director waves for attention */
  askAt: number;
}

export const roomRuntime = new Map<string, RoomRuntime>();

/** Schedules and delivers the parcels of a room: a first one soon after somebody is on stage, then one every 2-5 minutes once it is collected. Only numbers are compared. Returns true at the moment a parcel arrives. */
export function tickParcel(rt: RoomRuntime, now: number): boolean {
  if (rt.parcelAt === 0) rt.parcelAt = now + 40 + Math.random() * 50;
  if (rt.parcel !== 'none' || now < rt.parcelAt) return false;
  rt.parcel = 'waiting';
  return true;
}

/** The parcel was taken in: the next delivery is 2-5 minutes away. */
export function parcelDone(rt: RoomRuntime, now: number) {
  rt.parcel = 'none';
  rt.parcelBy = null;
  rt.parcelAt = now + 120 + Math.random() * 180;
}

export function runtimeFor(roomId: string): RoomRuntime {
  let rt = roomRuntime.get(roomId);
  if (!rt) {
    rt = {
      doorFreeAt: 0, walkFreeAt: 0, walkBy: null, visitors: [null, null, null], directorSeated: false, directorKey: null, receivedAt: -99,
      burstKey: null, burstStart: 0, lastToolAt: 0, burstSeq: 0, prompt: '', idleSince: 0, leaving: false, wasBusy: false, lastHire: 0, runStart: 0, lastText: '', knownFinal: '', talkDeadline: 0,
      parcel: 'none', parcelAt: 0, parcelBy: null, askAt: 0,
    };
    roomRuntime.set(roomId, rt);
  }
  return rt;
}

/** per-room lists, rebuilt at most once per frame (the arrays are reused: do not keep or modify them) */
const simLists = new Map<string, { n: number; list: SimState[] }>();

export function simsInRoom(roomId: string): SimState[] {
  let c = simLists.get(roomId);
  if (!c) simLists.set(roomId, (c = { n: 0, list: [] }));
  if (c.n !== frame.n) {
    c.n = frame.n;
    c.list.length = 0;
    for (const s of sims.values()) if (s.roomId === roomId) c.list.push(s);
  }
  return c.list;
}

// ---------------------------------------------------------------- speech queues
const queues = new Map<string, Speech[]>();
const lastSaid = new Map<string, { at: number; kind: Speech['kind'] }>();
let speechId = 1;

export function enqueueSpeech(key: string, s: Omit<Speech, 'id' | 'at'>, priority = false): Speech {
  const speech: Speech = { ...s, id: speechId++, at: Date.now() };
  let q = queues.get(key);
  if (!q) {
    q = [];
    queues.set(key, q);
  }
  // (the summary talk is never wiped: whatever the character wants to say waits behind it)
  if (priority) q.splice(0, q.length, ...q.filter((x) => x.hold));
  q.push(speech);
  // small talk about breaks must not change how the character behaves (the director rests when he has nothing to say)
  if (s.kind !== 'idle') lastSaid.set(key, { at: performance.now() / 1000, kind: s.kind });
  // keep bubbles fresh: drop the oldest when a burst arrives
  while (q.filter((x) => !x.hold).length > 4) {
    const i = q.findIndex((x) => !x.hold && x.kind === 'tool');
    q.splice(i === -1 ? q.findIndex((x) => !x.hold) : i, 1);
  }
  return speech;
}

export function queueLength(key: string): number {
  return queues.get(key)?.length ?? 0;
}

/** Something with this `tool` is still waiting in the queue of the character. */
export function hasQueuedTool(key: string, tool: string): boolean {
  return !!queues.get(key)?.some((x) => x.tool === tool);
}

export function nextSpeech(key: string): Speech | undefined {
  return queues.get(key)?.shift();
}

export function peekSpeech(key: string): Speech | undefined {
  return queues.get(key)?.[0];
}

/** performance.now() ms until which the summary bubble on screen is held */
const talkUntil = new Map<string, number>();

export function holdTalk(key: string, until: number) {
  talkUntil.set(key, until);
}

/** The character still has summary bubbles to show (queued, or the last one is still held). */
export function talkPending(key: string): boolean {
  return !!queues.get(key)?.some((x) => x.hold) || (talkUntil.get(key) ?? 0) > performance.now();
}

/** Forget the summary talk (new work arrived, or it took too long). */
export function clearTalk(key: string) {
  const q = queues.get(key);
  if (q) queues.set(key, q.filter((x) => !x.hold));
  talkUntil.delete(key);
}

/** performance.now() ms of the last time a break ended (its thought bubble is switched off) */
const idleDismissed = new Map<string, number>();

export function idleDismissedAt(key: string): number {
  return idleDismissed.get(key) ?? 0;
}

/** A break is over: the thought about it goes away at once (also when it is still waiting in the queue). */
export function dismissIdle(key: string) {
  idleDismissed.set(key, performance.now());
  const q = queues.get(key);
  if (q) queues.set(key, q.filter((x) => x.kind !== 'idle' || x.hold));
}

/** A greeting at the door: shown first, for `hold` ms, before whatever else the character has to say. */
export function greet(key: string, text: string, icon: string, hold: number) {
  let q = queues.get(key);
  if (!q) {
    q = [];
    queues.set(key, q);
  }
  q.unshift({ id: speechId++, kind: 'idle', text, tool: icon, at: Date.now(), hold });
}

export function lastSpeech(key: string) {
  return lastSaid.get(key);
}

// -------------------------------------------- speech of tasks that have nobody to say it yet
const taskBuffers = new Map<string, Omit<Speech, 'id' | 'at'>[]>();

export function bufferTaskSpeech(taskKey: string, s: Omit<Speech, 'id' | 'at'>) {
  let q = taskBuffers.get(taskKey);
  if (!q) {
    q = [];
    taskBuffers.set(taskKey, q);
  }
  q.push(s);
  while (q.length > 6) q.shift();
}

export function takeTaskSpeech(taskKey: string): Omit<Speech, 'id' | 'at'>[] {
  const q = taskBuffers.get(taskKey) ?? [];
  taskBuffers.delete(taskKey);
  return q;
}

export function dropTaskSpeech(taskKey: string) {
  taskBuffers.delete(taskKey);
}

export function dropRuntime(key: string) {
  sims.delete(key);
  queues.delete(key);
  talkUntil.delete(key);
  idleDismissed.delete(key);
  lastSaid.delete(key);
  anchors.delete(key);
}

export function dropRoomRuntime(roomId: string) {
  roomRuntime.delete(roomId);
  simLists.delete(roomId);
  catLists.delete(roomId);
}

// ---------------------------------------------------------------- screen anchors
/** World-space anchor (above the head) of every visible character, used to place HTML bubbles. */
export const anchors = new Map<string, { x: number; y: number; z: number; live: boolean }>();

/** Camera + viewport, published by the 3D scene each frame for the HTML overlay. */
/** a point in normalised device coordinates (x, y, z) and its distance from the camera */
export interface Projected {
  x: number;
  y: number;
  z: number;
  dist: number;
}
export const view: {
  camera: import('three').Camera | null;
  width: number;
  height: number;
  /** published by the 3D scene: projects a world point to the screen */
  project: ((x: number, y: number, z: number, out: Projected) => void) | null;
} = { camera: null, width: 1, height: 1, project: null };

// ------------------------------------------------------------------------- cats
export interface CatSim {
  key: string;
  roomId: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  phase: string;
  onStage: boolean;
  /** lying / sitting still – a good moment for a pat */
  still: boolean;
  /** performance.now()/1000 until which someone is stroking the cat */
  petUntil: number;
  /** index into layout.spots the cat is using (-1 none) */
  spot: number;
}

export const cats = new Map<string, CatSim>();

/** Dev / test switches (exposed as window.__registry in dev builds). */
export const debugFlags: { activity?: string; catNow?: boolean; catLeave?: boolean; catSpot?: string; catPose?: string; channel?: 'call' | 'email' } = {};

const catLists = new Map<string, { n: number; list: CatSim[] }>();

export function catsInRoom(roomId: string): CatSim[] {
  let c = catLists.get(roomId);
  if (!c) catLists.set(roomId, (c = { n: 0, list: [] }));
  if (c.n !== frame.n) {
    c.n = frame.n;
    c.list.length = 0;
    for (const s of cats.values()) if (s.roomId === roomId) c.list.push(s);
  }
  return c.list;
}

/** Who currently occupies a sofa seat / desk spot: `${roomId}#${spotIndex}` -> owner key. */
export const spotOwners = new Map<string, string>();
