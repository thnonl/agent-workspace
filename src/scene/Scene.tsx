import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useStore } from '../store';
import { getLayout } from '../world/layout';
import { anchors, cats, sims, view } from '../sim/registry';
import { frame } from '../sim/frame';
import { env, envForHour, lightParams, stepEnv } from '../env';
import { updateGlow } from './glow';
import { RoomView, roomOrigin } from './RoomView';

const AZIMUTH = 0.72;
const POLAR = 0.8;
/** frame rate while nothing moves (a calm office is not worth a laptop fan) */
const IDLE_FPS = 20;
/** the render resolution is lowered when the busy scene cannot hold this frame rate */
const LOW_FPS = 40;
const HIGH_FPS = 57;
const MIN_DPR = 0.8;

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

/** Center of the active room in world space (used outside the frame loop; inside it read `frame.center`). */
function activeCenter(): { center: THREE.Vector3; fit: number } | null {
  const center = new THREE.Vector3();
  const fit = computeActive(useStore.getState(), center);
  return fit > 0 ? { center, fit } : null;
}

const tmpFrustum = new THREE.Frustum();
const tmpMat = new THREE.Matrix4();
const tmpSphere = new THREE.Sphere();

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
    const fit = computeActive(st, frame.center);
    frame.hasActive = fit > 0;
    if (fit > 0) frame.fit = fit;

    // which rooms does the camera see?
    const cam = state.camera;
    cam.updateMatrixWorld();
    tmpMat.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    tmpFrustum.setFromProjectionMatrix(tmpMat);
    frame.visibleRooms.clear();
    for (const id of st.visibleOrder) {
      const room = st.rooms[id];
      if (!room) continue;
      const o = roomOrigin(room.index);
      const l = getLayout(room.seed, room.themeIndex);
      tmpSphere.center.set(o[0], 2, o[2]);
      tmpSphere.radius = Math.hypot(l.width, l.depth) / 2 + 4;
      if (id === st.activeRoomId || tmpFrustum.intersectsSphere(tmpSphere)) frame.visibleRooms.add(id);
    }

    let dynamic = false;
    for (const s of sims.values()) {
      if (s.onStage && frame.visibleRooms.has(s.roomId)) {
        dynamic = true;
        break;
      }
    }
    if (!dynamic) {
      for (const c of cats.values()) {
        if (c.onStage && !c.still && frame.visibleRooms.has(c.roomId)) {
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
    if (frame.busy && dt < 0.1) {
      r.acc += dt;
      r.frames++;
      if (r.acc >= 2.5) {
        const fps = r.frames / r.acc;
        r.acc = 0;
        r.frames = 0;
        if (fps < LOW_FPS && r.dpr > Math.min(MIN_DPR, r.max)) {
          r.dpr = Math.max(Math.min(MIN_DPR, r.max), r.dpr * 0.85);
          r.good = 0;
          state.setDpr(r.dpr);
        } else if (fps > HIGH_FPS && r.dpr < r.max) {
          if (++r.good >= 3) {
            r.dpr = Math.min(r.max, r.dpr * 1.1);
            r.good = 0;
            state.setDpr(r.dpr);
          }
        } else r.good = 0;
      }
    } else if (!frame.busy) {
      r.acc = 0;
      r.frames = 0;
    }
  }, -100);
  return null;
}

/**
 * The canvas renders on demand. While something moves this asks for a frame on every display refresh;
 * otherwise only IDLE_FPS times per second. (Camera drags, resizes and React updates invalidate on their own.)
 */
function IdleGovernor() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (frame.busy || t - last >= 1000 / IDLE_FPS) {
        last = t;
        invalidate();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
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
      c.target.copy(frame.center);
      camera.position.copy(frame.center).add(spherical(fit.current.dist, tmpA));
      c.update();
      frame.cameraBusy = true;
      return;
    }
    const k = 1 - Math.exp(-3.6 * dt);
    const delta = tmpA.copy(frame.center).sub(c.target).multiplyScalar(k);
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
  useFrame((state) => {
    view.camera = state.camera;
    view.width = state.size.width;
    view.height = state.size.height;
    if (import.meta.env.DEV) (window as unknown as { __gl?: unknown }).__gl = state.gl;
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
      const cam = frame.hasActive ? frame.center : state.camera.position;
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

/** the shadow map is redrawn at most this often while people move, and once a second otherwise */
const SHADOW_STEP = 1 / 30;
const SHADOW_IDLE_STEP = 1;
/** how far (world units) the sun may drift before the shadow map is redrawn */
const SHADOW_DRIFT = 0.02;

function Lights() {
  const light = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const shadow = useRef({ since: 99, pos: new THREE.Vector3(1e9, 0, 0), target: new THREE.Vector3(), was: false });
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    scene.add(l.target);
    return () => {
      scene.remove(l.target);
    };
  }, [scene]);
  // the shadow map is only redrawn when something in it can have changed (see useFrame below)
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  useFrame((_, dt) => {
    const l = light.current;
    if (!l || !frame.hasActive) return;
    const p = lightParams();
    const k = 1 - Math.exp(-4 * dt);
    l.target.position.lerp(frame.center, k);
    l.position.lerp(tmpA.copy(frame.center).add(p.dirOffset), k);
    l.target.updateMatrixWorld();
    l.color.copy(p.dirColor);
    l.intensity = p.dirIntensity;
    if (hemi.current) {
      hemi.current.color.copy(p.hemiSky);
      hemi.current.groundColor.copy(p.hemiGround);
      hemi.current.intensity = p.hemiIntensity;
    }

    const s = shadow.current;
    s.since += dt;
    const moved = l.position.distanceToSquared(s.pos) > SHADOW_DRIFT * SHADOW_DRIFT || l.target.position.distanceToSquared(s.target) > SHADOW_DRIFT * SHADOW_DRIFT;
    // somebody started moving: draw at once, then at a steady pace
    const woke = frame.dynamic && !s.was;
    s.was = frame.dynamic;
    if (frame.shadowDirty || moved || woke || s.since >= (frame.dynamic ? SHADOW_STEP : SHADOW_IDLE_STEP)) {
      gl.shadowMap.needsUpdate = true;
      frame.shadowDirty = false;
      s.since = 0;
      s.pos.copy(l.position);
      s.target.copy(l.target.position);
    }
  });
  return (
    <>
      <hemisphereLight ref={hemi} args={['#ffffff', '#ffd9c4', 1.05]} />
      <directionalLight
        ref={light}
        castShadow
        color="#fff3e2"
        intensity={1.9}
        position={[7, 17, 9]}
        shadow-mapSize={[1536, 1536]}
        shadow-camera-left={-13}
        shadow-camera-right={13}
        shadow-camera-top={13}
        shadow-camera-bottom={-13}
        shadow-camera-near={1}
        shadow-camera-far={45}
        shadow-bias={-0.0004}
        shadow-normalBias={0.035}
        shadow-radius={3}
      />
    </>
  );
}

export function Scene() {
  const roomOrder = useStore((s) => s.visibleOrder);
  // a room appears or disappears: its furniture has to cast (or stop casting) shadows
  useEffect(() => {
    frame.shadowDirty = true;
  }, [roomOrder]);
  return (
    <Canvas
      frameloop="demand"
      shadows="percentage"
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
      {roomOrder.map((id) => (
        <RoomView key={id} roomId={id} />
      ))}
    </Canvas>
  );
}
