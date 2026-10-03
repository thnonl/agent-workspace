import { create } from 'zustand';
import type { ActivityEntry, AskRec, MonitorEvent, PersonRec, RoomRec, RunSummary, Speech, TaskLogEntry, TaskRec } from './types';
import { hashString, Rng } from './util/rng';
import { chunkText } from './util/text';
import { THEMES } from './world/palettes';
import { HOUR_PRESETS } from './env';
import { loadNames, pickName, saveNames } from './names';
import { getLayout } from './world/layout';
import { isMuted, setMuted as setAudioMuted, sfx } from './audio';
import { loadFlag, loadPref, QUALITIES, savePref, type Quality } from './prefs';
import { getSetting, setSetting } from './settings';
import { takeRestoredPeople } from './roomPeople';
import { CONTEXT_WINDOWS, type ContextWindowPref } from './context';
import { resolveWeather, WEATHER_MODES, type Weather, type WeatherMode } from './weather';
import { resolveSeason, SEASON_MODES, type Season, type SeasonMode } from './season';
import { doneLines, pickAck } from './sim/phrases';
import { celebrate } from './sim/celebrate';
import { frame } from './sim/frame';
import { noteCue, notePeople, noteReport, noteRun, noteTask } from './progress';
import { HIRE_GAP_MS, bufferTaskSpeech, clearTalk, debugFlags, dropRoomRuntime, dropRuntime, dropTaskSpeech, enqueueSpeech, hasQueuedTool, runtimeFor, sims, takeTaskSpeech, talkPending, tickQuietDelivery } from './sim/registry';

export type Connection = 'connecting' | 'live' | 'offline';
export type TimeMode = 'auto' | 'day' | 'dusk' | 'night';
export type Sources = Record<string, string | null>;

interface State {
  connection: Connection;
  /** what the monitor watches, by provider (null = switched off) */
  sources: Sources;
  demoOn: boolean;
  rooms: Record<string, RoomRec>;
  roomOrder: string[];
  /** the rooms that are shown: a session is working, or was active less than 5 minutes ago */
  visibleOrder: string[];
  /** the order of the room buttons (and of the number and arrow keys): the order the sessions showed up, idle rooms behind the working ones */
  listOrder: string[];
  /** the characters: one director per room plus the staff */
  people: Record<string, PersonRec>;
  /** open tasks (waiting for somebody, being worked on, or being handed over) */
  tasks: Record<string, TaskRec>;
  /** what each person said, by person key */
  logs: Record<string, Speech[]>;
  /** finished tasks per room, newest first */
  finished: Record<string, TaskLogEntry[]>;
  /** everything that happened in a room, newest first */
  activity: Record<string, ActivityEntry[]>;
  /** which list is open under the room header (none from the start: the lists cover a good part of the room) */
  listTab: 'tasks' | 'reports' | 'activity' | null;
  /** the last finished run of every room */
  summaries: Record<string, RunSummary>;
  /** rooms whose session has finished all its work and were not released yet (blue blinking dot on their button) */
  unseen: Record<string, boolean>;
  /** rooms whose main agent waits for the user's answer (pulsing bubble over the director, amber badge on the card) */
  asks: Record<string, AskRec>;
  /** rooms whose summary nobody has closed yet: the paper opens when they are visited */
  unread: Record<string, boolean>;
  /** rooms whose summary paper the user has closed since the last run: stepping into them does not lay the paper down again */
  dismissed: Record<string, boolean>;
  /** rooms the user released: hidden from the list until the session is continued (session id → when) */
  released: Record<string, number>;
  /** the release confirmation that is on screen */
  releaseAsk: { roomId: string } | null;
  /** the "release every idle room" confirmation is on screen */
  releaseAllAsk: boolean;
  /** the room whose summary paper is open */
  summaryOpen: string | null;
  activeRoomId: string | null;
  selectedKey: string | null;
  showHelp: boolean;
  showNames: boolean;
  /** the list of sessions on the right is shown (toggled by the live pill in the top bar) */
  showSwitcher: boolean;
  /** on a phone the list folds away while a person is looked at, and comes back when they are let go (not saved; see switcherShown) */
  switcherAuto: boolean;
  /** phones and tablets: the top bar and the room header are folded away behind one button (saved per browser) */
  hudFolded: boolean;
  /** sound effects are off */
  muted: boolean;
  /** the user's list of names for the director and the staff */
  names: string[];
  resetTick: number;
  autoDemo: boolean;
  timeMode: TimeMode;
  /** effective hour of day (0-24) driving light and sky */
  hour: number;
  /** render quality: low = plain, medium = soft light effects, high = sharper render and denser particles */
  quality: Quality;
  weatherMode: WeatherMode;
  /** the weather outside right now (weatherMode resolved) */
  weather: Weather;
  seasonMode: SeasonMode;
  season: Season;
  /** lo-fi music on (off until the user asks for it) */
  musicOn: boolean;
  /** window size assumed for sessions whose window is only guessed (see context.ts) */
  contextWindow: ContextWindowPref;
  /** screensaver: HUD hidden, the camera tours the rooms */
  cinema: boolean;
  /** picture-in-picture: the office is in a small floating window (see pip.ts) */
  pip: boolean;
  showSettings: boolean;
  syncing: { sessions: Set<string>; agents: Set<string> } | null;

  setConnection: (c: Connection, sources?: Sources) => void;
  applyEvent: (ev: MonitorEvent, demo?: boolean) => void;
  /** applies a list of live events in order with one store notification */
  applyEvents: (list: MonitorEvent[]) => void;
  beginSync: () => void;
  endSync: () => void;
  /** housekeeping clock: closes bursts, hands out tasks, sends everybody home when the work is over */
  tick: () => void;
  /** the person handed their task over: it is finished for good and they are free for the next one */
  releaseTask: (personKey: string) => void;
  /** the character has come through the door for the first time (see PersonRec.inside) */
  markInside: (personKey: string) => void;
  /** the report of the person's task lands on the director's desk */
  reportTask: (personKey: string) => void;
  openSummary: (roomId: string) => void;
  /** Esc / close button / backdrop of the paper: answers a pending question first, otherwise closes the paper */
  requestCloseSummary: () => void;
  closeSummary: () => void;
  askRelease: () => void;
  cancelRelease: () => void;
  askReleaseAll: () => void;
  /** hide the room from the list (continuing the session in its agent brings it back) */
  releaseRoom: (roomId: string) => void;
  /** release every room that is not working right now (working ones stay: they would come straight back) */
  releaseAllRooms: () => void;
  toggleList: (tab: 'tasks' | 'reports' | 'activity') => void;
  setListTab: (tab: 'tasks' | 'reports' | 'activity') => void;
  setActiveRoom: (id: string | null) => void;
  stepRoom: (dir: 1 | -1) => void;
  select: (key: string | null) => void;
  setDemo: (on: boolean) => void;
  clearDemo: () => void;
  setHelp: (on: boolean) => void;
  setMuted: (on: boolean) => void;
  setShowNames: (on: boolean) => void;
  setShowSwitcher: (on: boolean) => void;
  setSwitcherAuto: (on: boolean) => void;
  setHudFolded: (on: boolean) => void;
  /** the session list button / the live pill: shows a list that was folded for a person, or else flips the saved choice */
  toggleSwitcher: () => void;
  applyNames: (list: string[]) => void;
  resetView: () => void;
  setAutoDemo: (on: boolean) => void;
  setTimeMode: (m: TimeMode) => void;
  setHour: (h: number) => void;
  setQuality: (q: Quality) => void;
  setWeatherMode: (m: WeatherMode) => void;
  setSeasonMode: (m: SeasonMode) => void;
  setMusicOn: (on: boolean) => void;
  setContextWindow: (w: ContextWindowPref) => void;
  setCinema: (on: boolean) => void;
  setPip: (on: boolean) => void;
  setShowSettings: (on: boolean) => void;
}

export function localHour(): number {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

/** Key of a sub-agent's task (the monitor's agent id is the tool_use id) and of the main agent. */
export const agentKey = (sessionId: string, agentId: string) => `${sessionId}::${agentId}`;
const directorKeyOf = (sessionId: string) => `${sessionId}::director`;

// ------------------------------------------------------------------ tuning
/** the office stays this long after the last piece of work before everybody goes home */
const GRACE_MS = 5000;
/** the director stays in the office at least this long after the work is done (the staff go home at once) */
const DIRECTOR_STAY_MS = 5 * 60_000;
/** gap between two people walking out */
const LEAVE_STAGGER_MS = 15000;
/** ...and this once no other room is left to load ahead */
const LEAVE_STAGGER_FREE_MS = 1000;
/** every tool call of the main agent is a task of its own; whoever gets it works on it for this long */
const MAIN_TASK_MS = 4500;
/** a tool call that has waited this long for a free person is skipped (the office cannot keep up): the staff do the newest calls */
const CALL_STALE_MS = 3000;
/** ...except the newest few, which wait for somebody however long it takes */
const CALL_KEEP = 3;
/** a picture a tool brought back is a job somebody shows (a thumbnail in the bubble): it waits this long for a free person before it is skipped */
const IMAGE_WAIT_MS = 15_000;
/** while other rooms are being loaded ahead nobody comes back from home and the team grows to this size at most */
const MIN_TEAM = 3;
/** a room seats the director and at most this many staff (the layout has exactly this many desks) */
export const MAX_STAFF = 6;

const SWITCHER_KEY = 'agent-workspace.showSwitcher';
/** ?weather=rain / ?season=xmas force a setting for this page load (testing, screenshots) */
const queryOf = (name: string): string | null => (typeof location === 'undefined' ? null : new URLSearchParams(location.search).get(name));
const pickMode = <T extends string>(q: string | null, allowed: readonly T[]): T | null => (allowed.includes(q as T) ? (q as T) : null);
const initWeatherMode: WeatherMode = pickMode(queryOf('weather'), WEATHER_MODES) ?? loadPref('weather', WEATHER_MODES, 'auto');
const initSeasonMode: SeasonMode = pickMode(queryOf('season'), SEASON_MODES) ?? loadPref('season', SEASON_MODES, 'auto');
const HUD_FOLD_KEY = 'agent-workspace.hudFolded';
function loadHudFolded(): boolean {
  try {
    return getSetting(HUD_FOLD_KEY) === '1';
  } catch {
    return false;
  }
}
function loadShowSwitcher(): boolean {
  try {
    return getSetting(SWITCHER_KEY) !== '0';
  } catch {
    return true;
  }
}
/** the director announces the end of the work: each bubble stays this long on screen */
const TALK_HOLD_MS = 4500;

let logId = 100000;

/** a session that has stood still for this long is released by itself (it comes back when it is continued) */
const AUTO_RELEASE_MS = 60 * 60_000;
const RELEASED_KEY = 'claude-office:released';

/** Rooms the user released (hidden from the list until the session is continued), by session id → when. */
function loadReleased(): Record<string, number> {
  try {
    const v = JSON.parse(getSetting(RELEASED_KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function saveReleased(r: Record<string, number>) {
  try {
    const keep = Object.entries(r).filter(([, at]) => Date.now() - at < 3 * 86_400_000).sort((a, b) => b[1] - a[1]).slice(0, 200);
    setSetting(RELEASED_KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch {
    /* private mode – the release is simply not remembered */
  }
}

/** last time something happened in a room (not reactive on purpose: it changes with every event) */
const lastActive = new Map<string, number>();
const touchRoom = (id: string, at = Date.now()) => lastActive.set(id, Math.max(lastActive.get(id) ?? 0, at));

/** A room stays in the list until it is released; a released room comes back as soon as its session is continued. */
function isShown(s: State, id: string): boolean {
  const r = s.rooms[id];
  if (!r) return false;
  const released = s.released[id];
  if (!released) return true;
  if (r.mainActive) return true;
  for (const t of Object.values(s.tasks)) if (t.sessionId === id) return true;
  return (lastActive.get(id) ?? 0) > released;
}

/** Nothing is going on in the room and nothing has happened for an hour. */
function isStale(s: State, id: string, now: number): boolean {
  const r = s.rooms[id];
  if (!r || r.mainActive) return false;
  for (const t of Object.values(s.tasks)) if (t.sessionId === id) return false;
  return now - (lastActive.get(id) ?? r.createdAt) > AUTO_RELEASE_MS;
}

/**
 * The order of the room buttons: the order in which the sessions showed up, with the rooms that need the user (a question,
 * an unread summary) in front and the idle rooms behind the working ones
 * (sorted again shortly after a room starts or stops working, see the subscription at the end of this file, and at once
 * when a summary is closed). (The number keys and the arrow keys follow the same order.)
 */
/** the session list is on screen: switched on and not folded away for the person being looked at */
export const switcherShown = (s: Pick<State, 'showSwitcher' | 'switcherAuto'>) => s.showSwitcher && !s.switcherAuto;

export function orderedRooms(s: Pick<State, 'listOrder'>): string[] {
  return [...s.listOrder];
}

/** A question first, then the finished rooms with an unread summary, then the working rooms, then the idle ones; ties keep the order of arrival. */
function sortedList(s: State, ids: string[]): string[] {
  const rank = roomRanks(s, ids);
  const at = new Map(s.roomOrder.map((id, i) => [id, i] as const));
  return [...ids].sort((a, b) => rank.get(a)! - rank.get(b)! || at.get(a)! - at.get(b)!);
}

/** How much a room needs the user: 0 a question, 1 an unread summary, 2 working, 3 idle. */
const IDLE_RANK = 3;
function roomRanks(s: State, ids: string[]): Map<string, number> {
  const busy = new Set<string>();
  for (const t of Object.values(s.tasks)) busy.add(t.sessionId);
  return new Map(ids.map((id) => [id, s.asks[id] ? 0 : s.unseen[id] ? 1 : s.rooms[id]?.mainActive || busy.has(id) ? 2 : IDLE_RANK] as const));
}

/** The first sync after the page was loaded has run: the page opens on the room that needs the user, but never moves again by itself. */
let focusedOnLoad = false;

/** `listOrder` follows `visibleOrder`: rooms that closed leave it, new rooms join at the end. */
function reconcileList(list: string[], vis: string[]): string[] {
  const kept = list.filter((id) => vis.includes(id));
  const next = [...kept, ...vis.filter((id) => !kept.includes(id))];
  return next.length === list.length && next.every((id, i) => id === list[i]) ? list : next;
}

/** Keep `visibleOrder` (and the active room) in line with what is going on. */
function refreshVisible(get: Get, set: SetFn) {
  let s = get();
  const now = Date.now();
  // a session that stopped more than an hour ago is released like the user would do it (not while its paper is open)
  const stale = s.roomOrder.filter((id) => !s.released[id] && s.summaryOpen !== id && s.releaseAsk?.roomId !== id && isStale(s, id, now));
  let unseen = s.unseen;
  let unread = s.unread;
  let released = s.released;
  if (stale.length) {
    released = { ...released };
    unseen = { ...unseen };
    unread = { ...unread };
    for (const id of stale) {
      released[id] = now;
      unseen[id] = false;
      unread[id] = false;
    }
    saveReleased(released);
    s = { ...s, released, unseen, unread };
  }
  const vis = s.roomOrder.filter((id) => isShown(s, id));
  // rooms whose session went on after the release are no longer "released"
  const back = vis.filter((id) => s.released[id]);
  if (back.length) {
    released = { ...released };
    for (const id of back) delete released[id];
    saveReleased(released);
  }
  s = get();
  const same = vis.length === s.visibleOrder.length && vis.every((id, i) => id === s.visibleOrder[i]);
  let active = s.activeRoomId;
  if (!active || !vis.includes(active)) {
    // the room we were looking at closed: move to the nearest one that is still open
    const from = active ? s.roomOrder.indexOf(active) : 0;
    active = [...vis].sort((a, b) => Math.abs(s.roomOrder.indexOf(a) - from) - Math.abs(s.roomOrder.indexOf(b) - from))[0] ?? null;
  }
  const listOrder = reconcileList(s.listOrder, vis);
  if (same && listOrder === s.listOrder && active === s.activeRoomId && released === s.released && unseen === s.unseen && unread === s.unread) return;
  set({
    released, unseen, unread, listOrder,
    visibleOrder: same ? s.visibleOrder : vis, activeRoomId: active,
    selectedKey: active === s.activeRoomId ? s.selectedKey : null,
    summaryOpen: active === s.activeRoomId ? s.summaryOpen : null,
  });
}
function newRoom(id: string, existing: RoomRec[], demo: boolean): RoomRec {
  const seed = hashString(id);
  const used = new Set(existing.map((r) => r.themeIndex));
  let themeIndex = seed % THEMES.length;
  for (let k = 0; k < THEMES.length && used.has(themeIndex); k++) themeIndex = (themeIndex + 1) % THEMES.length;
  return {
    id, title: id.slice(0, 8), project: 'session', provider: 'claude', cwd: '', seed, themeIndex,
    index: existing.length, updatedAt: Date.now(), createdAt: Date.now(), reports: 0, tasksDone: 0, mainActive: false, demo,
  };
}

type Get = () => State;
type SetFn = (partial: Partial<State>) => void;
type BatchSet = (partial: Partial<State> | ((s: State) => Partial<State>)) => void;
type Batch = <T>(fn: () => T) => T;

/**
 * One event or tick changes people, tasks, rooms and logs in several steps. Every `set` notifies every
 * subscriber (and each of them re-runs its selector), so inside `run` the changes are collected and
 * written once at the end. `get` already sees the collected changes.
 */
function makeBatcher(rawSet: (p: Partial<State>) => void, rawGet: Get): { set: BatchSet; get: Get; run: Batch } {
  let depth = 0;
  let pending: Partial<State> | null = null;
  const get: Get = () => (pending ? { ...rawGet(), ...pending } : rawGet());
  const set: BatchSet = (p) => {
    const partial = typeof p === 'function' ? p(get()) : p;
    if (depth > 0) pending = { ...pending, ...partial };
    else rawSet(partial);
  };
  const run: Batch = (fn) => {
    depth++;
    try {
      return fn();
    } finally {
      if (--depth === 0 && pending) {
        const p = pending;
        pending = null;
        rawSet(p);
      }
    }
  };
  return { set, get, run };
}
type SpeechIn = Omit<Speech, 'id' | 'at'>;

/** (the floating window is an about:blank document: a picture's address must not depend on the page it is shown in) */
const absoluteUrl = (u: string) => {
  try {
    return new URL(u, location.href).href;
  } catch {
    return u;
  }
};

const peopleOf = (s: State, roomId: string) => Object.values(s.people).filter((p) => p.sessionId === roomId);
/**
 * Rooms the user has looked at since this page was opened. Until then a working room is run by its director alone: no staff is hired
 * (nobody would see them), and the jobs that come in are only counted (see headlessRoom).
 */
const enteredRooms = new Set<string>();
export const hasEntered = (roomId: string) => enteredRooms.has(roomId);

const tasksOf = (s: State, roomId: string) => Object.values(s.tasks).filter((t) => t.sessionId === roomId);
const clip = (t: string, n: number) => {
  const x = t.replace(/\s+/g, ' ').trim();
  return x.length > n ? `${x.slice(0, n - 1).trimEnd()}…` : x;
};

function roomNames(state: State, roomId: string, except?: string): Set<string> {
  const taken = new Set<string>();
  for (const a of Object.values(state.people)) if (a.sessionId === roomId && a.key !== except) taken.add(a.name.toLowerCase());
  return taken;
}

const ACTIVITY_CAP = 500;
let activityId = 1;

/** Add a line to the activity feed of a room (newest first). */
function logActivity(get: Get, set: SetFn, roomId: string, e: Omit<ActivityEntry, 'id' | 'at' | 'roomId'>) {
  const s = get();
  if (!s.rooms[roomId]) return;
  const text = e.text.length > 600 ? `${e.text.slice(0, 599)}…` : e.text;
  const entry: ActivityEntry = { id: activityId++, at: Date.now(), roomId, ...e, text };
  set({ activity: { ...s.activity, [roomId]: [entry, ...(s.activity[roomId] ?? [])].slice(0, ACTIVITY_CAP) } });
}

/** rooms whose pending ask the server repeated during the current sync (an ask that is not repeated was answered while the page was away) */
const syncAsks = new Set<string>();

/** The question was answered (or the turn ended): the bubble, the badge and the director's wave go away. */
function clearAsk(get: Get, set: SetFn, roomId: string) {
  const s = get();
  if (!s.asks[roomId]) return;
  const asks = { ...s.asks };
  delete asks[roomId];
  set({ asks });
  const rt = runtimeFor(roomId);
  rt.askAt = 0;
}

const nameOfPerson = (get: Get, key: string | null | undefined) => (key ? get().people[key]?.name ?? '' : '');

function patchPeople(get: Get, set: SetFn, patches: Record<string, Partial<PersonRec>>) {
  const people = { ...get().people };
  let any = false;
  for (const [k, patch] of Object.entries(patches)) {
    if (!people[k]) continue;
    people[k] = { ...people[k], ...patch };
    any = true;
  }
  if (any) set({ people });
}

function patchTask(get: Get, set: SetFn, key: string, patch: Partial<TaskRec>) {
  const t = get().tasks[key];
  if (t) set({ tasks: { ...get().tasks, [key]: { ...t, ...patch } } });
}

function removeTask(get: Get, set: SetFn, key: string) {
  const tasks = { ...get().tasks };
  delete tasks[key];
  dropTaskSpeech(key);
  set({ tasks });
}

/** Queue something for a character to say (and remember it in the log of that character). */
function deliver(get: Get, set: SetFn, personKey: string, sp: SpeechIn, bubbleTool = sp.tool) {
  const chunks = chunkText(sp.text, sp.kind === 'thinking' ? 110 : 130, sp.kind === 'thinking' ? 1 : 2);
  // (a picture goes with the last piece of the text)
  chunks.forEach((c, i) => enqueueSpeech(personKey, { kind: sp.kind, text: c, tool: bubbleTool, ...(sp.image && i === chunks.length - 1 ? { image: sp.image } : {}) }));
  const s = get();
  const entry: Speech = { id: logId++, kind: sp.kind, text: sp.text, tool: sp.tool, at: Date.now(), ...(sp.image ? { image: sp.image } : {}) };
  const prev = s.logs[personKey] ?? [];
  set({ logs: { ...s.logs, [personKey]: [...prev.slice(-39), entry] } });
}

/** when the director last answered a user message (Date.now()) */
const lastAck = new Map<string, number>();
const ACK_GAP_MS = 10000;

/** A short "got it" after the user's message (skipped while one is still waiting or was said a moment ago). */
function acknowledge(directorKey: string, via: 'call' | 'email') {
  const now = Date.now();
  if (now - (lastAck.get(directorKey) ?? 0) < ACK_GAP_MS || hasQueuedTool(directorKey, 'ack')) return;
  lastAck.set(directorKey, now);
  enqueueSpeech(directorKey, { kind: 'text', text: pickAck(via), tool: 'ack' });
}

// ------------------------------------------------------------------ people
function createPerson(get: Get, set: SetFn, roomId: string, role: 'director' | 'staff', desk: number, key: string): PersonRec {
  const state = get();
  const rec: PersonRec = {
    key, sessionId: roomId, role, name: pickName(roomId, key, state.names, roomNames(state, roomId)), seed: hashString(key),
    present: true, inside: state.syncing ? undefined : false, taskKey: null, desk, joinedAt: Date.now(), restored: !!state.syncing, lastWorkEnd: 0, leaveAt: 0, demo: state.rooms[roomId]?.demo ?? false,
  };
  set({ people: { ...state.people, [key]: rec } });
  return rec;
}

/** A director is always in the office while a session works – even when the page was opened mid-run. */
function ensureDirector(get: Get, set: SetFn, roomId: string): PersonRec {
  const key = directorKeyOf(roomId);
  const cur = get().people[key];
  if (cur) {
    if (!cur.present || cur.leaveAt) patchPeople(get, set, { [key]: { present: true, leaveAt: 0 } });
    return get().people[key];
  }
  const director = createPerson(get, set, roomId, 'director', -1, key);
  // after a page reload the people who were in the room come back with the director (the head count is kept by the server)
  if (!get().rooms[roomId]?.demo) {
    for (let n = takeRestoredPeople(roomId) - 1; n > 0; n--) if (!hireStaff(get, set, roomId)) break;
  }
  return director;
}

function staffCap(get: Get, roomId: string): number {
  const room = get().rooms[roomId];
  if (!room) return 0;
  return Math.min(MAX_STAFF, getLayout(room.seed, room.themeIndex).desks.length);
}

function hireStaff(get: Get, set: SetFn, roomId: string): PersonRec | null {
  const s = get();
  const room = s.rooms[roomId];
  if (!room) return null;
  const staff = peopleOf(s, roomId).filter((p) => p.role === 'staff');
  if (staff.length >= staffCap(get, roomId)) return null;
  const layout = getLayout(room.seed, room.themeIndex);
  const used = new Set(staff.map((p) => p.desk));
  const free = layout.desks.map((_, i) => i).filter((i) => !used.has(i));
  if (!free.length) return null;
  const n = staff.reduce((m, p) => Math.max(m, Number(p.key.split('::staff')[1]) || 0), 0) + 1;
  const key = `${roomId}::staff${n}`;
  runtimeFor(roomId).lastNewHire = Date.now();
  return createPerson(get, set, roomId, 'staff', new Rng(hashString(key)).pick(free), key);
}

/** A hired person who has not come through the door yet (rooms being loaded hold the door shut). */
function waitingOutside(staff: PersonRec[], now: number): boolean {
  return staff.some((p) => p.present && (sims.has(p.key) ? !sims.get(p.key)!.onStage : p.sessionId === frame.activeId && now - p.joinedAt < 20_000));
}

/**
 * The size of the team follows the number of jobs the session has done: one person after 2 tasks, two after 5, three after 10, four
 * after 20, five after 30, six after 40 (never more than the desks). A room nobody has looked at yet stops at PRESET_MAX.
 */
const TEAM_BY_TASKS: readonly [number, number][] = [[40, 6], [30, 5], [20, 4], [10, 3], [5, 2], [2, 1]];
const PRESET_MAX = 4;
function teamSize(get: Get, roomId: string): number {
  const room = get().rooms[roomId];
  if (!room) return 0;
  // (the monitor counts the whole session, the page only what happened since it opened: whichever knows more)
  const open = tasksOf(get(), roomId).length;
  const done = Math.max(room.toolCalls ?? 0, room.tasksDone + open);
  let n = TEAM_BY_TASKS.find(([k]) => done >= k)?.[1] ?? 0;
  if (!enteredRooms.has(roomId)) n = Math.min(n, PRESET_MAX);
  // (a room on screen with work waiting has somebody to do it, even before the second task)
  else if (open > 0) n = Math.max(n, 1);
  return Math.min(staffCap(get, roomId), n);
}

/** A room nobody has looked at yet but that is working has its team (see teamSize) at their desks already: they sit there when the room is first built. */
function presetStaff(get: Get, set: SetFn, roomId: string) {
  if (enteredRooms.has(roomId)) return;
  const want = teamSize(get, roomId);
  const staff = peopleOf(get(), roomId).filter((p) => p.role === 'staff');
  let missing = want - staff.filter((p) => p.present).length;
  if (missing <= 0) return;
  const patches: Record<string, Partial<PersonRec>> = {};
  // somebody of the team who went home earlier is back first, then new people
  for (const p of staff) {
    if (missing <= 0) break;
    if (p.present) continue;
    patches[p.key] = { present: true, leaveAt: 0, restored: true, inside: undefined };
    missing--;
  }
  patchPeople(get, set, patches);
  for (; missing > 0; missing--) {
    const p = hireStaff(get, set, roomId);
    if (!p) break;
    // (already in the office: at the desk from the start, counted as inside)
    patchPeople(get, set, { [p.key]: { restored: true, inside: undefined } });
  }
}

/** every this long after the last new hire, the office takes on one more person – needed or not (up to the desks of the room) */
const AUTO_HIRE_MS = 5 * 60_000;
function autoHire(get: Get, set: SetFn, roomId: string, now: number) {
  if (!enteredRooms.has(roomId)) return; // (only the director works in a room nobody has looked at)
  const rt = runtimeFor(roomId);
  if (!rt.lastNewHire) rt.lastNewHire = now; // (the clock starts when the office first works)
  if (now - rt.lastNewHire < AUTO_HIRE_MS) return;
  const staff = peopleOf(get(), roomId).filter((p) => p.role === 'staff');
  if (staff.length >= staffCap(get, roomId)) return; // (every desk has its person already)
  // (not while rooms are being loaded, one behind the other, and HIRE_GAP_MS after anybody came in)
  if (loadingAhead() || waitingOutside(staff, now) || now - Math.max(rt.lastHire, rt.lastNewcomer) < HIRE_GAP_MS) return;
  const p = hireStaff(get, set, roomId);
  if (!p) return;
  rt.lastHire = now;
  logActivity(get, set, roomId, { kind: 'system', who: 'Office', text: `${p.name} joins the team` });
}

// ------------------------------------------------------------------- tasks
function createTask(get: Get, set: SetFn, sessionId: string, source: 'sub' | 'main', agentId: string, key: string, label: string, agentType: string, extra: Partial<TaskRec> = {}): TaskRec {
  const rec: TaskRec = {
    key, sessionId, source, agentId, label, agentType, assignee: null, done: false, failed: false, summary: '',
    reported: false, origin: '', tool: '', steps: 0, first: '', closeAt: 0, startedAt: Date.now(), finishedAt: 0, demo: get().rooms[sessionId]?.demo ?? false,
    ...extra,
  };
  set({ tasks: { ...get().tasks, [key]: rec } });
  return rec;
}

/** Say something for a task: to whoever works on it, or keep it until somebody picks the task up. */
function sayForTask(get: Get, set: SetFn, task: TaskRec, sp: SpeechIn) {
  if (task.assignee && get().people[task.assignee]) deliver(get, set, task.assignee, sp);
  else bufferTaskSpeech(task.key, sp);
}

/**
 * Every tool call – of the main agent or of a sub-agent – is a task of its own (source "main" = a tool
 * call), so the calls are spread over the staff. `origin` says who made the call.
 */
function callTask(get: Get, set: SetFn, roomId: string, c: { label: string; origin: string; text: string; tool?: string }): TaskRec {
  const rt = runtimeFor(roomId);
  rt.lastToolAt = Date.now();
  const key = `${roomId}::call#${++rt.burstSeq}`;
  return createTask(get, set, roomId, 'main', c.origin, key, c.label, '', { origin: c.origin, tool: c.tool ?? '', first: clip(c.text, 70), steps: 1 });
}

/** Give waiting tasks to people: hire until the team has a decent size, then let the staff take turns. */
/** Has the person arrived at their desk (or been there all along)? Somebody who has just been hired and is still on the way in has not. */
function arrived(p: PersonRec): boolean {
  const s = sims.get(p.key);
  // (nobody walks in a room that is not on screen: its people only exist as records and are at their desks at once)
  if (!s) return !!p.restored || p.sessionId !== frame.activeId || Date.now() - p.joinedAt > 20_000;
  return s.onStage && s.phase !== 'entering';
}

/** Is another room still being loaded, or waiting to be (see frame.loading)? Not when nobody is looking at the scene. */
function loadingAhead(): boolean {
  const now = performance.now();
  // (the flag flickers between two rooms: it counts as false only after a pause, like the door gap in Actor)
  return now - frame.at < 3000 && (frame.loading || now - frame.loadingAt < 3000);
}

/**
 * Who gets the next task (lower first; within a rank the rotation of freeStaff decides): somebody at the desk, then on a bean bag, on the
 * toilet, on the sofa, at the round table, then everybody else (away from the desk, on the move or on another break) if there are still tasks.
 */
const MOVING_RANK = 5;
function assignRank(p: PersonRec): number {
  const s = sims.get(p.key);
  if (!s) return 0; // (a room that is not on screen has no people to see: all of them sit at their desks)
  if (s.phase === 'working' || s.phase === 'sitting' || s.phase === 'unpacking') return 0;
  if (s.phase === 'activity' && s.sitT > 0.5) {
    const k = s.actKind;
    return k === 'beanbag' ? 1 : k === 'toilet' ? 2 : k === 'sofa' ? 3 : k === 'table' ? 4 : MOVING_RANK;
  }
  return MOVING_RANK;
}

/** Staff without a task who are not on their way out – at home or in the office – the one who finished a task longest ago (or never had one) first. */
function freeStaff(get: Get, roomId: string): PersonRec[] {
  // (whoever fetches the parcel or carries a carton to open it finishes that first: no task cuts in)
  const free = peopleOf(get(), roomId).filter((p) => p.role === 'staff' && !p.taskKey && !(p.present && p.leaveAt) && !sims.get(p.key)?.carrying);
  return free.sort((a, b) => a.lastWorkEnd - b.lastWorkEnd || a.joinedAt - b.joinedAt);
}

/**
 * Bring one more person into the office (while the team is smaller than the jobs of the session call for, see teamSize): somebody who went home comes back
 * first, otherwise a new person is hired (up to the size of the room). Returns 1 when somebody is on the way (or will be once the gap is over), 0 when nobody can come.
 */
function bringIn(get: Get, set: SetFn, roomId: string, wanted: number): number {
  const staff = peopleOf(get(), roomId).filter((p) => p.role === 'staff');
  const loading = loadingAhead();
  const rt = runtimeFor(roomId);
  const need = Math.min(wanted, teamSize(get, roomId) - staff.filter((p) => p.present).length);
  if (need <= 0) return 0;
  // One person at a time, at least HIRE_GAP_MS apart – somebody who comes back from home counts like a new hire. Nobody is brought in while the one before
  // still waits outside the door (rooms being loaded hold the door shut) and the gap runs from the moment the last one came in: otherwise they pile up
  // outside and walk in one behind the other. A person held back by the gap counts as on the way, so the task waits for them.
  const now = Date.now();
  const mayCome = !waitingOutside(staff, now) && now - Math.max(rt.lastHire, rt.lastNewcomer) >= HIRE_GAP_MS;
  // (while other rooms are being loaded nobody comes back and only the minimum team is hired)
  const home = loading ? undefined : freeStaff(get, roomId).find((p) => !p.present);
  const limit = loading ? Math.min(MIN_TEAM, staffCap(get, roomId)) : staffCap(get, roomId);
  if (home) {
    if (mayCome) {
      patchPeople(get, set, { [home.key]: { present: true, leaveAt: 0 } });
      rt.lastHire = now;
    }
    return 1;
  }
  if (staff.length >= limit) return 0;
  if (mayCome && hireStaff(get, set, roomId)) rt.lastHire = now;
  return 1;
}

function dispatchRoom(get: Get, set: SetFn, roomId: string) {
  if (!enteredRooms.has(roomId)) return; // (only the director works in a room nobody has looked at)
  // sub-agent runs first, oldest first (each is a real agent that must be shown); then the tool calls, the newest first
  const queued = tasksOf(get(), roomId)
    .filter((t) => !t.assignee && !t.done)
    .sort((a, b) => (a.source === 'sub' ? 0 : 1) - (b.source === 'sub' ? 0 : 1) || (a.source === 'sub' ? a.startedAt - b.startedAt : b.startedAt - a.startedAt));
  for (let i = 0; i < queued.length; i++) {
    const t = queued[i];
    // strict rotation: whoever finished a task longest ago (or never had one) is next, so one person never ends up doing everything
    const free = freeStaff(get, roomId);
    // the work goes to the staff who are in the office; somebody who is still on the way in gets none until they are there (a task held by a
    // person outside the door would block the queue, and the next free one could not take it)
    const ready = free.filter(arrived).sort((a, b) => assignRank(a) - assignRank(b));
    // the ones who sit (at the desk first, then on the toilet, the sofa, the round table) are asked before anybody else
    let who: PersonRec | undefined = ready.find((p) => assignRank(p) < MOVING_RANK);
    if (!who) {
      // everybody who sits has a task already: somebody new comes in for this one (people who went home first, then new hires) rather than
      // calling away somebody who is on a break or on the move; the task waits for them
      const left = queued.length - i;
      const coming = free.filter((p) => p.present && !arrived(p)).length;
      if (coming >= left) break;
      if (bringIn(get, set, roomId, left - coming) > 0) break;
      // nobody can come (the office is full, or rooms are still being loaded): whoever is free does it, even from a break
      who = ready[0];
      if (!who) break;
    }
    patchPeople(get, set, { [who.key]: { taskKey: t.key, present: true, leaveAt: 0 } });
    // a long queue makes the calls shorter, so the office keeps up
    const duration = Math.max(1800, MAIN_TASK_MS - 350 * queued.length);
    patchTask(get, set, t.key, { assignee: who.key, closeAt: t.source === 'main' ? Date.now() + duration : 0 });
    if (t.source === 'sub') deliver(get, set, who.key, { kind: 'task', text: t.label });
    for (const sp of takeTaskSpeech(t.key)) deliver(get, set, who.key, sp);
  }
}

/** New work: the summary of the previous run is old news. */
function beginRun(get: Get, set: SetFn, roomId: string, now: number) {
  const rt = runtimeFor(roomId);
  if (rt.wasBusy) return;
  rt.wasBusy = true;
  rt.summaryDue = false; // more work came in: the summary of the last run is no longer the news
  rt.runStart = now;
  clearTalk(directorKeyOf(roomId)); // the announcement of the previous run is forgotten
  const cur = get();
  if (cur.dismissed[roomId]) set({ dismissed: { ...cur.dismissed, [roomId]: false } });
  if (cur.unseen[roomId] || cur.unread[roomId]) {
    set({
      unseen: { ...cur.unseen, [roomId]: false },
      unread: { ...cur.unread, [roomId]: false },
      summaryOpen: cur.summaryOpen === roomId ? null : cur.summaryOpen,
      releaseAsk: cur.releaseAsk?.roomId === roomId ? null : cur.releaseAsk,
    });
  }
}

/** The office has nothing left to do: put together the summary paper and call attention to it. */
function composeSummary(get: Get, roomId: string, now: number, partial: boolean): RunSummary {
  const s = get();
  const rt = runtimeFor(roomId);
  const all = s.finished[roomId] ?? [];
  const tasks = (partial ? all : all.filter((t) => t.finishedAt >= rt.runStart - 1000)).slice(0, 60).reverse();
  return {
    roomId, partial, startedAt: partial ? tasks[0]?.startedAt ?? s.rooms[roomId]?.createdAt ?? now : rt.runStart, finishedAt: now,
    prompt: rt.prompt, final: partial ? rt.lastText || rt.knownFinal : rt.lastText, tasks,
    staff: peopleOf(s, roomId).filter((p) => p.role === 'staff').length, reports: tasks.filter((t) => t.reported).length,
  };
}

/** The director announces that the work is finished (a couple of short phrases, not the closing message – that is on the summary paper). Returns whether they will say anything. */
function startSummaryTalk(get: Get, roomId: string, summary: RunSummary): boolean {
  const director = get().people[directorKeyOf(roomId)];
  if (!director) return false;
  clearTalk(director.key);
  const lines = doneLines(summary.tasks.filter((t) => t.failed).length, summary.tasks.length);
  for (const text of lines) enqueueSpeech(director.key, { kind: 'text', text, hold: TALK_HOLD_MS });
  runtimeFor(roomId).talkDeadline = Date.now() + lines.length * (TALK_HOLD_MS + 1500) + 45_000;
  return true;
}

/** The director is still announcing the end of the work (a talk nobody could watch is dropped after a while). */
function directorTalking(get: Get, roomId: string, now: number): boolean {
  const director = get().people[directorKeyOf(roomId)];
  if (!director || !talkPending(director.key)) return false;
  if (now <= runtimeFor(roomId).talkDeadline) return true;
  clearTalk(director.key);
  return false;
}

function finishRun(get: Get, set: SetFn, roomId: string, now: number) {
  const s = get();
  const room = s.rooms[roomId];
  if (!room) return;
  const rt = runtimeFor(roomId);
  const summary = composeSummary(get, roomId, now, false);
  rt.lastText = '';
  logActivity(get, set, roomId, { kind: 'system', who: 'Office', text: 'All work is done – the summary is ready' });
  sfx('chime'); // the session is done (also when another room is on screen)
  // confetti and cheers; a long or busy run also gets a cake on the director's desk
  celebrate(roomId, 'run');
  if (summary.tasks.length >= 10 || now - summary.startedAt >= 5 * 60_000) celebrate(roomId, 'cake');
  if (!room.demo) noteRun((now - summary.startedAt) / 60_000);
  // the director announces it; the paper itself is laid on the screen when everybody has left the office (tickRoom) – not in the demo: it would keep interrupting
  startSummaryTalk(get, roomId, summary);
  rt.summaryDue = !room.demo;
  const cur = get();
  set({
    summaries: { ...cur.summaries, [roomId]: summary },
    unseen: { ...cur.unseen, [roomId]: true },
    unread: { ...cur.unread, [roomId]: true },
  });
}

/** None of the staff of the room is at work or on the way: every one of them has been sent home and has walked out of the door (the director may still be there, see DIRECTOR_STAY_MS). */
function staffGone(st: State, roomId: string): boolean {
  const staff = peopleOf(st, roomId).filter((p) => p.role === 'staff');
  if (staff.some((p) => p.present)) return false;
  for (const p of staff) if (sims.get(p.key)?.onStage) return false;
  return true;
}

/** The user steps into a room: a session that is done lays its summary paper on the screen (the demo would keep interrupting). */
function enterRoom(get: Get, set: SetFn, id: string | null) {
  const st = get();
  const room = id ? st.rooms[id] : undefined;
  let summaries = st.summaries;
  let summaryOpen: string | null = null;
  if (id && room) {
    const busy = room.mainActive || tasksOf(st, id).length > 0;
    const known = st.summaries[id];
    const rt = runtimeFor(id);
    if (known && st.unread[id]) summaryOpen = id;
    else if (!busy && !room.demo && !st.dismissed[id] && (known || rt.prompt || rt.knownFinal || rt.lastText)) {
      if (!known || known.partial) summaries = { ...summaries, [id]: composeSummary(get, id, Date.now(), true) };
      summaryOpen = id;
    }
  }
  set({ activeRoomId: id, selectedKey: null, releaseAsk: null, summaries, summaryOpen });
}

/** How long the room in the floating window may stand empty-handed before the window moves on to a room that is working. */
const PIP_IDLE_MS = 8000;
let pipIdle = { id: '', since: 0 };

/**
 * The floating window has no buttons to change rooms with: once the room on show has had nothing to do for a while (its people
 * have had time to go home), it follows the room that was active most recently. With no room working it stays where it is.
 */
function followActiveRoom(get: Get, set: SetFn, now: number) {
  const st = get();
  const cur = st.activeRoomId;
  if (!st.pip || !cur) return;
  const working = (id: string) => !!st.rooms[id]?.mainActive || tasksOf(st, id).length > 0;
  if (working(cur)) {
    pipIdle = { id: '', since: 0 };
    return;
  }
  if (pipIdle.id !== cur) pipIdle = { id: cur, since: now };
  if (now - pipIdle.since < PIP_IDLE_MS) return;
  let best: string | null = null;
  for (const id of st.visibleOrder) {
    if (id === cur || !working(id)) continue;
    if (!best || (lastActive.get(id) ?? 0) > (lastActive.get(best) ?? 0)) best = id;
  }
  if (!best) return;
  pipIdle = { id: '', since: 0 };
  set({ activeRoomId: best, selectedKey: null, summaryOpen: null });
}

/** A finished job of a room that is not in the 3D scene is reported after this long (a character would walk to the director first). */
const HEADLESS_REPORT_MS = 3500;

/** A task nobody carries out (the room is not in the scene, or the office cannot keep up): the director settles it, and it still counts and shows in the lists. */
function settleByDirector(get: Get, set: SetFn, roomId: string, t: TaskRec, now: number) {
  const boss = get().people[directorKeyOf(roomId)];
  const entry: TaskLogEntry = {
    key: t.key, label: t.label, source: t.source, agentType: t.agentType, who: boss?.name ?? 'Director', startedAt: t.startedAt, finishedAt: now,
    failed: t.failed, reported: true, summary: t.summary, origin: t.origin, tool: t.tool, steps: t.steps, first: t.first,
  };
  removeTask(get, set, t.key);
  const cur = get();
  const r = cur.rooms[roomId];
  if (r) {
    set({
      rooms: { ...cur.rooms, [roomId]: { ...r, tasksDone: r.tasksDone + 1, reports: t.source === 'sub' ? r.reports + 1 : r.reports } },
      finished: { ...cur.finished, [roomId]: [entry, ...(cur.finished[roomId] ?? [])].slice(0, 300) },
    });
  }
}

/**
 * A room that is not the one on screen has nobody to walk the reports to the director (the scene may keep the room itself built
 * ahead, but never its people, see Preload in scene/Scene.tsx): its characters only exist as records. The story goes on all the same – jobs that are done are reported
 * and handed in, so the staff become free for the next one and the numbers (tasks, reports, who is in) stay true. When the room
 * is built again its people simply sit at their desks (Actor.warm).
 */
function headlessRoom(get: Get, set: SetFn, roomId: string, now: number) {
  const room = get().rooms[roomId];
  if (!room) return;
  // a room nobody has been in has no staff: its jobs are done by themselves (a tool call takes a few seconds, a sub-agent run is over when the agent says so)
  if (!enteredRooms.has(roomId)) {
    for (const t of tasksOf(get(), roomId)) {
      if (t.assignee) continue;
      const over = t.source === 'main' ? now - t.startedAt >= MAIN_TASK_MS : t.done && now - t.finishedAt >= HEADLESS_REPORT_MS;
      if (over) settleByDirector(get, set, roomId, t, now);
    }
  }
  for (const p of peopleOf(get(), roomId)) {
    if (!p.taskKey) continue;
    const t = get().tasks[p.taskKey];
    if (!t || !t.done) continue;
    if (t.source === 'sub' && now - t.finishedAt < HEADLESS_REPORT_MS) continue;
    if (t.source === 'sub') get().reportTask(p.key);
    get().releaseTask(p.key);
  }
}

/** One housekeeping step for a room. */
function tickRoom(get: Get, set: SetFn, roomId: string, now: number) {
  const room = get().rooms[roomId];
  if (!room) return;
  const rt = runtimeFor(roomId);
  if (get().activeRoomId !== roomId) headlessRoom(get, set, roomId, now);
  // tool calls are short jobs: they end on their own
  const waiting: TaskRec[] = [];
  for (const t of tasksOf(get(), roomId)) {
    if (t.source !== 'main' || t.done) continue;
    if (!t.assignee) waiting.push(t);
    else if (t.closeAt && now >= t.closeAt) patchTask(get, set, t.key, { done: true, finishedAt: now });
  }
  // a tool call nobody had time for within CALL_STALE_MS is old news: the director settles it (it still counts), the staff take the newest calls.
  // The newest CALL_KEEP calls stay however old they are: while nobody is in the office yet (people are walking in) they are what the first one does.
  waiting.sort((a, b) => b.startedAt - a.startedAt);
  for (let i = CALL_KEEP; i < waiting.length; i++) {
    const age = now - waiting[i].startedAt;
    if (age > (waiting[i].tool === 'Image' ? IMAGE_WAIT_MS : CALL_STALE_MS)) settleByDirector(get, set, roomId, waiting[i], now);
  }
  rt.queued = tasksOf(get(), roomId).filter((t) => !t.assignee && !t.done).length;
  // a room that is not on screen stands still, but its things keep arriving: switching back, it has moved on in the meantime
  if (get().visibleOrder.includes(roomId)) tickQuietDelivery(roomId, getLayout(room.seed, room.themeIndex), get().activeRoomId === roomId, performance.now() / 1000);
  const busy = room.mainActive || tasksOf(get(), roomId).length > 0;
  if (busy) {
    touchRoom(roomId, now);
    rt.idleSince = 0;
    beginRun(get, set, roomId, now);
    if (rt.leaving) {
      // more work arrived while people were on their way out: whoever has not left yet stays
      rt.leaving = false;
      const patches: Record<string, Partial<PersonRec>> = {};
      for (const p of peopleOf(get(), roomId)) if (p.leaveAt) patches[p.key] = { leaveAt: 0 };
      patchPeople(get, set, patches);
    }
    ensureDirector(get, set, roomId);
    dispatchRoom(get, set, roomId);
    // the team grows with the jobs of the session (one at a time, HIRE_GAP_MS apart), not only when a task finds nobody free
    if (enteredRooms.has(roomId)) bringIn(get, set, roomId, Infinity);
    autoHire(get, set, roomId, now);
    presetStaff(get, set, roomId);
    if (!room.demo) notePeople(peopleOf(get(), roomId).filter((p) => p.present && (p.inside !== false || roomId !== get().activeRoomId)).length);
  } else if (!rt.idleSince) {
    rt.idleSince = now;
  } else if (!rt.leaving && now - rt.idleSince > GRACE_MS) {
    // everything is done: the staff go home one after another, the director locks up last
    rt.leaving = true;
    if (rt.wasBusy) {
      rt.wasBusy = false;
      finishRun(get, set, roomId, now);
    }
    const here = peopleOf(get(), roomId).filter((p) => p.present);
    here.sort((a, b) => (a.role === 'director' ? 1 : 0) - (b.role === 'director' ? 1 : 0) || a.joinedAt - b.joinedAt);
    const patches: Record<string, Partial<PersonRec>> = {};
    here.forEach((p, i) => {
      if (p.role !== 'director') patches[p.key] = { leaveAt: now + 400 + i * (loadingAhead() ? LEAVE_STAGGER_MS : LEAVE_STAGGER_FREE_MS) };
    });
    patchPeople(get, set, patches);
  }
  if (rt.leaving && !busy) {
    // the director locks up last – and only after the announcement has been made
    const boss = get().people[directorKeyOf(roomId)];
    if (boss?.present && !boss.leaveAt && !directorTalking(get, roomId, now)) {
      const lastStaff = peopleOf(get(), roomId).reduce((m, p) => (p.role === 'staff' ? Math.max(m, p.leaveAt) : m), 0);
      // (the director stays a while after the work is done: DIRECTOR_STAY_MS from the moment the office ran out of work)
      const stay = (rt.idleSince || now) + DIRECTOR_STAY_MS;
      patchPeople(get, set, { [boss.key]: { leaveAt: Math.max(now + 400, stay, lastStaff + (loadingAhead() ? LEAVE_STAGGER_MS : LEAVE_STAGGER_FREE_MS)) } });
    }
  }
  const due: Record<string, Partial<PersonRec>> = {};
  // (somebody who goes home walks in like everybody else next time: no longer "at the desk from the start")
  for (const p of peopleOf(get(), roomId)) if (p.leaveAt && now >= p.leaveAt) due[p.key] = { present: false, leaveAt: 0, restored: false };
  patchPeople(get, set, due);
  // the run is over and the last of the staff has gone (the director stays on a while, nobody waits for that): the summary paper opens by
  // itself once the director has announced the end (when the room is the one on screen and nothing else is open)
  if (rt.summaryDue && rt.leaving && !busy && staffGone(get(), roomId) && !directorTalking(get, roomId, now)) {
    rt.summaryDue = false;
    const st = get();
    if (st.activeRoomId === roomId && st.summaries[roomId] && !st.summaryOpen && !st.releaseAsk && !st.releaseAllAsk) set({ summaryOpen: roomId });
  }
}

/** Turns one monitor event into people, tasks and rooms. */
function handleEvent(get: Get, set: SetFn, ev: MonitorEvent, demo: boolean) {
  const s = get();
  switch (ev.type) {
    case 'hello':
      set({ sources: ev.sources ?? { claude: ev.claudeDir } });
      return;
    case 'ready':
      return;
    case 'session': {
      s.syncing?.sessions.add(ev.sessionId);
      {
        // what was asked and how it ended, as far as the monitor knows (an idle session still has a summary)
        const rt = runtimeFor(ev.sessionId);
        if (ev.lastPrompt && !rt.prompt) rt.prompt = ev.lastPrompt;
        if (ev.lastFinal) rt.knownFinal = ev.lastFinal;
      }
      const existing = s.rooms[ev.sessionId];
      const base = existing ?? newRoom(ev.sessionId, Object.values(s.rooms), demo);
      const room: RoomRec = { ...base, title: ev.title || base.title, project: ev.project || base.project, provider: ev.provider ?? base.provider, cwd: ev.cwd || base.cwd, updatedAt: ev.updatedAt, context: ev.context ?? base.context, toolCalls: ev.toolCalls ?? base.toolCalls };
      set({
        rooms: { ...s.rooms, [room.id]: room },
        roomOrder: existing ? s.roomOrder : [...s.roomOrder, room.id],
        activeRoomId: s.activeRoomId ?? room.id,
      });
      return;
    }
    case 'session_end': {
      // the monitor stops following a quiet session after a while – the room stays until it is released
      if (ev.reason === 'idle') return;
      const room = s.rooms[ev.sessionId];
      if (!room) return;
      const rooms = { ...s.rooms };
      delete rooms[room.id];
      const people = { ...s.people };
      const tasks = { ...s.tasks };
      const logs = { ...s.logs };
      for (const p of Object.values(s.people)) {
        if (p.sessionId !== room.id) continue;
        delete people[p.key];
        delete logs[p.key];
        dropRuntime(p.key);
      }
      for (const t of Object.values(s.tasks)) {
        if (t.sessionId !== room.id) continue;
        delete tasks[t.key];
        dropTaskSpeech(t.key);
      }
      dropRoomRuntime(room.id);
      lastActive.delete(room.id);
      const finished = { ...s.finished };
      delete finished[room.id];
      const summaries = { ...s.summaries };
      delete summaries[room.id];
      const activity = { ...s.activity };
      delete activity[room.id];
      const unseen = { ...s.unseen };
      delete unseen[room.id];
      const asks = { ...s.asks };
      delete asks[room.id];
      const unread = { ...s.unread };
      delete unread[room.id];
      const dismissed = { ...s.dismissed };
      delete dismissed[room.id];
      const roomOrder = s.roomOrder.filter((id) => id !== room.id);
      // keep grid slots stable: re-index remaining rooms
      roomOrder.forEach((id, i) => (rooms[id] = { ...rooms[id], index: i }));
      let activeRoomId = s.activeRoomId;
      if (activeRoomId === room.id) {
        const at = s.roomOrder.indexOf(room.id);
        activeRoomId = roomOrder[Math.min(at, roomOrder.length - 1)] ?? null;
      }
      set({
        rooms, roomOrder, people, tasks, logs, finished, summaries, unseen, asks, unread, dismissed, activity, activeRoomId,
        releaseAsk: s.releaseAsk?.roomId === room.id ? null : s.releaseAsk,
        summaryOpen: s.summaryOpen === room.id ? null : s.summaryOpen,
        selectedKey: s.selectedKey && people[s.selectedKey] ? s.selectedKey : null,
      });
      return;
    }
    case 'agent_start': {
      s.syncing?.agents.add(agentKey(ev.sessionId, ev.agentId));
      if (!s.rooms[ev.sessionId]) {
        get().applyEvent({ type: 'session', sessionId: ev.sessionId, title: ev.sessionId.slice(0, 8), cwd: '', project: 'session', updatedAt: Date.now() }, demo);
      }
      const roomId = ev.sessionId;
      runtimeFor(roomId).idleSince = 0;
      beginRun(get, set, roomId, Date.now());
      if (ev.role === 'main') {
        const room = get().rooms[roomId];
        if (room && !room.mainActive) {
          set({ rooms: { ...get().rooms, [roomId]: { ...room, mainActive: true } } });
          logActivity(get, set, roomId, { kind: 'system', who: 'Main agent', text: 'Started working' });
        }
        ensureDirector(get, set, roomId);
        return;
      }
      const key = agentKey(roomId, ev.agentId);
      if (get().tasks[key]) return;
      ensureDirector(get, set, roomId);
      createTask(get, set, roomId, 'sub', ev.agentId, key, ev.label || 'Sub agent', ev.agentType ?? '');
      dispatchRoom(get, set, roomId);
      logActivity(get, set, roomId, { kind: 'task', who: nameOfPerson(get, get().tasks[key]?.assignee) || 'Office', ctx: ev.agentType || undefined, text: `${ev.agentType === 'background' ? 'Running in the background' : 'Sub-agent started'}: ${ev.label || 'Sub agent'}` });
      return;
    }
    case 'agent_say': {
      const roomId = ev.sessionId;
      if (!s.rooms[roomId]) return;
      // the agent committed / pushed (not for history that is replayed when the page connects)
      if (ev.cue && !s.syncing) {
        celebrate(roomId, ev.cue);
        if (!s.rooms[roomId].demo) noteCue(ev.cue);
      }
      const sp: SpeechIn = { kind: ev.kind, text: ev.text, tool: ev.tool, ...(ev.image ? { image: absoluteUrl(ev.image) } : {}) };
      if (ev.agentId !== 'main') {
        const task = s.tasks[agentKey(roomId, ev.agentId)];
        if (task && ev.kind === 'tool') {
          // a tool call of a sub-agent is a task of its own, done by whoever is next in line
          const call = callTask(get, set, roomId, { label: task.label, origin: task.label, text: ev.text, tool: ev.tool });
          sayForTask(get, set, call, sp);
          dispatchRoom(get, set, roomId);
          logActivity(get, set, roomId, { kind: 'tool', who: nameOfPerson(get, get().tasks[call.key]?.assignee) || 'Sub-agent', ctx: task.label, text: ev.text, tool: ev.tool });
        } else if (task) {
          sayForTask(get, set, task, sp);
          logActivity(get, set, roomId, { kind: ev.kind === 'idle' ? 'text' : ev.kind, who: nameOfPerson(get, task.assignee) || 'Sub-agent', ctx: task.label, text: ev.text, tool: ev.tool });
        }
        return;
      }
      // the main agent: the director voices its prompt and thoughts, the staff carry out its tool calls
      const rt = runtimeFor(roomId);
      if (ev.kind === 'tool') {
        const task = callTask(get, set, roomId, { label: rt.prompt ? clip(rt.prompt, 46) : 'Main task', origin: 'main', text: ev.text, tool: ev.tool });
        sayForTask(get, set, task, sp);
        dispatchRoom(get, set, roomId);
        logActivity(get, set, roomId, { kind: 'tool', who: nameOfPerson(get, get().tasks[task.key]?.assignee) || 'Main agent', ctx: 'main agent', text: ev.text, tool: ev.tool });
        return;
      }
      if (ev.kind === 'task') {
        rt.prompt = ev.text;
      }
      if (ev.kind === 'text') {
        rt.lastText = ev.full ?? ev.text;
        rt.knownFinal = rt.lastText;
      }
      rt.idleSince = 0;
      const director = ensureDirector(get, set, roomId);
      // the user's message reaches the director by a call on the desk phone or by an email on the laptop, chosen at random (the log keeps the plain prompt); the director answers it
      const via = ev.kind === 'task' ? debugFlags.channel ?? (Math.random() < 0.5 ? 'call' : 'email') : undefined;
      deliver(get, set, director.key, sp, via ?? sp.tool);
      if (via) acknowledge(director.key, via);
      logActivity(get, set, roomId, {
        kind: ev.kind === 'task' ? 'prompt' : ev.kind === 'idle' ? 'text' : ev.kind,
        who: ev.kind === 'task' ? 'You' : director.name,
        text: ev.text,
        tool: ev.tool,
      });
      return;
    }
    case 'agent_ask': {
      const roomId = ev.sessionId;
      if (!s.rooms[roomId]) return;
      if (s.syncing) syncAsks.add(roomId);
      if (s.asks[roomId]?.text === ev.text) return; // repeated by a snapshot
      const rt = runtimeFor(roomId);
      rt.idleSince = 0;
      const director = ensureDirector(get, set, roomId);
      rt.askAt = performance.now() / 1000;
      set({ asks: { ...get().asks, [roomId]: { text: ev.text, full: ev.full, since: Date.now() } } });
      logActivity(get, set, roomId, { kind: 'ask', who: director.name, text: ev.full ?? ev.text });
      if (!s.syncing) sfx('ask'); // heard in every room: the user is needed
      return;
    }
    case 'agent_ask_end':
      clearAsk(get, set, ev.sessionId);
      return;
    case 'agent_done': {
      const roomId = ev.sessionId;
      s.syncing?.agents.add(agentKey(roomId, ev.agentId));
      if (ev.agentId === 'main') {
        const room = s.rooms[roomId];
        if (!room) return;
        if (room.mainActive) {
          set({ rooms: { ...get().rooms, [roomId]: { ...room, mainActive: false } } });
          logActivity(get, set, roomId, { kind: 'system', who: 'Main agent', text: 'Finished its turn' });
        }
        clearAsk(get, set, roomId);
        return;
      }
      const key = agentKey(roomId, ev.agentId);
      const task = s.tasks[key];
      if (!task || task.done) return;
      logActivity(get, set, roomId, {
        kind: 'done', who: nameOfPerson(get, task.assignee) || 'Sub-agent', ctx: task.label, tool: ev.failed ? 'failed' : undefined,
        text: ev.summary ? `${ev.failed ? 'Failed' : 'Finished'}: ${ev.summary}` : ev.failed ? 'Failed' : 'Finished',
      });
      if (!task.assignee) removeTask(get, set, key); // finished before anybody picked it up
      else patchTask(get, set, key, { done: true, failed: !!ev.failed, summary: ev.summary ?? '', finishedAt: Date.now() });
      return;
    }
  }
}

const createStore = (set: BatchSet, get: Get, batch: Batch): State => ({
  connection: 'connecting',
  sources: {},
  demoOn: false,
  rooms: {},
  roomOrder: [],
  visibleOrder: [],
  listOrder: [],
  people: {},
  tasks: {},
  logs: {},
  finished: {},
  activity: {},
  listTab: null,
  summaries: {},
  unseen: {},
  asks: {},
  unread: {},
  dismissed: {},
  released: loadReleased(),
  releaseAsk: null,
  releaseAllAsk: false,
  summaryOpen: null,
  muted: isMuted(),
  activeRoomId: null,
  selectedKey: null,
  showHelp: false,
  showNames: false,
  showSwitcher: loadShowSwitcher(),
  switcherAuto: false,
  hudFolded: loadHudFolded(),
  names: loadNames(),
  resetTick: 0,
  autoDemo: false,
  timeMode: 'auto',
  hour: localHour(),
  quality: loadPref('quality', QUALITIES, 'medium'),
  weatherMode: initWeatherMode,
  weather: resolveWeather(initWeatherMode, localHour()),
  seasonMode: initSeasonMode,
  season: resolveSeason(initSeasonMode),
  musicOn: loadFlag('music', false),
  contextWindow: loadPref('contextWindow', CONTEXT_WINDOWS, 'auto'),
  cinema: false,
  pip: false,
  showSettings: false,
  syncing: null,

  setConnection: (connection, sources) => set((s) => ({ connection, sources: sources ?? s.sources })),

  beginSync: () => set({ syncing: { sessions: new Set(), agents: new Set() } }),

  endSync: () => batch(() => {
    const { syncing, rooms, tasks } = get();
    if (!syncing) return;
    // anything live that the server no longer reports is finished
    for (const id of Object.keys(rooms)) {
      if (!rooms[id].demo && !syncing.sessions.has(id)) get().applyEvent({ type: 'session_end', sessionId: id, reason: 'idle' });
    }
    for (const r of Object.values(get().rooms)) {
      if (!r.demo && r.mainActive && !syncing.agents.has(agentKey(r.id, 'main'))) get().applyEvent({ type: 'agent_done', sessionId: r.id, agentId: 'main' });
    }
    for (const t of Object.values(tasks)) {
      if (t.demo || t.source !== 'sub' || t.done || syncing.agents.has(t.key) || !get().tasks[t.key]) continue;
      get().applyEvent({ type: 'agent_done', sessionId: t.sessionId, agentId: t.agentId, summary: '' });
    }
    for (const id of Object.keys(get().asks)) {
      if (!get().rooms[id]?.demo && !syncAsks.has(id)) get().applyEvent({ type: 'agent_ask_end', sessionId: id });
    }
    syncAsks.clear();
    // page load or refresh: sort the list and step into the first room with a question, an unread summary or work going on
    if (!focusedOnLoad) {
      focusedOnLoad = true;
      const st = get();
      const live = st.listOrder.filter((id) => !st.rooms[id]?.demo);
      const sorted = sortedList(st, live);
      const ranks = roomRanks(st, live);
      const best = sorted.find((id) => ranks.get(id)! < IDLE_RANK);
      set({ listOrder: [...sorted, ...st.listOrder.filter((id) => st.rooms[id]?.demo)] });
      if (best) enterRoom(get, set, best);
    }
    set({ syncing: null });
  }),

  applyEvent: (ev, demo = false) =>
    batch(() => {
      handleEvent(get, set, ev, demo);
      if (ev.type === 'session') touchRoom(ev.sessionId, ev.updatedAt);
      else if (ev.type !== 'hello' && ev.type !== 'ready' && ev.type !== 'session_end') touchRoom(ev.sessionId);
      refreshVisible(get, set);
    }),

  applyEvents: (list) =>
    batch(() => {
      const s = get();
      for (const ev of list) {
        if (ev.type === 'hello') {
          s.beginSync();
          s.setConnection('live', ev.sources ?? { claude: ev.claudeDir });
        }
        s.applyEvent(ev, false);
        if (ev.type === 'ready') s.endSync();
      }
    }),

  tick: () =>
    batch(() => {
      const now = Date.now();
      for (const id of [...get().roomOrder]) tickRoom(get, set, id, now);
      refreshVisible(get, set);
      followActiveRoom(get, set, now);
    }),

  markInside: (personKey) => {
    const p = get().people[personKey];
    if (p && p.inside !== true) set({ people: { ...get().people, [personKey]: { ...p, inside: true } } });
  },

  releaseTask: (personKey) => batch(() => {
    const s = get();
    const p = s.people[personKey];
    if (!p?.taskKey) return;
    const t = s.tasks[p.taskKey];
    removeTask(get, set, p.taskKey);
    patchPeople(get, set, { [personKey]: { taskKey: null, lastWorkEnd: Date.now() } });
    const room = get().rooms[p.sessionId];
    if (!room) return;
    const entry: TaskLogEntry | null = t
      ? {
          key: t.key, label: t.label, source: t.source, agentType: t.agentType, who: p.name, startedAt: t.startedAt, finishedAt: Date.now(),
          failed: t.failed, reported: t.reported, summary: t.summary, origin: t.origin, tool: t.tool, steps: t.steps, first: t.first,
        }
      : null;
    const now = get();
    set({
      rooms: { ...now.rooms, [room.id]: { ...room, tasksDone: room.tasksDone + 1 } },
      finished: entry ? { ...now.finished, [room.id]: [entry, ...(now.finished[room.id] ?? [])].slice(0, 300) } : now.finished,
    });
    if (!room.demo) noteTask({ weather: now.weather, season: now.season });
  }),

  reportTask: (personKey) => batch(() => {
    const s = get();
    const p = s.people[personKey];
    const t = p?.taskKey ? s.tasks[p.taskKey] : undefined;
    const r = p ? s.rooms[p.sessionId] : undefined;
    if (!p || !r) return;
    if (t && !t.reported) patchTask(get, set, t.key, { reported: true });
    set({ rooms: { ...get().rooms, [r.id]: { ...r, reports: r.reports + 1 } } });
    if (!r.demo) noteReport();
    if (t) logActivity(get, set, r.id, { kind: 'report', who: p.name, ctx: t.label, text: t.summary || 'Handed the report to the director' });
  }),

  // the last finished summary, or (nothing finished yet) one made from what is known so far
  openSummary: (roomId) => {
    const st = get();
    if (!st.rooms[roomId]) return;
    const known = st.summaries[roomId];
    const summaries = known && !known.partial ? st.summaries : { ...st.summaries, [roomId]: composeSummary(get, roomId, Date.now(), true) };
    set({ summaries, summaryOpen: roomId });
  },
  // Esc, the close button and a click beside the paper all do the same: close it (a pending release question is answered first)
  requestCloseSummary: () => {
    const st = get();
    if (st.releaseAsk || st.releaseAllAsk) {
      set({ releaseAsk: null, releaseAllAsk: false });
      return;
    }
    if (st.summaryOpen) get().closeSummary();
  },
  // the paper is read: the blue dot stops blinking and the paper does not come back until the session has worked again
  // and the list is sorted again at once, so the read room drops behind the ones that still need attention
  closeSummary: () =>
    set((st) => {
      const id = st.summaryOpen;
      if (!id) return { releaseAsk: null };
      const next = { ...st, unseen: { ...st.unseen, [id]: false } };
      return {
        summaryOpen: null, releaseAsk: null,
        unread: { ...st.unread, [id]: false }, unseen: next.unseen, dismissed: { ...st.dismissed, [id]: true },
        listOrder: st.unseen[id] ? sortedList(next, st.listOrder) : st.listOrder,
      };
    }),
  askRelease: () => set((st) => (st.summaryOpen ? { releaseAsk: { roomId: st.summaryOpen } } : {})),
  askReleaseAll: () => set({ releaseAllAsk: true }),
  cancelRelease: () => set({ releaseAsk: null, releaseAllAsk: false }),
  releaseRoom: (roomId) => {
    const st = get();
    const released = { ...st.released, [roomId]: Date.now() };
    saveReleased(released);
    set({
      released,
      unseen: { ...st.unseen, [roomId]: false },
      unread: { ...st.unread, [roomId]: false },
      dismissed: { ...st.dismissed, [roomId]: false },
      summaryOpen: st.summaryOpen === roomId ? null : st.summaryOpen,
      releaseAsk: null,
      selectedKey: st.selectedKey && st.people[st.selectedKey]?.sessionId === roomId ? null : st.selectedKey,
    });
    refreshVisible(get, set);
  },
  releaseAllRooms: () => {
    const st = get();
    const now = Date.now();
    const released = { ...st.released };
    const unseen = { ...st.unseen };
    const unread = { ...st.unread };
    for (const id of st.roomOrder) {
      const r = st.rooms[id];
      if (!r || r.mainActive || Object.values(st.tasks).some((t) => t.sessionId === id)) continue;
      released[id] = now;
      unseen[id] = false;
      unread[id] = false;
    }
    saveReleased(released);
    set({ released, unseen, unread, summaryOpen: null, releaseAsk: null, releaseAllAsk: false, selectedKey: null });
    refreshVisible(get, set);
  },
  toggleList: (tab) => set((st) => ({ listTab: st.listTab === tab ? null : tab })),
  setListTab: (tab) => set({ listTab: tab }),

  // entering a room whose session is done (or whose summary is unread) opens the paper
  setActiveRoom: (id) => enterRoom(get, set, id),

  stepRoom: (dir) => {
    const visibleOrder = orderedRooms(get());
    const { activeRoomId } = get();
    if (!visibleOrder.length) return;
    const i = Math.max(0, visibleOrder.indexOf(activeRoomId ?? ''));
    const id = visibleOrder[(i + dir + visibleOrder.length) % visibleOrder.length];
    enterRoom(get, set, id);
  },

  select: (key) => set({ selectedKey: key }),
  setDemo: (on) => set({ demoOn: on }),

  clearDemo: () => {
    const { rooms } = get();
    for (const r of Object.values(rooms)) if (r.demo) get().applyEvent({ type: 'session_end', sessionId: r.id });
  },

  setHelp: (on) => set({ showHelp: on }),
  setMuted: (on) => {
    setAudioMuted(on);
    set({ muted: on });
  },
  setShowNames: (on) => set({ showNames: on }),
  setShowSwitcher: (on) => {
    try {
      setSetting(SWITCHER_KEY, on ? '1' : '0');
    } catch {
      /* private mode: the choice just is not remembered */
    }
    set({ showSwitcher: on, switcherAuto: false });
  },
  setSwitcherAuto: (on) => set({ switcherAuto: on }),
  setHudFolded: (on) => {
    try {
      setSetting(HUD_FOLD_KEY, on ? '1' : '0');
    } catch {
      /* private mode: the choice just is not remembered */
    }
    set({ hudFolded: on });
  },
  toggleSwitcher: () => {
    const s = get();
    if (s.switcherAuto) set({ switcherAuto: false });
    else s.setShowSwitcher(!s.showSwitcher);
  },

  /** Save the list and give everybody who is already in an office a name from it (director first). */
  applyNames: (list) => {
    saveNames(list);
    const own = new Set(list.map((n) => n.toLowerCase()));
    const people = { ...get().people };
    const byRoom = new Map<string, PersonRec[]>();
    for (const a of Object.values(people)) byRoom.set(a.sessionId, [...(byRoom.get(a.sessionId) ?? []), a]);
    for (const [roomId, members] of byRoom) {
      members.sort((a, b) => (a.role === 'director' ? -1 : 0) - (b.role === 'director' ? -1 : 0) || a.joinedAt - b.joinedAt);
      const taken = new Set<string>();
      for (const a of members) if (own.has(a.name.toLowerCase())) taken.add(a.name.toLowerCase());
      for (const a of members) {
        if (own.has(a.name.toLowerCase())) continue;
        if (!list.some((n) => !taken.has(n.toLowerCase()))) {
          // the list is used up in this room: keep the English name they have
          taken.add(a.name.toLowerCase());
          continue;
        }
        const name = pickName(roomId, a.key, list, taken, true);
        taken.add(name.toLowerCase());
        people[a.key] = { ...a, name };
      }
    }
    set({ names: list, people });
  },
  resetView: () => set((s) => ({ resetTick: s.resetTick + 1 })),
  setAutoDemo: (on) => set({ autoDemo: on }),
  setTimeMode: (timeMode) =>
    set((s) => {
      const hour = timeMode === 'auto' ? localHour() : HOUR_PRESETS[timeMode];
      return { timeMode, hour, weather: resolveWeather(s.weatherMode, hour) };
    }),
  setHour: (hour) => set((s) => ({ hour, weather: resolveWeather(s.weatherMode, hour), season: resolveSeason(s.seasonMode) })),
  setQuality: (quality) => {
    savePref('quality', quality);
    set({ quality });
  },
  setWeatherMode: (weatherMode) => {
    savePref('weather', weatherMode);
    set((s) => ({ weatherMode, weather: resolveWeather(weatherMode, s.hour) }));
  },
  setSeasonMode: (seasonMode) => {
    savePref('season', seasonMode);
    set({ seasonMode, season: resolveSeason(seasonMode) });
  },
  setContextWindow: (contextWindow) => {
    savePref('contextWindow', contextWindow);
    set({ contextWindow });
  },
  setMusicOn: (musicOn) => {
    savePref('music', musicOn);
    set({ musicOn });
  },
  setCinema: (cinema) => set(cinema ? { cinema, showSettings: false, summaryOpen: null, listTab: null } : { cinema }),
  // (the floating window is the screensaver without the tour: dialogs and the screensaver itself are closed)
  setPip: (pip) => set(pip ? { pip, cinema: false, showSettings: false, listTab: null, selectedKey: null } : { pip }),
  setShowSettings: (showSettings) => set({ showSettings }),
});

export const useStore = create<State>()((rawSet, rawGet) => {
  const b = makeBatcher(rawSet, rawGet);
  return createStore(b.set, b.get, b.run);
});

// Idle rooms always sit behind the working ones: when a room starts or stops working (or asks, or is read), the list is
// sorted again after a short pause, so a burst of changes moves the buttons once and a button is not pulled from under the pointer.
// (the room on screen counts as entered; a room that is only loaded ahead does not)
useStore.subscribe((s, prev) => {
  if (s.activeRoomId && s.activeRoomId !== prev.activeRoomId) enteredRooms.add(s.activeRoomId);
});

const SORT_DELAY_MS = 1200;
let sortTimer: ReturnType<typeof setTimeout> | undefined;
let watched: unknown[] = [];
useStore.subscribe((s) => {
  // (the store changes many times a second: only look again when something that decides the order has changed)
  const seen = [s.listOrder, s.rooms, s.tasks, s.asks, s.unseen, s.roomOrder];
  if (seen.every((v, i) => v === watched[i])) return;
  watched = seen;
  const sorted = sortedList(s, s.listOrder);
  const settled = sorted.every((id, i) => id === s.listOrder[i]);
  if (settled) {
    if (sortTimer !== undefined) clearTimeout(sortTimer);
    sortTimer = undefined;
    return;
  }
  if (sortTimer !== undefined) return;
  sortTimer = setTimeout(() => {
    sortTimer = undefined;
    const now = useStore.getState();
    const next = sortedList(now, now.listOrder);
    if (!next.every((id, i) => id === now.listOrder[i])) useStore.setState({ listOrder: next });
  }, SORT_DELAY_MS);
});
