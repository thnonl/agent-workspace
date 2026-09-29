import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { orderedRooms, useStore } from '../store';
import { themeFor } from '../world/palettes';
import { cats, sims } from '../sim/registry';
import type { Phase } from '../sim/registry';
import type { ActivityEntry, Speech, TaskLogEntry, TaskRec } from '../types';
import { FALLBACK_NAMES, parseNames } from '../names';
import { sfx } from '../audio';

const ICON: Record<string, string> = { thinking: '💭', text: '💬', tool: '🔧', task: '📥', done: '✅', error: '⚠️' };

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

export function useRoomStatus() {
  return useStore(
    useShallow((s) => {
      const out: Record<string, RoomStatus> = {};
      for (const id of s.visibleOrder) out[id] = { ...NO_STATUS, working: !!s.rooms[id]?.mainActive };
      for (const t of Object.values(s.tasks)) {
        const r = out[t.sessionId];
        if (!r) continue;
        r.working = true;
      }
      for (const p of Object.values(s.people)) {
        const r = out[p.sessionId];
        if (r && p.present) r.people++;
      }
      return JSON.stringify(out);
    }),
  );
}

const TIME_CYCLE = ['auto', 'day', 'dusk', 'night'] as const;
function timeIcon(h: number) {
  return h >= 7.5 && h < 17.3 ? '☀️' : (h >= 5.2 && h < 7.5) || (h >= 17.3 && h < 19.8) ? '🌇' : '🌙';
}

export function TopBar() {
  const connection = useStore((s) => s.connection);
  const claudeDir = useStore((s) => s.claudeDir);
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
  const dir = claudeDir.replace(/\\/g, '/').replace(/^.*\/(\.claude\/.*)$/, '~/$1');

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-logo">🏢</span>
        <div>
          <b>Claude Office</b>
          <small>watch your agents at work</small>
        </div>
      </div>
      <div className="topbar-right">
        <span className={`pill pill-${connection}`} title={claudeDir}>
          <i className="pill-dot" />
          {connection === 'live' ? (liveRooms ? `Live · ${liveRooms} session${liveRooms > 1 ? 's' : ''}` : 'Live · idle') : connection === 'connecting' ? 'Connecting…' : 'Monitor offline'}
          {connection === 'live' && dir ? <em>{dir}</em> : null}
        </span>
        <button className={`btn${demoOn ? ' btn-on' : ''}`} onClick={() => setDemo(!demoOn)} title="Simulated Claude sessions">
          {demoOn ? '⏸ Demo' : '▶ Demo'}
          {demoOn && autoDemo ? <em>auto</em> : null}
        </button>
        <button
          className="btn btn-time"
          onClick={() => setTimeMode(TIME_CYCLE[(TIME_CYCLE.indexOf(timeMode) + 1) % TIME_CYCLE.length])}
          title="Time of day: follows the system clock, click to preview day / dusk / night (N)"
        >
          {timeIcon(hour)} {timeMode === 'auto' ? `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}` : timeMode}
        </button>
        <button className="btn" onClick={() => setShowNames(true)} title="Names for the director and the staff">
          👥 Names{nameCount ? <em>{nameCount}</em> : null}
        </button>
        <button
          className="btn btn-icon"
          onClick={() => {
            setMuted(!muted);
            if (muted) window.setTimeout(() => sfx('ding'), 60);
          }}
          aria-pressed={muted}
          title={muted ? 'Sound effects are off – click to turn them on (M)' : 'Sound effects are on – click to mute (M)'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <button className="btn btn-icon" onClick={resetView} title="Reset camera (R)">⌖</button>
        <button className="btn btn-icon" onClick={() => setHelp(true)} title="Help (?)">?</button>
      </div>
    </header>
  );
}

/** A short, readable name for a session (its title, trimmed) – nothing when it only has a generated id. */
function shortTitle(r: { id: string; title: string; project: string }): string {
  const t = r.title.replace(/\s+/g, ' ').trim();
  if (!t || t === r.id.slice(0, 8) || t === r.project) return '';
  return t.length > 26 ? `${t.slice(0, 25).trimEnd()}…` : t;
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

const FEED_ICON: Record<ActivityEntry['kind'], string> = {
  prompt: '📥', thinking: '💭', text: '💬', tool: '🔧', task: '🧩', done: '✅', report: '📄', system: '🏢', error: '⚠️',
};
const FEED_TOOL_ICON: Record<string, string> = {
  Read: '📖', Edit: '✏️', MultiEdit: '✏️', NotebookEdit: '✏️', Write: '📝', Bash: '⌨️', PowerShell: '⌨️', Grep: '🔍', Glob: '🔍',
  WebFetch: '🌐', WebSearch: '🌐', TodoWrite: '✅', TaskCreate: '✅', TaskUpdate: '✅', Agent: '📨', Task: '📨',
};

/** Everything that happened in the session – requests, thoughts, messages, tool calls, sub-agents, reports – newest first. */
function ActivityFeed({ roomId }: { roomId: string }) {
  const entries = useStore((s) => s.activity[roomId]);
  const [limit, setLimit] = useState(80);
  if (!entries?.length) return <p className="muted">Nothing has happened yet.</p>;
  const shown = entries.slice(0, limit);
  return (
    <>
      {shown.map((e) => (
        <div key={e.id} className={`arow arow-${e.kind}${e.tool === 'failed' ? ' arow-bad' : ''}`}>
          <time>{clockSec(e.at)}</time>
          <span className="arow-icon">{e.kind === 'tool' ? FEED_TOOL_ICON[e.tool ?? ''] ?? '🔧' : e.tool === 'failed' ? '😵' : FEED_ICON[e.kind]}</span>
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
}

/** Full list of the tasks of a room (running ones first), of the reports that were handed over, or of everything that happened. */
function TaskList({ roomId }: { roomId: string }) {
  const tab = useStore((s) => s.listTab);
  const setTab = useStore((s) => s.setListTab);
  const finished = useStore((s) => s.finished[roomId]);
  const tasks = useStore((s) => s.tasks);
  const people = useStore((s) => s.people);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
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
    <div className="tasklist">
      <div className="tasklist-tabs">
        <button className={tab === 'tasks' ? 'on' : ''} onClick={() => setTab('tasks')}>🧩 Tasks</button>
        <button className={tab === 'reports' ? 'on' : ''} onClick={() => setTab('reports')}>📄 Reports</button>
        <button className={tab === 'activity' ? 'on' : ''} onClick={() => setTab('activity')}>🕘 Activity</button>
      </div>
      <div className="tasklist-body">
        {tab === 'activity' ? (
          <ActivityFeed roomId={roomId} />
        ) : tab === 'tasks' ? (
          <>
            {open.length + done.length === 0 ? <p className="muted">No tasks yet.</p> : null}
            {open.map((t) => (
              <div key={t.key} className="trow trow-running">
                <span className="trow-icon">{t.assignee ? (t.done ? '📨' : '⏳') : '🕒'}</span>
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
                <span className="trow-icon">{t.failed ? '😵' : '✅'}</span>
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
                <span className="trow-icon">{t.failed ? '😵' : '📄'}</span>
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

export function RoomHeader() {
  const room = useStore((s) => (s.activeRoomId ? s.rooms[s.activeRoomId] : null));
  const listTab = useStore((s) => s.listTab);
  const toggleList = useStore((s) => s.toggleList);
  const openSummary = useStore((s) => s.openSummary);
  const status = JSON.parse(useRoomStatus()) as Record<string, RoomStatus>;
  if (!room) return null;
  const st = status[room.id] ?? NO_STATUS;
  const theme = themeFor(room.themeIndex);
  return (
    <div className="room-header" style={{ ['--accent' as string]: theme.accent }}>
      <div className="room-header-title">
        <span className="room-header-dot" />
        <b>{room.project}</b>
        {room.demo ? <em className="tag-demo">demo</em> : null}
      </div>
      <div className="room-header-sub" title={room.cwd}>{room.title}</div>
      <div className="room-header-stats">
        <span className={st.working ? 'on' : ''}>{st.working ? '💼 Working' : '☕ Idle'}</span>
        <span>👥 {st.people} in the office</span>
        <button className={`stat-btn${listTab === 'tasks' ? ' open' : ''}`} onClick={() => toggleList('tasks')} aria-pressed={listTab === 'tasks'} title="Tasks of this session (sub-agent runs and the main agent's own work) – click for the full list">
          🧩 Tasks
        </button>
        <button className={`stat-btn${listTab === 'reports' ? ' open' : ''}`} onClick={() => toggleList('reports')} aria-pressed={listTab === 'reports'} title="Reports handed over to the director – click for the full list">
          📄 Reports
        </button>
        <button className={`stat-btn${listTab === 'activity' ? ' open' : ''}`} onClick={() => toggleList('activity')} aria-pressed={listTab === 'activity'} title="Everything that happened in this session, newest first – click again to close">
          🕘 Activity
        </button>
        <button className="stat-btn" onClick={() => openSummary(room.id)} title="The last summary of this session on a sheet of paper (made from what is known so far if no run has finished yet)">📜 Summary</button>
      </div>
      <TaskList roomId={room.id} />
    </div>
  );
}

export function RoomSwitcher() {
  const order = useStore(useShallow(orderedRooms));
  const rooms = useStore((s) => s.rooms);
  const active = useStore((s) => s.activeRoomId);
  const setActive = useStore((s) => s.setActiveRoom);
  const unseen = useStore((s) => s.unseen);
  const status = JSON.parse(useRoomStatus()) as Record<string, RoomStatus>;
  const listRef = useRef<HTMLDivElement>(null);
  // the room that is opened stays in view when the list scrolls
  useEffect(() => {
    listRef.current?.querySelector('.room-card.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  if (!order.length) return null;
  return (
    <nav className="switcher">
      <div className="switcher-list" ref={listRef}>
        {order.map((id, i) => {
          const r = rooms[id];
          if (!r) return null;
          const st = status[id] ?? NO_STATUS;
          const theme = themeFor(r.themeIndex);
          return (
            <button key={id} className={`room-card${id === active ? ' active' : ''}`} style={{ ['--accent' as string]: theme.accent, ['--wall' as string]: theme.wall }} onClick={() => setActive(id)} title={`${r.title}${i < 9 ? ` (${i + 1})` : ''}`}>
              <span className="room-card-swatch">
                <i style={{ background: theme.wall }} />
                <i style={{ background: theme.floor }} />
                <i style={{ background: theme.accent }} />
              </span>
              <span className="room-card-text">
                <b>{i + 1}. {r.project}</b>
                {shortTitle(r) ? <small className="room-card-name">{shortTitle(r)}</small> : null}
                <small>{st.working ? 'working' : 'idle'}</small>
              </span>
              <span className={`room-card-status${st.working ? ' on' : ''}`} />
              {unseen[id] ? <i className="room-card-alert" title="This session is done – click to read its summary" /> : null}
            </button>
          );
        })}
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

/** The few bits of markdown Claude's answers use: headings, bullet / numbered lists, bold, code. */
function MiniMarkdown({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    const items = list;
    out.push(<ul key={`u${out.length}`}>{items.map((l, i) => <li key={i}>{inlineMd(l)}</li>)}</ul>);
    list = [];
  };
  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (li) {
      list.push(li[1]);
      return;
    }
    flush();
    if (!line.trim()) return;
    const h = line.match(/^#{1,4}\s+(.*)$/);
    out.push(h ? <h4 key={i}>{inlineMd(h[1])}</h4> : <p key={i}>{inlineMd(line)}</p>);
  });
  flush();
  return <>{out}</>;
}

/** A sheet of paper in the middle of the screen: what the office did in the run that just finished. */
export function SummaryPaper() {
  const roomId = useStore((s) => s.summaryOpen);
  const summary = useStore((s) => (s.summaryOpen ? s.summaries[s.summaryOpen] : undefined));
  const room = useStore((s) => (s.summaryOpen ? s.rooms[s.summaryOpen] : undefined));
  const close = useStore((s) => s.requestCloseSummary);
  const askRelease = useStore((s) => s.askRelease);
  const working = useStore((s) => !!(s.summaryOpen && s.rooms[s.summaryOpen]?.mainActive));
  // a room can only be released while nothing is going on in it
  const idle = useStore((s) => !!s.summaryOpen && !s.rooms[s.summaryOpen]?.mainActive && !Object.values(s.tasks).some((t) => t.sessionId === s.summaryOpen));
  if (!roomId || !summary || !room) return null;
  const failed = summary.tasks.filter((t) => t.failed).length;
  const reports = summary.tasks.filter((t) => t.reported);
  const calls = summary.tasks.filter((t) => t.source === 'main');
  const mix = new Map<string, number>();
  for (const c of calls) mix.set(c.tool || 'other', (mix.get(c.tool || 'other') ?? 0) + 1);
  const callMix = [...mix.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tool, n]) => `${tool.replace(/^mcp__/, '')} ×${n}`).join(' · ');
  return (
    <div className="paper-backdrop" onClick={close}>
      <article className="paper" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Session summary">
        <span className="paper-tape" />
        <button className="paper-close" onClick={close} title="Close (Esc)">×</button>
        <div className="paper-scroll">
          <small className="paper-kicker">{summary.partial ? (working ? '🛠 Session so far' : '📜 Last known state') : '✅ Session summary'}</small>
          <h2>{room.project}</h2>
          <p className="paper-sub">{room.title}</p>
          <div className="paper-stats">
            <span>🕒 {summary.partial ? 'as of' : 'finished'} {clockText(summary.finishedAt)}</span>
            <span>⏱ {durText(summary.finishedAt - summary.startedAt)}</span>
            <span>🧩 {summary.tasks.length} task{summary.tasks.length === 1 ? '' : 's'}{failed ? ` (${failed} failed)` : ''}</span>
            <span>📄 {summary.reports} report{summary.reports === 1 ? '' : 's'}</span>
            <span>👥 {summary.staff} staff</span>
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
                    <b>{t.failed ? '😵 ' : '✓ '}{taskTitle(t)}</b>
                    <small>{t.who} · {sourceText(t)} · {durText(t.finishedAt - t.startedAt)}</small>
                    {t.reported && t.summary ? <p>{t.summary}</p> : null}
                  </li>
                ))}
                {calls.length ? (
                  <li>
                    <b>🔧 {calls.length} tool call{calls.length === 1 ? '' : 's'}</b>
                    <small>{callMix}</small>
                  </li>
                ) : null}
              </ol>
            </section>
          ) : null}
          {reports.length === 0 && summary.tasks.length === 0 ? null : <p className="paper-end">— end of report —</p>}
        </div>
        <div className="paper-foot">
          {idle ? <button className="btn" onClick={askRelease} title="Take this room off the list – continue the session in Claude Code to bring it back">Release room</button> : null}
          <button className="btn btn-big" onClick={close}>Got it</button>
        </div>
      </article>
    </div>
  );
}

/** "Release this room?" – shown from the summary paper (Release button, or closing the paper). */
export function ReleaseConfirm() {
  const ask = useStore((s) => s.releaseAsk);
  const room = useStore((s) => (s.releaseAsk ? s.rooms[s.releaseAsk.roomId] : undefined));
  const cancel = useStore((s) => s.cancelRelease);
  const release = useStore((s) => s.releaseRoom);
  const closePaper = useStore((s) => s.closeSummary);
  if (!ask || !room) return null;
  const onClose = ask.via === 'close';
  return (
    <div className="confirm-backdrop" onClick={cancel}>
      <div className="confirm-card" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-label="Release this room">
        <h3>{onClose ? 'Release this room before you close the summary?' : 'Release this room?'}</h3>
        <p className="confirm-room">🏢 {room.project} <em>{room.title}</em></p>
        <p className="confirm-note">
          ℹ️ Releasing only takes the room off the list. Nothing is deleted – when you <b>continue this session in Claude Code</b>, the room opens again by itself.
          {onClose ? ' If you keep it, the blue dot keeps blinking until you release the room or the session starts working again.' : ''}
        </p>
        <div className="confirm-actions">
          <button className="btn" onClick={onClose ? closePaper : cancel}>{onClose ? 'Keep the room' : 'Cancel'}</button>
          <button className="btn btn-big" onClick={() => release(ask.roomId)}>Release room</button>
        </div>
      </div>
    </div>
  );
}

export function AgentPanel() {
  const key = useStore((s) => s.selectedKey);
  const person = useStore((s) => (s.selectedKey ? s.people[s.selectedKey] : null));
  const log = useStore((s) => (s.selectedKey ? s.logs[s.selectedKey] : undefined));
  const room = useStore((s) => (person ? s.rooms[person.sessionId] : null));
  const select = useStore((s) => s.select);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 400);
    return () => clearInterval(t);
  }, []);
  const entries = useMemo<Speech[]>(() => (log ? [...log].reverse().slice(0, 14) : []), [log]);
  const cat = key ? cats.get(key) : undefined;
  if (key && cat && !person) {
    return (
      <aside className="panel panel-cat" style={{ ['--accent' as string]: '#ff9ec4' }}>
        <button className="panel-close" onClick={() => select(null)}>×</button>
        <div className="panel-title">
          <span className="panel-avatar">🐱</span>
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
    <aside className="panel" style={{ ['--accent' as string]: director ? '#ffb020' : theme.accent }}>
      <button className="panel-close" onClick={() => select(null)}>×</button>
      <div className="panel-title">
        <span className="panel-avatar">{director ? '👑' : '🧑‍💻'}</span>
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
            <span>{ICON[e.kind] ?? '•'}</span>
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
  const claudeDir = useStore((s) => s.claudeDir);
  if (!empty) return null;
  return (
    <div className="empty">
      <div className="empty-card">
        <div className="empty-emoji">🏢💤</div>
        <h2>The office is empty</h2>
        <p>
          {connection === 'live'
            ? <>Watching <code>{claudeDir || '~/.claude/projects'}</code>. Start Claude Code in any terminal and a room will appear here.</>
            : connection === 'connecting'
              ? 'Connecting to the transcript monitor…'
              : 'The monitor is not reachable (run with npm run dev or npm start).'}
        </p>
        <button className="btn btn-big" onClick={() => setDemo(true)}>▶ Watch a demo</button>
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
  return (
    <div className="modal" onClick={() => setShow(false)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="panel-close" onClick={() => setShow(false)}>×</button>
        <h2>👥 Names</h2>
        <p className="muted">
          One name per line (or separated by commas). The director and every staff member get a random name from this list – no two people in a room share a name.
          The list is saved in this browser and reused for every room and every run. When it runs out, common English names such as {FALLBACK_NAMES.slice(0, 4).join(', ')}… are used.
        </p>
        <textarea
          className="names-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Mai\nLinh\nNam\nHuy\nTrang'}
          rows={9}
          spellCheck={false}
          autoFocus
        />
        <div className="names-row">
          <span className="muted">{parsed.length} name{parsed.length === 1 ? '' : 's'}</span>
          <span className="names-actions">
            <button className="btn" onClick={() => setText('')}>Clear</button>
            <button className="btn btn-big" onClick={save}>Save</button>
          </span>
        </div>
      </div>
    </div>
  );
}

export function Help() {
  const show = useStore((s) => s.showHelp);
  const setHelp = useStore((s) => s.setHelp);
  if (!show) return null;
  return (
    <div className="modal" onClick={() => setHelp(false)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="panel-close" onClick={() => setHelp(false)}>×</button>
        <h2>How the office works</h2>
        <ul>
          <li>🏢 Every Claude Code <b>session</b> gets its own <b>room</b>. Rooms appear when a session is active and disappear after it has been quiet for a while.</li>
          <li>👑 The <b>director</b> is in the office for as long as the session works. They voice the main agent (prompt, thoughts, delegating) and walk out last, when everything is finished.</li>
          <li>🧩 Characters are not agents any more: every <b>task</b> is done by one <b>staff member</b> – a sub-agent run, or one tool call (of the main agent or of a sub-agent). Staff walk in, unpack their laptop, type, and show what they are doing in speech bubbles. A bubble stays until they do something else – on a break a thought cloud says what they are up to (which book they read, that they get a drink…).</li>
          <li>🔁 The staff <b>take turns</b>: whoever has rested longest gets the next task. When a sub-agent&apos;s task is done they hand the report to the director, then stay at their desk, sit on the sofa or pet a cat until the next task comes round.</li>
          <li>🚪 When the session has no work left, the staff and the director go home one after another.</li>
          <li>🔊 Soft sound effects (a door, key clicks, a pop for every speech bubble, a chime when a session is finished, sizzling noodles…) only for the room on screen – no music. The speaker button (or <kbd>M</kbd>) mutes them; the choice is saved in this browser.</li>
          <li>💼 A new task never sends anybody back to their desk: whoever is on a break works on it right where they stand (or sit) and goes on with the break afterwards – after a report to the director they walk back to what they were doing. Somebody with nothing to do shows no speech bubble, only their name tag. Chats and greetings are spoken (round speech bubbles), what they plan to do is a thought cloud.</li>
          <li>👋 Everybody who walks in greets the room first; the job they came for shows up five seconds later.</li>
          <li>☕ Whoever has nothing to do takes a break: strolls around, sits on the sofa, watches a colleague work, looks out of the window, pets a cat, gets a drink, reads a book, watches the fish, washes their face, waters the plants, cooks noodles at the stove and eats them on the spot, or chats with a colleague at their desk. Breaks are long and far apart, so nobody is busy with one thing after another. The thought bubble goes away the moment the break is over.</li>
          <li>🧩 The header buttons Tasks / Reports / Activity open the full list – the Activity tab is open by default (the activity feed is everything that happened, newest first), click again to close it. 📜 Summary always shows the last summary of the session on a sheet of paper.</li>
          <li>🗂️ The room buttons in the column on the right (working sessions first, then the most recently updated; it scrolls when there are many) keep every session until you <b>release</b> it (from the summary paper: Release room, or when you close the paper). Releasing only takes the room off the list – continue the session in Claude Code and the room opens again. A session that has stood still for an hour is released automatically.</li>
          <li>🔵 When a session has finished all its work the director reads the summary aloud in their speech bubble (two lines at a time) and only goes home after the last line. A blinking blue dot in the top-left corner of the room button means the summary is still unread. Whenever you step into a room whose session is done, its summary lies on the screen as a sheet of paper (📜 Summary in the header brings it back). The dot keeps blinking until you release the room or the session starts working again.</li>
          <li>🐱 Every room has 1–2 cats. They hop in through the open sash of a window, wander, nap on the sofa or the director&apos;s desk and hop out again whenever they like.</li>
          <li>👥 Use the <b>Names</b> button to give the director and the staff real names (saved in this browser, unique inside a room, common English names are used when the list runs out).</li>
          <li>🌙 Light follows your system clock: the sky darkens in the evening and every room switches its lights on.</li>
        </ul>
        <h3>Controls</h3>
        <ul className="keys">
          <li><kbd>←</kbd> <kbd>→</kbd> or <kbd>1</kbd>–<kbd>9</kbd> switch room</li>
          <li>Drag = rotate · Wheel = zoom · <kbd>R</kbd> = reset camera</li>
          <li>Click a character to see its log · <kbd>Esc</kbd> to close</li>
          <li><kbd>D</kbd> toggles the demo · <kbd>N</kbd> previews day / dusk / night</li>
        </ul>
      </div>
    </div>
  );
}
