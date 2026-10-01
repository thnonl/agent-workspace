import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { orderedRooms, useStore } from '../store';
import { themeFor } from '../world/palettes';
import { cats, sims } from '../sim/registry';
import type { Phase } from '../sim/registry';
import type { ActivityEntry, Speech, TaskLogEntry, TaskRec } from '../types';
import { FALLBACK_NAMES, parseNames } from '../names';
import { audioRunning, sfx, subscribeAudioState } from '../audio';
import { retryConnection } from '../live/connection';
import { takePhoto } from '../photo';
import { pipSupported, togglePip } from '../pip';
import { contextShare } from '../context';
import { LevelChip } from './ProgressDialog';
import { Dialog } from './Dialog';
import { Icon, type IconName } from './Icon';
import { PROVIDER_NAME, ProviderLogo, watchedSources } from './ProviderLogo';

/** The demo buttons are for development and screenshots: a production build hides them (the D key and ?demo still work). */
const SHOW_DEMO_BUTTON = import.meta.env.DEV;

const ICON: Record<string, IconName> = { thinking: 'lightbulb', text: 'message', tool: 'wrench', task: 'inbox', done: 'check-circle', error: 'alert' };

const PHASE_TEXT: Record<Phase, string> = {
  waiting: 'Waiting outside',
  entering: 'Walking in',
  sitting: 'Sitting down',
  unpacking: 'Taking out the laptop',
  working: 'At the desk',
  packing: 'Packing up',
  standing: 'Getting up',
  stroll: 'Taking a walk',
  activity: 'Taking a break',
  returning: 'Heading back to the desk',
  toBoss: 'Heading to the director',
  handover: 'Handing over the report',
  leaving: 'Leaving the office',
};

const CAT_TEXT: Record<string, string> = {
  away: 'Out and about', arrive: 'Hopping in through the window', jump: 'Jumping', idle: 'Looking around', wander: 'Exploring the office',
  sit: 'Sitting and watching', groom: 'Washing up', stretch: 'Stretching', toSpot: 'Looking for a cosy spot', sleep: 'Napping',
  toWindow: 'Heading for the window', exit: 'Leaving through the window',
};

interface RoomStatus {
  working: boolean;
  /** people inside the office */
  people: number;
}

const NO_STATUS: RoomStatus = { working: false, people: 0 };

export function useRoomStatus(): Record<string, RoomStatus> {
  // the selector returns a primitive key so the store only re-renders when a status really changed; parsed once per change
  const key = useStore((s) => {
    const working: Record<string, boolean> = {};
    const count: Record<string, number> = {};
    for (const id of s.visibleOrder) {
      working[id] = !!s.rooms[id]?.mainActive;
      count[id] = 0;
    }
    for (const t of Object.values(s.tasks)) if (t.sessionId in working) working[t.sessionId] = true;
    for (const p of Object.values(s.people)) if (p.present && p.sessionId in count) count[p.sessionId]++;
    let k = '';
    for (const id of s.visibleOrder) k += `${id}\t${working[id] ? 1 : 0}\t${count[id]}\n`;
    return k;
  });
  return useMemo(() => {
    const out: Record<string, RoomStatus> = {};
    for (const line of key.split('\n')) {
      if (!line) continue;
      const [id, w, n] = line.split('\t');
      out[id] = { ...NO_STATUS, working: w === '1', people: Number(n) };
    }
    return out;
  }, [key]);
}

const TIME_CYCLE = ['auto', 'day', 'dusk', 'night'] as const;
function timeIcon(h: number): IconName {
  return h >= 7.5 && h < 17.3 ? 'sun' : (h >= 5.2 && h < 7.5) || (h >= 17.3 && h < 19.8) ? 'sunset' : 'moon';
}

export function TopBar() {
  const connection = useStore((s) => s.connection);
  const demoOn = useStore((s) => s.demoOn);
  const autoDemo = useStore((s) => s.autoDemo);
  const liveRooms = useStore((s) => s.visibleOrder.filter((id) => !s.rooms[id].demo).length);
  const setDemo = useStore((s) => s.setDemo);
  const resetView = useStore((s) => s.resetView);
  const setHelp = useStore((s) => s.setHelp);
  const timeMode = useStore((s) => s.timeMode);
  const hour = useStore((s) => s.hour);
  const setTimeMode = useStore((s) => s.setTimeMode);
  const setShowNames = useStore((s) => s.setShowNames);
  const muted = useStore((s) => s.muted);
  const setMuted = useStore((s) => s.setMuted);
  const nameCount = useStore((s) => s.names.length);
  const showSwitcher = useStore((s) => s.showSwitcher);
  const setShowSwitcher = useStore((s) => s.setShowSwitcher);
  const soundReady = useSyncExternalStore(subscribeAudioState, audioRunning);
  const musicOn = useStore((s) => s.musicOn);
  const setMusicOn = useStore((s) => s.setMusicOn);
  const setCinema = useStore((s) => s.setCinema);
  const setShowSettings = useStore((s) => s.setShowSettings);

  const status: ReactNode = connection === 'live' ? (liveRooms ? <>Live · {liveRooms}<span className="lbl"> session{liveRooms > 1 ? 's' : ''}</span></> : 'Live · idle') : connection === 'connecting' ? 'Connecting…' : 'Offline';
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-logo" aria-hidden="true"><Icon name="building" size={22} /></span>
        <div>
          <h1>Agent Workspace</h1>
          <small>watch your agents at work</small>
        </div>
      </div>
      <div className="topbar-right">
        <button
          type="button"
          className={`pill pill-btn pill-${connection}${showSwitcher ? '' : ' pill-collapsed'}`}
          onClick={() => setShowSwitcher(!showSwitcher)}
          aria-pressed={showSwitcher}
          title={showSwitcher ? 'Hide the list of sessions' : 'Show the list of sessions'}
        >
          <i className="pill-dot" aria-hidden="true" />
          {status}
          <span className="pill-caret" aria-hidden="true"><Icon name={showSwitcher ? 'chevron-down' : 'chevron-right'} size={13} /></span>
        </button>
        {SHOW_DEMO_BUTTON ? (
          <button className={`btn btn-extra${demoOn ? ' btn-on' : ''}`} onClick={() => setDemo(!demoOn)} title="Simulated agent sessions">
            <Icon name={demoOn ? 'pause' : 'play'} size={13} /> Demo
            {demoOn && autoDemo ? <em>auto</em> : null}
          </button>
        ) : null}
        <button
          className="btn btn-time"
          onClick={() => setTimeMode(TIME_CYCLE[(TIME_CYCLE.indexOf(timeMode) + 1) % TIME_CYCLE.length])}
          title="Time of day: follows the system clock, click to preview day / dusk / night (N)"
        >
          <Icon name={timeIcon(hour)} size={18} /> <span className="lbl">{timeMode === 'auto' ? `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}` : timeMode}</span>
        </button>
        <button className="btn btn-names btn-extra" onClick={() => setShowNames(true)} title="Names for the director and the staff" aria-label={`Names${nameCount ? ` (${nameCount})` : ''}`}>
          <Icon name="users" size={18} />
          <span className="lbl" aria-hidden="true">Names</span>
          {nameCount ? <em aria-hidden="true">{nameCount}</em> : null}
        </button>
        <button
          className={`btn btn-icon${!muted && !soundReady ? ' btn-pending' : ''}`}
          onClick={() => {
            setMuted(!muted);
            if (muted) window.setTimeout(() => sfx('ding'), 60);
          }}
          aria-pressed={muted}
          aria-label={muted ? 'Sound effects off' : 'Sound effects on'}
          title={
            muted
              ? 'Sound effects are off – click to turn them on (M)'
              : soundReady
                ? 'Sound effects are on – click to mute (M)'
                : 'Sound effects are on, but the browser plays them only after your first click or key press (M mutes)'
          }
        >
          <Icon name={muted ? 'volume-x' : 'volume'} size={18} />
        </button>
        <LevelChip />
        <button className={`btn btn-icon btn-extra btn-music${musicOn ? ' btn-on' : ''}`} onClick={() => setMusicOn(!musicOn)} aria-pressed={musicOn} aria-label={musicOn ? 'Lo-fi music on' : 'Lo-fi music off'} title={musicOn ? 'Lo-fi music is on – click to stop (K)' : 'Play lo-fi music (K)'}><Icon name="music" size={18} /></button>
        <button className="btn btn-icon btn-extra" onClick={() => takePhoto()} aria-label="Take a photo" title="Save a photo of the office (P)"><Icon name="camera" size={18} /></button>
        <button className="btn btn-icon btn-extra" onClick={() => setCinema(true)} aria-label="Screensaver mode" title="Screensaver: hide the buttons and tour the rooms (C)"><Icon name="maximize" size={18} /></button>
        {pipSupported() ? (
          <button className="btn btn-icon btn-extra" onClick={togglePip} aria-label="Floating window" title="Show the office in a small floating window that stays on top (I)"><Icon name="pip" size={18} /></button>
        ) : null}
        <button className="btn btn-icon" onClick={resetView} aria-label="Reset camera" title="Reset camera (R)"><Icon name="crosshair" size={18} /></button>
        <button className="btn btn-icon" onClick={() => setShowSettings(true)} aria-label="Settings" title="Settings: graphics, weather, decorations, sound"><Icon name="settings" size={18} /></button>
        <button className="btn btn-icon" onClick={() => setHelp(true)} aria-label="Help" title="Help (?)"><Icon name="help" size={18} /></button>
      </div>
    </header>
  );
}

/** A short, readable name for a session (its title, trimmed) – nothing when it only has a generated id. */
function shortTitle(r: { id: string; title: string; project: string }): string {
  const t = r.title.replace(/\s+/g, ' ').trim();
  if (!t || t === r.id.slice(0, 8) || t === r.project) return '';
  // the card cuts the line to its own width (text-overflow); this only keeps very long prompts out of the DOM
  return t.length > 120 ? `${t.slice(0, 119).trimEnd()}…` : t;
}

const clockText = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const clockSec = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};
const durText = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
};

/** Where a task comes from: a sub-agent run, or a tool call of the main agent / of a sub-agent. */
function sourceText(t: { source: 'sub' | 'main'; origin: string }): string {
  if (t.source === 'sub') return 'sub-agent';
  return t.origin && t.origin !== 'main' ? `tool call · ${t.origin}` : 'tool call · main agent';
}

/** What a task is called in the lists: the sub-agent's description, or the tool call itself. */
function taskTitle(t: { label: string; source: 'sub' | 'main'; first: string; steps: number }): string {
  if (t.source === 'sub' || !t.first) return t.label;
  return t.steps > 1 ? `${t.first} · +${t.steps - 1} more` : t.first;
}

const FEED_ICON: Record<ActivityEntry['kind'], IconName> = {
  prompt: 'inbox', thinking: 'lightbulb', text: 'message', tool: 'wrench', task: 'layers', done: 'check-circle', report: 'file-text', system: 'building', error: 'alert', ask: 'help',
};
const FEED_TOOL_ICON: Record<string, IconName> = {
  Read: 'book-open', Edit: 'pencil', MultiEdit: 'pencil', NotebookEdit: 'pencil', Write: 'file-text', Bash: 'terminal', PowerShell: 'terminal', Grep: 'search', Glob: 'search',
  WebFetch: 'globe', WebSearch: 'globe', TodoWrite: 'list-checks', TaskCreate: 'list-checks', TaskUpdate: 'list-checks', Agent: 'send', Task: 'send',
};
/** MCP tools (mcp__server__tool) get a plug */
const feedToolIcon = (tool: string | undefined): IconName => FEED_TOOL_ICON[tool ?? ''] ?? (tool?.startsWith('mcp__') ? 'plug' : 'wrench');

/** Everything that happened in the session – requests, thoughts, messages, tool calls, sub-agents, reports – newest first. */
const ActivityFeed = memo(function ActivityFeed({ roomId }: { roomId: string }) {
  const entries = useStore((s) => s.activity[roomId]);
  const [limit, setLimit] = useState(80);
  if (!entries?.length) return <p className="muted">Nothing has happened yet.</p>;
  const shown = entries.slice(0, limit);
  return (
    <>
      {shown.map((e) => (
        <div key={e.id} className={`arow arow-${e.kind}${e.tool === 'failed' ? ' arow-bad' : ''}`}>
          <time>{clockSec(e.at)}</time>
          <span className="arow-icon"><Icon name={e.kind === 'tool' ? feedToolIcon(e.tool) : e.tool === 'failed' ? 'x-circle' : FEED_ICON[e.kind]} size={14} /></span>
          <div>
            <b>{e.who}</b>
            {e.ctx ? <em> · {e.ctx}</em> : null}
            <p className={e.kind === 'tool' ? 'mono' : ''} title={e.text}>{e.text}</p>
          </div>
        </div>
      ))}
      {entries.length > limit ? (
        <button className="arow-more" onClick={() => setLimit(limit + 100)}>Show older ({entries.length - limit} more)</button>
      ) : null}
    </>
  );
});

/** Full list of the tasks of a room (running ones first), of the reports that were handed over, or of everything that happened. */
function TaskList({ roomId }: { roomId: string }) {
  const tab = useStore((s) => s.listTab);
  const finished = useStore((s) => s.finished[roomId]);
  const tasks = useStore((s) => s.tasks);
  const people = useStore((s) => s.people);
  const [now, setNow] = useState(() => Date.now());
  const ticking = tab === 'tasks' || tab === 'reports';
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);
  const open = useMemo(
    () => Object.values(tasks).filter((t) => t.sessionId === roomId).sort((a, b) => b.startedAt - a.startedAt),
    [tasks, roomId],
  );
  if (!tab) return null;
  const done: TaskLogEntry[] = finished ?? [];
  const who = (t: TaskRec) => (t.assignee ? people[t.assignee]?.name ?? '' : '');
  const reported = [
    ...open.filter((t) => t.reported).map((t) => ({ key: t.key, label: taskTitle(t), who: who(t), at: now, failed: t.failed, summary: t.summary })),
    ...done.filter((t) => t.reported).map((t) => ({ key: t.key, label: taskTitle(t), who: t.who, at: t.finishedAt, failed: t.failed, summary: t.summary })),
  ];
  return (
    <div className="tasklist" id="tasklist">
      <div className="tasklist-body" role="region" aria-label={tab === 'tasks' ? 'Tasks' : tab === 'reports' ? 'Reports' : 'Activity'}>
        {tab === 'activity' ? (
          <ActivityFeed roomId={roomId} />
        ) : tab === 'tasks' ? (
          <>
            {open.length + done.length === 0 ? <p className="muted">No tasks yet.</p> : null}
            {open.map((t) => (
              <div key={t.key} className="trow trow-running">
                <span className="trow-icon"><Icon name={t.assignee ? (t.done ? 'send' : 'hourglass') : 'clock'} size={15} /></span>
                <div>
                  <b>{taskTitle(t)}</b>
                  <small>
                    {t.assignee ? (t.done ? (t.source === 'sub' ? 'handing over' : 'wrapping up') : 'running') : 'waiting for a free desk'}
                    {who(t) ? ` · ${who(t)}` : ''} · {sourceText(t)} · {durText(now - t.startedAt)}
                  </small>
                </div>
              </div>
            ))}
            {done.map((t) => (
              <div key={t.key} className="trow">
                <span className="trow-icon"><Icon name={t.failed ? 'x-circle' : 'check-circle'} size={15} /></span>
                <div>
                  <b>{taskTitle(t)}</b>
                  <small>
                    {t.who} · {sourceText(t)} · {clockText(t.startedAt)} · {durText(t.finishedAt - t.startedAt)}
                    {t.reported ? ' · reported' : ''}
                  </small>
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            {reported.length === 0 ? <p className="muted">No reports handed over yet.</p> : null}
            {reported.map((t) => (
              <div key={t.key} className="trow">
                <span className="trow-icon"><Icon name={t.failed ? 'x-circle' : 'file-text'} size={15} /></span>
                <div>
                  <b>{t.label}</b>
                  <p>{t.summary || (t.failed ? 'Could not finish this one.' : 'Report handed over.')}</p>
                  <small>{t.who} · {clockText(t.at)}</small>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** the floating window has no header: the context use of the room on show sits in its corner */
export function PipContext() {
  const room = useStore((s) => (s.activeRoomId ? s.rooms[s.activeRoomId] : null));
  const ctxPref = useStore((s) => s.contextWindow);
  const ctx = contextShare(room?.context, ctxPref);
  if (!ctx) return null;
  return (
    <div className={`pip-ctx ctx-${ctx.level}`} title={ctx.title} role="status">
      <Icon name="layers" size={12} />
      <i aria-hidden="true"><b style={{ width: `${Math.min(100, ctx.pct)}%` }} /></i>
      <em>{ctx.text}</em>
    </div>
  );
}

/** a small window (phone, split screen, 200% zoom): the header starts folded so the room stays in view */
const SMALL_QUERY = '(max-width: 600px), (max-height: 560px)';
const smallScreen = () => typeof window !== 'undefined' && !!window.matchMedia?.(SMALL_QUERY).matches;

export function RoomHeader() {
  const room = useStore((s) => (s.activeRoomId ? s.rooms[s.activeRoomId] : null));
  const listTab = useStore((s) => s.listTab);
  const toggleList = useStore((s) => s.toggleList);
  const openSummary = useStore((s) => s.openSummary);
  const status = useRoomStatus();
  const ask = useStore((s) => (s.activeRoomId ? s.asks[s.activeRoomId] : undefined));
  const ctxPref = useStore((s) => s.contextWindow);
  const [folded, setFolded] = useState(smallScreen);
  // the window grows or shrinks past the limit: fold or unfold to match (a click on the fold button lasts until the next change)
  useEffect(() => {
    const mq = window.matchMedia?.(SMALL_QUERY);
    if (!mq) return;
    const on = () => setFolded(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  if (!room) return null;
  const st = status[room.id] ?? NO_STATUS;
  const theme = themeFor(room.themeIndex);
  const ctxShare = contextShare(room.context, ctxPref);
  const askChip = ask ? <span className="room-header-ask" title={ask.full ?? ask.text}><Icon name="help" size={13} /> Needs your input</span> : null;
  return (
    <section className={`room-header${folded ? ' folded' : ''}`} style={{ ['--accent' as string]: theme.accent }} aria-label="Current room">
      <div className="room-header-title">
        <span className="room-header-dot" aria-hidden="true" />
        <b>{room.project}</b>
        {room.demo ? <em className="tag-demo">demo</em> : null}
        <button className="room-header-fold" onClick={() => setFolded(!folded)} aria-expanded={!folded} aria-label={folded ? 'Show room details' : 'Hide room details'} title={folded ? 'Show room details' : 'Hide room details'}>
          <Icon name={folded ? 'chevron-down' : 'chevron-up'} size={16} />
        </button>
      </div>
      {folded ? (
        askChip ? <div className="room-header-stats">{askChip}</div> : null
      ) : (
        <>
          <div className="room-header-sub">{room.title}</div>
          <div className="room-header-stats">
            <span className={st.working ? 'on' : ''}><Icon name={st.working ? 'briefcase' : 'coffee'} size={13} /> {st.working ? 'Working' : 'Idle'}</span>
            <span><Icon name="users" size={13} /> {st.people} in the office</span>
            {ctxShare ? <span className={`ctx-chip ctx-${ctxShare.level}`} title={ctxShare.title}><Icon name="layers" size={13} /> {ctxShare.text}</span> : null}
            {askChip}
            <button className={`stat-btn${listTab === 'tasks' ? ' open' : ''}`} onClick={() => toggleList('tasks')} aria-pressed={listTab === 'tasks'} aria-controls="tasklist" title="Tasks of this session (sub-agent runs and the main agent's own work) – click for the full list, click again to close">
              <Icon name="list-checks" size={13} /> Tasks
            </button>
            <button className={`stat-btn${listTab === 'reports' ? ' open' : ''}`} onClick={() => toggleList('reports')} aria-pressed={listTab === 'reports'} aria-controls="tasklist" title="Reports handed over to the director – click for the full list, click again to close">
              <Icon name="file-text" size={13} /> Reports
            </button>
            <button className={`stat-btn${listTab === 'activity' ? ' open' : ''}`} onClick={() => toggleList('activity')} aria-pressed={listTab === 'activity'} aria-controls="tasklist" title="Everything that happened in this session, newest first – click again to close">
              <Icon name="clock" size={13} /> Activity
            </button>
            <button className="stat-btn" onClick={() => openSummary(room.id)} title="The last summary of this session on a sheet of paper (made from what is known so far if no run has finished yet)"><Icon name="scroll" size={13} /> Summary</button>
          </div>
          <TaskList roomId={room.id} />
        </>
      )}
    </section>
  );
}

export function RoomSwitcher() {
  const order = useStore(useShallow(orderedRooms));
  const rooms = useStore((s) => s.rooms);
  const active = useStore((s) => s.activeRoomId);
  const setActive = useStore((s) => s.setActiveRoom);
  const askReleaseAll = useStore((s) => s.askReleaseAll);
  const unseen = useStore((s) => s.unseen);
  const asks = useStore((s) => s.asks);
  const show = useStore((s) => s.showSwitcher);
  const ctxPref = useStore((s) => s.contextWindow);
  const status = useRoomStatus();
  const listRef = useRef<HTMLDivElement>(null);
  // the room that is opened stays in view when the list scrolls
  useEffect(() => {
    listRef.current?.querySelector('.room-card.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);
  // when the order changes (a read summary sorts the list) the cards glide to their new places: FLIP, transform only, so the compositor does the work
  const orderKey = order.join('\n');
  const placed = useRef<{ key: string; at: Map<string, [number, number]> }>({ key: orderKey, at: new Map() });
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const cards = list.querySelectorAll<HTMLElement>('.room-card');
    const prev = placed.current;
    const at = new Map<string, [number, number]>();
    for (const el of cards) at.set(el.dataset.room ?? '', [el.offsetLeft, el.offsetTop]);
    if (prev.key !== orderKey && prev.at.size && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let moved = false;
      for (const el of cards) {
        const from = prev.at.get(el.dataset.room ?? '');
        const to = at.get(el.dataset.room ?? '');
        if (!from || !to || (from[0] === to[0] && from[1] === to[1])) continue;
        moved = true;
        el.animate(
          [{ transform: `translate(${from[0] - to[0]}px, ${from[1] - to[1]}px)` }, { transform: 'translate(0, 0)' }],
          { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        );
      }
      if (moved) listRef.current?.querySelector('.room-card.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
    placed.current = { key: orderKey, at };
  }, [orderKey, show]);
  if (!order.length || !show) return null;
  const idleCount = order.filter((id) => !(status[id] ?? NO_STATUS).working).length;
  return (
    <nav className="switcher" aria-label="Sessions">
      <div className="switcher-list" ref={listRef}>
        {order.map((id, i) => {
          const r = rooms[id];
          if (!r) return null;
          const st = status[id] ?? NO_STATUS;
          const theme = themeFor(r.themeIndex);
          const ctx = contextShare(r.context, ctxPref);
          return (
            <button key={id} data-room={id} className={`room-card${id === active ? ' active' : ''}`} style={{ ['--accent' as string]: theme.accent, ['--wall' as string]: theme.wall }} onClick={() => setActive(id)} aria-current={id === active ? 'true' : undefined} title={`${r.title} · ${PROVIDER_NAME[r.provider]}${i < 9 ? ` (${i + 1})` : ''}`}>
              <span className="room-card-side">
                <span className="room-card-logo" title={PROVIDER_NAME[r.provider]}>
                  <ProviderLogo provider={r.provider} />
                </span>
                <small className="room-card-state" title={asks[id] ? `Waiting for your answer: ${asks[id].text}` : unseen[id] ? 'This session is done – click to read its summary' : undefined}>
                  <i className={`room-card-dot${asks[id] ? ' is-ask' : unseen[id] ? ' is-unseen' : st.working ? ' is-working' : ''}`} aria-hidden="true" />
                  {st.working ? 'working' : 'idle'}
                </small>
              </span>
              <span className="room-card-text">
                <b>{i + 1}. {r.project}</b>
                {shortTitle(r) ? <small className="room-card-name">{shortTitle(r)}</small> : null}
                {ctx ? (
                  <span className={`room-card-ctx ctx-${ctx.level}`} title={ctx.title}>
                    <i aria-hidden="true"><b style={{ width: `${Math.min(100, ctx.pct)}%` }} /></i>
                    <em>{ctx.text}</em>
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
        {idleCount ? (
          <button className="room-clear" onClick={askReleaseAll} title="Take every room that is not working right now off the list (nothing is deleted)">
            <Icon name="archive" size={14} /> Release {idleCount === order.length ? 'all' : idleCount} idle room{idleCount > 1 ? 's' : ''}
          </button>
        ) : null}
      </div>
    </nav>
  );
}

/** **bold** and `code` inside a line */
function inlineMd(t: string): ReactNode[] {
  return t.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) => {
    if (p.length > 4 && p.startsWith('**') && p.endsWith('**')) return <b key={i}>{p.slice(2, -2)}</b>;
    if (p.length > 2 && p.startsWith('`') && p.endsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>;
    return p;
  });
}

/** The few bits of markdown the agents' answers use: headings, bullet / numbered lists, code blocks, rules, bold, code. */
function MiniMarkdown({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let list: string[] = [];
  let ordered = false;
  const flush = () => {
    if (!list.length) return;
    const items = list;
    const Tag = ordered ? 'ol' : 'ul';
    out.push(<Tag key={`l${out.length}`}>{items.map((l, i) => <li key={i}>{inlineMd(l)}</li>)}</Tag>);
    list = [];
  };
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    // a fenced code block runs to the closing fence (or to the end of the text when the message was cut off)
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trimStart().startsWith(fence[1]); i++) code.push(lines[i]);
      out.push(<pre key={`c${out.length}`}><code>{code.join('\n')}</code></pre>);
      continue;
    }
    const li = line.match(/^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/);
    if (li) {
      const isOrdered = !li[1];
      if (list.length && isOrdered !== ordered) flush();
      ordered = isOrdered;
      list.push(li[3]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push(<hr key={`r${out.length}`} />);
      continue;
    }
    const h = line.match(/^#{1,4}\s+(.*)$/);
    out.push(h ? <h4 key={`h${out.length}`}>{inlineMd(h[1])}</h4> : <p key={`p${out.length}`}>{inlineMd(line)}</p>);
  }
  flush();
  return <>{out}</>;
}

/** A sheet of paper in the middle of the screen: what the office did in the run that just finished. */
export function SummaryPaper() {
  const roomId = useStore((s) => s.summaryOpen);
  const summary = useStore((s) => (s.summaryOpen ? s.summaries[s.summaryOpen] : undefined));
  const room = useStore((s) => (s.summaryOpen ? s.rooms[s.summaryOpen] : undefined));
  const close = useStore((s) => s.requestCloseSummary);
  const dismiss = useStore((s) => s.closeSummary);
  const askRelease = useStore((s) => s.askRelease);
  const working = useStore((s) => !!(s.summaryOpen && s.rooms[s.summaryOpen]?.mainActive));
  // tasks that are still going on (a summary "so far" only lists the finished ones)
  const running = useStore((s) => (s.summaryOpen ? Object.values(s.tasks).filter((t) => t.sessionId === s.summaryOpen).length : 0));
  // a room can only be released while nothing is going on in it
  const idle = useStore((s) => !!s.summaryOpen && !s.rooms[s.summaryOpen]?.mainActive && !Object.values(s.tasks).some((t) => t.sessionId === s.summaryOpen));
  if (!roomId || !summary || !room) return null;
  const failed = summary.tasks.filter((t) => t.failed).length;
  const reports = summary.tasks.filter((t) => t.reported);
  const calls = summary.tasks.filter((t) => t.source === 'main');
  const mix = new Map<string, number>();
  for (const c of calls) mix.set(c.tool || 'other', (mix.get(c.tool || 'other') ?? 0) + 1);
  const callMix = [...mix.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tool, n]) => `${tool.replace(/^mcp__/, '')} ×${n}`).join(' · ');
  const soFar = summary.partial;
  return (
    <Dialog backdrop="paper-backdrop" card="paper" as="article" label={`Session summary: ${room.project}`} onClose={close}>
      <span className="paper-tape" aria-hidden="true" />
      <button className="paper-close" onClick={close} aria-label="Close" title="Close (Esc)"><Icon name="x" size={18} /></button>
      <div className="paper-scroll">
        <small className="paper-kicker"><Icon name={summary.partial ? (working ? 'briefcase' : 'scroll') : 'check-circle'} size={14} /> {summary.partial ? (working ? 'Session so far' : 'Last known state') : 'Session summary'}</small>
        <h2>{room.project}</h2>
        <p className="paper-sub">{room.title}</p>
        <div className="paper-stats">
          <span><Icon name="clock" size={13} /> {summary.partial ? 'as of' : 'finished'} {clockText(summary.finishedAt)}</span>
          <span><Icon name="timer" size={13} /> {durText(summary.finishedAt - summary.startedAt)}</span>
          <span><Icon name="list-checks" size={13} /> {summary.tasks.length} task{summary.tasks.length === 1 ? '' : 's'}{soFar ? ' done' : ''}{failed ? ` (${failed} failed)` : ''}{running ? ` · ${running} running` : ''}</span>
          <span><Icon name="file-text" size={13} /> {summary.reports} report{summary.reports === 1 ? '' : 's'}</span>
          <span><Icon name="users" size={13} /> {summary.staff} staff</span>
        </div>
        {summary.prompt ? (
          <section>
            <h3>The request</h3>
            <p className="paper-quote">{summary.prompt}</p>
          </section>
        ) : null}
        <section>
          <h3>Result</h3>
          {summary.final ? <div className="paper-text"><MiniMarkdown text={summary.final} /></div> : <p className="muted">{summary.partial ? 'No closing message yet – the session is still working, or has not said anything since this page was opened.' : 'All the work is done – the main agent did not leave a closing message.'}</p>}
        </section>
        {summary.tasks.length ? (
          <section>
            <h3>What the team did</h3>
            <ol className="paper-tasks">
              {summary.tasks.filter((t) => t.source === 'sub').map((t) => (
                <li key={t.key} className={t.failed ? 'bad' : ''}>
                  <b><Icon name={t.failed ? 'x-circle' : 'check'} size={14} /> {taskTitle(t)}</b>
                  <small>{t.who} · {sourceText(t)} · {durText(t.finishedAt - t.startedAt)}</small>
                  {t.reported && t.summary ? <p>{t.summary}</p> : null}
                </li>
              ))}
              {calls.length ? (
                <li>
                  <b><Icon name="wrench" size={14} /> {calls.length} tool call{calls.length === 1 ? '' : 's'}</b>
                  <small>{callMix}</small>
                </li>
              ) : null}
            </ol>
          </section>
        ) : null}
        {reports.length === 0 && summary.tasks.length === 0 ? null : <p className="paper-end">— end of report —</p>}
      </div>
      <div className="paper-foot">
        {idle ? <button className="btn" onClick={askRelease} title="Take this room off the list – continue the session in its agent to bring it back">Release room</button> : null}
        <button className="btn btn-big" onClick={dismiss} data-autofocus>Got it</button>
      </div>
    </Dialog>
  );
}

/** "Release this room?" (from the summary paper) or "Release every idle room?" (from the room list). */
export function ReleaseConfirm() {
  const ask = useStore((s) => s.releaseAsk);
  const all = useStore((s) => s.releaseAllAsk);
  const room = useStore((s) => (s.releaseAsk ? s.rooms[s.releaseAsk.roomId] : undefined));
  const cancel = useStore((s) => s.cancelRelease);
  const release = useStore((s) => s.releaseRoom);
  const releaseAll = useStore((s) => s.releaseAllRooms);
  if (all) {
    return (
      <Dialog backdrop="confirm-backdrop" card="confirm-card" role="alertdialog" label="Release every idle room" onClose={cancel}>
        <h3>Release every idle room?</h3>
        <p className="confirm-note">
          <Icon name="info" size={14} /> Rooms that are working stay. Releasing only takes a room off the list – nothing is deleted, and a room comes back by itself when its session is continued.
        </p>
        <div className="confirm-actions">
          <button className="btn" onClick={cancel} data-autofocus>Cancel</button>
          <button className="btn btn-big" onClick={releaseAll}>Release idle rooms</button>
        </div>
      </Dialog>
    );
  }
  if (!ask || !room) return null;
  return (
    <Dialog backdrop="confirm-backdrop" card="confirm-card" role="alertdialog" label="Release this room" onClose={cancel}>
      <h3>Release this room?</h3>
      <p className="confirm-room"><Icon name="building" size={14} /> {room.project} <em>{room.title}</em></p>
      <p className="confirm-note">
        <Icon name="info" size={14} /> Releasing only takes the room off the list. Nothing is deleted – when you <b>continue this session in {PROVIDER_NAME[room.provider]}</b>, the room opens again by itself.
      </p>
      <div className="confirm-actions">
        <button className="btn" onClick={cancel} data-autofocus>Cancel</button>
        <button className="btn btn-big" onClick={() => release(ask.roomId)}>Release room</button>
      </div>
    </Dialog>
  );
}

export function AgentPanel() {
  const key = useStore((s) => s.selectedKey);
  const person = useStore((s) => (s.selectedKey ? s.people[s.selectedKey] : null));
  const log = useStore((s) => (s.selectedKey ? s.logs[s.selectedKey] : undefined));
  const room = useStore((s) => (person ? s.rooms[person.sessionId] : null));
  const select = useStore((s) => s.select);
  const [, tick] = useState(0);
  const selected = !!key;
  useEffect(() => {
    if (!selected) return;
    const t = setInterval(() => tick((n) => n + 1), 400);
    return () => clearInterval(t);
  }, [selected]);
  const entries = useMemo<Speech[]>(() => (log ? [...log].reverse().slice(0, 14) : []), [log]);
  const cat = key ? cats.get(key) : undefined;
  if (key && cat && !person) {
    return (
      <aside className="panel panel-cat" style={{ ['--accent' as string]: '#ff9ec4' }} aria-label="Office cat">
        <button className="panel-close" onClick={() => select(null)} aria-label="Close" title="Close (Esc)"><Icon name="x" size={16} /></button>
        <div className="panel-title">
          <span className="panel-avatar" aria-hidden="true"><Icon name="cat" size={22} /></span>
          <div>
            <b>Office cat</b>
            <small>{CAT_TEXT[cat.phase] ?? 'Being a cat'}</small>
          </div>
        </div>
        <p className="muted">Cats hop in through the windows, wander around, nap on the sofa or the director&apos;s desk, and leave when they feel like it. The director likes to pet them.</p>
      </aside>
    );
  }
  if (!key || !person) return null;
  const sim = sims.get(key);
  const director = person.role === 'director';
  // (the panel does not say whether they are on a task or not)
  const phaseText = !sim ? '…' : PHASE_TEXT[sim.phase];
  const theme = room ? themeFor(room.themeIndex) : themeFor(0);
  return (
    <aside className="panel" style={{ ['--accent' as string]: director ? '#ffb020' : theme.accent }} aria-label={`${person.name}, ${director ? 'director' : 'staff'}`}>
      <button className="panel-close" onClick={() => select(null)} aria-label="Close" title="Close (Esc)"><Icon name="x" size={16} /></button>
      <div className="panel-title">
        <span className="panel-avatar" aria-hidden="true"><Icon name={director ? 'crown' : 'user'} size={22} /></span>
        <div>
          <b>{person.name}</b>
          <small>{director ? 'Director' : 'Staff'}</small>
        </div>
      </div>
      <div className="panel-status">
        <span className="chip">{phaseText}</span>
      </div>
      <div className="panel-log">
        {entries.length === 0 ? <p className="muted">Nothing said yet.</p> : null}
        {entries.map((e) => (
          <div key={e.id} className={`log log-${e.kind}`}>
            <span className="log-icon"><Icon name={ICON[e.kind] ?? 'dot'} size={14} /></span>
            <p>{e.text}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

export function EmptyState() {
  const empty = useStore((s) => s.visibleOrder.length === 0);
  const connection = useStore((s) => s.connection);
  const setDemo = useStore((s) => s.setDemo);
  const sources = useStore((s) => s.sources);
  if (!empty) return null;
  const offline = connection === 'offline';
  return (
    <div className="empty">
      <div className="empty-card">
        <div className="empty-emoji" aria-hidden="true"><Icon name={offline ? 'wifi-off' : 'building'} size={44} /></div>
        <h2>{offline ? "Can't reach the monitor" : connection === 'connecting' ? 'Connecting…' : 'The office is empty'}</h2>
        <p>
          {connection === 'live' ? (
            <>Watching {watchedSources(sources).map((w, i) => <span key={w.provider}>{i ? ', ' : ''}<b>{PROVIDER_NAME[w.provider]}</b></span>)}. Start a session in any of them and a room will appear here.</>
          ) : connection === 'connecting' ? (
            'Connecting to the transcript monitor…'
          ) : (
            <>The page keeps trying to reconnect by itself. If the monitor was stopped, start it again with <code>npx @thnonline/agent-workspace</code> (from a checkout: <code>npm start</code>).</>
          )}
        </p>
        {offline ? <button className="btn btn-big" onClick={retryConnection}>Try again now</button> : null}
        {SHOW_DEMO_BUTTON ? <button className="btn btn-big" onClick={() => setDemo(true)}><Icon name="play" size={14} /> Watch a demo</button> : null}
      </div>
    </div>
  );
}

export function NamesDialog() {
  const show = useStore((s) => s.showNames);
  const names = useStore((s) => s.names);
  const setShow = useStore((s) => s.setShowNames);
  const apply = useStore((s) => s.applyNames);
  const [text, setText] = useState('');
  useEffect(() => {
    if (show) setText(names.join('\n'));
  }, [show, names]);
  if (!show) return null;
  const parsed = parseNames(text);
  const save = () => {
    apply(parsed);
    setShow(false);
  };
  const close = () => setShow(false);
  return (
    <Dialog backdrop="modal" card="modal-card" label="Names" onClose={close}>
      <button className="panel-close" onClick={close} aria-label="Close" title="Close (Esc)"><Icon name="x" size={16} /></button>
      <h2><Icon name="users" size={22} /> Names</h2>
      <p className="muted">
        One name per line (or separated by commas). The director and every staff member get a random name from this list – no two people in a room share a name.
        The list is saved in this browser and reused for every room and every run. When it runs out, common English names such as {FALLBACK_NAMES.slice(0, 4).join(', ')}… are used.
      </p>
      <textarea
        className="names-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Names, one per line"
        placeholder={'Mai\nLinh\nNam\nHuy\nTrang'}
        rows={9}
        spellCheck={false}
        data-autofocus
      />
      <div className="names-row">
        <span className="muted">{parsed.length} name{parsed.length === 1 ? '' : 's'}</span>
        <span className="names-actions">
          <button className="btn" onClick={() => setText('')}>Clear</button>
          <button className="btn btn-big" onClick={save}>Save</button>
        </span>
      </div>
    </Dialog>
  );
}

export function Help() {
  const show = useStore((s) => s.showHelp);
  const setHelp = useStore((s) => s.setHelp);
  if (!show) return null;
  const close = () => setHelp(false);
  return (
    <Dialog backdrop="modal" card="modal-card modal-help" label="How the office works" onClose={close}>
      <button className="panel-close" onClick={close} aria-label="Close" title="Close (Esc)"><Icon name="x" size={16} /></button>
      <h2>How the office works</h2>
      <h3>Controls</h3>
      <ul className="keys">
        <li><kbd>←</kbd> <kbd>→</kbd> or <kbd>1</kbd>–<kbd>9</kbd> switch room</li>
        <li>Drag = rotate · Wheel = zoom · <kbd>R</kbd> = reset camera</li>
        <li>Click a character to follow it and see its log · <kbd>Esc</kbd> to close</li>
        <li><kbd>N</kbd> previews day / dusk / night · <kbd>W</kbd> changes the weather · <kbd>M</kbd> mutes sound · <kbd>K</kbd> lo-fi music · <kbd>?</kbd> opens this help</li>
        <li><kbd>P</kbd> saves a photo · <kbd>C</kbd> screensaver mode (<kbd>Esc</kbd> or a click leaves it) · <kbd>L</kbd> levels and achievements · <kbd>I</kbd> floating window (picture-in-picture)</li>
      </ul>
      <h3>The office</h3>
      <ul className="help-list">
        <li><Icon name="building" size={16} /><span>Every <b>session</b> of Claude Code, Codex or OpenCode gets its own <b>room</b>; the round logo on its button says which one.</span></li>
        <li><Icon name="crown" size={16} /><span>The <b>director</b> voices the main agent (prompt, thoughts, delegating) and walks out last, when everything is finished.</span></li>
        <li><Icon name="list-checks" size={16} /><span>Every <b>task</b> is done by one <b>staff member</b> – a sub-agent run, or one tool call. Staff walk in, unpack their laptop, type, and show what they are doing in speech bubbles; the staff take turns.</span></li>
        <li><Icon name="coffee" size={16} /><span>Whoever has nothing to do takes a break – a stroll, the sofa, a book, a drink, noodles, the punching dummy, a cat… A new task never sends anybody back to their desk: they work on it where they are.</span></li>
        <li><Icon name="cat" size={16} /><span>Every room has 1–2 cats that hop in through the windows, wander, nap and leave when they like.</span></li>
        <li><Icon name="moon" size={16} /><span>Light follows your system clock: the sky darkens in the evening and every room switches its lights on.</span></li>
      </ul>
      <h3>Sessions and summaries</h3>
      <ul className="help-list">
        <li><Icon name="archive" size={16} /><span>The green <b>Live</b> pill in the top bar shows or hides the session list. The room buttons keep the order in which the sessions showed up, but rooms that wait for you (a question, an unread summary) come first and idle rooms always sit behind the working ones: a moment after a session starts or stops working (or you have read its summary) the list sorts itself and the buttons glide to their new places. A room stays until you <b>release</b> it (Release room on the summary paper, or Release idle rooms under the list) or until its session has stood still for an hour. Releasing only takes it off the list – continue the session in its agent and it comes back.</span></li>
        <li><i className="help-dot" aria-hidden="true" /><span>When a session is done the director announces it and a blue dot blinks on its button until you have read the summary. Stepping into a finished room lays its summary on the screen as a sheet of paper; <b>Summary</b> in the header brings it back.</span></li>
        <li><Icon name="help" size={16} /><span>When the agent waits for your answer, its room shows an amber badge and the director waves a question bubble.</span></li>
        <li><Icon name="users" size={16} /><span><b>Names</b> gives the director and the staff real names (saved in this browser). Sound effects only play for the room on screen; the browser allows them after your first click.</span></li>
      </ul>
    </Dialog>
  );
}

/** Says out loud (to screen readers) what the eyes see happen in another room: a question is waiting, a session is done. */
export function Announcer() {
  const [msg, setMsg] = useState('');
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        for (const id of Object.keys(s.asks)) {
          if (!prev.asks[id]) setMsg(`${s.rooms[id]?.project ?? 'A session'} needs your input`);
        }
        for (const id of Object.keys(s.unseen)) {
          if (s.unseen[id] && !prev.unseen[id]) setMsg(`${s.rooms[id]?.project ?? 'A session'} is done`);
        }
      }),
    [],
  );
  return <div className="sr-only" role="status" aria-live="polite">{msg}</div>;
}
