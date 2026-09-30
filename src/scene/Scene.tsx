import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, addAfterEffect, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useStore } from '../store';
import { getLayout } from '../world/layout';
import { anchors, cats, sims, view } from '../sim/registry';
import { afterRender, BACKGROUND_STEP, frame } from '../sim/frame';
import { env, envForHour, stepEnv } from '../env';
import { lightParams } from './lighting';
import { updateGlow } from './glow';
import { RoomView, roomOrigin } from './RoomView';

const AZIMUTH = 0.72;
const POLAR = 0.8;
/** frame rate while nothing moves in the active room (a calm office is not worth a laptop fan; still well above the background rooms' tick rate) */
const IDLE_FPS = 12;
/** ...and when nobody has touched the page for CALM_AFTER ms it drops to this (only the slow decor is left to draw) */
const CALM_FPS = 6;
const CALM_AFTER = 15_000;
/** a room that is off screen, not working and empty is taken out of the scene after this long (ms), checked every EVICT_CHECK */
const EVICT_AFTER = 3 * 60_000;
const EVICT_CHECK = 10_000;
/** staged loading: pause after a room reported ready, and after the render resolution had to be lowered (ms) */
const STAGE_GAP = 1500;
const STAGE_DPR_PAUSE = 6000;
/** frame rate while characters move but the camera does not (the app usually sits on a second screen) */
const BUSY_FPS = 30;
/** the render resolution is lowered when the busy scene cannot hold this frame rate */
const LOW_FPS = 40;
const HIGH_FPS = 57;
const MIN_DPR = 1;

/** centre of the active room in world space */
const center = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

function spherical(dist: number, out: THREE.Vector3, az = AZIMUTH, pol = POLAR) {
  return out.set(Math.sin(az) * Math.sin(pol), Math.cos(pol), Math.cos(az) * Math.sin(pol)).multiplyScalar(dist);
}

type StoreState = ReturnType<typeof useStore.getState>;

/** Writes the centre of the active room (a bit above the floor) into `out`; returns the camera fit distance, 0 when no room is active. */
function computeActive(st: StoreState, out: THREE.Vector3): number {
  const { activeRoomId, rooms, selectedKey, people } = st;
  const room = activeRoomId ? rooms[activeRoomId] : null;
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
  out.set(o[0] - 0.4, 1.0, o[2] + 0.2);
  return getLayout(room.seed, room.themeIndex).fitDistance;
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
const lastAnim = new Map<string, number>();
/** performance.now of the last time the render resolution was lowered (staged loading waits after that) */
let dprDropAt = -1e9;

/**
 * Runs before everything else in a frame: publishes the shared per-frame facts (`frame`) – the camera
 * target, which rooms are on screen, whether anything moves – and adapts the render resolution to the
 * frame rate.
 */
function FrameSync() {
  const q = useRef({ acc: 0, frames: 0, good: 0, dpr: 0, max: 0 });
  useFrame((state, dt) => {
    frame.n++;
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
    const nowMs = performance.now();
    for (const id of st.visibleOrder) {
      const room = st.rooms[id];
      if (!room) continue;
      const o = roomOrigin(room.index);
      const l = getLayout(room.seed, room.themeIndex);
      tmpSphere.center.set(o[0], 2, o[2]);
      tmpSphere.radius = Math.hypot(l.width, l.depth) / 2 + 4;
      if (id === st.activeRoomId || tmpFrustum.intersectsSphere(tmpSphere)) {
        frame.visibleRooms.add(id);
        // decor of a background room only animates on the frames of its own (slow) tick
        if (id === st.activeRoomId) frame.animRooms.add(id);
        else if (nowMs - (lastAnim.get(id) ?? 0) >= BACKGROUND_STEP * 1000) {
          lastAnim.set(id, nowMs);
          frame.animRooms.add(id);
        }
      }
    }

    // only the active room's movement asks for the busy frame rate; a background room is drawn on the frames that happen anyway
    let dynamic = false;
    for (const s of sims.values()) {
      if (s.onStage && s.roomId === st.activeRoomId) {
        dynamic = true;
        break;
      }
    }
    if (!dynamic) {
      for (const c of cats.values()) {
        if (c.onStage && !c.still && c.roomId === st.activeRoomId) {
          dynamic = true;
          break;
        }
      }
    }
    frame.dynamic = dynamic;
    frame.busy = dynamic || frame.cameraBusy;

    // resolution follows the frame rate, measured only while the scene is busy
    const r = q.current;
    if (!r.dpr) {
      r.dpr = state.viewport.dpr;
      r.max = state.viewport.initialDpr || state.viewport.dpr;
    }
    // (only camera drags run uncapped, so only they tell what the GPU can really do)
    if (frame.cameraBusy && dt < 0.1) {
      r.acc += dt;
      r.frames++;
      if (r.acc >= 2.5) {
        const fps = r.frames / r.acc;
        r.acc = 0;
        r.frames = 0;
        if (fps < LOW_FPS && r.dpr > Math.min(MIN_DPR, r.max)) {
          r.dpr = Math.max(Math.min(MIN_DPR, r.max), r.dpr * 0.85);
          r.good = 0;
          dprDropAt = performance.now();
          state.setDpr(r.dpr);
        } else if (fps > HIGH_FPS && r.dpr < r.max) {
          if (++r.good >= 3) {
            r.dpr = Math.min(r.max, r.dpr * 1.1);
            r.good = 0;
            state.setDpr(r.dpr);
          }
        } else r.good = 0;
      }
    } else if (!frame.cameraBusy) {
      r.acc = 0;
      r.frames = 0;
    }
  }, -100);
  return null;
}

/**
 * The canvas renders on demand. While the camera moves this asks for a frame on every display refresh; while
 * characters of the active room move, BUSY_FPS times per second; otherwise IDLE_FPS, or CALM_FPS once the page has been
 * left alone for CALM_AFTER (the background rooms tick at most every BACKGROUND_STEP and are drawn by these frames).
 * (Camera drags, resizes and React updates invalidate on their own; a hidden tab gets no animation frames at all.)
 */
function IdleGovernor() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    let input = performance.now();
    const touch = () => {
      input = performance.now();
    };
    const events = ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });
    document.addEventListener('visibilitychange', touch);
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const fps = frame.busy ? BUSY_FPS : t - input > CALM_AFTER ? CALM_FPS : IDLE_FPS;
      // (a few ms of slack: a 33.3 ms interval would otherwise skip to every third refresh at 60 Hz)
      const every = frame.cameraBusy ? 0 : 1000 / fps - 4;
      if (t - last >= every) {
        last = t;
        invalidate();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      for (const e of events) window.removeEventListener(e, touch);
      document.removeEventListener('visibilitychange', touch);
    };
  }, [invalidate]);
  return null;
}

function CameraRig() {
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const { camera, size } = useThree();
  const activeRoomId = useStore((s) => s.activeRoomId);
  const fit = useRef({ active: false, dist: 30, snap: true });
  const resetTick = useStore((s) => s.resetTick);
  const focused = useStore((s) => !!s.selectedKey);

  useEffect(() => {
    const a = activeCenter();
    if (!a) return;
    const aspect = size.width / Math.max(1, size.height);
    fit.current.dist = a.fit * (aspect < 1.5 && a.fit > 14 ? (1.5 / Math.max(0.6, aspect)) * 0.85 : 1);
    fit.current.active = true;
    frame.cameraBusy = true;
  }, [activeRoomId, resetTick, focused, size.width, size.height]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c || !frame.hasActive) {
      frame.cameraBusy = false;
      return;
    }
    if (fit.current.snap) {
      fit.current.snap = false;
      c.target.copy(center);
      camera.position.copy(center).add(spherical(fit.current.dist, tmpA));
      c.update();
      frame.cameraBusy = true;
      return;
    }
    const k = 1 - Math.exp(-3.6 * dt);
    const delta = tmpA.copy(center).sub(c.target).multiplyScalar(k);
    c.target.add(delta);
    camera.position.add(delta);
    let moving = delta.lengthSq() > 1e-6;
    if (fit.current.active) {
      moving = true;
      const off = tmpB.copy(camera.position).sub(c.target);
      const len = off.length();
      off.setLength(len + (fit.current.dist - len) * k);
      camera.position.copy(c.target).add(off);
      if (Math.abs(fit.current.dist - len) < 0.06 && delta.length() < 0.01) fit.current.active = false;
    }
    frame.cameraBusy = moving;
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
      maxDistance={80}
      minPolarAngle={0.3}
      maxPolarAngle={1.3}
      minAzimuthAngle={0.12}
      maxAzimuthAngle={1.4}
      onStart={() => (fit.current.active = false)}
    />
  );
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

/** Feeds the system clock into the damped `env` object and refreshes time-reactive materials. */
function EnvSync() {
  const last = useRef({ lamps: -1, day: -1, night: -1 });
  useFrame((_, dt) => {
    stepEnv(envForHour(useStore.getState().hour), Math.min(dt, 0.1));
    const l = last.current;
    // the materials only need a refresh while the time of day is actually changing
    if (Math.abs(l.lamps - env.lamps) + Math.abs(l.day - env.day) + Math.abs(l.night - env.night) > 1e-5) {
      l.lamps = env.lamps;
      l.day = env.day;
      l.night = env.night;
      updateGlow();
    }
  });
  return null;
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
    const k = 1 - Math.exp(-5 * dt);
    for (let i = 0; i < POOL; i++) {
      const l = refs.current[i];
      if (!l) continue;
      const r = ranked.current[i];
      if (r && owner.current[i] !== r.id) {
        owner.current[i] = r.id;
        l.intensity = 0; // fade in again at the new room
        l.position.set(r.x - 0.3, 7.6, r.z + 0.4);
      }
      const target = r ? env.lamps * 22 : 0;
      l.intensity += (target - l.intensity) * k;
      l.visible = l.intensity > 0.5;
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
    const k = 1 - Math.exp(-4 * dt);
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

/** Is the session of this room doing anything (the main agent runs, or a task of it is open)? */
function isWorking(st: StoreState, id: string): boolean {
  if (st.rooms[id]?.mainActive) return true;
  for (const t of Object.values(st.tasks)) if (t.sessionId === id) return true;
  return false;
}

/**
 * Takes a room out of the scene (its meshes, textures and actors are disposed) once it has been off screen,
 * not working and without anybody on stage for EVICT_AFTER. It comes back the way it came the first time:
 * as the active room, or staged in when it starts working. Runs on a timer, not on frames, so a hidden tab frees
 * its rooms too.
 */
function Evictor({ evict }: { evict: (ids: string[]) => void }) {
  useEffect(() => {
    const quietSince = new Map<string, number>();
    const t = setInterval(() => {
      const st = useStore.getState();
      const now = performance.now();
      const onStage = new Set<string>();
      for (const s of sims.values()) if (s.onStage) onStage.add(s.roomId);
      const gone: string[] = [];
      for (const id of frame.readyRooms) {
        const quiet = id !== st.activeRoomId && !frame.visibleRooms.has(id) && !onStage.has(id) && !isWorking(st, id);
        if (!quiet) {
          quietSince.delete(id);
          continue;
        }
        const since = quietSince.get(id) ?? now;
        quietSince.set(id, since);
        if (now - since >= EVICT_AFTER) gone.push(id);
      }
      for (const id of quietSince.keys()) if (!frame.readyRooms.has(id)) quietSince.delete(id);
      if (gone.length) {
        for (const id of gone) {
          quietSince.delete(id);
          lastAnim.delete(id);
        }
        evict(gone);
      }
    }, EVICT_CHECK);
    return () => clearInterval(t);
  }, [evict]);
  return null;
}

/**
 * Staged loading: once the active room is ready, the other sessions that are working are mounted one at a
 * time (in list order), each after the previous one reported ready plus STAGE_GAP. Nothing is started while
 * the camera moves, the user drags, or the render resolution was just lowered. Idle rooms load on demand.
 */
function Staging({ mount }: { mount: (id: string) => void }) {
  const gl = useThree((s) => s.gl);
  const s = useRef({ loading: null as string | null, readyAt: 0, down: false });
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
    if (r.loading) {
      if (!st.rooms[r.loading]) r.loading = null; // released while loading
      else if (frame.readyRooms.has(r.loading)) {
        r.loading = null;
        r.readyAt = now;
      } else return;
    }
    if (!st.activeRoomId || !frame.readyRooms.has(st.activeRoomId)) return;
    if (frame.cameraBusy || r.down || now - r.readyAt < STAGE_GAP || now - dprDropAt < STAGE_DPR_PAUSE) return;
    for (const id of st.visibleOrder) {
      const room = st.rooms[id];
      if (!room || frame.readyRooms.has(id)) continue;
      if (!isWorking(st, id)) continue;
      r.loading = id;
      mount(id);
      return;
    }
  });
  return null;
}

export function Scene() {
  const roomOrder = useStore((s) => s.visibleOrder);
  // rooms are built lazily: a room is put into the scene the first time it becomes the active one (or, staged one at a time, when it is working; see Staging) and stays after that
  const activeRoomId = useStore((s) => s.activeRoomId);
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set());
  if (activeRoomId && !visited.has(activeRoomId)) setVisited(new Set(visited).add(activeRoomId));
  // (the staged rooms join through the callback below; the functional update keeps them apart from the render-time one)
  const stage = useCallback((id: string) => setVisited((v) => (v.has(id) ? v : new Set(v).add(id))), []);
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
      dpr={[1, 1.5]}
      camera={{ fov: 30, near: 1, far: 400, position: [16, 17, 18] }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => useStore.getState().select(null)}
    >
      <FrameSync />
      <IdleGovernor />
      <ViewSync />
      <EnvSync />
      <Lights />
      <RoomLights />
      <CameraRig />
      <Staging mount={stage} />
      <Evictor evict={evict} />
      {roomOrder.map((id) => (visited.has(id) ? <RoomView key={id} roomId={id} /> : null))}
    </Canvas>
  );
}
