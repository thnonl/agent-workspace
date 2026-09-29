import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../store';
import { makeAppearance } from '../world/appearance';
import { rot2 } from '../world/layout';
import type { RoomLayout } from '../world/layout';
import { Actor, type ActorCtx, type Pose } from '../sim/actor';
import { anchors, catsInRoom, enqueueSpeech, lastSpeech, queueLength, runtimeFor, sims, simsInRoom, view, type SimState } from '../sim/registry';
import { frame, OFFSCREEN_STEP } from '../sim/frame';
import { buildCharacter, RIG_SCALE, type Rig } from './character';
import { buildLaptop } from './laptop';
import { buildHeldItems } from './heldItems';
import { G } from './kit';
import { DESK_TOP } from './furniture';

const qHand = new THREE.Quaternion();
const qRoot = new THREE.Quaternion();
const qRel = new THREE.Quaternion();
const qTilt = new THREE.Quaternion();
const tiltAxis = new THREE.Vector3(1, 0, 0);
const vTmp = new THREE.Vector3();
const vDrop = new THREE.Vector3();
// scratch objects for the per-frame prop maths (nothing is allocated inside the frame loop)
const vBagTop = new THREE.Vector3();
const vHands = new THREE.Vector3();
const vDesk = new THREE.Vector3();
const vHeld = new THREE.Vector3();
const vPile = new THREE.Vector3();
const roomXZ = { x: 0, z: 0 };

/** Character-local offset (lx, lz) turned into room space. The result is shared: read it right away. */
function toRoom(sim: SimState, lx: number, lz: number) {
  const sn = Math.sin(sim.yaw);
  const cs = Math.cos(sim.yaw);
  roomXZ.x = sim.x + lx * cs + lz * sn;
  roomXZ.z = sim.z - lx * sn + lz * cs;
  return roomXZ;
}

/** Where the HTML speech bubble of this character is anchored (world space, above the head). */
function syncAnchor(key: string, outer: THREE.Group | null, wp: THREE.Vector3, sim: SimState, scale: number) {
  if (!outer) return;
  outer.getWorldPosition(wp);
  let a = anchors.get(key);
  if (!a) anchors.set(key, (a = { x: 0, y: 0, z: 0, live: false }));
  a.x = wp.x + sim.x;
  a.y = 2.12 * scale;
  a.z = wp.z + sim.z;
  a.live = sim.onStage && sim.phase !== 'waiting';
}
const k = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
const damp = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * k(rate, dt);
const ease = (t: number) => {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
};

function applyPose(rig: Rig, p: Pose, dt: number, eyeOpen: number, clock: number, walking: boolean, glance: number) {
  const r = 18;
  rig.pelvis.position.y = damp(rig.pelvis.position.y, p.bob, 24, dt);
  rig.torso.rotation.x = damp(rig.torso.rotation.x, p.lean, r, dt);
  rig.torso.rotation.y = damp(rig.torso.rotation.y, p.twist, r, dt);
  rig.torso.rotation.z = damp(rig.torso.rotation.z, p.roll, r, dt);
  rig.head.rotation.x = damp(rig.head.rotation.x, p.headX, r, dt);
  rig.head.rotation.y = damp(rig.head.rotation.y, p.headY + glance, r, dt);
  rig.head.rotation.z = damp(rig.head.rotation.z, p.headZ, r, dt);
  rig.armL.rotation.x = damp(rig.armL.rotation.x, p.armLx, r, dt);
  rig.armR.rotation.x = damp(rig.armR.rotation.x, p.armRx, r, dt);
  rig.armL.rotation.z = damp(rig.armL.rotation.z, -p.armLz, r, dt);
  rig.armR.rotation.z = damp(rig.armR.rotation.z, p.armRz, r, dt);
  rig.foreL.rotation.x = damp(rig.foreL.rotation.x, p.foreLx, r + 6, dt);
  rig.foreR.rotation.x = damp(rig.foreR.rotation.x, p.foreRx, r + 6, dt);
  rig.thighL.rotation.x = damp(rig.thighL.rotation.x, p.thighLx, r, dt);
  rig.thighR.rotation.x = damp(rig.thighR.rotation.x, p.thighRx, r, dt);
  rig.kneeL.rotation.x = damp(rig.kneeL.rotation.x, p.kneeLx, r, dt);
  rig.kneeR.rotation.x = damp(rig.kneeR.rotation.x, p.kneeRx, r, dt);
  // face
  const squint = 1 - 0.68 * p.happy;
  const open = Math.max(0.08, eyeOpen) * squint;
  rig.eyeL.scale.y = damp(rig.eyeL.scale.y, open, 30, dt);
  rig.eyeR.scale.y = damp(rig.eyeR.scale.y, open, 30, dt);
  rig.eyes.position.y = damp(rig.eyes.position.y, 0.035 * p.lookUp, 8, dt);
  rig.browL.position.y = damp(rig.browL.position.y, 0.115 + 0.03 * p.happy + 0.02 * p.lookUp, 12, dt);
  rig.browR.position.y = rig.browL.position.y;
  const showO = p.mouth === 'o';
  rig.mouthO.visible = showO;
  rig.mouthSmile.visible = !showO;
  rig.mouthSmile.rotation.z = p.mouth === 'sad' ? 0 : Math.PI;
  rig.mouthSmile.position.y = p.mouth === 'sad' ? -0.165 : -0.135;
  rig.mouthSmile.scale.setScalar(1 + p.happy * 0.25);
  if (rig.tail) {
    rig.tail.rotation.x = Math.sin(clock * 2.2) * 0.06 + (walking ? Math.sin(clock * 9) * 0.12 : 0);
    rig.tail.rotation.z = Math.sin(clock * 1.7) * 0.05;
  }
  rig.ears.forEach((e, i) => (e.rotation.x = Math.sin(clock * 1.5 + i) * 0.05 + (walking ? -0.12 : 0)));
}

interface Props {
  personKey: string;
  roomId: string;
  layout: RoomLayout;
}

export function PersonActor({ personKey, roomId, layout }: Props) {
  const seed = useStore((s) => s.people[personKey]?.seed ?? 0);
  const role = useStore((s) => s.people[personKey]?.role ?? 'staff');
  const desk = useStore((s) => s.people[personKey]?.desk ?? -1);
  const selected = useStore((s) => s.selectedKey === personKey);
  const isDirector = role === 'director';

  const app = useMemo(() => makeAppearance(seed, { director: isDirector }), [seed, isDirector]);
  const rig = useMemo(() => buildCharacter(app), [app]);
  const laptop = useMemo(() => buildLaptop(layout.theme.accent, layout.theme.accent3), [layout.theme]);
  const actor = useMemo(() => new Actor(personKey, roomId, isDirector, layout, desk, app.scale), [personKey, roomId, isDirector, layout, desk, app.scale]);
  const scale = RIG_SCALE * app.scale;
  const items = useMemo(() => {
    const it = buildHeldItems(layout.theme.accent);
    rig.handHold.add(it.cup, it.book, it.can);
    return it;
  }, [rig, layout.theme]);

  const ring = useRef<THREE.Mesh>(null);
  const outer = useRef<THREE.Group>(null);
  const clockRef = useRef(0);
  const ctx = useRef<ActorCtx | null>(null);
  /** time collected since the last update (rooms that are off screen only step every OFFSCREEN_STEP) */
  const pending = useRef(0);
  const workersAt = useRef(-1);
  const wp = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    sims.set(personKey, actor.sim);
    return () => {
      sims.delete(personKey);
      anchors.delete(personKey);
    };
  }, [personKey, actor]);

  useEffect(() => {
    rig.root.scale.setScalar(scale);
    rig.root.traverse((o) => {
      (o as THREE.Mesh).userData.personKey = personKey;
    });
  }, [rig, scale, personKey]);

  useFrame((_, rawDt) => {
    const visible = frame.visibleRooms.has(roomId);
    pending.current += rawDt;
    if (!visible && pending.current < OFFSCREEN_STEP) return;
    const dt = Math.min(pending.current, 0.1);
    pending.current = 0;
    const st = useStore.getState();
    const person = st.people[personKey];
    if (!person) return;
    const rt = runtimeFor(roomId);
    const now = performance.now() / 1000;
    clockRef.current += dt;
    if (!ctx.current) {
      ctx.current = {
        layout, rt, person, task: null, now, lastSayAge: Infinity, lastKind: null, queueLen: 0, others: [], cats: [], workers: [],
        onReport: () => useStore.getState().reportTask(personKey),
        onRelease: () => useStore.getState().releaseTask(personKey),
        say: (text, icon) => enqueueSpeech(personKey, { kind: 'idle', text, tool: icon }, true),
        nameOf: (simKey) => useStore.getState().people[simKey]?.name ?? 'a colleague',
        onDoneSpeech: (text, isFailed) => enqueueSpeech(personKey, { kind: 'done', text: text.length > 150 ? `${text.slice(0, 149)}…` : text, tool: isFailed ? 'failed' : undefined }, true),
      };
    }
    const c = ctx.current;
    c.person = person;
    c.task = person.taskKey ? st.tasks[person.taskKey] ?? null : null;
    c.rt = rt;
    c.now = now;
    const said = lastSpeech(personKey);
    c.lastSayAge = said ? now - said.at : Infinity;
    c.lastKind = said?.kind ?? null;
    c.queueLen = queueLength(personKey);
    c.others = actor.sim.walking ? simsInRoom(roomId) : c.others;
    // people who have nothing to do look around for colleagues to watch and cats to pet
    const free = isDirector || !c.task;
    if (actor.sim.walking || free) c.cats = catsInRoom(roomId);
    if (free && now - workersAt.current > 0.25) {
      workersAt.current = now;
      c.workers = simsInRoom(roomId).filter((x) => x.key !== personKey && x.busy && x.desk >= 0);
    }

    actor.update(dt, c);
    const sim = actor.sim;
    if (isDirector) {
      rt.directorSeated = sim.phase === 'working' || sim.phase === 'unpacking';
      rt.directorKey = personKey;
    }
    if (!visible) {
      // off screen: the story goes on (tasks, hand-overs, bubbles) but nobody needs to be posed
      syncAnchor(personKey, outer.current, wp, actor.sim, scale);
      return;
    }

    // ---- character transform
    const root = rig.root;
    root.visible = sim.onStage;
    root.position.set(sim.x, sim.y, sim.z);
    root.rotation.y = sim.yaw;
    // seated / talking characters glance towards the viewer so their cute faces stay visible
    let glance = 0;
    if (view.camera && !sim.walking && sim.phase !== 'waiting') {
      const cp = view.camera.position;
      outer.current?.getWorldPosition(wp);
      const toCam = Math.atan2(cp.x - (wp.x + sim.x), cp.z - (wp.z + sim.z));
      let d = (toCam - sim.yaw) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      glance = Math.max(-0.7, Math.min(0.7, d * 0.55));
    }
    applyPose(rig, actor.pose, dt, actor.eyeOpen(), clockRef.current, sim.walking, glance);

    // ---- props (room space)
    const deskSlot = isDirector ? null : layout.desks[Math.max(0, sim.desk)];
    const seat = isDirector ? layout.director.seat : deskSlot?.seat ?? { x: 0, z: 0 };
    const seatRot = deskSlot?.rot ?? 0;
    const approachSide = isDirector ? layout.director.approachSide : deskSlot?.approachSide ?? -1;
    const laptopSpot = isDirector ? layout.director.laptop : layout.desks[Math.max(0, sim.desk)]?.laptop ?? { x: 0, z: 0 };
    const deskTop = isDirector ? DESK_TOP + 0.02 : DESK_TOP;

    // bag: back → floor beside the chair
    const bag = rig.bag;
    // the bag is set down on the side opposite to where the worker came from
    const lat = rot2(1, 0, seatRot);
    const side = -approachSide;
    const floor = { x: seat.x + lat.x * side * 0.62, z: seat.z + lat.z * side * 0.62 };
    const bp = toRoom(sim, 0, -0.3 * scale);
    const bx = bp.x;
    const bz = bp.z;
    const bt = ease(actor.bagT);
    bag.visible = sim.onStage;
    bag.position.set(
      bx + (floor.x - bx) * bt,
      (0.86 * scale + (0.23 - 0.86 * scale) * bt) + Math.sin(bt * Math.PI) * 0.35,
      bz + (floor.z - bz) * bt,
    );
    bag.rotation.set(bt * 0.15, sim.yaw + bt * 0.4 * side, 0);
    bag.scale.setScalar(scale / 0.85 * 0.92);

    // laptop
    const lp = actor.lapP;
    laptop.root.visible = lp > 0.001 && sim.onStage;
    if (laptop.root.visible) {
      const bagTop = vBagTop.set(floor.x, 0.5, floor.z);
      const hp = toRoom(sim, 0, 0.42 * scale);
      const hands = vHands.set(hp.x, DESK_TOP + 0.24, hp.z);
      const desk = vDesk.set(laptopSpot.x, deskTop, laptopSpot.z);
      const pos = laptop.root.position;
      let sc = 1;
      if (lp < 1) {
        pos.lerpVectors(bagTop, hands, ease(lp));
        sc = 0.3 + 0.7 * ease(lp * 1.4);
      } else if (lp < 2) {
        pos.lerpVectors(hands, desk, ease(lp - 1));
        pos.y += Math.sin((lp - 1) * Math.PI) * 0.18;
      } else pos.copy(desk);
      laptop.root.scale.setScalar(sc * 1.08);
      // held in front of the body while it is carried, then turned to face the seated worker
      let ly = seatRot;
      if (lp < 1) ly = sim.yaw;
      else if (lp < 2) {
        let d = (seatRot - sim.yaw) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        ly = sim.yaw + d * ease(lp - 1);
      }
      laptop.root.rotation.set(0, ly, 0);
      laptop.lid.rotation.x = actor.lid * 1.85;
      // screen lines "type" themselves
      const clock = clockRef.current;
      laptop.lines.forEach((l, i) => {
        const len = actor.typing > 0.05 ? 0.06 + (0.5 + 0.5 * Math.sin(clock * (4 + i) + i * 2.3)) * 0.22 : 0.08;
        l.scale.x = len;
        l.position.x = -0.16 + len / 2;
      });
      const pulse = 0.85 + Math.sin(clock * 6) * 0.15 * actor.typing;
      laptop.logo.scale.setScalar(pulse);
      laptop.sparks.forEach((s, i) => {
        s.visible = actor.typing > 0.5 && actor.lid > 0.9;
        if (!s.visible) return;
        const ph = (clock * 0.7 + i / laptop.sparks.length) % 1;
        s.position.set(Math.sin(i * 2.1 + clock) * 0.14, 0.22 + ph * 0.55, 0.14 + ph * 0.05);
        s.scale.setScalar(Math.sin(ph * Math.PI) * 1.1);
        s.rotation.z = ph * 4 + i;
      });
    }

    // folder handed to the director
    const f = rig.folder;
    f.visible = actor.folderP >= 1 && actor.folderP < 3 && sim.onStage;
    if (f.visible) {
      const fp = toRoom(sim, 0, 0.55 * scale);
      const held = vHeld.set(fp.x, 0.78 * scale + 0.1, fp.z);
      const pile = vPile.set(layout.director.desk.x + 0.95, DESK_TOP + 0.12, layout.director.desk.z + 0.1);
      if (actor.folderP === 1) f.position.copy(held);
      else {
        const fe = ease((actor.folderT - 1) / 0.55);
        f.position.lerpVectors(held, pile, fe);
        f.position.y += Math.sin(fe * Math.PI) * 0.25;
      }
      f.rotation.set(0, sim.yaw, 0);
    }

    // things in the hand (cup, book, watering can) stay upright in the hand's frame; water effects
    const held = sim.onStage ? actor.held : 'none';
    items.cup.visible = held === 'cup';
    items.book.visible = held === 'book';
    items.can.visible = held === 'can';
    if (held !== 'none') {
      rig.root.updateMatrixWorld(true);
      rig.handHold.getWorldQuaternion(qHand);
      rig.root.getWorldQuaternion(qRoot);
      qRel.copy(qHand).invert().multiply(qRoot);
      qTilt.setFromAxisAngle(tiltAxis, actor.heldTilt);
      const item = held === 'cup' ? items.cup : held === 'book' ? items.book : items.can;
      const off = held === 'cup' ? vTmp.set(0, 0.07, 0.03) : held === 'book' ? vTmp.set(-0.13, 0.03, 0.06) : vTmp.set(0, -0.03, 0.1);
      item.position.copy(off).applyQuaternion(qRel);
      item.quaternion.copy(qRel).multiply(qTilt);
      if (held === 'book') {
        // closed: one block; open: two halves in a shallow V
        items.book.scale.x = 0.5 + 0.5 * actor.bookOpen;
        items.bookLeft.rotation.z = -0.28 * actor.bookOpen;
        items.bookRight.rotation.z = 0.28 * actor.bookOpen;
      }
    }
    // water from the tap of the sink
    const flow = sim.onStage && actor.tap ? actor.tapFlow : 0;
    items.stream.visible = flow > 0.05;
    if (items.stream.visible && actor.tap) {
      items.stream.position.set(actor.tap.x, 0.9, actor.tap.z);
      items.stream.scale.set(1, 0.85 + Math.sin(clockRef.current * 30) * 0.12, 1);
    }
    // ...and from the spout of the can
    const pouring = held === 'can' && actor.pour > 0.35;
    items.drops.forEach((d, i) => {
      d.visible = pouring;
      if (!pouring || !outer.current) return;
      const ph = (clockRef.current * 1.6 + i / items.drops.length) % 1;
      items.spout.getWorldPosition(vDrop);
      outer.current.worldToLocal(vDrop);
      d.position.set(vDrop.x + Math.sin(sim.yaw) * ph * 0.3, vDrop.y - ph * ph * Math.max(0.1, vDrop.y - 0.35), vDrop.z + Math.cos(sim.yaw) * ph * 0.3);
      d.scale.setScalar(1 - ph * 0.4);
    });

    // anchor for the HTML speech bubble
    syncAnchor(personKey, outer.current, wp, sim, scale);

    // selection ring
    if (ring.current) {
      ring.current.visible = selected && sim.onStage;
      ring.current.rotation.z = clockRef.current * 1.5;
    }
  });

  const accent = isDirector ? '#ffb020' : layout.theme.accent;

  return (
    <group ref={outer} name={`actor-${personKey}`}>
      <primitive
        object={rig.root}
        onClick={(e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          useStore.getState().select(personKey);
        }}
      >
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} visible={false} geometry={G.torus(0.62, 0.05, Math.PI * 2, 6, 40)}>
          <meshBasicMaterial color={accent} transparent opacity={0.9} />
        </mesh>
      </primitive>
      <primitive object={rig.bag} />
      <primitive object={laptop.root} />
      <primitive object={rig.folder} />
      <primitive object={items.fx} />
    </group>
  );
}
