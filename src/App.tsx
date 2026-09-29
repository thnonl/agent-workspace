import { useEffect, useMemo } from 'react';
import { Scene } from './scene/Scene';
import { BubbleLayer } from './ui/BubbleLayer';
import { AgentPanel, EmptyState, Help, NamesDialog, RoomHeader, ReleaseConfirm, RoomSwitcher, SummaryPaper, TopBar } from './ui/Overlay';
import { localHour, useStore } from './store';
import { celestial, envForHour, skyColors } from './env';
import { connectLive } from './live/connection';
import { startDemo } from './demo/simulator';
import { themeFor } from './world/palettes';

function useLiveConnection() {
  useEffect(() => connectLive(), []);
}

function useDemo() {
  const demoOn = useStore((s) => s.demoOn);
  useEffect(() => {
    if (!demoOn) return;
    const stop = startDemo((ev) => useStore.getState().applyEvent(ev, true));
    return () => {
      stop();
      useStore.getState().clearDemo();
    };
  }, [demoOn]);

  // No live session shortly after start-up? Show the demo so the page is never blank.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('demo')) {
      useStore.getState().setDemo(true);
      return;
    }
    if (params.has('nodemo')) return;
    const t = setTimeout(() => {
      const s = useStore.getState();
      if (!s.demoOn && s.visibleOrder.length === 0) {
        s.setAutoDemo(true);
        s.setDemo(true);
      }
    }, 2500);
    return () => clearTimeout(t);
  }, []);

  // ...and get out of the way as soon as a real session shows up.
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (s.autoDemo && s.demoOn && s.visibleOrder.length !== prev.visibleOrder.length) {
          if (s.visibleOrder.some((id) => !s.rooms[id].demo)) {
            s.setAutoDemo(false);
            s.setDemo(false);
          }
        }
      }),
    [],
  );
}

/** Follows the system clock (unless the user picked a fixed time of day). */
function useClock() {
  useEffect(() => {
    const q = new URLSearchParams(location.search).get('hour');
    if (q !== null && !Number.isNaN(Number(q))) useStore.getState().setHour(Number(q));
    const t = setInterval(() => {
      const s = useStore.getState();
      if (s.timeMode === 'auto' && new URLSearchParams(location.search).get('hour') === null) s.setHour(localHour());
    }, 15000);
    return () => clearInterval(t);
  }, []);
}

/** Office housekeeping: hands out waiting tasks, closes finished bursts, sends everybody home when the work is over. */
function useOfficeClock() {
  useEffect(() => {
    const t = setInterval(() => useStore.getState().tick(), 250);
    return () => clearInterval(t);
  }, []);
}

const TIME_ORDER = ['auto', 'day', 'dusk', 'night'] as const;

function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const s = useStore.getState();
      if (e.key === 'ArrowRight' || e.key === ']') s.stepRoom(1);
      else if (e.key === 'ArrowLeft' || e.key === '[') s.stepRoom(-1);
      else if (e.key >= '1' && e.key <= '9') {
        const id = s.visibleOrder[Number(e.key) - 1];
        if (id) s.setActiveRoom(id);
      } else if (e.key === 'Escape') {
        s.select(null);
        s.requestCloseSummary();
        s.setHelp(false);
        s.setShowNames(false);
      } else if (e.key === 'r' || e.key === 'R') s.resetView();
      else if (e.key === 'd' || e.key === 'D') s.setDemo(!s.demoOn);
      else if (e.key === 'n' || e.key === 'N') s.setTimeMode(TIME_ORDER[(TIME_ORDER.indexOf(s.timeMode) + 1) % TIME_ORDER.length]);
      else if (e.key === '?') s.setHelp(!s.showHelp);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function App() {
  useLiveConnection();
  useDemo();
  useHotkeys();
  useClock();
  useOfficeClock();
  const themeIndex = useStore((s) => (s.activeRoomId ? s.rooms[s.activeRoomId]?.themeIndex : 0) ?? 0);
  const hour = useStore((s) => s.hour);
  const e = useMemo(() => envForHour(hour), [hour]);
  const [sky1, sky2] = skyColors(themeFor(themeIndex).sky, e);
  const body = celestial(hour);
  const stars = useMemo(() => Array.from({ length: 70 }, (_, i) => ({ x: (i * 37.7) % 100, y: (i * 53.3) % 62, s: 1 + ((i * 7) % 3), d: (i * 0.37) % 4 })), []);
  return (
    <div
      className={`app${e.night > 0.55 ? ' is-night' : ''}`}
      style={{ ['--sky1' as string]: sky1, ['--sky2' as string]: sky2, ['--night' as string]: e.night.toFixed(3), ['--warm' as string]: e.warm.toFixed(3) }}
    >
      <div className="sky">
        <div className="stars">
          {stars.map((st, i) => (
            <i key={i} style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s, animationDelay: `${st.d}s` }} />
          ))}
        </div>
        <i className={`orb orb-${body.kind}`} style={{ left: `${body.x * 100}%`, top: `${body.y * 100}%`, opacity: body.alpha }} />
        <i className="cloud c1" />
        <i className="cloud c2" />
        <i className="cloud c3" />
      </div>
      <div className="stage">
        <Scene />
      </div>
      <BubbleLayer />
      <TopBar />
      <RoomHeader />
      <AgentPanel />
      <RoomSwitcher />
      <EmptyState />
      <Help />
      <NamesDialog />
      <SummaryPaper />
      <ReleaseConfirm />
    </div>
  );
}
