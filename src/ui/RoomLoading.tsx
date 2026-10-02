import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { frame } from '../sim/frame';

/** the note only shows when the build takes a moment: a room that was loaded ahead (or a quick one) never flashes it */
const SHOW_AFTER_MS = 250;
const POLL_MS = 120;

/**
 * "Setting up the room…": a small note with a progress bar while the room on screen is still being built (it was not loaded ahead).
 * The 3D side keeps its build state in `frame` (outside React), so this looks at it a few times per second.
 */
export function RoomLoading() {
  const activeId = useStore((s) => s.activeRoomId);
  const hidden = useStore((s) => s.cinema || s.pip);
  const [state, setState] = useState<{ progress: number; people: boolean } | null>(null);
  useEffect(() => {
    setState(null);
    if (!activeId || hidden) return;
    const since = performance.now();
    const t = setInterval(() => {
      const b = frame.buildStage.get(activeId);
      const loading = frame.mountedRooms.has(activeId) && !frame.readyRooms.has(activeId);
      const next = loading && performance.now() - since >= SHOW_AFTER_MS ? { progress: b?.progress ?? 0, people: b?.people ?? false } : null;
      setState((cur) => (cur === next || (cur && next && cur.progress === next.progress && cur.people === next.people) ? cur : next));
      if (frame.readyRooms.has(activeId)) clearInterval(t);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [activeId, hidden]);
  if (!state) return null;
  const pct = Math.round(state.progress * 100);
  return (
    <div className="room-loading" role="status" aria-live="polite">
      <span className="room-loading-text">{state.people ? 'The team is coming in…' : 'Setting up the room…'}</span>
      <span className="room-loading-bar" aria-hidden="true">
        <b style={{ width: `${Math.max(6, pct)}%` }} />
      </span>
    </div>
  );
}
