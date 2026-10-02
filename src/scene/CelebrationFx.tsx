import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { onDirectorDesk, type RoomLayout } from '../world/layout';
import { dropCelebrations, takeCelebrations, type Show } from '../sim/celebrate';
import { frame } from '../sim/frame';
import { DESK_TOP, Ms, RB } from './furniture';
import { G, M, MB } from './kit';

const N = 260;
const CONFETTI = ['#ff6b8b', '#ffd166', '#5ed3b0', '#6bb8ff', '#b388ff', '#ff9e5e', '#ffffff'];
const GOLD = ['#ffd166', '#fff1b0', '#ffb347', '#ffffff'];
const STEAM = ['#ffffff', '#f1f4ff', '#e3e9ff'];
const WATER = ['#bfeaff', '#ffffff', '#8fd4ff'];
const NOTES = ['#ff8fb1', '#b388ff', '#6bb8ff', '#ffd166'];
const CAKE_S = 40;
const tmp = new THREE.Color();

/**
 * Confetti / sparkles and the cake of a room. One pooled `Points` object; particles are simulated on the CPU only
 * while some are alive. A fallen piece sinks into the floor, so nothing has to be cleaned up.
 */
export function CelebrationFx({ roomId, layout }: { roomId: string; layout: RoomLayout }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3).fill(-50), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => dropCelebrations(roomId), [roomId]);
  const sim = useRef({ vel: new Float32Array(N * 3), life: new Float32Array(N), decay: new Float32Array(N).fill(0.25), floaty: new Uint8Array(N), next: 0, alive: 0, t: 0 });
  const pts = useRef<THREE.Points>(null);
  const cake = useRef<THREE.Group>(null);
  const flame = useRef<THREE.Mesh>(null);
  const cakeLeft = useRef(0);
  const { width: W, depth: D } = layout;
  const desk = layout.director.desk;
  const cakeAt = onDirectorDesk(layout, 0.72, 0.12);

  const spawn = (n: number, palette: string[], make: (i: number) => [number, number, number, number, number, number], floaty = false) => {
    const s = sim.current;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = geo.attributes.color as THREE.BufferAttribute;
    for (let k = 0; k < n; k++) {
      const i = s.next;
      s.next = (s.next + 1) % N;
      const [x, y, z, vx, vy, vz] = make(k);
      pos.setXYZ(i, x, y, z);
      s.vel[i * 3] = vx;
      s.vel[i * 3 + 1] = vy;
      s.vel[i * 3 + 2] = vz;
      s.life[i] = floaty ? 1 : 1.6 + Math.random() * 2.2;
      s.decay[i] = floaty ? 0.55 + Math.random() * 0.35 : 0.25;
      s.floaty[i] = floaty ? 1 : 0;
      tmp.set(palette[Math.floor(Math.random() * palette.length)]);
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    col.needsUpdate = true;
    s.alive = N;
  };

  const show = ({ kind, at }: Show) => {
    const r = Math.random;
    const [ax, ay, az] = at ?? [0, 0, 0];
    if (kind === 'steam') spawn(10, STEAM, () => [ax + (r() - 0.5) * 0.25, ay, az + (r() - 0.5) * 0.25, (r() - 0.5) * 0.15, 0.55 + r() * 0.35, (r() - 0.5) * 0.15], true);
    else if (kind === 'bubbles') spawn(14, WATER, () => [ax + (r() - 0.5) * 0.2, ay + r() * 0.1, az + (r() - 0.5) * 0.2, (r() - 0.5) * 0.12, 0.6 + r() * 0.5, (r() - 0.5) * 0.12], true);
    else if (kind === 'feed') spawn(16, GOLD, () => [ax + (r() - 0.5) * 0.5, ay + 0.05, az + (r() - 0.5) * 0.3, (r() - 0.5) * 0.3, 0.25 + r() * 0.5, (r() - 0.5) * 0.3], true);
    else if (kind === 'notes') spawn(8, NOTES, () => [ax + (r() - 0.5) * 0.3, ay, az + (r() - 0.5) * 0.3, (r() - 0.5) * 0.45, 0.55 + r() * 0.4, (r() - 0.5) * 0.3], true);
    else if (kind === 'run') {
      // a shower over the whole room, and two cannons at the director's desk
      spawn(120, CONFETTI, () => [(r() - 0.5) * W * 0.8, 3.4 + r() * 1.6, (r() - 0.5) * D * 0.8, (r() - 0.5) * 0.8, -0.6 - r() * 1.2, (r() - 0.5) * 0.8]);
      spawn(80, CONFETTI, () => [desk.x + (r() - 0.5) * 0.6, DESK_TOP + 0.2, desk.z, (r() - 0.5) * 5.5, 4.5 + r() * 3.5, (r() - 0.5) * 5.5]);
    } else if (kind === 'push') {
      spawn(110, CONFETTI, () => [desk.x + (r() - 0.5) * 0.8, DESK_TOP + 0.2, desk.z, (r() - 0.5) * 5, 4 + r() * 3.6, (r() - 0.5) * 5]);
    } else if (kind === 'commit') {
      spawn(46, GOLD, () => [desk.x + (r() - 0.5) * 0.7, DESK_TOP + 0.25, desk.z + (r() - 0.5) * 0.4, (r() - 0.5) * 1.6, 1.4 + r() * 1.8, (r() - 0.5) * 1.6]);
    } else if (kind === 'cake') cakeLeft.current = CAKE_S;
  };

  useFrame((_, dtRaw) => {
    const on = frame.animRooms.has(roomId);
    const ev = takeCelebrations(roomId);
    for (const k of ev) show(k);
    if (!on) return;
    const dt = Math.min(dtRaw, 0.1);
    const s = sim.current;
    const o = pts.current;
    if (o && s.alive > 0) {
      const pos = geo.attributes.position as THREE.BufferAttribute;
      let alive = 0;
      s.t += dt;
      for (let i = 0; i < N; i++) {
        if (s.life[i] <= 0) continue;
        alive++;
        let vx = s.vel[i * 3];
        let vy = s.vel[i * 3 + 1];
        let vz = s.vel[i * 3 + 2];
        let x = pos.getX(i);
        let y = pos.getY(i);
        let z = pos.getZ(i);
        if (s.floaty[i]) {
          // steam, bubbles, notes: drift upwards and fade out (they do not land)
          x += (vx + Math.sin(s.t * 3 + i) * 0.06) * dt;
          z += (vz + Math.cos(s.t * 2.6 + i) * 0.06) * dt;
          y += vy * dt;
          s.life[i] -= dt * s.decay[i];
        } else if (y > 0.04) {
          vy -= 6.5 * dt;
          // paper flutters: it falls slowly once it has lost its speed
          const drag = Math.exp(-1.6 * dt);
          vx *= drag;
          vz *= drag;
          if (vy < -1.3) vy = -1.3;
          x += (vx + Math.sin(s.t * 5 + i) * 0.25) * dt;
          z += (vz + Math.cos(s.t * 4 + i * 1.7) * 0.25) * dt;
          y += vy * dt;
          if (y < 0.04) y = 0.04;
        } else {
          // lying on the floor: sinks away
          s.life[i] -= dt * 1.2;
          y -= dt * 0.1;
        }
        if (!s.floaty[i]) s.life[i] -= dt * 0.25;
        s.vel[i * 3] = vx;
        s.vel[i * 3 + 1] = vy;
        s.vel[i * 3 + 2] = vz;
        if (s.life[i] <= 0 || y < -0.1) {
          s.life[i] = 0;
          pos.setXYZ(i, 0, -50, 0);
        } else pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
      s.alive = alive;
    }
    // the cake stays on the director's desk for a while; its flame flickers
    const g = cake.current;
    if (g) {
      if (cakeLeft.current > 0) cakeLeft.current -= dt;
      g.visible = cakeLeft.current > 0;
      if (g.visible) g.scale.setScalar(Math.min(1, (CAKE_S - cakeLeft.current) * 3, cakeLeft.current * 3));
      if (g.visible && flame.current) {
        flame.current.scale.set(0.85 + Math.random() * 0.3, 0.8 + Math.random() * 0.5, 0.85 + Math.random() * 0.3);
      }
    }
  });

  return (
    <>
      <points ref={pts} geometry={geo} frustumCulled={false} renderOrder={6} raycast={() => null}>
        <pointsMaterial size={0.15} sizeAttenuation vertexColors transparent opacity={0.95} depthWrite={false} />
      </points>
      <group ref={cake} position={[cakeAt.x, DESK_TOP + 0.02, cakeAt.z]} rotation={[0, layout.director.rot, 0]} visible={false}>
        <Ms geo={G.cyl(0.26, 0.27, 0.03, 24)} mat={M('#ffffff', { rough: 0.4 })} pos={[0, 0.015, 0]} cast={false} />
        <Ms geo={G.cyl(0.2, 0.2, 0.12, 24)} mat={M('#ff9ec4', { rough: 0.7 })} pos={[0, 0.09, 0]} cast={false} />
        <Ms geo={G.cyl(0.205, 0.205, 0.03, 24)} mat={M('#fff6e8', { rough: 0.6 })} pos={[0, 0.16, 0]} cast={false} />
        <Ms geo={G.torus(0.17, 0.018, Math.PI * 2, 6, 20)} mat={M('#e5383b', { rough: 0.5 })} pos={[0, 0.17, 0]} rot={[Math.PI / 2, 0, 0]} cast={false} />
        {[0, 1, 2, 3].map((i) => (
          <Ms key={i} geo={G.sphere(0.022, 8, 6)} mat={M(CONFETTI[i], { rough: 0.4 })} pos={[Math.cos(i * 1.57) * 0.13, 0.19, Math.sin(i * 1.57) * 0.13]} cast={false} />
        ))}
        <RB size={[0.02, 0.09, 0.02]} pos={[0, 0.22, 0]} color="#6bb8ff" r={0.005} cast={false} />
        <mesh ref={flame} geometry={G.cone(0.022, 0.06, 8)} material={MB('#ffd166')} position={[0, 0.3, 0]} />
      </group>
    </>
  );
}
