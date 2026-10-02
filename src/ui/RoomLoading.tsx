import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { frame } from '../sim/frame';

/** the note only shows when the build takes a moment: a room that was loaded ahead (or a quick one) never flashes it */
const SHOW_AFTER_MS = 250;
const POLL_MS = 120;
/** once the room is built the full bar stays up this long (the bar fills in 0.25 s, see .room-loading-bar), then the note goes */
const DONE_HOLD_MS = 400;

/**
 * "Setting up the room…": a small note with a progress bar while the room on screen is still being built (it was not loaded ahead).
 * It follows the room itself – walls, furniture, the things in it – and goes as soon as that is done (the people and cats walking in
 * afterwards are no loading). The 3D side keeps its build state in `frame` (outside React), so this looks at it a few times per second.
 */
export function RoomLoading() {
  const activeId = useStore((s) => s.activeRoomId);
  const hidden = useStore((s) => s.cinema || s.pip);
  const [progress, setProgress] = useState<number | null>(null);
  useEffect(() => {
    setProgress(null);
    if (!activeId || hidden) return;
    const since = performance.now();
    let shown = false;
    let doneAt = 0;
    const t = setInterval(() => {
      const now = performance.now();
      const p = frame.readyRooms.has(activeId) ? 1 : frame.buildStage.get(activeId)?.progress ?? 0;
      let next: number | null = null;
      if (p < 1) {
        if (frame.mountedRooms.has(activeId) && now - since >= SHOW_AFTER_MS) {
          next = p;
          shown = true;
        }
      } else {
        // built: the bar shows 100 % for a moment (only if the note was up at all), then the note goes
        if (!doneAt) doneAt = now;
        if (shown && now - doneAt < DONE_HOLD_MS) next = 1;
        else clearInterval(t);
      }
      setProgress(next);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [activeId, hidden]);
  if (progress === null) return null;
  const pct = Math.round(progress * 100);
  return (
    <div className="room-loading" role="status" aria-live="polite">
      <span className="room-loading-text">{pct >= 100 ? 'Room ready' : 'Setting up the room…'}</span>
      <span className="room-loading-bar" aria-hidden="true">
        <b style={{ width: `${Math.max(6, pct)}%` }} />
      </span>
    </div>
  );
}
