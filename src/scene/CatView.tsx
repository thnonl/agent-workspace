import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { RoomLayout } from '../world/layout';
import { CatBrain, neutralCatPose, type CatPose } from '../sim/cat';
import { cats, catsInRoom, simsInRoom, spotOwners } from '../sim/registry';
import { frame, OFFSCREEN_STEP } from '../sim/frame';
import { buildCat, makeCatLook, type CatRig } from './catModel';
import { MB } from './kit';
import { useStore } from '../store';

function heartGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(-1, 0.1, -0.6, 0.8, 0, 0.35);
  s.bezierCurveTo(0.6, 0.8, 1, 0.1, 0, -0.5);
  return new THREE.ShapeGeometry(s, 8);
}

/** Exponentially smooth every channel of the pose so transitions between behaviours never pop. */
export function smoothPose(cur: CatPose, target: CatPose, dt: number) {
  const k = (rate: number) => 1 - Math.exp(-rate * dt);
  const a = k(9);
  const slow = k(3.2);
  const fast = k(24);
  cur.y += (target.y - cur.y) * k(8);
  cur.pitch += (target.pitch - cur.pitch) * k(7);
  cur.roll += (target.roll - cur.roll) * a;
  cur.arch += (target.arch - cur.arch) * a;
  cur.curl += (target.curl - cur.curl) * slow;
  cur.curlDir = target.curlDir;
  cur.headX += (target.headX - cur.headX) * a;
  cur.headY += (target.headY - cur.headY) * k(6);
  cur.headZ += (target.headZ - cur.headZ) * a;
  cur.tailLift += (target.tailLift - cur.tailLift) * k(5);
  cur.tailCurl += (target.tailCurl - cur.tailCurl) * k(5);
  cur.tailWrap += (target.tailWrap - cur.tailWrap) * slow;
  cur.tailSway += (target.tailSway - cur.tailSway) * k(4);
  cur.walk += (target.walk - cur.walk) * k(6);
  cur.gait = target.gait;
  cur.gaitAmp += (target.gaitAmp - cur.gaitAmp) * a;
  cur.eyes += (target.eyes - cur.eyes) * fast;
  cur.earsBack += (target.earsBack - cur.earsBack) * a;
  cur.purr += (target.purr - cur.purr) * a;
  for (let i = 0; i < 4; i++) {
    const c = cur.legs[i];
    const t = target.legs[i];
    const r = k(11);
    c.u += (t.u - c.u) * r;
    c.l += (t.l - c.l) * r;
    c.p += (t.p - c.p) * r;
  }
}

// gait phase offsets (fraction of a cycle): FL, FR, BL, BR – a relaxed lateral-sequence walk
const GAIT = [0, 0.5, 0.75, 0.25];

export function applyCat(rig: CatRig, p: CatPose, clock: number) {
  const w = p.walk;
  const g = p.gait;
  const amp = p.gaitAmp;
  const curl = p.curl * p.curlDir;
  const wave = Math.sin(g);

  // spine: walk undulation + arch / hollow + curl
  rig.hips.position.y = rig.hipsRestY + p.y + w * Math.abs(Math.sin(g)) * 0.006 * amp;
  rig.hips.rotation.set(p.pitch - p.arch * 0.3, curl * 0.06 + wave * 0.07 * w * amp, p.roll + Math.sin(g) * 0.025 * w);
  rig.spine1.rotation.set(p.arch * 0.35, curl * 0.55 - wave * 0.1 * w * amp, -Math.sin(g) * 0.02 * w);
  rig.spine2.rotation.set(p.arch * 0.35, curl * 0.66 - wave * 0.05 * w * amp, 0);
  rig.neck.rotation.set(p.arch * 0.2, curl * 0.7, 0);
  rig.head.rotation.set(p.headX + Math.sin(g * 2) * 0.035 * w, p.headY + curl * 0.5 + wave * 0.05 * w, p.headZ);

  // breathing / purring
  const rate = 1.7 + p.purr * 2.4;
  const breath = Math.sin(clock * rate) * (0.02 + 0.018 * p.purr);
  rig.spine1.scale.set(1 + breath * 0.6, 1 + breath, 1 + breath * 0.6);
  rig.spine2.scale.set(1 + breath * 0.4, 1 + breath * 0.7, 1);

  // legs: pose + walk cycle
  for (let i = 0; i < 4; i++) {
    const front = i < 2;
    const lp = p.legs[i];
    const ph = g + GAIT[i] * Math.PI * 2;
    const sn = Math.sin(ph);
    const lift = Math.max(0, Math.cos(ph));
    const L = rig.legs[i];
    if (front) {
      L.a.rotation.x = lp.u - sn * 0.62 * w * amp;
      L.b.rotation.x = lp.l + lift * 1.0 * w * amp + 0.12 * w;
      L.c.rotation.x = lp.p + (sn * 0.25 - lift * 0.45) * w * amp;
    } else {
      L.a.rotation.x = lp.u - sn * 0.62 * w * amp;
      L.b.rotation.x = lp.l + lift * 0.85 * w * amp;
      L.c.rotation.x = lp.p + (sn * 0.3 - lift * 0.65) * w * amp;
    }
  }

  // tail: pose lift / curl / wrap + lazy sway that travels down the tail
  for (let k = 0; k < rig.tail.length; k++) {
    const f = (k + 1) / rig.tail.length;
    const sway = Math.sin(clock * 2.1 - k * 0.55) * p.tailSway * (0.03 + 0.05 * f);
    const flick = Math.sin(clock * 5.3 - k * 0.9) * 0.02 * w * f;
    rig.tail[k].rotation.set(0.12 + (p.tailLift > 0 ? p.tailLift * 0.3 : p.tailLift * 0.42) + (k >= 3 ? p.tailCurl * 0.14 : 0), p.tailWrap * p.curlDir * 0.36 + sway + flick, 0);
  }

  // ears & eyes
  const twitch = Math.max(0, Math.sin(clock * 0.9 + 1.3) - 0.93) * 9;
  rig.ears.forEach((e, i) => {
    e.rotation.x = -0.12 + p.earsBack * 0.75 + (i ? twitch * 0.5 : 0);
    e.rotation.z = (i ? 1 : -1) * (0.32 + p.earsBack * 0.7) + (i ? 0 : twitch * 0.3);
  });
  const open = Math.max(0, p.eyes);
  const closed = open < 0.3;
  rig.eyes.forEach((e, i) => {
    e.visible = !closed;
    e.scale.y = Math.max(0.2, Math.min(1, open * 1.15));
    rig.closedEyes[i].visible = closed;
  });
}

interface Props {
  catKey: string;
  roomId: string;
  layout: RoomLayout;
  seed: number;
}

export function CatView({ catKey, roomId, layout, seed }: Props) {
  const look = useMemo(() => makeCatLook(seed), [seed]);
  const rig = useMemo(() => buildCat(look), [look]);
  const brain = useMemo(() => new CatBrain(catKey, roomId, seed, layout), [catKey, roomId, seed, layout]);
  const heartGeo = useMemo(heartGeometry, []);
  const heartMat = useMemo(() => MB('#ff7fa8'), []);
  const hearts = useRef<(THREE.Mesh | null)[]>([]);
  const clock = useRef(0);
  const smoothed = useRef<CatPose>(neutralCatPose());
  /** time collected since the last update (a cat in a room that is off screen only steps every OFFSCREEN_STEP) */
  const pending = useRef(0);

  useEffect(() => {
    cats.set(catKey, brain.sim);
    brain.attach();
    // drop claims left behind by a discarded (StrictMode / hot-reload) instance of this cat
    for (const [k, owner] of spotOwners) if (owner === catKey && k !== `${roomId}#${brain.sim.spot}`) spotOwners.delete(k);
    return () => {
      brain.dispose();
      cats.delete(catKey);
    };
  }, [catKey, roomId, brain]);

  useFrame((state, rawDt) => {
    const visible = frame.visibleRooms.has(roomId);
    pending.current += rawDt;
    if (!visible && pending.current < OFFSCREEN_STEP) return;
    const dt = Math.min(pending.current, 0.1);
    pending.current = 0;
    clock.current += dt;
    const now = performance.now() / 1000;
    brain.update(dt, { layout, now, chars: simsInRoom(roomId), cats: catsInRoom(roomId) });
    if (!visible) return; // off screen: the cat lives on, but it is not posed
    const s = brain.sim;
    rig.root.visible = s.onStage;
    rig.root.position.set(s.x, s.y, s.z);
    rig.root.rotation.y = s.yaw;
    smoothPose(smoothed.current, brain.pose, dt);
    applyCat(rig, smoothed.current, clock.current);
    // hearts drift up while somebody strokes the cat
    const petted = s.petUntil > now && s.onStage;
    hearts.current.forEach((h, i) => {
      if (!h) return;
      h.visible = petted;
      if (!petted) return;
      const ph = (clock.current * 0.55 + i / 3) % 1;
      h.position.set(s.x + Math.sin(ph * 6 + i * 2) * 0.12, s.y + 0.4 + ph * 0.5, s.z + Math.cos(ph * 5 + i) * 0.1);
      h.scale.setScalar(Math.sin(ph * Math.PI) * 0.17);
      h.quaternion.copy(state.camera.quaternion);
    });
  });

  return (
    <group>
      <primitive
        object={rig.root}
        onClick={(e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          useStore.getState().select(catKey);
        }}
      />
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(el) => { hearts.current[i] = el; }} geometry={heartGeo} material={heartMat} visible={false} renderOrder={5} />
      ))}
    </group>
  );
}
