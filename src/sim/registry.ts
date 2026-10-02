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
  /** sits (or waits) without moving or typing: updated at a low rate, and alone it does not ask for the busy frame rate (see PersonActor, FrameSync) */
  calm?: boolean;
  /** sits still but something shows: music with headphones, a video, a game… (the scene is then drawn a little faster, see IdleGovernor) */
  lively?: boolean;
  /** while sitting down / getting up: how far the desk chair is pulled out from the desk (0 = tucked in, 1 = fully out) and its swivel relative to the desk (radians); the chair follows exactly */
  chairOut?: number;
  chairSwivel?: number;
  /** toilet visit: 1 = on the way to the door of the cubicle, 2 = inside with the door shut, 3 = inside and on the way out (door open); undefined = none */
  wc?: 1 | 2 | 3;
  /** kind of the break (activity) the person is on, set by the actor every frame; undefined = none (see store.assignRank) */
  actKind?: string;
  /** fetching the parcel or carrying a carton to open it: no task is handed to them until it is done (see store.dispatchRoom) */
  carrying?: boolean;
  /** on the sofa playing on the console (a colleague who wants to play sits down next to them) */
  gaming?: boolean;
}

export const sims = new Map<string, SimState>();

/** at least this long between two hires of a new person, and between the first appearances of two new people in the office */
export const HIRE_GAP_MS = 5000;

/** this many tasks waiting for somebody: the office hurries (people wave while walking in, more people are hired sooner) */
export const HURRY_QUEUE = 3;

export interface RoomRuntime {
  /** seconds (performance.now()/1000) after which the next character may enter */
  doorFreeAt: number;
  /** earliest moment the next person may go home while no room is being loaded ahead */
  leaveFreeAt: number;
  /** seconds (sim clock) before which nobody else may start a walk, and who started the last one (see Actor.walkSlotOpen) */
  /** when somebody in the room was last on the move (walking, sitting down, getting up), and who; no other movement starts within MOTION_GAP_S of it */
  motionAt: number;
  motionBy: string | null;
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
  /** tasks waiting for somebody to be free (set every tick: the office hurries when many are waiting) */
  queued: number;
  /** when a person was last brought in (hired or called back from home), and when a staff member last came through the door (Date.now()) */
  lastHire: number;
  lastNewcomer: number;
  /** when a new person was last hired (Date.now(), 0 = not yet looked at): AUTO_HIRE_MS after it the office hires one more, needed or not (see store.autoHire) */
  lastNewHire: number;
  /** the latest user prompt (names the main agent's tasks) */
  prompt: string;
  /** when the office ran out of work (Date.now(), 0 = busy) */
  idleSince: number;
  /** everybody is on the way out */
  leaving: boolean;
  /** the office has been working since `runStart` (a summary is due when it stops) */
  wasBusy: boolean;
  runStart: number;
  /** the last full message of the main agent */
  lastText: string;
  /** the last closing message the monitor knows about (also from before this page was opened) */
  knownFinal: string;
  /** the director announces the end of the work until then (Date.now()); a safety net for when nobody watches */
  talkDeadline: number;
  /** delivery at the door: 'waiting' = a box stands on the porch, 'carried' = somebody has it in their arms */
  parcel: 'none' | 'waiting' | 'carried';
  /** performance.now()/1000 of the next delivery (0 = not scheduled yet) */
  parcelAt: number;
  /** key of the character who is fetching the parcel */
  parcelBy: string | null;
  /** what is in the parcel: its place in layout.late (-1: nothing) and whether it is a big box */
  parcelRank: number;
  parcelBig: boolean;
  /** the main agent waits for the user's answer since then (performance.now()/1000, 0 = no question pending): the director waves for attention */
  askAt: number;
  /** everybody who stands or sits cheers until then (performance.now()/1000; see sim/celebrate.ts) */
  cheerUntil: number;
  /** the run is over: the summary paper opens on its own once everybody has left the office (see store.ts tickRoom) */
  summaryDue: boolean;
}

export const roomRuntime = new Map<string, RoomRuntime>();

/** A plant or carton of `layout.props` (one of `layout.movable`) while people carry it around: where it stands now. */
export interface MovedProp {
  /** index into layout.props */
  prop: number;
  /** 'gone': a carton that was opened (what was in it stands in the room now, see commitDelivery) */
  state: 'placed' | 'carried' | 'gone';
  x: number;
  z: number;
  rot: number;
  /** key of the character who is going to / carrying it */
  by: string | null;
  /** where it is going (reserved so nobody else picks the same place) */
  to: { x: number; z: number; rot: number } | null;
  /** performance.now()/1000 it was last set down (0 = never moved) */
  movedAt: number;
}

const movedByRoom = new Map<string, { layout: import('../world/layout').RoomLayout; items: MovedProp[]; version: number; listeners: Set<() => void> }>();

function movedEntry(roomId: string, layout: import('../world/layout').RoomLayout) {
  let c = movedByRoom.get(roomId);
  if (!c || c.layout !== layout) {
    const listeners = c?.listeners ?? new Set<() => void>();
    c = {
      layout,
      version: (c?.version ?? 0) + 1,
      listeners,
      items: layout.movable.map((i) => ({ prop: i, state: 'placed' as const, x: layout.props[i].x, z: layout.props[i].z, rot: layout.props[i].rot, by: null, to: null, movedAt: 0 })),
    };
    movedByRoom.set(roomId, c);
  }
  return c;
}

/** where the carriable plants and cartons of a room stand now (created from the layout the first time) */
export function movedOf(roomId: string, layout: import('../world/layout').RoomLayout): MovedProp[] {
  return movedEntry(roomId, layout).items;
}

/** the moved props of a room as they are now, or nothing when nobody has looked yet */
export function movedIfAny(roomId: string): MovedProp[] | null {
  return movedByRoom.get(roomId)?.items ?? null;
}

/** something was picked up / put down: the scene redraws the room's carriable props */
export function notifyMoved(roomId: string) {
  const c = movedByRoom.get(roomId);
  if (!c) return;
  c.version++;
  c.listeners.forEach((f) => f());
}

// ---------------------------------------------------------------- deliveries
/** What the room has been sent: the things of `layout.late` that are claimed (on their way) and the moment they arrived. */
interface DeliveryEntry {
  layout: import('../world/layout').RoomLayout;
  claims: Set<number>;
  at: Map<number, number>;
  version: number;
  listeners: Set<() => void>;
}
const deliveryByRoom = new Map<string, DeliveryEntry>();

function deliveryEntry(roomId: string, layout: import('../world/layout').RoomLayout): DeliveryEntry {
  let c = deliveryByRoom.get(roomId);
  if (!c || c.layout !== layout) {
    c = { layout, claims: new Set(), at: new Map(), version: (c?.version ?? 0) + 1, listeners: c?.listeners ?? new Set() };
    deliveryByRoom.set(roomId, c);
  }
  return c;
}

/** Is this prop in the room (it was there from the start, or has been delivered)? */
export function propHere(layout: import('../world/layout').RoomLayout, idx: number): boolean {
  const k = layout.lateRank[idx];
  return k < 0 || layout.lateDone[k];
}

/** Is there a thing that has not been sent yet and is not on its way? */
export function lateAvailable(roomId: string, layout: import('../world/layout').RoomLayout): boolean {
  const c = deliveryEntry(roomId, layout);
  return layout.late.some((_, k) => !layout.lateDone[k] && !c.claims.has(k));
}

/**
 * Takes a thing that is to be delivered, picked at random from what is left (some kinds more often, see LATE_WEIGHT; it is on its way from now on): its place in
 * `layout.late`, or -1 when everything is sent already. Every thing has its own place in the layout (a sofa by the wall, a lamp in a
 * corner, a plant by the window…, checked to leave every walkway open whichever of the others are there), so the order does not matter.
 */
export function claimLate(roomId: string, layout: import('../world/layout').RoomLayout): number {
  const c = deliveryEntry(roomId, layout);
  const open: number[] = [];
  let total = 0;
  for (let k = 0; k < layout.late.length; k++) {
    if (layout.lateDone[k] || c.claims.has(k)) continue;
    open.push(k);
    total += LATE_WEIGHT[layout.props[layout.late[k]].kind] ?? 1;
  }
  if (!open.length) return -1;
  let pick = Math.random() * total;
  let k = open[open.length - 1];
  for (const o of open) {
    pick -= LATE_WEIGHT[layout.props[layout.late[o]].kind] ?? 1;
    if (pick < 0) {
      k = o;
      break;
    }
  }
  c.claims.add(k);
  return k;
}

/** things that turn up in a parcel / a carton more often than the rest (1 for everything else): a floor lamp lights up the room */
const LATE_WEIGHT: Partial<Record<import('../world/layout').PropKind, number>> = { floorLamp: 4 };

/** The delivery was called off: the thing is next in line again. */
export function releaseLate(roomId: string, layout: import('../world/layout').RoomLayout, rank: number) {
  deliveryEntry(roomId, layout).claims.delete(rank);
}

/** The parcel is open: the thing stands in the room from now on (drawn, in the way of the walkers, its stations and seats usable). */
export function commitDelivery(roomId: string, layout: import('../world/layout').RoomLayout, rank: number) {
  if (rank < 0 || rank >= layout.late.length || layout.lateDone[rank]) return;
  const c = deliveryEntry(roomId, layout);
  const pi = layout.late[rank];
  layout.lateDone[rank] = true;
  layout.blockProp(pi);
  for (const st of layout.stations) if (st.propIdx === pi) st.off = false;
  for (const sp of layout.spots) if (sp.propIdx === pi) sp.off = false;
  c.claims.delete(rank);
  c.at.set(rank, performance.now());
  c.version++;
  c.listeners.forEach((f) => f());
}

export function subscribeDelivery(roomId: string, layout: import('../world/layout').RoomLayout, fn: () => void): () => void {
  const c = deliveryEntry(roomId, layout);
  c.listeners.add(fn);
  return () => c.listeners.delete(fn);
}

export function deliveryVersion(roomId: string, layout: import('../world/layout').RoomLayout): number {
  return deliveryEntry(roomId, layout).version;
}

/** performance.now() (ms) at which the thing of this place in `layout.late` arrived (0: before this page knew about it) */
export function deliveredAt(roomId: string, layout: import('../world/layout').RoomLayout, rank: number): number {
  return deliveryEntry(roomId, layout).at.get(rank) ?? 0;
}

export function subscribeMoved(roomId: string, fn: () => void): () => void {
  const c = movedByRoom.get(roomId);
  if (!c) return () => {};
  c.listeners.add(fn);
  return () => c.listeners.delete(fn);
}

export function movedVersion(roomId: string): number {
  return movedByRoom.get(roomId)?.version ?? 0;
}

/** Seconds until the first parcel of a room, and between a parcel that was opened and the next one. */
const FIRST_PARCEL_S: [number, number] = [8, 18];
const NEXT_PARCEL_S: [number, number] = [18, 40];

/**
 * Schedules and delivers the parcels of a room: a first one soon after somebody is on stage, then the next one shortly after a parcel
 * was opened. What is in the box is the next thing of `layout.late` (big things come in big boxes); once everything is sent there are no more.
 * Only numbers are compared. Returns true at the moment a parcel arrives.
 */
export function tickParcel(rt: RoomRuntime, now: number, roomId: string, layout: import('../world/layout').RoomLayout): boolean {
  if (rt.parcelAt === 0) rt.parcelAt = now + FIRST_PARCEL_S[0] + Math.random() * (FIRST_PARCEL_S[1] - FIRST_PARCEL_S[0]);
  if (rt.parcel !== 'none' || now < rt.parcelAt) return false;
  const rank = claimLate(roomId, layout);
  if (rank < 0) {
    rt.parcelAt = now + 30;
    return false;
  }
  rt.parcelRank = rank;
  rt.parcelBig = layout.lateBig[rank];
  rt.parcel = 'waiting';
  return true;
}

/** The parcel was opened: the next delivery is not far. */
export function parcelDone(rt: RoomRuntime, now: number) {
  rt.parcel = 'none';
  rt.parcelBy = null;
  rt.parcelRank = -1;
  rt.parcelBig = false;
  rt.parcelAt = now + NEXT_PARCEL_S[0] + Math.random() * (NEXT_PARCEL_S[1] - NEXT_PARCEL_S[0]);
}

export function runtimeFor(roomId: string): RoomRuntime {
  let rt = roomRuntime.get(roomId);
  if (!rt) {
    rt = {
      doorFreeAt: 0, leaveFreeAt: 0, motionAt: -99, motionBy: null, visitors: [null, null, null], directorSeated: false, directorKey: null, receivedAt: -99,
      burstKey: null, burstStart: 0, lastToolAt: 0, burstSeq: 0, queued: 0, lastHire: 0, lastNewcomer: 0, lastNewHire: 0, prompt: '', idleSince: 0, leaving: false, wasBusy: false, runStart: 0, lastText: '', knownFinal: '', talkDeadline: 0,
      parcel: 'none', parcelAt: 0, parcelBy: null, parcelRank: -1, parcelBig: false, askAt: 0, cheerUntil: 0, summaryDue: false,
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
  deliveryByRoom.delete(roomId);
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
export const debugFlags: { activity?: string; catNow?: boolean; catLeave?: boolean; catSpot?: string; catToy?: 'play' | 'scratch'; catPose?: string; channel?: 'call' | 'email' } = {};

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
