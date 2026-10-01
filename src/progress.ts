import { create } from 'zustand';
import { loadJson, saveJson } from './prefs';
import { sfx } from './audio';
import { pushToast } from './toast';
import type { IconName } from './ui/Icon';

/**
 * The office grows with the work it has seen: every finished task, report, run, commit and push earns experience, the
 * level unlocks more cats, and achievements (shown on the stats board and in the dialog) are handed out on the way.
 * Everything is kept in the settings (SQLite on the server) and only real sessions count – not the demo.
 */
export interface Stats {
  tasks: number;
  reports: number;
  runs: number;
  commits: number;
  pushes: number;
  pets: number;
  /** tasks finished between midnight and 5, between 5 and 8, while it rained, and in a festive season */
  night: number;
  early: number;
  rainy: number;
  festive: number;
  /** most people in one office at the same time */
  maxPeople: number;
  /** longest run, minutes */
  longestRun: number;
  /** days (YYYY-MM-DD) on which the office worked */
  days: string[];
}

const EMPTY: Stats = { tasks: 0, reports: 0, runs: 0, commits: 0, pushes: 0, pets: 0, night: 0, early: 0, rainy: 0, festive: 0, maxPeople: 0, longestRun: 0, days: [] };

export interface Achievement {
  id: string;
  title: string;
  text: string;
  icon: IconName;
  /** how far along: [now, goal] */
  goal: (s: Stats) => [number, number];
}

const n = (now: number, goal: number): [number, number] => [Math.min(now, goal), goal];

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-task', title: 'First task', text: 'Finish a first task', icon: 'check-circle', goal: (s) => n(s.tasks, 1) },
  { id: 'busy-bee', title: 'Busy bee', text: 'Finish 100 tasks', icon: 'list-checks', goal: (s) => n(s.tasks, 100) },
  { id: 'workhorse', title: 'Workhorse', text: 'Finish 1,000 tasks', icon: 'briefcase', goal: (s) => n(s.tasks, 1000) },
  { id: 'report-card', title: 'Report card', text: 'Hand over 10 reports', icon: 'file-text', goal: (s) => n(s.reports, 10) },
  { id: 'closer', title: 'Closer', text: 'Finish a whole run', icon: 'archive', goal: (s) => n(s.runs, 1) },
  { id: 'marathon', title: 'Marathon', text: 'A run that lasts 30 minutes', icon: 'timer', goal: (s) => n(s.longestRun, 30) },
  { id: 'committer', title: 'Committer', text: 'The agent makes a commit', icon: 'terminal', goal: (s) => n(s.commits, 1) },
  { id: 'commit-machine', title: 'Commit machine', text: '25 commits', icon: 'wrench', goal: (s) => n(s.commits, 25) },
  { id: 'shipper', title: 'Ship it!', text: 'The agent pushes to a remote', icon: 'send', goal: (s) => n(s.pushes, 1) },
  { id: 'cat-whisperer', title: 'Cat whisperer', text: 'The office pets the cats 25 times', icon: 'cat', goal: (s) => n(s.pets, 25) },
  { id: 'night-owl', title: 'Night owl', text: '20 tasks between midnight and 5 am', icon: 'moon', goal: (s) => n(s.night, 20) },
  { id: 'early-bird', title: 'Early bird', text: '20 tasks between 5 and 8 am', icon: 'sunset', goal: (s) => n(s.early, 20) },
  { id: 'rainy-day', title: 'Rainy-day coder', text: '30 tasks while it rains', icon: 'cloud-rain', goal: (s) => n(s.rainy, 30) },
  { id: 'festive', title: 'Festive office', text: '30 tasks during Halloween, Christmas or Tết', icon: 'sparkles', goal: (s) => n(s.festive, 30) },
  { id: 'full-house', title: 'Full house', text: 'Seven people in one office', icon: 'users', goal: (s) => n(s.maxPeople, 7) },
  { id: 'regular', title: 'Regular', text: 'The office works on 7 different days', icon: 'clock', goal: (s) => n(s.days.length, 7) },
];

export const TITLES: [number, string][] = [[1, 'Intern'], [3, 'Junior'], [5, 'Mid-level'], [8, 'Senior'], [12, 'Lead'], [16, 'Director'], [20, 'VP'], [25, 'CEO'], [30, 'Legend']];

export interface LevelInfo {
  level: number;
  title: string;
  /** experience inside this level and what the level needs */
  into: number;
  need: number;
}

const XP_UNIT = 25;
const MAX_LEVEL = 30;
const xpFor = (level: number) => XP_UNIT * (level - 1) ** 2;

export function levelOf(xp: number): LevelInfo {
  const level = Math.min(MAX_LEVEL, Math.floor(Math.sqrt(xp / XP_UNIT)) + 1);
  const title = [...TITLES].reverse().find(([l]) => level >= l)![1];
  const base = xpFor(level);
  return { level, title, into: xp - base, need: level >= MAX_LEVEL ? 1 : xpFor(level + 1) - base };
}

/** extra cats that visit every room (0, 1 or 2) */
export const bonusCats = (level: number) => (level >= 10 ? 2 : level >= 5 ? 1 : 0);

export const UNLOCKS: { level: number; text: string }[] = [
  { level: 3, text: 'Trophies appear on the stats board' },
  { level: 5, text: 'An extra cat joins every office' },
  { level: 10, text: 'A third cat joins every office' },
];

interface Saved {
  stats: Stats;
  xp: number;
  unlocked: Record<string, number>;
}

interface ProgressState extends Saved {
  open: boolean;
  setOpen: (on: boolean) => void;
}

const KEY = 'progress';
const saved = loadJson<Partial<Saved>>(KEY, {});
export const useProgress = create<ProgressState>((set) => ({
  stats: { ...EMPTY, ...(saved.stats ?? {}), days: saved.stats?.days ?? [] },
  xp: saved.xp ?? 0,
  unlocked: saved.unlocked ?? {},
  open: false,
  setOpen: (open) => set({ open }),
}));

let saveTimer = 0;
function persist() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const { stats, xp, unlocked } = useProgress.getState();
    saveJson(KEY, { stats, xp, unlocked });
  }, 600);
}

/** Changes the stats, adds the experience it earns and hands out level-ups and achievements. */
function bump(change: (s: Stats) => number) {
  const cur = useProgress.getState();
  const stats: Stats = { ...cur.stats, days: [...cur.stats.days] };
  let gain = change(stats);
  const day = new Date().toLocaleDateString('sv-SE');
  if (!stats.days.includes(day)) {
    stats.days = [...stats.days, day].slice(-400);
    gain += 20;
  }
  const xp = cur.xp + gain;
  const before = levelOf(cur.xp).level;
  const after = levelOf(xp);
  const unlocked = { ...cur.unlocked };
  const fresh = ACHIEVEMENTS.filter((a) => !unlocked[a.id] && a.goal(stats)[0] >= a.goal(stats)[1]);
  for (const a of fresh) unlocked[a.id] = Date.now();
  useProgress.setState({ stats, xp, unlocked });
  persist();
  if (after.level > before) {
    const extra = UNLOCKS.find((u) => u.level > before && u.level <= after.level);
    pushToast({ icon: 'star', title: `Level ${after.level} · ${after.title}`, text: extra?.text ?? 'The office is growing' });
    sfx('levelup');
  }
  fresh.forEach((a, i) => window.setTimeout(() => {
    pushToast({ icon: a.icon, title: `Achievement: ${a.title}`, text: a.text });
    sfx('achieve');
  }, (after.level > before ? 1200 : 0) + i * 1400));
}

interface Ctx {
  weather: string;
  season: string;
}

export function noteTask(c: Ctx) {
  const h = new Date().getHours();
  bump((s) => {
    s.tasks++;
    if (h < 5) s.night++;
    else if (h < 8) s.early++;
    if (c.weather === 'rain' || c.weather === 'storm') s.rainy++;
    if (c.season !== 'none') s.festive++;
    return 1;
  });
}
export function noteReport() {
  bump((s) => {
    s.reports++;
    return 3;
  });
}
export function noteRun(minutes: number) {
  bump((s) => {
    s.runs++;
    s.longestRun = Math.max(s.longestRun, Math.round(minutes));
    return 10 + Math.min(20, Math.round(minutes));
  });
}
export function noteCue(kind: 'commit' | 'push') {
  bump((s) => {
    if (kind === 'commit') s.commits++;
    else s.pushes++;
    return kind === 'commit' ? 8 : 15;
  });
}
export function notePet() {
  bump((s) => {
    s.pets++;
    return 1;
  });
}
export function notePeople(count: number) {
  if (count <= useProgress.getState().stats.maxPeople) return;
  bump((s) => {
    s.maxPeople = count;
    return 0;
  });
}
