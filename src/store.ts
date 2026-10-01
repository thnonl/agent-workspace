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
import { CONTEXT_WINDOWS, type ContextWindowPref } from './context';
import { resolveWeather, WEATHER_MODES, type Weather, type WeatherMode } from './weather';
import { resolveSeason, SEASON_MODES, type Season, type SeasonMode } from './season';
import { doneLines, pickAck } from './sim/phrases';
import { celebrate } from './sim/celebrate';
import { noteCue, notePeople, noteReport, noteRun, noteTask } from './progress';
import { bufferTaskSpeech, clearTalk, debugFlags, dropRoomRuntime, dropRuntime, dropTaskSpeech, enqueueSpeech, hasQueuedTool, runtimeFor, sims, takeTaskSpeech, talkPending } from './sim/registry';

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
/** gap between two people walking out */
const LEAVE_STAGGER_MS = 1800;
/** every tool call of the main agent is a task of its own; whoever gets it works on it for this long */
const MAIN_TASK_MS = 4500;
/** tool calls waiting for a free person: beyond this many the oldest are dropped (the office cannot keep up) */
const CALL_QUEUE_MAX = 40;
/** a new task hires a new person until this many staff are around, afterwards the staff take turns (more are hired only when every one of them is busy) */
const MIN_TEAM = 3;
/** a room seats the director and at most this many staff (the layout has exactly this many desks) */
export const MAX_STAFF = 6;

const SWITCHER_KEY = 'agent-workspace.showSwitcher';
/** ?weather=rain / ?season=xmas force a setting for this page load (testing, screenshots) */
const queryOf = (name: string): string | null => (typeof location === 'undefined' ? null : new URLSearchParams(location.search).get(name));
const pickMode = <T extends string>(q: string | null, allowed: readonly T[]): T | null => (allowed.includes(q as T) ? (q as T) : null);
const initWeatherMode: WeatherMode = pickMode(queryOf('weather'), WEATHER_MODES) ?? loadPref('weather', WEATHER_MODES, 'auto');
const initSeasonMode: SeasonMode = pickMode(queryOf('season'), SEASON_MODES) ?? loadPref('season', SEASON_MODES, 'auto');
function loadShowSwitcher(): boolean {
  try {
    return localStorage.getItem(SWITCHER_KEY) !== '0';
  } catch {
    return true;
  }
}
/** once the team is complete another person is hired at most this often (the newcomer needs time to walk in) */
const HIRE_GAP_MS = 6000;
/** the director announces the end of the work: each bubble stays this long on screen */
const TALK_HOLD_MS = 4500;

let logId = 100000;

/** a session that has stood still for this long is released by itself (it comes back when it is continued) */
const AUTO_RELEASE_MS = 60 * 60_000;
const RELEASED_KEY = 'claude-office:released';

/** Rooms the user released (hidden from the list until the session is continued), by session id → when. */
function loadReleased(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(RELEASED_KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function saveReleased(r: Record<string, number>) {
  try {
    const keep = Object.entries(r).filter(([, at]) => Date.now() - at < 3 * 86_400_000).sort((a, b) => b[1] - a[1]).slice(0, 200);
    localStorage.setItem(RELEASED_KEY, JSON.stringify(Object.fromEntries(keep)));
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
 * The order of the room buttons: the order in which the sessions showed up. It never changes when a session starts or
 * stops working, so a card (and its number key) stays where it is. (The number keys and the arrow keys follow the same order.)
 */
export function orderedRooms(s: Pick<State, 'visibleOrder'>): string[] {
  return [...s.visibleOrder];
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
  if (same && active === s.activeRoomId && released === s.released && unseen === s.unseen && unread === s.unread) return;
  set({
    released, unseen, unread,
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

const peopleOf = (s: State, roomId: string) => Object.values(s.people).filter((p) => p.sessionId === roomId);
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
  for (const c of chunks) enqueueSpeech(personKey, { kind: sp.kind, text: c, tool: bubbleTool });
  const s = get();
  const entry: Speech = { id: logId++, kind: sp.kind, text: sp.text, tool: sp.tool, at: Date.now() };
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
    present: true, taskKey: null, desk, joinedAt: Date.now(), lastWorkEnd: 0, leaveAt: 0, demo: state.rooms[roomId]?.demo ?? false,
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
  return createPerson(get, set, roomId, 'director', -1, key);
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
  return createPerson(get, set, roomId, 'staff', new Rng(hashString(key)).pick(free), key);
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
function dispatchRoom(get: Get, set: SetFn, roomId: string) {
  const queued = tasksOf(get(), roomId).filter((t) => !t.assignee && !t.done).sort((a, b) => a.startedAt - b.startedAt);
  for (const t of queued) {
    const staff = peopleOf(get(), roomId).filter((p) => p.role === 'staff');
    // strict rotation: whoever finished a task longest ago (or never had one) is next – whether they are
    // in the office or already at home, so one person never ends up doing everything
    const free = staff.filter((p) => !p.taskKey && !(p.present && p.leaveAt));
    free.sort((a, b) => a.lastWorkEnd - b.lastWorkEnd || a.joinedAt - b.joinedAt);
    const cap = staffCap(get, roomId);
    const rt = runtimeFor(roomId);
    const now = Date.now();
    let who: PersonRec | null = null;
    if (staff.length < Math.min(MIN_TEAM, cap)) who = hireStaff(get, set, roomId);
    if (!who && free.length) who = free[0];
    if (!who && now - rt.lastHire >= HIRE_GAP_MS) who = hireStaff(get, set, roomId);
    if (!who) break; // everybody is busy – the task waits for the next free person
    if (staff.length >= Math.min(MIN_TEAM, cap) && !staff.some((p) => p.key === who!.key)) rt.lastHire = now;
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

/** Nobody of the room is at work or on the way: every person has been sent home and has walked out of the door. */
function officeEmpty(st: State, roomId: string): boolean {
  if (peopleOf(st, roomId).some((p) => p.present)) return false;
  for (const s of sims.values()) if (s.roomId === roomId && s.onStage) return false;
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

/** One housekeeping step for a room. */
function tickRoom(get: Get, set: SetFn, roomId: string, now: number) {
  const room = get().rooms[roomId];
  if (!room) return;
  const rt = runtimeFor(roomId);
  // tool calls are short jobs: they end on their own
  const waiting: TaskRec[] = [];
  for (const t of tasksOf(get(), roomId)) {
    if (t.source !== 'main' || t.done) continue;
    if (!t.assignee) waiting.push(t);
    else if (t.closeAt && now >= t.closeAt) patchTask(get, set, t.key, { done: true, finishedAt: now });
  }
  if (waiting.length > CALL_QUEUE_MAX) {
    waiting.sort((a, b) => a.startedAt - b.startedAt);
    for (const t of waiting.slice(0, waiting.length - CALL_QUEUE_MAX)) removeTask(get, set, t.key);
  }
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
    if (!room.demo) notePeople(peopleOf(get(), roomId).filter((p) => p.present).length);
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
      if (p.role !== 'director') patches[p.key] = { leaveAt: now + 400 + i * LEAVE_STAGGER_MS };
    });
    patchPeople(get, set, patches);
  }
  if (rt.leaving && !busy) {
    // the director locks up last – and only after the announcement has been made
    const boss = get().people[directorKeyOf(roomId)];
    if (boss?.present && !boss.leaveAt && !directorTalking(get, roomId, now)) {
      const lastStaff = peopleOf(get(), roomId).reduce((m, p) => (p.role === 'staff' ? Math.max(m, p.leaveAt) : m), 0);
      patchPeople(get, set, { [boss.key]: { leaveAt: Math.max(now + 400, lastStaff + LEAVE_STAGGER_MS) } });
    }
  }
  const due: Record<string, Partial<PersonRec>> = {};
  for (const p of peopleOf(get(), roomId)) if (p.leaveAt && now >= p.leaveAt) due[p.key] = { present: false, leaveAt: 0 };
  patchPeople(get, set, due);
  // the run is over and the last person has gone: the summary paper opens by itself (when the room is the one on screen and nothing else is open)
  if (rt.summaryDue && rt.leaving && !busy && officeEmpty(get(), roomId)) {
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
      const room: RoomRec = { ...base, title: ev.title || base.title, project: ev.project || base.project, provider: ev.provider ?? base.provider, cwd: ev.cwd || base.cwd, updatedAt: ev.updatedAt, context: ev.context ?? base.context };
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
      logActivity(get, set, roomId, { kind: 'task', who: nameOfPerson(get, get().tasks[key]?.assignee) || 'Office', ctx: ev.agentType || undefined, text: `Sub-agent started: ${ev.label || 'Sub agent'}` });
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
      const sp: SpeechIn = { kind: ev.kind, text: ev.text, tool: ev.tool };
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
    }),

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
  closeSummary: () =>
    set((st) => {
      const id = st.summaryOpen;
      if (!id) return { releaseAsk: null };
      return {
        summaryOpen: null, releaseAsk: null,
        unread: { ...st.unread, [id]: false }, unseen: { ...st.unseen, [id]: false }, dismissed: { ...st.dismissed, [id]: true },
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
      localStorage.setItem(SWITCHER_KEY, on ? '1' : '0');
    } catch {
      /* private mode: the choice just is not remembered */
    }
    set({ showSwitcher: on });
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
