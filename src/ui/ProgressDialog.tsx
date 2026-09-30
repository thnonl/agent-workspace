import { ACHIEVEMENTS, levelOf, UNLOCKS, useProgress } from '../progress';
import { Dialog } from './Dialog';
import { Icon } from './Icon';

const fmt = (n: number) => n.toLocaleString('en-US');

/** The button in the top bar: level and title; it opens the dialog. */
export function LevelChip() {
  const xp = useProgress((s) => s.xp);
  const setOpen = useProgress((s) => s.setOpen);
  const lv = levelOf(xp);
  return (
    <button className="btn btn-level btn-extra" onClick={() => setOpen(true)} title={`${lv.title} – level ${lv.level}. Achievements and stats (L)`} aria-label={`Level ${lv.level}, ${lv.title}. Open achievements`}>
      <Icon name="trophy" size={18} />
      <span className="lbl">Lv {lv.level}</span>
      <i className="level-bar" aria-hidden="true"><b style={{ width: `${Math.round((lv.into / lv.need) * 100)}%` }} /></i>
    </button>
  );
}

export function ProgressDialog() {
  const open = useProgress((s) => s.open);
  const setOpen = useProgress((s) => s.setOpen);
  const stats = useProgress((s) => s.stats);
  const xp = useProgress((s) => s.xp);
  const unlocked = useProgress((s) => s.unlocked);
  if (!open) return null;
  const close = () => setOpen(false);
  const lv = levelOf(xp);
  const done = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length;
  const rows: [string, number][] = [
    ['Tasks finished', stats.tasks],
    ['Reports handed over', stats.reports],
    ['Runs completed', stats.runs],
    ['Commits', stats.commits],
    ['Pushes', stats.pushes],
    ['Cats petted', stats.pets],
    ['Days at work', stats.days.length],
    ['Longest run (min)', stats.longestRun],
  ];
  return (
    <Dialog backdrop="modal" card="modal-card modal-progress" label="Achievements" onClose={close}>
      <button className="panel-close" onClick={close} aria-label="Close" title="Close (Esc)"><Icon name="x" size={16} /></button>
      <h2><Icon name="trophy" size={22} /> {lv.title} · level {lv.level}</h2>
      <div className="xp" role="progressbar" aria-valuemin={0} aria-valuemax={lv.need} aria-valuenow={lv.into} aria-label="Experience">
        <b style={{ width: `${Math.round((lv.into / lv.need) * 100)}%` }} />
      </div>
      <p className="muted">
        {fmt(xp)} XP in total{lv.level < 30 ? ` · ${fmt(lv.need - lv.into)} more to level ${lv.level + 1}` : ''}. Tasks, reports, finished runs, commits and pushes earn experience (real sessions only, not the demo).
      </p>
      <ul className="unlocks">
        {UNLOCKS.map((u) => (
          <li key={u.level} className={lv.level >= u.level ? 'on' : ''}>
            <Icon name={lv.level >= u.level ? 'check-circle' : 'hourglass'} size={15} /> Level {u.level}: {u.text}
          </li>
        ))}
      </ul>
      <h3>Stats</h3>
      <dl className="stat-grid">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dd>{fmt(v)}</dd>
            <dt>{k}</dt>
          </div>
        ))}
      </dl>
      <h3>Achievements · {done} / {ACHIEVEMENTS.length}</h3>
      <ul className="ach-grid">
        {ACHIEVEMENTS.map((a) => {
          const [now, goal] = a.goal(stats);
          const got = !!unlocked[a.id];
          return (
            <li key={a.id} className={got ? 'got' : ''}>
              <span className="ach-ico"><Icon name={a.icon} size={20} /></span>
              <span className="ach-body">
                <b>{a.title}</b>
                <small>{a.text}</small>
                {got ? null : <i className="ach-bar" aria-hidden="true"><b style={{ width: `${Math.round((now / goal) * 100)}%` }} /></i>}
              </span>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
