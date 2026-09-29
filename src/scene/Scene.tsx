import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useStore } from '../store';
import { getLayout } from '../world/layout';
import { anchors, cats, view } from '../sim/registry';
import { env, envForHour, lightParams, stepEnv } from '../env';
import { updateGlow } from './glow';
import { RoomView, roomOrigin } from './RoomView';

const AZIMUTH = 0.72;
const POLAR = 0.8;

function spherical(dist: number, az = AZIMUTH, pol = POLAR) {
  return new THREE.Vector3(Math.sin(az) * Math.sin(pol), Math.cos(pol), Math.cos(az) * Math.sin(pol)).multiplyScalar(dist);
}

/** Center of the active room in world space (a bit above the floor). */
function activeCenter(): { center: THREE.Vector3; fit: number } | null {
  const { activeRoomId, rooms, selectedKey, people } = useStore.getState();
  const room = activeRoomId ? rooms[activeRoomId] : null;
  if (!room) return null;
  const o = roomOrigin(room.index);
  const layout = getLayout(room.seed, room.themeIndex);
  // a selected cat / character is followed by the camera, RTS style
  const cat = selectedKey ? cats.get(selectedKey) : undefined;
  if (cat?.onStage && cat.roomId === room.id) return { center: new THREE.Vector3(o[0] + cat.x, cat.y + 0.3, o[2] + cat.z), fit: 5.5 };
  const sel = selectedKey ? people[selectedKey] : null;
  const anchor = sel && sel.sessionId === room.id ? anchors.get(selectedKey!) : null;
  if (anchor?.live) return { center: new THREE.Vector3(anchor.x, 0.85, anchor.z), fit: 13 };
  return { center: new THREE.Vector3(o[0] - 0.4, 1.0, o[2] + 0.2), fit: layout.fitDistance };
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
  }, [activeRoomId, resetTick, focused, size.width, size.height]);

  useFrame((_, dt) => {
    const c = controls.current;
    const a = activeCenter();
    if (!c || !a) return;
    if (fit.current.snap) {
      fit.current.snap = false;
      c.target.copy(a.center);
      camera.position.copy(a.center).add(spherical(fit.current.dist));
      c.update();
      return;
    }
    const k = 1 - Math.exp(-3.6 * dt);
    const delta = a.center.clone().sub(c.target).multiplyScalar(k);
    c.target.add(delta);
    camera.position.add(delta);
    if (fit.current.active) {
      const off = camera.position.clone().sub(c.target);
      const len = off.length();
      off.setLength(len + (fit.current.dist - len) * k);
      camera.position.copy(c.target).add(off);
      if (Math.abs(fit.current.dist - len) < 0.06 && delta.length() < 0.01) fit.current.active = false;
    }
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
  useFrame((_, dt) => {
    stepEnv(envForHour(useStore.getState().hour), Math.min(dt, 0.1));
    updateGlow();
  });
  return null;
}

/**
 * A fixed pool of warm point lights, moved to the rooms nearest to the camera. Keeping the light
 * count constant avoids shader recompiles; at night every nearby room "switches its lights on".
 */
const POOL = 3;
function RoomLights() {
  const refs = useRef<(THREE.PointLight | null)[]>([]);
  const owner = useRef<string[]>([]);
  useFrame((state, dt) => {
    const { rooms, visibleOrder: roomOrder } = useStore.getState();
    const cam = new THREE.Vector3();
    const a = activeCenter();
    cam.copy(a ? a.center : state.camera.position);
    const ranked = roomOrder
      .map((id) => {
        const o = roomOrder.length ? roomOrigin(rooms[id].index) : [0, 0, 0];
        return { id, x: o[0], z: o[2], d: Math.hypot(o[0] - cam.x, o[2] - cam.z) };
      })
      .sort((p, q) => p.d - q.d)
      .slice(0, POOL);
    const k = 1 - Math.exp(-5 * dt);
    for (let i = 0; i < POOL; i++) {
      const l = refs.current[i];
      if (!l) continue;
      const r = ranked[i];
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
    const a = activeCenter();
    if (!l || !a) return;
    const p = lightParams();
    const k = 1 - Math.exp(-4 * dt);
    l.target.position.lerp(a.center, k);
    l.position.lerp(a.center.clone().add(p.dirOffset), k);
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
        castShadow
        color="#fff3e2"
        intensity={1.9}
        position={[7, 17, 9]}
        shadow-mapSize={[2048, 2048]}
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
  return (
    <Canvas
      shadows="percentage"
      flat
      dpr={[1, 1.75]}
      camera={{ fov: 30, near: 1, far: 400, position: [16, 17, 18] }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => useStore.getState().select(null)}
    >
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
