import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, addAfterEffect, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { offlineRoom, useStore } from '../store';
import { getLayout } from '../world/layout';
import { anchors, cats, catsInRoom, simsInRoom, view } from '../sim/registry';
import { afterRender, frame, GLIDE_MAX_MS, PRELOAD_ROOMS, PRE_ROLL_MS } from '../sim/frame';
import { env, envForHour, stepEnv } from '../env';
import { OVERCAST } from '../weather';
import { photoHooks } from '../photo';
import { floatingWindow } from '../pipHost';
import { lightParams } from './lighting';
import { litOf, roomLit, updateGlow, viewLit } from './glow';
import { RoomView, roomOrigin } from './RoomView';
import { GhostFloor } from './RoomGhost';

const AZIMUTH = 0.72;
/** when frame.loading was last worked out in full (ms) */
let loadingAt = 0;
const POLAR = 0.8;
/** frame rate while nothing moves in the active room (a calm office is not worth a laptop fan; still well above the background rooms' tick rate) */
const IDLE_FPS = 12;
/** ...a bit more while somebody sits with something to see (music, a video, a game…) */
const LIVELY_FPS = 18;
/** ...and when nobody has touched the page for CALM_AFTER ms it drops to this (only the slow decor is left to draw) */
const CALM_FPS = 6;
const CALM_LIVELY_FPS = 10;
const CALM_AFTER = 15_000;
const EVICT_CHECK = 2_000;
/**
 * The room on screen is built completely. Once it is, the next rooms of the room list (a question first, then unread summaries, then
 * the working rooms, in the order of arrival) are loaded ahead, one at a time, up to PRELOAD_ROOMS: the room itself, but never its
 * cats and people – they come when the room is looked at. Every other session only exists in the store (its tasks go on, see
 * headlessRoom in store.ts).
 */
/** pause between two rooms that are loaded ahead (ms) */
const PRELOAD_GAP = 1500;
/** a built room that is neither the active one nor among the preloaded ones stays this long (ms) – a glance at the next room and back must not rebuild it – unless the camera sees it */
const OVER_BUDGET_MS = 8_000;
/** frame rate of each quality level while characters move but the camera does not (the app usually sits on a second screen) */
const BUSY_FPS = { low: 30, medium: 48, high: 60 } as const;
/** a frame may come this much (ms) before its slot: animation frame timestamps jitter a little */
const PACE_SLACK = 2;
/** the render resolution is lowered when the busy scene cannot hold this frame rate */
const LOW_FPS = 40;
const HIGH_FPS = 57;
const MIN_DPR = 1;
/** busy frames (BUSY_FPS per second when all is well) that come in slower than this share of it for SLOW_WINDOWS windows of SLOW_WINDOW seconds lower the resolution */
const SLOW_SHARE = 2 / 3;
const SLOW_WINDOW = 3;
const SLOW_WINDOWS = 2;
/** busy windows in a row this close to BUSY_FPS or better raise a lowered resolution again (one step per UP_WINDOWS windows) */
const UP_MARGIN = 3;
const UP_WINDOWS = 4;
/** a resolution that turned out too slow is not tried again for this long (ms): no back and forth between two levels */
const CEIL_MS = 120_000;
/** highest render resolution (device pixels per CSS pixel) of each quality level; the screen's own pixel ratio is the limit anyway */
const QUALITY_DPR = { low: 1, medium: 3, high: 3 } as const;
/**
 * The camera target should get at least this many render pixels per metre. A camera further away (a narrow phone screen, a zoomed-out view)
 * renders above the screen's resolution and the browser scales the picture down: thin edges seen from afar stop looking jagged. A room
 * seen from afar covers less of the screen, so the extra pixels cost less than they seem.
 */
const SHARP_PPM = 110;
/** most extra resolution (per side) and the most render pixels it may lead to, per quality level */
const FAR_MAX = { low: 1, medium: 1.5, high: 2 } as const;
const FAR_PIXELS = { low: 0, medium: 4.8e6, high: 10e6 } as const;
/** the extra resolution moves in steps this big, and only once the camera has been still for FAR_STILL_MS (every change resizes the canvas) */
const FAR_STEP = 0.25;
const FAR_STILL_MS = 400;
/**
 * The render resolution FrameSync settled on (0 before the first frame). The canvas gets it as its `dpr`: R3F sets the resolution back to
 * the canvas prop whenever the canvas re-renders, which used to undo the resolution FrameSync had picked.
 */
let renderDpr = 0;

/** furthest the camera may be pulled back by hand (MIN_ROOM_PX may stop it earlier; framing a room on a narrow screen may go further) */
const MAX_DISTANCE = 80;
/** zooming out by hand stops once the room is this wide on screen (CSS px, at the default angles): never smaller than on a 360 px phone */
const MIN_ROOM_PX = 360;

/** world-space offset of the default room framing (keeps the room clear of the HUD cards); applied by computeActive while the room itself is followed */
const viewShift = new THREE.Vector3();
/** the room the camera frames right now (null while a cat or a person is followed) */
let framedRoom: ReturnType<typeof getLayout> | null = null;
const reduceMotionQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
const reducedMotion = () => !!reduceMotionQuery?.matches;

/** The room's corners (floor + the two visible walls) relative to the camera target (o.x - 0.4, 1.0, o.z + 0.2), in the camera's right / up / back axes at the default angles. */
function roomCorners(layout: ReturnType<typeof getLayout>) {
  const sp = Math.sin(POLAR), cp = Math.cos(POLAR), sa = Math.sin(AZIMUTH), ca = Math.cos(AZIMUTH);
  const n = [sa * sp, cp, ca * sp];
  const r = [ca, 0, -sa];
  const u = [-sa * cp, sp, -ca * cp];
  const hw = layout.width / 2 + 0.35, hd = layout.depth / 2 + 0.35, wh = layout.wallHeight + 0.4;
  const pts: number[][] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pts.push([sx * hw + 0.4, -1, sz * hd - 0.2]);
  pts.push([-hw + 0.4, wh - 1, -hd - 0.2], [hw + 0.4, wh - 1, -hd - 0.2], [-hw + 0.4, wh - 1, hd - 0.2]);
  const rel = pts.map((q) => ({ x: q[0] * r[0] + q[1] * r[1] + q[2] * r[2], y: q[0] * u[0] + q[1] * u[1] + q[2] * u[2], d: q[0] * n[0] + q[1] * n[1] + q[2] * n[2] }));
  return { rel, r, u };
}

/** Camera distance at which the room is `px` CSS pixels wide on a canvas `width` px wide (default angles; solved by bisection). */
function roomDistanceForWidth(layout: ReturnType<typeof getLayout>, fovDeg: number, aspect: number, width: number, px: number): number {
  const { rel } = roomCorners(layout);
  const Tx = Math.tan((fovDeg * Math.PI) / 360) * aspect;
  const wide = (dist: number) => {
    let x0 = 1e9, x1 = -1e9;
    for (const q of rel) {
      const dep = dist - q.d;
      if (dep <= 0.1) return Infinity;
      x0 = Math.min(x0, q.x / (dep * Tx));
      x1 = Math.max(x1, q.x / (dep * Tx));
    }
    return ((x1 - x0) / 2) * width;
  };
  let a = 6, b = 400;
  for (let i = 0; i < 40; i++) {
    const mid = (a + b) / 2;
    if (wide(mid) > px) a = mid;
    else b = mid;
  }
  return a;
}

/**
 * Camera distance and target shift that put the whole room (floor + the two visible walls) inside the part of the
 * screen the HUD leaves free, for the default viewing angles. Solved by bisection on the distance; the room is
 * re-centred in the free area by shifting the target along the camera's right / up axes.
 */
function frameRoom(layout: ReturnType<typeof getLayout>, fovDeg: number, aspect: number, width: number, out: THREE.Vector3, floating = false): number {
  const { rel, r, u } = roomCorners(layout);
  const Ty = Math.tan((fovDeg * Math.PI) / 360), Tx = Ty * aspect;
  // (the floating window has no buttons to keep clear of: the room fills it, a little closer than "everything just fits")
  const m = floating ? 0.01 : 0.05;
  // the HUD cards only cover the top corners: reserve half of their width on wide screens
  const wide = width >= 1100;
  const lo = -1 + (wide ? Math.min(360, width * 0.3) : 0) / width + m;
  const hi = 1 - (wide ? 310 : 0) / width - m;
  const ylo = floating ? -0.97 : -0.86, yhi = floating ? 0.86 : 0.84;
  const cx = (lo + hi) / 2, cy = (ylo + yhi) / 2;
  let sx = 0, sy = 0;
  const test = (dist: number) => {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const q of rel) {
      const dep = dist - q.d;
      if (dep <= 0.1) return false;
      const nx = q.x / (dep * Tx), ny = q.y / (dep * Ty);
      x0 = Math.min(x0, nx); x1 = Math.max(x1, nx); y0 = Math.min(y0, ny); y1 = Math.max(y1, ny);
    }
    sx = (cx - (x0 + x1) / 2) * Tx * dist;
    sy = (cy - (y0 + y1) / 2) * Ty * dist;
    return x1 - x0 <= hi - lo && y1 - y0 <= yhi - ylo;
  };
  let a = 6, b = 200;
  for (let i = 0; i < 40; i++) {
    const mid = (a + b) / 2;
    if (test(mid)) b = mid;
    else a = mid;
  }
  if (floating) b *= 0.85;
  test(b);
  // moving the target by -shift along right/up shifts the picture by +shift
  if (!Number.isFinite(sx + sy + b)) {
    out.set(0, 0, 0);
    return 30;
  }
  out.set(-(r[0] * sx + u[0] * sy), -(r[1] * sx + u[1] * sy), -(r[2] * sx + u[2] * sy));
  return b;
}

/** centre of the active room in world space */
const center = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

function spherical(dist: number, out: THREE.Vector3, az = AZIMUTH, pol = POLAR) {
  return out.set(Math.sin(az) * Math.sin(pol), Math.cos(pol), Math.cos(az) * Math.sin(pol)).multiplyScalar(dist);
}

type StoreState = ReturnType<typeof useStore.getState>;

// The moment the user picks another room – before React has rendered it and long before the camera starts to move – everything stops
// (see frame.settling and the pre-roll of the camera).
useStore.subscribe((s, prev) => {
  if (s.activeRoomId === prev.activeRoomId) return;
  frame.settleFor = s.activeRoomId;
  frame.switchAt = performance.now();
  frame.settling = true;
  // (the camera glides from the room that was left to the new one: only those two are drawn meanwhile)
  frame.fromId = prev.activeRoomId;
  frame.glide = !!prev.activeRoomId && !!s.activeRoomId;
});

/** Writes the centre of the active room (a bit above the floor) into `out`; returns the camera fit distance, 0 when no room is active. */
function computeActive(st: StoreState, out: THREE.Vector3): number {
  const { activeRoomId, rooms, selectedKey, people } = st;
  const room = activeRoomId ? rooms[activeRoomId] : null;
  framedRoom = null;
  if (!room) return 0;
  const o = roomOrigin(room.index);
  // a selected cat / character is followed by the camera, RTS style
  const cat = selectedKey ? cats.get(selectedKey) : undefined;
  if (cat?.onStage && cat.roomId === room.id) {
    out.set(o[0] + cat.x, cat.y + 0.3, o[2] + cat.z);
    return 5.5;
  }
  const sel = selectedKey ? people[selectedKey] : null;
  const anchor = sel && sel.sessionId === room.id ? anchors.get(selectedKey!) : null;
  if (anchor?.live) {
    out.set(anchor.x, 0.85, anchor.z);
    return 13;
  }
  out.set(o[0] - 0.4, 1.0, o[2] + 0.2).add(viewShift);
  framedRoom = getLayout(room.seed, room.themeIndex);
  return framedRoom.fitDistance;
}

/** Center of the active room in world space (used outside the frame loop; inside it read `center`). */
function activeCenter(): { center: THREE.Vector3; fit: number } | null {
  const center = new THREE.Vector3();
  const fit = computeActive(useStore.getState(), center);
  return fit > 0 ? { center, fit } : null;
}

const tmpFrustum = new THREE.Frustum();
const tmpMat = new THREE.Matrix4();
const tmpSphere = new THREE.Sphere();
/** when a background room's decor last animated (performance.now ms) */

/**
 * Runs before everything else in a frame: publishes the shared per-frame facts (`frame`) – the camera
 * target, which rooms are on screen, whether anything moves – and adapts the render resolution to the
 * frame rate.
 */
function FrameSync() {
  const q = useRef({ acc: 0, frames: 0, good: 0, dpr: 0, max: 0, quality: '', bAcc: 0, bFrames: 0, slow: 0, up: 0, ceil: 0, ceilAt: -Infinity, far: 1, farOff: -Infinity, stillAt: 0, native: 0 });
  useFrame((state, dt) => {
    frame.n++;
    frame.at = performance.now();
    const st = useStore.getState();
    const fit = computeActive(st, center);
    frame.hasActive = fit > 0;
    if (fit > 0) frame.fit = fit;

    // which rooms does the camera see?
    const cam = state.camera;
    cam.updateMatrixWorld();
    tmpMat.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    tmpFrustum.setFromProjectionMatrix(tmpMat);
    frame.activeId = st.activeRoomId;
    frame.visibleRooms.clear();
    frame.animRooms.clear();
    // switching rooms: from the moment of the switch nobody moves; once the old room has stopped (PRE_ROLL_MS, the camera starts to glide then) the new room moves
    const tNow = performance.now();
    if (st.activeRoomId !== frame.settleFor) {
      frame.settleFor = st.activeRoomId;
      frame.switchAt = tNow;
      frame.settling = true;
    } else if (frame.settling && tNow - frame.switchAt >= PRE_ROLL_MS) frame.settling = false;
    // the glide is over once the camera has arrived (or after a while, whatever the camera does)
    if (frame.glide && ((!frame.settling && !frame.cameraBusy) || tNow - frame.switchAt > GLIDE_MAX_MS)) frame.glide = false;
    for (const id of st.visibleOrder) {
      const room = st.rooms[id];
      if (!room) continue;
      const o = roomOrigin(room.index);
      const l = getLayout(room.seed, room.themeIndex);
      tmpSphere.center.set(o[0], 2, o[2]);
      tmpSphere.radius = Math.hypot(l.width, l.depth) / 2 + 4;
      if (id === st.activeRoomId || (frame.glide && !frame.settling ? id === frame.fromId : tmpFrustum.intersectsSphere(tmpSphere))) {
        frame.visibleRooms.add(id);
        // (a room that is not the active one stands still: its decor does not animate)
        if (id === st.activeRoomId && !frame.settling) frame.animRooms.add(id);
      }
    }

    // only the active room's movement asks for the busy frame rate; a background room is drawn on the frames that happen anyway
    let dynamic = false;
    let moving = false;
    let lively = false;
    // (the lists of the active room are the ones the people and cats read in this frame too: one pass over everybody serves all)
    const here = st.activeRoomId ? simsInRoom(st.activeRoomId) : [];
    for (const s of here) {
      if (!s.onStage) continue;
      // on the move: on their feet, or in the middle of sitting down / getting up (the rest of the room is loaded only while nobody is)
      if (s.walking || s.phase === 'sitting' || s.phase === 'standing' || (s.sitT > 0.01 && s.sitT < 0.99)) moving = true;
      // (somebody who sits still does not ask for the busy frame rate)
      if (!s.calm) dynamic = true;
      if (s.lively) lively = true;
    }
    if (!dynamic) {
      for (const c of st.activeRoomId ? catsInRoom(st.activeRoomId) : []) {
        if (c.onStage && !c.still) {
          dynamic = true;
          break;
        }
      }
    }
    if (frame.settling) {
      // (everybody stands still: nothing to draw at the busy rate, nobody is on the move)
      dynamic = false;
      moving = false;
    }
    frame.lively = lively && !frame.settling;
    frame.moving = moving;
    frame.loadOk = !moving && !frame.settling && !frame.cameraBusy;
    // (whether a room is left to load only changes when one is added or mounted: no need to look at every frame)
    if (frame.aheadBuilding > 0) frame.loading = !st.pip && !!st.activeRoomId;
    else if (tNow - loadingAt >= 200) {
      loadingAt = tNow;
      frame.loading = !st.pip && !!st.activeRoomId && preloadTargets(st).some((id) => !frame.mountedRooms.has(id));
    }
    if (frame.loading) frame.loadingAt = tNow;
    frame.dynamic = dynamic;
    frame.busy = dynamic || frame.cameraBusy || st.cinema;

    // resolution follows the frame rate, measured only while the scene is busy
    const r = q.current;
    const apply = () => {
      renderDpr = r.dpr * r.far;
      state.setDpr(renderDpr);
    };
    const native = Math.max(1, window.devicePixelRatio || 1);
    if (r.quality !== st.quality || r.native !== native) {
      // first frame, another quality, or the window went to another screen / the page was zoomed: start again from the highest resolution
      // that level allows
      r.quality = st.quality;
      r.native = native;
      r.max = Math.min(native, QUALITY_DPR[st.quality]);
      r.dpr = r.max;
      r.good = 0;
      r.acc = 0;
      r.frames = 0;
      r.up = 0;
      r.ceilAt = -Infinity;
      r.far = 1;
      r.farOff = -Infinity;
      apply();
    }
    const lower = () => {
      r.good = 0;
      r.up = 0;
      // too slow with the extra resolution of a far camera: drop that first, and leave it off for CEIL_MS
      if (r.far > 1) {
        r.far = 1;
        r.farOff = tNow;
        apply();
        return;
      }
      // (remember the level that was too slow: it is not climbed back to for CEIL_MS)
      r.ceil = r.dpr * 0.99;
      r.ceilAt = tNow;
      r.dpr = Math.max(Math.min(MIN_DPR, r.max), r.dpr * 0.85);
      apply();
    };
    const top = () => (tNow - r.ceilAt < CEIL_MS ? Math.min(r.max, r.ceil) : r.max);
    // (only camera drags run uncapped, so only they tell what the GPU can really do)
    if (frame.cameraBusy && dt < 0.1) {
      r.acc += dt;
      r.frames++;
      if (r.acc >= 2.5) {
        const fps = r.frames / r.acc;
        r.acc = 0;
        r.frames = 0;
        if (fps < LOW_FPS && r.dpr > Math.min(MIN_DPR, r.max)) lower();
        else if (fps > HIGH_FPS && r.dpr < top()) {
          if (++r.good >= 3) {
            r.dpr = Math.min(top(), r.dpr * 1.1);
            r.good = 0;
            apply();
          }
        } else r.good = 0;
      }
    } else if (!frame.cameraBusy) {
      r.acc = 0;
      r.frames = 0;
    }
    // the same for the usual busy state (people moving, camera still): this is the frame rate people really see, and a retina screen
    // with a modest GPU cannot always hold it at full resolution. Frames of a room that is still being built do not count.
    // A lowered resolution goes back up step by step while these frames keep their rate (a slow moment must not leave the picture soft).
    if (!frame.cameraBusy && frame.dynamic && frame.building === 0 && !st.pip && dt < 0.5) {
      r.bAcc += dt;
      r.bFrames++;
      if (r.bAcc >= SLOW_WINDOW) {
        const fps = r.bFrames / r.bAcc;
        r.bAcc = 0;
        r.bFrames = 0;
        if (fps < BUSY_FPS[st.quality] * SLOW_SHARE && r.dpr > Math.min(MIN_DPR, r.max)) {
          r.up = 0;
          if (++r.slow >= SLOW_WINDOWS) {
            r.slow = 0;
            lower();
          }
        } else {
          r.slow = 0;
          if (fps >= BUSY_FPS[st.quality] - UP_MARGIN && r.dpr < top()) {
            if (++r.up >= UP_WINDOWS) {
              r.up = 0;
              r.dpr = Math.min(top(), r.dpr * 1.1);
              apply();
            }
          } else r.up = 0;
        }
      }
    } else {
      r.bAcc = 0;
      r.bFrames = 0;
      if (frame.building > 0) r.slow = 0;
    }
    // a far camera: extra resolution, only at the full resolution of the quality level (a lowered one means the GPU has no room for it)
    if (frame.cameraBusy) r.stillAt = tNow;
    else if (tNow - r.stillAt >= FAR_STILL_MS) {
      let want = 1;
      const pc = state.camera as THREE.PerspectiveCamera;
      if (pc.isPerspectiveCamera && r.dpr >= r.max && tNow - r.farOff >= CEIL_MS && !st.pip) {
        const target = (state.controls as { target?: THREE.Vector3 } | null)?.target ?? center;
        const dist = Math.max(0.1, pc.position.distanceTo(target));
        const ppm = (r.dpr * state.size.height * pc.zoom) / (2 * dist * Math.tan((pc.fov * Math.PI) / 360));
        const pixels = state.size.width * state.size.height * r.dpr * r.dpr;
        const most = Math.min(FAR_MAX[st.quality], Math.sqrt(FAR_PIXELS[st.quality] / Math.max(1, pixels)), SHARP_PPM / ppm);
        want = Math.max(1, Math.floor(most / FAR_STEP + 1e-6) * FAR_STEP);
      }
      if (want !== r.far) {
        r.far = want;
        apply();
      }
    }
    // (anything else that set the resolution is undone)
    if (state.viewport.dpr !== renderDpr) state.setDpr(renderDpr);
  }, -100);
  return null;
}

/**
 * The canvas renders on demand. While the camera moves this asks for a frame on every display refresh; while
 * characters of the active room move, BUSY_FPS times per second (by quality); otherwise IDLE_FPS, or CALM_FPS once the page has been
 * left alone for CALM_AFTER (the background rooms tick at most every BACKGROUND_STEP and are drawn by these frames).
 * (Camera drags, resizes and React updates invalidate on their own; a hidden tab gets no animation frames at all.)
 */
/**
 * Paces frames at `fps` on any refresh rate (0 = every refresh). A frame is due once a step has passed since the last slot; slots move on by
 * whole steps, so a rate that does not divide the refresh rate still holds on average (48 per second on a 60 Hz screen = 4 refreshes of
 * every 5). After a longer gap (another rate before, a busy main thread) the slots start again from now.
 */
function pacer() {
  let slot = -Infinity;
  return (t: number, fps: number) => {
    if (fps <= 0) {
      slot = t;
      return true;
    }
    const step = 1000 / fps;
    if (t - slot < step - PACE_SLACK) return false;
    slot = t - slot >= 2 * step ? t : slot + step;
    return true;
  };
}

function IdleGovernor() {
  const invalidate = useThree((s) => s.invalidate);
  const pip = useStore((s) => s.pip);
  useEffect(() => {
    if (pip) return; // (PipDriver draws the frames of the floating window)
    let raf = 0;
    const due = pacer();
    let input = performance.now();
    const touch = () => {
      input = performance.now();
    };
    const events = ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });
    document.addEventListener('visibilitychange', touch);
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const fps = frame.busy ? BUSY_FPS[useStore.getState().quality] : t - input > CALM_AFTER ? (frame.lively ? CALM_LIVELY_FPS : CALM_FPS) : frame.lively ? LIVELY_FPS : IDLE_FPS;
      if (due(t, frame.cameraBusy ? 0 : fps)) invalidate();
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      for (const e of events) window.removeEventListener(e, touch);
      document.removeEventListener('visibilitychange', touch);
    };
  }, [invalidate, pip]);
  return null;
}

/**
 * Picture-in-picture: the page the office came from may be hidden behind other windows, and a hidden page gets no animation frames.
 * So the frames are asked for by the floating window instead: the canvas stops rendering by itself and is advanced from that window's
 * own frame loop, at the same pace the governor above would choose for a screen nobody touches.
 */
function PipDriver() {
  const pip = useStore((s) => s.pip);
  const advance = useThree((s) => s.advance);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const invalidate = useThree((s) => s.invalidate);
  const clock = useThree((s) => s.clock);
  const setSize = useThree((s) => s.setSize);
  const get = useThree((s) => s.get);
  useEffect(() => {
    const w = floatingWindow();
    if (!pip || !w) return;
    setFrameloop('never');
    // (frames queued before the switch would still run, with a timestamp in milliseconds for a clock that counts seconds)
    get().internal.frames = 0;
    // (the canvas measures itself with an observer of the page it was made in, which does not notice the other window: tell it)
    const fit = () => {
      if (w.innerWidth > 8 && w.innerHeight > 8) setSize(w.innerWidth, w.innerHeight);
    };
    fit();
    w.addEventListener('resize', fit);
    let raf = 0;
    let last = 0;
    const due = pacer();
    // (with the frame loop off the clock is set from the time we pass in – in seconds, continuing where the clock stood)
    let seconds = clock.elapsedTime;
    const loop = (t: number) => {
      raf = w.requestAnimationFrame(loop);
      // (the page's own observer reports an empty canvas for a moment after the move, and may do so after this window's first size was set)
      const cur = get().size;
      if (w.innerWidth > 8 && w.innerHeight > 8 && (cur.width !== w.innerWidth || cur.height !== w.innerHeight)) fit();
      if (due(t, frame.cameraBusy ? 0 : frame.busy ? BUSY_FPS[useStore.getState().quality] : frame.lively ? CALM_LIVELY_FPS : CALM_FPS)) {
        const before = seconds;
        seconds += Math.min(0.25, (t - last) / 1000);
        last = t;
        // (R3F hands the frame a delta of "time we pass in minus clock.elapsedTime", and clock.elapsedTime is only ours as long as nobody else
        // touches it. A frame that R3F's own loop had already queued when the mode switched runs with the raw rAF timestamp in ms instead, which
        // leaves elapsedTime at ~100000: the next delta is minus that, the lights and the sky damping compute exp(+huge) = Infinity and fill the
        // scene with NaN – everything black, for good. So state the previous time ourselves before every frame: delta is exactly the step.)
        clock.elapsedTime = before;
        clock.oldTime = performance.now();
        advance(seconds);
      }
    };
    raf = w.requestAnimationFrame(loop);
    return () => {
      w.cancelAnimationFrame(raf);
      w.removeEventListener('resize', fit);
      setFrameloop('demand');
      invalidate();
    };
  }, [pip, advance, setFrameloop, invalidate, clock, setSize, get]);
  return null;
}

function CameraRig() {
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const { camera, size } = useThree();
  const activeRoomId = useStore((s) => s.activeRoomId);
  const fit = useRef({ active: false, dist: 30, snap: true, angles: false });
  const resetTick = useStore((s) => s.resetTick);
  const lastTick = useRef(resetTick);
  const sph = useRef(new THREE.Spherical());
  const focused = useStore((s) => !!s.selectedKey);
  // (the screensaver drifts the camera; the floating window holds still)
  const cinema = useStore((s) => s.cinema);
  const pip = useStore((s) => s.pip);
  const tour = useRef(1);
  /** vertical view shift (px) that keeps the followed character clear of a bottom sheet (the agent panel on a phone) */
  const lift = useRef({ now: 0, want: 0, n: 0 });

  // (on a touch screen the height also changes with the address bar and the keyboard: that is no reason to frame the room again and undo a pinch)
  const framedSize = useRef({ w: size.width, h: size.height });
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const f = framedSize.current;
  if (!touch || Math.abs(size.width - f.w) > 2 || size.width > size.height !== f.w > f.h) {
    f.w = size.width;
    f.h = size.height;
  }

  useEffect(() => {
    const a = activeCenter();
    if (!a) return;
    // (a canvas that was just moved to another window briefly reports no size at all: framing a room into nothing would give a camera of NaNs)
    if (size.width < 8 || size.height < 8) return;
    const aspect = size.width / Math.max(1, size.height);
    if (framedRoom) fit.current.dist = frameRoom(framedRoom, (camera as THREE.PerspectiveCamera).fov, aspect, size.width, viewShift, pip);
    else {
      viewShift.set(0, 0, 0);
      fit.current.dist = a.fit;
    }
    // R / the reset button: back to the default angles too, not only the distance
    if (lastTick.current !== resetTick) {
      lastTick.current = resetTick;
      fit.current.angles = true;
    }
    // zooming out stops once the room is MIN_ROOM_PX wide on screen (also while somebody is followed: the room around them counts)
    const st = useStore.getState();
    const room = st.activeRoomId ? st.rooms[st.activeRoomId] : undefined;
    const layout = framedRoom ?? (room ? getLayout(room.seed, room.themeIndex) : null);
    // (MAX_DISTANCE holds too, unless the framing of a narrow screen is already further away)
    const px360 = layout ? roomDistanceForWidth(layout, (camera as THREE.PerspectiveCamera).fov, aspect, size.width, MIN_ROOM_PX) : MAX_DISTANCE;
    const most = fit.current.dist > MAX_DISTANCE ? px360 : Math.min(MAX_DISTANCE, px360);
    // (never closer than the framing itself: with the limit in the way the framing pushed outwards and the controls pulled back on every
    // single frame, so the picture trembled between the two)
    if (controls.current) controls.current.maxDistance = Math.max(most, fit.current.dist);
    fit.current.active = true;
    frame.cameraBusy = true;
  }, [activeRoomId, resetTick, focused, f.w, f.h, pip]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c || !frame.hasActive) {
      frame.cameraBusy = false;
      return;
    }
    // a room has just been picked: the camera waits for a moment, so that everything has stopped before the picture starts to move
    if (performance.now() - frame.switchAt < PRE_ROLL_MS) {
      frame.cameraBusy = true;
      return;
    }
    // a camera that has ever become NaN stays NaN: start it again from the framing
    if (!Number.isFinite(camera.position.x + c.target.x)) fit.current.snap = true;
    if (fit.current.snap) {
      fit.current.snap = false;
      c.target.copy(center);
      camera.position.copy(center).add(spherical(fit.current.dist, tmpA));
      c.update();
      frame.cameraBusy = true;
      return;
    }
    // screensaver: the camera drifts slowly from side to side (not while a person or a cat is followed)
    if (cinema && !focused && !reducedMotion()) {
      const az = c.getAzimuthalAngle();
      if (az < 0.3) tour.current = -1;
      else if (az > 1.22) tour.current = 1;
      c.autoRotate = true;
      c.autoRotateSpeed = tour.current * 0.7;
    } else c.autoRotate = false;
    const k = reducedMotion() ? 1 : 1 - Math.exp(-3.6 * dt);
    // a bottom sheet hides the lower part of the picture: move the picture up so the character stays in the free part
    const lf = lift.current;
    if (lf.n++ % 12 === 0) {
      const sheet = focused && !framedRoom ? document.querySelector<HTMLElement>('.panel') : null;
      const r = sheet?.getBoundingClientRect();
      // (the character belongs in the middle of what is left free between the top buttons and the sheet)
      const top = document.querySelector('.hud-top')?.getBoundingClientRect().bottom ?? 0;
      lf.want = r && r.width > size.width * 0.8 && r.top > size.height * 0.3 ? Math.max(0, size.height / 2 - (top + r.top) / 2) : 0;
    }
    let shifting = false;
    if (Math.abs(lf.want - lf.now) > 0.5) {
      lf.now += (lf.want - lf.now) * k;
      shifting = true;
    } else lf.now = lf.want;
    const pc = camera as THREE.PerspectiveCamera;
    if (pc.isPerspectiveCamera && (shifting || (pc.view?.enabled ?? false) !== (lf.now > 0.5))) {
      if (lf.now > 0.5) pc.setViewOffset(size.width, size.height, 0, lf.now, size.width, size.height);
      else pc.clearViewOffset();
    }
    const delta = tmpA.copy(center).sub(c.target).multiplyScalar(k);
    c.target.add(delta);
    camera.position.add(delta);
    let moving = delta.lengthSq() > 1e-6;
    if (fit.current.active) {
      moving = true;
      const s = sph.current.setFromVector3(tmpB.copy(camera.position).sub(c.target));
      const len = s.radius;
      s.radius = len + (fit.current.dist - len) * k;
      let anglesDone = true;
      if (fit.current.angles) {
        s.theta += (AZIMUTH - s.theta) * k;
        s.phi += (POLAR - s.phi) * k;
        anglesDone = Math.abs(AZIMUTH - s.theta) < 0.004 && Math.abs(POLAR - s.phi) < 0.004;
        if (anglesDone) {
          s.theta = AZIMUTH;
          s.phi = POLAR;
        }
      }
      camera.position.copy(c.target).add(tmpB.setFromSpherical(s));
      if (Math.abs(fit.current.dist - len) < 0.06 && delta.length() < 0.01 && anglesDone) {
        fit.current.active = false;
        fit.current.angles = false;
      }
    }
    frame.cameraBusy = moving || shifting;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.09}
      rotateSpeed={0.6}
      zoomSpeed={0.8}
      minDistance={3.5}
      maxDistance={MAX_DISTANCE}
      minPolarAngle={0.3}
      maxPolarAngle={1.3}
      minAzimuthAngle={0.12}
      maxAzimuthAngle={1.4}
      onStart={() => {
        fit.current.active = false;
        fit.current.angles = false;
      }}
    />
  );
}

/** Lets the photo button draw a frame on demand (see photo.ts). */
function PhotoSync() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    photoHooks.render = () => {
      const st = get();
      st.gl.render(st.scene, st.camera);
      return st.gl.domElement;
    };
    return () => {
      photoHooks.render = null;
    };
  }, [get]);
  return null;
}

/** Publishes camera + viewport so the HTML overlay can project speech bubbles. */
function ViewSync() {
  const tmp = useRef(new THREE.Vector3());
  useEffect(() => {
    view.project = (x, y, z, out) => {
      const cam = view.camera;
      if (!cam) return;
      const v = tmp.current.set(x, y, z);
      out.dist = cam.position.distanceTo(v);
      v.project(cam);
      out.x = v.x;
      out.y = v.y;
      out.z = v.z;
    };
    // the bubble layout runs right after a frame was drawn
    const stop = addAfterEffect(() => {
      for (const f of afterRender) f();
    });
    return () => {
      stop();
      view.project = null;
    };
  }, []);
  useFrame((state) => {
    view.camera = state.camera;
    view.width = state.size.width;
    view.height = state.size.height;
    if (import.meta.env.DEV) Object.assign(window, { __gl: state.gl, __scene: state.scene });
  });
  return null;
}

/** Dev builds only: `?perf` shows a small statistics panel (perfOverlay.ts). Production drops this component and the module with it. */
function PerfHook() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('perf')) return;
    let stop: (() => void) | undefined;
    let dead = false;
    void import('../perfOverlay').then((m) => {
      if (!dead) stop = m.startPerfOverlay(gl, scene);
    });
    return () => {
      dead = true;
      stop?.();
    };
  }, [gl, scene]);
  return null;
}

/** Feeds the system clock into the damped `env` object and refreshes time-reactive materials. */
function EnvSync() {
  const last = useRef({ lamps: -1, day: -1, night: -1, overcast: -1, lit: -1 });
  useFrame((state, dt) => {
    const st = useStore.getState();
    stepEnv(envForHour(st.hour), Math.min(Math.max(dt, 0), 0.1), OVERCAST[st.weather]);
    syncRoomLit(st, Math.min(Math.max(dt, 0), 0.1));
    const lit = (viewLit.v = litOnView(st, (state.controls as { target?: THREE.Vector3 } | null)?.target));
    const l = last.current;
    // the materials only need a refresh while the time of day (or the weather, or the lights of the room on screen) is actually changing
    if (Math.abs(l.lamps - env.lamps) + Math.abs(l.day - env.day) + Math.abs(l.night - env.night) + Math.abs(l.overcast - env.overcast) + Math.abs(l.lit - lit) > 1e-5) {
      l.lamps = env.lamps;
      l.lit = lit;
      l.day = env.day;
      l.night = env.night;
      l.overcast = env.overcast;
      updateGlow();
    }
  });
  return null;
}

/**
 * The lights the camera looks at (see viewLit): the active room's, or during a glide those of the room that was left and of the new one,
 * mixed by how far the camera has come along the way between them (still the old room's while the camera waits, PRE_ROLL_MS).
 */
function litOnView(st: ReturnType<typeof useStore.getState>, target: THREE.Vector3 | undefined): number {
  const to = litOf(frame.activeId);
  if (!frame.glide || !frame.fromId || !frame.activeId || !target) return to;
  const a = st.rooms[frame.fromId];
  const b = st.rooms[frame.activeId];
  if (!a || !b) return to;
  const oa = roomOrigin(a.index);
  const ob = roomOrigin(b.index);
  const dx = ob[0] - oa[0];
  const dz = ob[2] - oa[2];
  const len2 = dx * dx + dz * dz;
  const p = len2 < 1e-6 ? 1 : Math.min(1, Math.max(0, ((target.x - oa[0]) * dx + (target.z - oa[2]) * dz) / len2));
  const from = litOf(frame.fromId);
  return from + (to - from) * p;
}

/** Somebody is in the room: a person on stage (the room on screen), or one who is present (a room whose people only exist as records). */
function occupied(id: string, present: Set<string>): boolean {
  let hasSims = false;
  for (const s of simsInRoom(id)) {
    if (s.onStage) return true;
    hasSims = true;
  }
  return !hasSims && present.has(id);
}

const presentRooms = new Set<string>();
let presentFor: unknown = null;
/** The lights of every room follow whether anybody is in: the first one in switches them on, the last one out switches them off (quickly, like a switch). */
function syncRoomLit(st: ReturnType<typeof useStore.getState>, dt: number) {
  if (presentFor !== st.people) {
    presentFor = st.people;
    presentRooms.clear();
    for (const p of Object.values(st.people)) if (p.present) presentRooms.add(p.sessionId);
  }
  const k = 1 - Math.exp(-6 * dt);
  for (const id of st.visibleOrder) {
    const target = !offlineRoom(st, id) && occupied(id, presentRooms) ? 1 : 0;
    const cur = roomLit.get(id);
    roomLit.set(id, cur === undefined ? target : Math.abs(target - cur) < 0.002 ? target : cur + (target - cur) * k);
  }
}

/**
 * A fixed pool of warm point lights, moved to the rooms nearest to the camera. Keeping the light
 * count constant avoids shader recompiles; at night every nearby room "switches its lights on".
 */
const POOL = 3;
interface Ranked {
  id: string;
  x: number;
  z: number;
  d: number;
}
function RoomLights() {
  const refs = useRef<(THREE.PointLight | null)[]>([]);
  const owner = useRef<string[]>([]);
  const ranked = useRef<Ranked[]>([]);
  const rankedFor = useRef<{ order: string[] | null; at: number }>({ order: null, at: -99 });
  useFrame((state, dt) => {
    const { rooms, visibleOrder: roomOrder } = useStore.getState();
    // the ranking changes slowly (the camera glides between rooms): refresh it a few times per second
    const rf = rankedFor.current;
    if (rf.order !== roomOrder || frame.n - rf.at >= 10) {
      rf.order = roomOrder;
      rf.at = frame.n;
      const cam = frame.hasActive ? center : state.camera.position;
      ranked.current = roomOrder
        .filter((id) => rooms[id])
        .map((id) => {
          const o = roomOrigin(rooms[id].index);
          return { id, x: o[0], z: o[2], d: Math.hypot(o[0] - cam.x, o[2] - cam.z) };
        })
        .sort((p, q) => p.d - q.d)
        .slice(0, POOL);
    }
    // (a negative or huge delta must never reach exp(): the lights would become NaN and stay so)
    const k = 1 - Math.exp(-5 * Math.min(Math.max(dt, 0), 0.5));
    let on = false;
    for (let i = 0; i < POOL; i++) {
      const l = refs.current[i];
      if (!l) continue;
      const r = ranked.current[i];
      if (r && owner.current[i] !== r.id) {
        owner.current[i] = r.id;
        l.intensity = 0; // fade in again at the new room
        l.position.set(r.x - 0.3, 7.6, r.z + 0.4);
      }
      const target = r ? env.lamps * 22 * (roomLit.get(r.id) ?? 1) : 0;
      l.intensity += (target - l.intensity) * k;
      if (l.intensity > 0.5) on = true;
    }
    // (three leaves invisible lights out, and the number of lights is part of every lit material's shader: the pool is switched on and off as
    // a whole, so there are only two variants to compile - see ShaderWarmUp - and a light that restarts at another room does not add a third)
    for (let i = 0; i < POOL; i++) {
      const l = refs.current[i];
      if (l) l.visible = on;
    }
  });
  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <pointLight key={i} ref={(el) => { refs.current[i] = el; }} color="#ffd9a0" intensity={0} distance={44} decay={1.05} position={[0, 6, 0]} />
      ))}
    </>
  );
}

/** room groups whose materials were compiled already (a rebuilt room is a new group) */
const warmed = new WeakSet<THREE.Object3D>();
/**
 * Three compiles a shader program the first time a material is drawn, which stalls that frame (tens to hundreds of ms on a real GPU).
 * Every room that has become ready is compiled ahead, in both light variants (the warm lamp pool off for the day, on for the night), so
 * dusk, dawn and switching to a room that was loaded ahead do not hitch. Three walks the whole group, hidden or not, so a room the camera
 * does not see is covered too; the lights come from the scene. The call is synchronous (nothing is drawn meanwhile) and cheap for a
 * program that already exists: only the first room of a page load costs real time, the others share almost all programs with it.
 */
function warmUp(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const pool: THREE.PointLight[] = [];
  for (const c of scene.children) if ((c as THREE.PointLight).isPointLight) pool.push(c as THREE.PointLight);
  const was = pool.map((l) => l.visible);
  try {
    for (const c of scene.children) {
      const id = c.userData.room as string | undefined;
      if (!id || warmed.has(c) || !frame.readyRooms.has(id)) continue;
      warmed.add(c);
      for (const on of [false, true]) {
        for (const l of pool) l.visible = on;
        gl.compileAsync(c, camera, scene).catch(() => {});
      }
    }
  } finally {
    pool.forEach((l, i) => (l.visible = was[i]));
  }
}

function ShaderWarmUp() {
  const s = useRef({ ready: 0, pending: false, queued: false });
  useFrame((state) => {
    const r = s.current;
    const n = frame.readyRooms.size;
    if (n > r.ready) r.pending = true;
    r.ready = n;
    // (not while a room is still being built or the camera moves: the compile waits for a quiet moment)
    if (!r.pending || r.queued || frame.building > 0 || frame.cameraBusy) return;
    r.queued = true;
    const { gl, scene, camera } = state;
    const run = () => {
      r.queued = false;
      if (frame.building > 0) return; // (a room was started meanwhile: the next ready room asks again)
      r.pending = false;
      warmUp(gl, scene, camera);
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2000 });
    else setTimeout(run, 300);
  });
  return null;
}

function Lights() {
  const light = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    scene.add(l.target);
    return () => {
      scene.remove(l.target);
    };
  }, [scene]);
  useFrame((_, dt) => {
    const l = light.current;
    if (!l || !frame.hasActive) return;
    const p = lightParams();
    const k = 1 - Math.exp(-4 * Math.min(Math.max(dt, 0), 0.5));
    l.target.position.lerp(center, k);
    l.position.lerp(tmpA.copy(center).add(p.dirOffset), k);
    l.target.updateMatrixWorld();
    l.color.copy(p.dirColor);
    l.intensity = p.dirIntensity;
    if (hemi.current) {
      hemi.current.color.copy(p.hemiSky);
      hemi.current.groundColor.copy(p.hemiGround);
      hemi.current.intensity = p.hemiIntensity;
    }
  });
  return (
    <>
      <hemisphereLight ref={hemi} args={['#ffffff', '#ffd9c4', 1.05]} />
      <directionalLight
        ref={light}
        color="#fff3e2"
        intensity={1.9}
        position={[7, 17, 9]}
      />
    </>
  );
}

/** The rooms that are loaded ahead: the first PRELOAD_ROOMS of the room list after the one on screen. */
function preloadTargets(st: StoreState): string[] {
  const out: string[] = [];
  for (const id of st.listOrder) {
    if (out.length >= PRELOAD_ROOMS) break;
    if (id !== st.activeRoomId && st.rooms[id]) out.push(id);
  }
  return out;
}

/**
 * Takes a built room out of the scene (its meshes, textures and actors are disposed) once it is neither the one on screen nor one
 * of the rooms that are loaded ahead, for OVER_BUDGET_MS, and the camera does not see it. It comes back when it is looked at or
 * loaded ahead again. Runs on a timer, not on frames, so a hidden tab frees its rooms too.
 */
function Evictor({ evict }: { evict: (ids: string[]) => void }) {
  useEffect(() => {
    const overSince = new Map<string, number>();
    const t = setInterval(() => {
      const st = useStore.getState();
      const now = performance.now();
      const keep = new Set(preloadTargets(st));
      const gone: string[] = [];
      for (const id of frame.mountedRooms) {
        if (id === st.activeRoomId || keep.has(id) || frame.visibleRooms.has(id)) {
          overSince.delete(id);
          continue;
        }
        const first = overSince.get(id) ?? now;
        overSince.set(id, first);
        if (now - first >= OVER_BUDGET_MS) gone.push(id);
      }
      for (const id of overSince.keys()) if (!frame.mountedRooms.has(id)) overSince.delete(id);
      if (gone.length) {
        for (const id of gone) {
          overSince.delete(id);
        }
        evict(gone);
      }
    }, EVICT_CHECK);
    return () => clearInterval(t);
  }, [evict]);
  return null;
}

/**
 * Loading ahead: once the room on screen is completely built, the next rooms (see preloadTargets) are put into the scene one at a
 * time – only the room itself, no cats and no people – each after the previous one is built plus PRELOAD_GAP. Nothing is started
 * while the camera moves or the user drags.
 */
function Preload({ mount }: { mount: (id: string) => void }) {
  const gl = useThree((s) => s.gl);
  const s = useRef({ at: 0, down: false });
  useEffect(() => {
    const el = gl.domElement;
    const down = () => (s.current.down = true);
    const up = () => (s.current.down = false);
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
    };
  }, [gl]);
  useFrame(() => {
    const r = s.current;
    const st = useStore.getState();
    const now = performance.now();
    const next = st.pip || !st.activeRoomId ? undefined : preloadTargets(st).find((id) => !frame.mountedRooms.has(id));
    if (!next || !st.activeRoomId || !frame.readyRooms.has(st.activeRoomId)) return;
    // (nothing is loaded ahead while somebody in the room on screen walks, sits down or gets up)
    if (frame.cameraBusy || !frame.loadOk || r.down || frame.building > 0 || now - r.at < PRELOAD_GAP) return;
    r.at = now;
    mount(next);
  });
  return null;
}

/** The base and plain floor of a room that is not built (see GhostFloor): what a room that is not loaded ahead shows until it is opened. */
function RoomBase({ roomId }: { roomId: string }) {
  const index = useStore((s) => s.rooms[roomId]?.index ?? 0);
  const seed = useStore((s) => s.rooms[roomId]?.seed ?? 0);
  const themeIndex = useStore((s) => s.rooms[roomId]?.themeIndex ?? 0);
  const layout = getLayout(seed, themeIndex);
  const group = useRef<THREE.Group>(null);
  // (the same rule as a built room: drawn only while the camera sees it, and during a glide only the two rooms of the glide)
  useFrame(() => {
    const g = group.current;
    if (g) g.visible = frame.visibleRooms.has(roomId);
  });
  return (
    <group ref={group} position={roomOrigin(index)} userData={{ roomBase: roomId }}>
      <GhostFloor layout={layout} />
    </group>
  );
}

/**
 * The bases of the rooms that are not built. They are put in only while nothing else asks for the time (the room on screen is built,
 * the camera is still, nobody in the room walks), one room per frame, so they never take a frame from the room on screen.
 */
function RoomBases({ built }: { built: ReadonlySet<string> }) {
  const roomOrder = useStore((s) => s.visibleOrder);
  const [placed, setPlaced] = useState<ReadonlySet<string>>(() => new Set());
  useFrame(() => {
    const st = useStore.getState();
    if (st.pip || frame.cameraBusy || !frame.loadOk || (st.activeRoomId && !frame.readyRooms.has(st.activeRoomId))) return;
    const next = st.visibleOrder.find((id) => !placed.has(id) && !built.has(id) && st.rooms[id]);
    if (next) setPlaced((v) => new Set(v).add(next));
  });
  return <>{roomOrder.map((id) => (placed.has(id) && !built.has(id) ? <RoomBase key={id} roomId={id} /> : null))}</>;
}

export function Scene() {
  const quality = useStore((s) => s.quality);
  const roomOrder = useStore((s) => s.visibleOrder);
  // rooms are built lazily: a room is put into the scene when it becomes the active one, or when it is loaded ahead (see Preload), and stays a little after that (see Evictor)
  const activeRoomId = useStore((s) => s.activeRoomId);
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set());
  if (activeRoomId && !visited.has(activeRoomId)) setVisited(new Set(visited).add(activeRoomId));
  const preload = useCallback((id: string) => setVisited((v) => (v.has(id) ? v : new Set(v).add(id))), []);
  const evict = useCallback(
    (ids: string[]) =>
      setVisited((v) => {
        const next = new Set(v);
        for (const id of ids) next.delete(id);
        return next.size === v.size ? v : next;
      }),
    [],
  );
  return (
    <Canvas
      frameloop="demand"
      flat
      dpr={renderDpr || [1, QUALITY_DPR[quality]]}
      camera={{ fov: 30, near: 1, far: 400, position: [16, 17, 18] }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      // (the baked rooms keep no CPU copy of their vertices: after a lost WebGL context the page is simply loaded again)
      onCreated={({ gl }) => gl.domElement.addEventListener('webglcontextrestored', () => window.location.reload())}
      onPointerMissed={() => useStore.getState().select(null)}
    >
      <FrameSync />
      <IdleGovernor />
      <PipDriver />
      <ViewSync />
      <PhotoSync />
      <EnvSync />
      <Lights />
      <RoomLights />
      <ShaderWarmUp />
      {import.meta.env.DEV ? <PerfHook /> : null}
      <CameraRig />
      <Evictor evict={evict} />
      <Preload mount={preload} />
      <RoomBases built={visited} />
      {roomOrder.map((id) => (visited.has(id) ? <RoomView key={id} roomId={id} active={id === activeRoomId} /> : null))}
    </Canvas>
  );
}
