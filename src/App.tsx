import { lazy, Suspense, useEffect, useMemo } from 'react';
import { BubbleLayer } from './ui/BubbleLayer';
import { AgentPanel, Announcer, EmptyState, Help, NamesDialog, PipContext, RoomHeader, ReleaseConfirm, RoomSwitcher, SummaryPaper, TopBar } from './ui/Overlay';
import { localHour, orderedRooms, switcherShown, useStore } from './store';
import { celestial, envForHour, skyColors } from './env';
import { connectLive } from './live/connection';
import { startDemo } from './demo/simulator';
import { themeFor } from './world/palettes';
import { sfx, setAudioRoom } from './audio';
import { setAtmosphere } from './music';
import { WeatherLayer } from './ui/WeatherLayer';
import { SettingsDialog } from './ui/Settings';
import { ProgressDialog } from './ui/ProgressDialog';
import { RoomLoading } from './ui/RoomLoading';
import { useProgress } from './progress';
import { Toasts } from './ui/Toasts';
import { UpdateNote } from './ui/UpdateNote';
import { useUpdate } from './update';
import { takePhoto } from './photo';
import { exitPip, togglePip } from './pip';
import { host } from './pipHost';
import { sims } from './sim/registry';
import { WEATHERS } from './weather';
import { OVERCAST } from './weather';

function useLiveConnection() {
  useEffect(() => connectLive(), []);
}

/** A question is waiting for the user and the tab is in the background: the tab title starts with "❓ ". */
function useAskTitle() {
  const pending = useStore((s) => Object.keys(s.asks).length > 0);
  useEffect(() => {
    const plain = () => document.title.replace(/^❓ /, '');
    const apply = () => {
      document.title = pending && document.hidden ? `❓ ${plain()}` : plain();
    };
    apply();
    document.addEventListener('visibilitychange', apply);
    return () => {
      document.removeEventListener('visibilitychange', apply);
      document.title = plain();
    };
  }, [pending]);
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

  // Dev only: no live session shortly after start-up? Show the demo so the page is never blank.
  // A production build never starts the demo by itself (only ?demo or the D key do).
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('demo')) {
      useStore.getState().setDemo(true);
      return;
    }
    if (!import.meta.env.DEV || params.has('nodemo')) return;
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
      if (s.timeMode !== 'auto' || new URLSearchParams(location.search).get('hour') !== null) return;
      // (the clock shows minutes: a change of seconds is not worth a re-render of the page)
      const h = localHour();
      if (Math.floor(h * 60) !== Math.floor(s.hour * 60)) s.setHour(h);
    }, 15000);
    return () => clearInterval(t);
  }, []);
}

/** Sound effects: only the room on screen is heard; a sheet of paper rustles when it is laid down. */
function useSounds() {
  useEffect(() => {
    setAudioRoom(useStore.getState().activeRoomId);
    let paper = useStore.getState().summaryOpen;
    return useStore.subscribe((s) => {
      setAudioRoom(s.activeRoomId);
      if (s.summaryOpen && s.summaryOpen !== paper) sfx('paper');
      paper = s.summaryOpen;
    });
  }, []);
}

/**
 * Screensaver: the buttons fade out and the office tours itself – room after room (the ones at work first), now and then
 * following one character. A click (or Esc) brings everything back.
 */
function useCinema() {
  const cinema = useStore((s) => s.cinema);
  useEffect(() => {
    if (!cinema) return;
    const leave = () => useStore.getState().setCinema(false);
    try {
      void document.documentElement.requestFullscreen?.().catch(() => undefined);
    } catch {
      /* not allowed here: the tour runs in the window */
    }
    const onFs = () => {
      if (!document.fullscreenElement) leave();
    };
    document.addEventListener('fullscreenchange', onFs);
    let armed = false;
    const arm = window.setTimeout(() => (armed = true), 700);
    const onDown = () => armed && leave();
    window.addEventListener('pointerdown', onDown);
    let n = 0;
    const t = window.setInterval(() => {
      n++;
      const s = useStore.getState();
      const ids = orderedRooms(s);
      if (!ids.length) return;
      const phase = n % 24;
      if (phase === 0) {
        const working = ids.filter((id) => s.rooms[id]?.mainActive || Object.values(s.tasks).some((tk) => tk.sessionId === id));
        const pool = working.length ? working : ids;
        const at = pool.indexOf(s.activeRoomId ?? '');
        s.select(null);
        s.setActiveRoom(pool[(at + 1) % pool.length]);
      } else if (phase === 12) {
        const here = [...sims.values()].filter((p) => p.onStage && p.roomId === s.activeRoomId && p.phase !== 'waiting');
        if (here.length) s.select(here[Math.floor(Math.random() * here.length)].key);
      } else if (phase === 21) s.select(null);
    }, 1000);
    return () => {
      window.clearTimeout(arm);
      window.clearInterval(t);
      window.removeEventListener('pointerdown', onDown);
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      useStore.getState().select(null);
    };
  }, [cinema]);
}

/** Lo-fi music (when switched on) and crickets at night follow the clock and the weather. */
function useAtmosphere() {
  useEffect(() => {
    let last = '';
    const apply = (s: ReturnType<typeof useStore.getState>) => {
      const e = envForHour(s.hour);
      const raining = s.weather === 'rain' || s.weather === 'storm';
      const mood = raining ? 'rain' : e.night > 0.6 ? 'night' : e.warm > 0.35 ? 'dusk' : 'day';
      const crickets = !raining && e.night > 0.6 && s.weather !== 'snow' ? 1 : 0;
      const key = `${s.musicOn}|${mood}|${crickets}`;
      if (key === last) return;
      last = key;
      setAtmosphere({ music: s.musicOn, mood, crickets });
    };
    apply(useStore.getState());
    return useStore.subscribe(apply);
  }, []);
}

/** Office housekeeping: hands out waiting tasks, closes finished bursts, sends everybody home when the work is over. */
function useOfficeClock() {
  // (in picture-in-picture mode the floating window's clock runs the office: the page behind it may be hidden and its timers slow)
  const pip = useStore((s) => s.pip);
  useEffect(() => {
    const w = host();
    const t = w.setInterval(() => useStore.getState().tick(), 250);
    return () => w.clearInterval(t);
  }, [pip]);
}

// the 3D scene (three.js, drei, the whole office) loads after the page shell has painted
const Scene = lazy(() => import('./scene/Scene').then((m) => ({ default: m.Scene })));

const TIME_ORDER = ['auto', 'day', 'dusk', 'night'] as const;

function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // browser and system shortcuts (Ctrl+N, Cmd+M, Ctrl+1…) are not ours
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const s = useStore.getState();
      // floating window open: this page only waits; I or Esc bring the office back, nothing else is for the page now
      if (s.pip) {
        if (e.key === 'i' || e.key === 'I' || e.key === 'Escape') exitPip();
        return;
      }
      const el = e.target as HTMLElement | null;
      const typing = el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.tagName === 'SELECT' || !!el?.isContentEditable;
      if (typing) {
        // while typing only Esc counts (it closes the dialog the text is in)
        if (e.key === 'Escape') {
          s.requestCloseSummary();
          s.setHelp(false);
          s.setShowNames(false);
          s.setShowSettings(false);
          useProgress.getState().setOpen(false);
          useUpdate.getState().setOpen(false);
        }
        return;
      }
      if (e.key === 'ArrowRight' || e.key === ']') s.stepRoom(1);
      else if (e.key === 'ArrowLeft' || e.key === '[') s.stepRoom(-1);
      else if (e.key >= '1' && e.key <= '9') {
        const id = orderedRooms(s)[Number(e.key) - 1];
        if (id) s.setActiveRoom(id);
      } else if (e.key === 'Escape') {
        s.setCinema(false);
        s.setShowSettings(false);
        useProgress.getState().setOpen(false);
        useUpdate.getState().setOpen(false);
        s.select(null);
        s.requestCloseSummary();
        s.setHelp(false);
        s.setShowNames(false);
      } else if (e.key === 'r' || e.key === 'R') s.resetView();
      else if (e.key === 'd' || e.key === 'D') s.setDemo(!s.demoOn);
      else if (e.key === 'n' || e.key === 'N') s.setTimeMode(TIME_ORDER[(TIME_ORDER.indexOf(s.timeMode) + 1) % TIME_ORDER.length]);
      else if (e.key === 'm' || e.key === 'M') s.setMuted(!s.muted);
      else if (e.key === 'k' || e.key === 'K') s.setMusicOn(!s.musicOn);
      else if (e.key === 'p' || e.key === 'P') takePhoto();
      else if (e.key === 'c' || e.key === 'C') s.setCinema(!s.cinema);
      else if (e.key === 'i' || e.key === 'I') togglePip();
      else if (e.key === 'l' || e.key === 'L') useProgress.getState().setOpen(!useProgress.getState().open);
      else if (e.key === 'w' || e.key === 'W') s.setWeatherMode(WEATHERS[(WEATHERS.indexOf(s.weather) + 1) % WEATHERS.length]);
      else if (e.key === '?') s.setHelp(!s.showHelp);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/**
 * Everything on the page that takes no props from App. It is built once: when App re-renders (time of day, weather, screensaver...)
 * React sees the same element and leaves the scene, the bubbles and all panels alone (they follow the store on their own).
 */
const LAYERS = (
  <>
    <WeatherLayer />
    <main className="stage" aria-label="3D office: every session of your agents is a room with a director, staff and cats. Use the session list and the buttons to follow them.">
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </main>
    <BubbleLayer />
    <RoomLoading />
    <div className="hud-top">
      <TopBar />
      <RoomHeader />
    </div>
    <AgentPanel />
    <RoomSwitcher />
    <EmptyState />
    <Help />
    <NamesDialog />
    <SummaryPaper />
    <ReleaseConfirm />
    <SettingsDialog />
    <ProgressDialog />
    <UpdateNote />
    <Toasts />
    <Announcer />
  </>
);

export default function App() {
  useLiveConnection();
  useAskTitle();
  useDemo();
  useHotkeys();
  useClock();
  useOfficeClock();
  useSounds();
  useCinema();
  useAtmosphere();
  const themeIndex = useStore((s) => (s.activeRoomId ? s.rooms[s.activeRoomId]?.themeIndex : 0) ?? 0);
  const hour = useStore((s) => s.hour);
  const e = useMemo(() => envForHour(hour), [hour]);
  const [sky1, sky2] = skyColors(themeFor(themeIndex).sky, e);
  const body = celestial(hour);
  const weather = useStore((s) => s.weather);
  const showList = useStore((s) => switcherShown(s) && s.visibleOrder.length > 0);
  const hasRooms = useStore((s) => s.visibleOrder.length > 0);
  const hudFolded = useStore((s) => s.hudFolded);
  const cinema = useStore((s) => s.cinema);
  const pip = useStore((s) => s.pip);
  const stars = useMemo(() => Array.from({ length: 70 }, (_, i) => ({ x: (i * 37.7) % 100, y: (i * 53.3) % 62, s: 1 + ((i * 7) % 3), d: (i * 0.37) % 4 })), []);
  return (
    <div
      className={`app wx-${weather}${e.night > 0.55 ? ' is-night' : ''}${showList ? ' has-list' : ''}${hasRooms ? ' has-rooms' : ''}${hudFolded ? ' hud-folded' : ''}${cinema || pip ? ' cinema' : ''}${pip ? ' pip' : ''}`}
      style={{ ['--sky1' as string]: sky1, ['--sky2' as string]: sky2, ['--night' as string]: e.night.toFixed(3), ['--warm' as string]: e.warm.toFixed(3), ['--wx' as string]: OVERCAST[weather] }}
    >
      <div className="sky">
        <div className={`stars${e.night < 0.1 ? ' stars-idle' : ''}`}>
          {stars.map((st, i) => (
            <i key={i} style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s, animationDelay: `${st.d}s` }} />
          ))}
        </div>
        <i className={`orb orb-${body.kind}`} style={{ left: `${body.x * 100}%`, top: `${body.y * 100}%`, opacity: body.alpha * (1 - 0.9 * OVERCAST[weather]) }} />
        <i className="cloud c1" />
        <i className="cloud c2" />
        <i className="cloud c3" />
        <i className="cloud cx c4" />
        <i className="cloud cx c5" />
        <i className="cloud cx c6" />
        <i className="sky-fog" />
      </div>
      {LAYERS}
      {pip ? <PipContext /> : null}
      {cinema ? <div className="cinema-hint" role="note">Screensaver · click or press Esc to leave</div> : null}
    </div>
  );
}
