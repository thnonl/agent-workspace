import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Prop } from '../world/layout';
import type { RoomTheme } from '../world/palettes';
import { frame } from '../sim/frame';
import {
  ARC, CLAW, FOOS, HOCKEY, HOOP, PIN, PONG, RACE, VR, peekGame, playing, players, type GameLive,
} from '../sim/gamePlay';
import { G, M, MB, group, mesh, shade } from './kit';
import { RB, Ms } from './furniture';
import { PLUSH_COLORS } from './heldItems';

/**
 * The game machines (a room has one, see GAMES in layout.ts). Every model stands in its own frame: the footprint of FOOT centred on the
 * origin, the front (where the players are) towards +z. Screens and lights are unlit materials, so they glow.
 *
 * The parts that move while somebody plays (sticks, buttons, flippers, the claw, mallets and puck, rods, the wheel, balls, the little game on
 * the screen…) are built as plain three.js groups flagged dynamic (the room bake leaves them alone) and follow the machine's live state
 * (sim/gamePlay.ts) every frame; the players' hands go to the same places.
 */

const PI2 = Math.PI / 2;
const DARK = '#2a2d3e';
const CHROME = M('#c9d1de', { metal: 0.6, rough: 0.3 });
const SCREEN = ['#46c2ff', '#ff6fb5', '#7cf29a', '#ffd166'];

/** the room and the index of the machine in its props (both unknown for a preview copy: then nothing moves) */
interface Live {
  roomId?: string;
  idx?: number;
}
interface MProps extends Live {
  p: Prop;
  theme: RoomTheme;
}

/** a group the room bake leaves alone */
function dyn(x = 0, y = 0, z = 0): THREE.Group {
  const g = group(x, y, z);
  g.userData.dynamic = true;
  return g;
}

/** runs `fn` every frame while the room is animated, with the machine's live state and whether anybody plays */
function useLive({ roomId, idx }: Live, fn: (g: GameLive | undefined, on: boolean, t: number, dt: number) => void) {
  useFrame((s, dt) => {
    if (roomId === undefined || idx === undefined || !frame.animRooms.has(roomId)) return;
    const g = peekGame(roomId, idx);
    fn(g, !!g && players(g) > 0, s.clock.elapsedTime, Math.min(dt, 0.1));
  });
}

/** is player `slot` there and settled in (holding the controls) */
const holds = (g: GameLive | undefined, slot: number, k = 0.3) => {
  const pl = g ? playing(g, slot) : null;
  return !!pl && pl.into > k;
};

// ------------------------------------------------------------------ a little game on a screen
type ScreenKind = 'shooter' | 'race' | 'split' | 'dance' | 'vr' | 'pinball';
interface ScreenGame {
  root: THREE.Group;
  update: (g: GameLive | undefined, on: boolean, t: number) => void;
}
/** sprites on a screen plane of size w x h (the group sits on the screen's face; +z towards the viewer); hidden while nobody plays */
function screenGame(kind: ScreenKind, w: number, h: number, seed = 0): ScreenGame {
  const root = dyn(0, 0, 0.004);
  const sprite = (sw: number, sh: number, color: string) => {
    const m = mesh(G.plane(sw, sh), MB(color), 0, 0, 0, { cast: false });
    root.add(m);
    return m;
  };
  const items: THREE.Mesh[] = [];
  const extra: THREE.Mesh[] = [];
  if (kind === 'shooter') {
    // two ships at the bottom, a row of invaders marching, shots going up
    for (let i = 0; i < 2; i++) items.push(sprite(w * 0.08, h * 0.08, i ? '#46c2ff' : '#ff5d73'));
    for (let i = 0; i < 6; i++) extra.push(sprite(w * 0.06, h * 0.07, ['#ffffff', '#7cf29a', '#ffd166'][i % 3]));
    for (let i = 0; i < 2; i++) items.push(sprite(w * 0.012, h * 0.07, '#ffffff'));
  } else if (kind === 'race' || kind === 'split') {
    const halves = kind === 'split' ? 2 : 1;
    for (let hv = 0; hv < halves; hv++) {
      const hw = w / halves;
      const cx = -w / 2 + hw * (hv + 0.5);
      // grass, the road, its dashes, the car
      const road = sprite(hw * 0.5, h * 0.98, '#3a3d50');
      road.position.set(cx, 0, 0.001);
      for (let i = 0; i < 4; i++) {
        const d = sprite(hw * 0.03, h * 0.12, '#ffffff');
        d.position.set(cx, 0, 0.002);
        extra.push(d);
      }
      const car = sprite(hw * 0.08, h * 0.13, hv ? '#46c2ff' : '#ff5d73');
      car.position.set(cx, -h * 0.32, 0.003);
      items.push(car);
    }
    if (halves === 2) sprite(0.012, h, '#1b1d2a').position.set(0, 0, 0.004);
  } else if (kind === 'dance') {
    // four target arrows on top, arrows scrolling up to them
    const cols = ['#ff5d73', '#46c2ff', '#7cf29a', '#ffd166'];
    for (let i = 0; i < 4; i++) {
      const tgt = sprite(w * 0.08, w * 0.08, '#5a5f78');
      tgt.position.set((i - 1.5) * w * 0.14, h * 0.36, 0.001);
    }
    for (let i = 0; i < 8; i++) extra.push(sprite(w * 0.07, w * 0.07, cols[i % 4]));
  } else if (kind === 'vr') {
    for (let i = 0; i < 4; i++) extra.push(sprite(w * 0.12, w * 0.12, SCREEN[(i + seed) % 4]));
  } else if (kind === 'pinball') {
    // the score: blocks lighting up
    for (let i = 0; i < 6; i++) extra.push(sprite(w * 0.1, h * 0.18, '#ffffff'));
  }
  root.visible = false;
  const update = (g: GameLive | undefined, on: boolean, t: number) => {
    root.visible = on;
    if (!on || !g) return;
    const gt = g.gt;
    if (kind === 'shooter') {
      // ships follow the sticks (steer: player 0, car: player 1)
      const duo = g.kind === 'arcadeDuo';
      items[0].visible = !!playing(g, 0) || !duo;
      items[1].visible = duo && !!playing(g, 1);
      items[0].position.set(g.steer * w * 0.4, -h * 0.4, 0.002);
      items[1].position.set(g.car * w * 0.4, -h * 0.4, 0.002);
      const march = Math.sin(gt * 0.8) * w * 0.15;
      const down = ((gt * 0.02) % 0.3) * h;
      extra.forEach((e, i) => e.position.set(march + ((i % 3) - 1) * w * 0.2, h * 0.32 - Math.floor(i / 3) * h * 0.15 - down, 0.002));
      for (let i = 0; i < 2; i++) {
        const shot = items[2 + i];
        const u = (gt * 1.6 + i * 0.5) % 1;
        shot.visible = items[i].visible && g.btn[i][0] >= 0;
        shot.position.set(items[i].position.x, -h * 0.35 + u * h * 0.75, 0.003);
      }
    } else if (kind === 'race' || kind === 'split') {
      const halves = kind === 'split' ? 2 : 1;
      extra.forEach((d, i) => {
        const hv = Math.floor(i / 4);
        const u = ((gt * 1.4 + (i % 4) * 0.25 + hv * 0.1) % 1) - 0.5;
        d.position.y = -u * h;
      });
      items.forEach((car, hv) => {
        const hw = w / halves;
        const cx = -w / 2 + hw * (hv + 0.5);
        const x = hv === 0 ? g.car : Math.sin(gt * 0.9 + 1) * 0.8;
        car.position.x = cx + x * hw * 0.18;
      });
    } else if (kind === 'dance') {
      extra.forEach((e, i) => {
        const u = (gt * 0.5 + i / 8) % 1;
        e.position.set(((i * 3 + Math.floor(gt * 0.5 + i / 8)) % 4 - 1.5) * w * 0.14, -h * 0.45 + u * h * 0.81, 0.002);
        e.visible = u < 0.98;
      });
    } else if (kind === 'vr') {
      extra.forEach((e, i) => {
        e.position.set(Math.sin(t * (0.5 + i * 0.2) + i * 2) * w * 0.35, Math.cos(t * (0.4 + i * 0.15) + i) * h * 0.3, 0.002);
        e.scale.setScalar(0.7 + 0.3 * Math.sin(t * 2 + i));
      });
    } else if (kind === 'pinball') {
      const n = Math.min(6, 1 + (Math.floor(gt * 0.6) % 6));
      extra.forEach((e, i) => {
        e.visible = i < n;
        e.position.set((i - 2.5) * w * 0.13, -h * 0.2, 0.002);
      });
    }
  };
  return { root, update };
}

// ------------------------------------------------------------------ parts
/** a joystick (ball on a stick) whose base is the group's origin: the group tilts */
function stickGroup(color: string): THREE.Group {
  const g = dyn();
  g.add(mesh(G.cyl(0.012, 0.012, 0.09, 8), M(DARK), 0, 0.045, 0, { cast: false }));
  g.add(mesh(G.sphere(0.03, 12, 10), M(color, { rough: 0.35 }), 0, 0.1, 0, { cast: false }));
  return g;
}
/** upright arcade cabinet: one (or two) players, joystick and buttons on a panel at hand height, a lit marquee on top */
function Arcade({ p, duo, live }: { p: Prop; duo?: boolean; live: Live }) {
  const w = duo ? 1.28 : 0.78;
  const body = p.color;
  const glow = SCREEN[p.variant % SCREEN.length];
  const xs = useMemo(() => (duo ? [-ARC.duoX, ARC.duoX] : [0]), [duo]);
  const parts = useMemo(() => {
    const panel = dyn();
    const sticks: THREE.Group[] = [];
    const buttons: THREE.Mesh[][] = [];
    xs.forEach((cx) => {
      const s = stickGroup(cx < 0 || !duo ? '#ff5d73' : '#46c2ff');
      s.position.set(cx + ARC.stickDx, 0.03, 0);
      panel.add(s);
      sticks.push(s);
      const row: THREE.Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const b = mesh(G.cyl(0.022, 0.022, 0.02, 12), MB(['#ffd166', '#ff5d73', '#7cf29a'][i]), cx + ARC.btnDx + i * ARC.btnGap, 0.04, -0.04 + (i % 2) * 0.03, { cast: false });
        panel.add(b);
        row.push(b);
      }
      buttons.push(row);
    });
    const screen = screenGame('shooter', w - 0.2, 0.4);
    return { panel, sticks, buttons, screen };
  }, [xs, duo, w]);
  useLive(live, (g, on, t) => {
    parts.screen.update(g, on, t);
    parts.sticks.forEach((s, i) => {
      const act = on && g && playing(g, i);
      s.rotation.set(act ? g.stick[i][1] : 0, 0, act ? -g.stick[i][0] : 0);
      parts.buttons[i].forEach((b, j) => (b.position.y = 0.04 - (act && g.btn[i][0] === j ? g.btn[i][1] * 0.012 : 0)));
    });
  });
  return (
    <group>
      {/* the lower body up to the panel, the box behind the panel, the screen housing */}
      <RB size={[w, ARC.panelY - 0.04, 0.66]} pos={[0, (ARC.panelY - 0.04) / 2, -0.02]} color={body} r={0.04} />
      <RB size={[w, 0.5, 0.48]} pos={[0, ARC.panelY + 0.2, -0.11]} color={body} r={0.04} />
      <RB size={[w, 0.66, 0.42]} pos={[0, 1.52, -0.16]} color={body} r={0.04} />
      {/* side art stripes */}
      {[-1, 1].map((s) => <RB key={s} size={[0.02, 1.7, 0.5]} pos={[s * (w / 2 + 0.005), 0.95, -0.05]} color={p.color2} r={0.01} cast={false} />)}
      {/* screen, tilted back */}
      <group position={[0, 1.36, 0.1]} rotation={[-0.25, 0, 0]}>
        <RB size={[w - 0.12, 0.5, 0.04]} color={DARK} r={0.02} />
        <Ms geo={G.plane(w - 0.2, 0.4)} mat={MB(glow)} pos={[0, 0, 0.022]} cast={false} />
        <Ms geo={G.plane(w * 0.3, 0.06)} mat={MB('#ffffff')} pos={[-(w - 0.2) * 0.2, 0.12, 0.024]} cast={false} />
        <group position={[0, 0, 0.022]}>
          <primitive object={parts.screen.root} />
        </group>
      </group>
      {/* marquee */}
      <RB size={[w, 0.2, 0.36]} pos={[0, 1.9, -0.12]} color={DARK} r={0.03} />
      <Ms geo={G.plane(w - 0.08, 0.15)} mat={MB(shade(p.color2, 0.25))} pos={[0, 1.9, 0.065]} cast={false} />
      {/* control panel */}
      <group position={[0, ARC.panelY, ARC.panelZ]} rotation={[ARC.tilt, 0, 0]}>
        <RB size={[w, 0.06, 0.32]} color={DARK} r={0.02} />
        <primitive object={parts.panel} />
      </group>
      {/* coin door */}
      <RB size={[0.22, 0.26, 0.02]} pos={[0, 0.42, 0.32]} color={shade(body, -0.25)} r={0.01} cast={false} />
      <Ms geo={G.plane(0.05, 0.08)} mat={MB('#ff8a3d')} pos={[0, 0.47, 0.332]} cast={false} />
    </group>
  );
}

/** pinball table: slanted playfield under glass on four legs, a backbox with the score at the back, a flipper button on each side */
function Pinball({ p, live }: { p: Prop; live: Live }) {
  const parts = useMemo(() => {
    const field = dyn();
    // the flippers turn about their outer ends
    const flippers = [-1, 1].map((s) => {
      const f = dyn(s * PIN.flipX, 0.12, PIN.flipZ);
      f.add(mesh(G.rbox(PIN.flipLen, 0.03, 0.04, 0.01), MB('#ffffff'), -s * (PIN.flipLen / 2 - 0.01), 0, 0, { cast: false }));
      field.add(f);
      return f;
    });
    const bumpers = PIN.bumpers.map(([x, z], i) => {
      const b = mesh(G.cyl(0.05, 0.05, 0.06, 14), MB(SCREEN[i]), x, 0.13, z, { cast: false });
      field.add(b);
      return b;
    });
    const ball = mesh(G.sphere(0.022, 10, 8), CHROME, 0.26, 0.13, 0.55, { cast: false });
    field.add(ball);
    const buttons = [-1, 1].map((s) => {
      const b = mesh(G.cyl(0.025, 0.025, 0.03, 12), MB(s < 0 ? '#ff5d73' : '#46c2ff'), s * PIN.btnX, PIN.btnY, PIN.btnZ, { r: [0, 0, PI2], cast: false });
      b.userData.dynamic = true;
      return b;
    });
    const score = screenGame('pinball', 0.6, 0.55);
    return { field, flippers, bumpers, ball, buttons, score };
  }, []);
  useLive(live, (g, on, t) => {
    const fl = on && g ? g.flip : [0, 0];
    parts.flippers.forEach((f, i) => {
      const s = i === 0 ? -1 : 1;
      f.rotation.y = s * (0.4 - 0.8 * fl[i]);
    });
    parts.buttons.forEach((b, i) => (b.position.x = (i === 0 ? -1 : 1) * (PIN.btnX - fl[i] * 0.012)));
    parts.bumpers.forEach((b, i) => b.scale.setScalar(1 + (on && g ? g.bump[i] * 0.25 : 0)));
    parts.ball.visible = !on || !!g?.ballOn;
    if (on && g?.ballOn) parts.ball.position.set(g.ball[0], 0.13, g.ball[2]);
    else parts.ball.position.set(0.26, 0.13, 0.55);
    parts.score.update(g, on, t);
  });
  return (
    <group>
      {[[-0.31, 0.6], [0.31, 0.6], [-0.31, -0.6], [0.31, -0.6]].map(([x, z], i) => (
        <Ms key={i} geo={G.cyl(0.03, 0.03, 0.8, 8)} mat={CHROME} pos={[x, 0.4, z]} />
      ))}
      <group position={[0, PIN.y, 0]} rotation={[PIN.tilt, 0, 0]}>
        <RB size={[0.72, 0.2, 1.35]} color={p.color} r={0.04} />
        <Ms geo={G.plane(0.62, 1.24)} mat={MB(shade(p.color2, 0.2))} pos={[0, 0.101, 0]} rot={[-PI2, 0, 0]} cast={false} />
        {/* the plunger lane */}
        <Ms geo={G.plane(0.012, 0.5)} mat={MB('#ffffff')} pos={[0.22, 0.102, 0.35]} rot={[-PI2, 0, 0]} cast={false} />
        <primitive object={parts.field} />
        <Ms geo={G.plane(0.66, 1.3)} mat={M('#cdefff', { opacity: 0.25, rough: 0.05 })} pos={[0, 0.115, 0]} rot={[-PI2, 0, 0]} cast={false} />
      </group>
      {parts.buttons.map((b, i) => <primitive key={i} object={b} />)}
      {/* backbox */}
      <RB size={[0.72, 0.72, 0.16]} pos={[0, 1.3, -0.62]} color={DARK} r={0.03} />
      <Ms geo={G.plane(0.6, 0.55)} mat={MB(SCREEN[p.variant % SCREEN.length])} pos={[0, 1.32, -0.539]} cast={false} />
      <Ms geo={G.plane(0.4, 0.08)} mat={MB('#ffffff')} pos={[0, 1.5, -0.537]} cast={false} />
      <group position={[0, 1.32, -0.537]}>
        <primitive object={parts.score.root} />
      </group>
    </group>
  );
}

/** claw crane: a glass case full of plush toys over a cabinet, the claw on its cable, the panel with the stick, the prize flap */
function ClawMachine({ p, live }: { p: Prop; live: Live }) {
  const parts = useMemo(() => {
    const claw = dyn(0, CLAW.restY, 0);
    const cable = mesh(G.cyl(0.006, 0.006, 1, 6), CHROME, 0, 0.5, 0, { cast: false });
    claw.add(cable);
    claw.add(mesh(G.cyl(0.035, 0.03, 0.05, 10), CHROME, 0, 0.02, 0, { cast: false }));
    const prongs = [0, 2.1, 4.2].map((a) => {
      const pr = group(Math.sin(a) * 0.03, 0, Math.cos(a) * 0.03);
      pr.rotation.y = a;
      const tip = group();
      tip.add(mesh(G.cyl(0.008, 0.006, 0.11, 6), CHROME, 0, -0.055, 0, { cast: false }));
      tip.add(mesh(G.sphere(0.012, 6, 5), CHROME, 0, -0.11, -0.012, { cast: false }));
      pr.add(tip);
      claw.add(pr);
      return tip;
    });
    const toy = mesh(G.sphere(0.075, 12, 10), M(PLUSH_COLORS[0], { rough: 0.9 }), 0, -0.13, 0, { cast: false });
    claw.add(toy);
    const falling = mesh(G.sphere(0.075, 12, 10), M(PLUSH_COLORS[0], { rough: 0.9 }), CLAW.chute[0], 1.0, CLAW.chute[1], { cast: false });
    falling.userData.dynamic = true;
    const stick = stickGroup('#ff5d73');
    stick.position.set(CLAW.stickX, CLAW.panelY + 0.03, CLAW.panelZ);
    const button = mesh(G.cyl(0.03, 0.03, 0.025, 12), MB('#7cf29a'), CLAW.btnX, CLAW.panelY + 0.04, CLAW.panelZ - 0.02, { cast: false });
    button.userData.dynamic = true;
    return { claw, cable, prongs, toy, falling, stick, button, last: [0, 0] };
  }, []);
  const toyMats = useMemo(() => PLUSH_COLORS.map((c) => M(c, { rough: 0.9 })), []);
  useLive(live, (g, on, _t, dt) => {
    const c = on && g ? g.claw : [0, CLAW.restY, 0];
    const { claw, cable, prongs, toy, falling, stick, button, last } = parts;
    claw.position.set(c[0], c[1], c[2]);
    // the cable from the trolley under the lid down to the claw
    const len = 1.76 - c[1];
    cable.scale.y = Math.max(0.01, len);
    cable.position.y = len / 2;
    const close = on && g ? g.clawClose : 0.4;
    prongs.forEach((pr) => (pr.rotation.x = -0.55 + 0.45 * close));
    toy.visible = !!(on && g && g.prize >= 0);
    if (toy.visible) toy.material = toyMats[g!.prize % toyMats.length];
    falling.visible = !!(on && g && g.prizeFall >= 0);
    if (falling.visible) {
      falling.material = toyMats[Math.max(0, g!.won >= 0 ? g!.won : 0) % toyMats.length];
      falling.position.y = 1.5 - (g!.prizeFall ** 2) * 1.1;
    }
    // the stick leans the way the claw goes; the button sinks as it drops
    const vx = dt > 0 ? (c[0] - last[0]) / dt : 0;
    const vz = dt > 0 ? (c[2] - last[1]) / dt : 0;
    last[0] = c[0];
    last[1] = c[2];
    stick.rotation.set(THREE.MathUtils.clamp(vz * 3, -0.35, 0.35), 0, THREE.MathUtils.clamp(-vx * 3, -0.35, 0.35));
    button.position.y = CLAW.panelY + 0.04 - (on && g && g.clawDrop > 0 && g.clawDrop < 0.25 ? 0.012 : 0);
  });
  const toys = PLUSH_COLORS;
  return (
    <group>
      <RB size={[0.88, 0.9, 0.88]} pos={[0, 0.45, 0]} color={p.color} r={0.05} />
      {/* the case */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <RB key={i} size={[0.05, 0.85, 0.05]} pos={[sx * 0.415, 1.33, sz * 0.415]} color={p.color2} r={0.015} />
      ))}
      <RB size={[0.88, 0.18, 0.88]} pos={[0, 1.85, 0]} color={p.color} r={0.05} />
      <Ms geo={G.plane(0.7, 0.12)} mat={MB('#fff3b0')} pos={[0, 1.85, 0.442]} cast={false} />
      <Ms geo={G.box(0.8, 0.82, 0.8)} mat={M('#cdefff', { opacity: 0.22, rough: 0.05 })} pos={[0, 1.33, 0]} cast={false} />
      {/* the pile of plush toys */}
      {Array.from({ length: 11 }, (_, i) => (
        <Ms key={i} geo={G.sphere(0.075, 12, 10)} mat={M(toys[(i + p.variant) % toys.length], { rough: 0.9 })} pos={[((i * 37) % 7) / 7 * 0.56 - 0.28, 0.96 + (i % 3) * 0.06, ((i * 53) % 5) / 5 * 0.5 - 0.25]} cast={false} />
      ))}
      {/* the prize chute in the front corner */}
      <RB size={[0.2, 0.04, 0.2]} pos={[CLAW.chute[0], 1.02, CLAW.chute[1]]} color={p.color2} r={0.01} cast={false} />
      <primitive object={parts.claw} />
      <primitive object={parts.falling} />
      {/* panel with the stick and the button, and the prize flap */}
      <RB size={[0.7, 0.06, 0.2]} pos={[0, CLAW.panelY, CLAW.panelZ - 0.04]} color={DARK} r={0.02} />
      <primitive object={parts.stick} />
      <primitive object={parts.button} />
      <RB size={[0.28, 0.24, 0.02]} pos={[CLAW.flap[0], CLAW.flap[1], 0.45]} color={DARK} r={0.01} cast={false} />
    </group>
  );
}

/** air hockey table: white field with a centre line and two goals, two mallets and a puck */
function AirHockey({ p, live }: { p: Prop; live: Live }) {
  const parts = useMemo(() => {
    const mallets = [1, -1].map((s) => {
      const m = dyn(0.1 * s, HOCKEY.y + 0.02, s * 0.6);
      const mat = M(s > 0 ? '#ff5d73' : '#46c2ff', { rough: 0.3 });
      m.add(mesh(G.cyl(HOCKEY.mallet, HOCKEY.mallet, 0.04, 16), mat, 0, 0, 0, { cast: false }));
      m.add(mesh(G.cyl(0.02, 0.025, 0.05, 10), mat, 0, 0.04, 0, { cast: false }));
      m.add(mesh(G.sphere(0.026, 10, 8), mat, 0, 0.07, 0, { cast: false }));
      return m;
    });
    const puck = mesh(G.cyl(HOCKEY.puck, HOCKEY.puck, 0.012, 14), M('#ffd166'), -0.12, HOCKEY.y + 0.008, 0.1, { cast: false });
    puck.userData.dynamic = true;
    return { mallets, puck };
  }, []);
  useLive(live, (g, on) => {
    parts.mallets.forEach((m, i) => {
      const s = i === 0 ? 1 : -1;
      if (on && g) m.position.set(g.mallet[i][0], HOCKEY.y + 0.02, g.mallet[i][1]);
      else m.position.set(0.1 * s, HOCKEY.y + 0.02, s * 0.6);
    });
    if (on && g) parts.puck.position.set(g.ball[0], HOCKEY.y + 0.008, g.ball[2]);
    else parts.puck.position.set(-0.12, HOCKEY.y + 0.008, 0.1);
  });
  return (
    <group>
      {[[-0.45, 0.85], [0.45, 0.85], [-0.45, -0.85], [0.45, -0.85]].map(([x, z], i) => (
        <RB key={i} size={[0.08, 0.7, 0.08]} pos={[x, 0.35, z]} color={DARK} r={0.02} />
      ))}
      <RB size={[1.1, 0.14, 2.0]} pos={[0, 0.76, 0]} color={p.color} r={0.04} />
      <RB size={[0.96, 0.02, 1.86]} pos={[0, 0.835, 0]} color="#f4f8ff" r={0.01} cast={false} />
      <Ms geo={G.plane(0.96, 0.02)} mat={MB('#ff5d73')} pos={[0, 0.847, 0]} rot={[-PI2, 0, 0]} cast={false} />
      <Ms geo={G.torus(0.18, 0.008, Math.PI * 2, 6, 24)} mat={MB('#46c2ff')} pos={[0, 0.847, 0]} rot={[PI2, 0, 0]} cast={false} />
      {[-1, 1].map((s) => <RB key={s} size={[0.3, 0.05, 0.03]} pos={[0, 0.85, s * 0.94]} color={DARK} r={0.01} cast={false} />)}
      {parts.mallets.map((m, i) => <primitive key={i} object={m} />)}
      <primitive object={parts.puck} />
    </group>
  );
}

/** foosball table: a green field in a box, rods with little players sticking out at both long sides (they slide and spin), a ball */
function Foosball({ p, live }: { p: Prop; live: Live }) {
  const parts = useMemo(() => {
    const rods = FOOS.rods.map((x, i) => {
      const r = dyn(x, FOOS.y, 0);
      r.add(mesh(G.cyl(0.012, 0.012, 1.05, 8), CHROME, 0, 0, 0, { r: [PI2, 0, 0], cast: false }));
      r.add(mesh(G.cyl(0.03, 0.03, 0.09, 10), M(DARK), 0, 0, (i % 2 ? 1 : -1) * 0.52, { r: [PI2, 0, 0], cast: false }));
      for (const z of FOOS.men) r.add(mesh(G.rbox(0.04, 0.12, 0.05, 0.01), M(i % 2 ? '#ff5d73' : '#46c2ff'), 0, -0.03, z, { cast: false }));
      return r;
    });
    const ball = mesh(G.sphere(0.022, 10, 8), M('#ffffff'), 0.07, 0.962, 0.05, { cast: false });
    ball.userData.dynamic = true;
    return { rods, ball };
  }, []);
  useLive(live, (g, on) => {
    parts.rods.forEach((r, i) => {
      r.position.z = on && g ? g.rodSlide[i] : 0;
      r.rotation.z = on && g ? g.rodSpin[i] : 0;
    });
    if (on && g) parts.ball.position.set(g.ball[0], 0.962, g.ball[2]);
    else parts.ball.position.set(0.07, 0.962, 0.05);
  });
  return (
    <group>
      {[[-0.6, 0.3], [0.6, 0.3], [-0.6, -0.3], [0.6, -0.3]].map(([x, z], i) => (
        <RB key={i} size={[0.08, 0.7, 0.08]} pos={[x, 0.35, z]} color={shade(p.color, -0.2)} r={0.02} />
      ))}
      <RB size={[1.25, 0.28, 0.76]} pos={[0, 0.82, 0]} color={p.color} r={0.04} />
      <RB size={[1.1, 0.02, 0.62]} pos={[0, 0.94, 0]} color="#4fb86f" r={0.01} cast={false} />
      <Ms geo={G.plane(0.02, 0.62)} mat={MB('#ffffff')} pos={[0, 0.952, 0]} rot={[-PI2, 0, 0]} cast={false} />
      {/* the goals at the ends */}
      {[-1, 1].map((s) => <RB key={s} size={[0.03, 0.06, 0.2]} pos={[s * 0.56, 0.97, 0]} color="#1b1d2a" r={0.01} cast={false} />)}
      {parts.rods.map((r, i) => <primitive key={i} object={r} />)}
      <primitive object={parts.ball} />
    </group>
  );
}

/** dance machine: a tall cabinet with a big screen and speakers, two arrow pads on the floor in front of it (the arrows light up under the feet) */
function DanceMachine({ p, live }: { p: Prop; live: Live }) {
  const arrow = ['#ff5d73', '#46c2ff', '#7cf29a', '#ffd166'];
  const parts = useMemo(() => {
    const dim = arrow.map((c) => MB(shade(c, -0.45)));
    const lit = arrow.map((c) => MB(shade(c, 0.25)));
    const pads = [-0.42, 0.42].map((x) => {
      const g = dyn(x, 0, 0.88);
      const arrows = [[0, -0.26, 0], [0, 0.26, Math.PI], [-0.26, 0, PI2], [0.26, 0, -PI2]].map(([ax, az, rot], i) => {
        const a = mesh(G.cone(0.08, 0.14, 3), dim[i], ax, 0.065, az, { r: [-PI2, 0, rot], s: [1, 1, 0.12], cast: false });
        g.add(a);
        return a;
      });
      return { g, arrows };
    });
    const screen = screenGame('dance', 1.1, 0.75);
    return { pads, dim, lit, screen };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useLive(live, (g, on, t) => {
    parts.pads.forEach((pad, i) => {
      const bits = on && g && playing(g, i) ? g.lit[i] : 0;
      pad.arrows.forEach((a, j) => (a.material = bits & (1 << j) ? parts.lit[j] : parts.dim[j]));
    });
    parts.screen.update(g, on, t);
  });
  return (
    <group>
      <RB size={[1.6, 2.1, 0.58]} pos={[0, 1.05, 0]} color={DARK} r={0.05} />
      <Ms geo={G.plane(1.1, 0.75)} mat={MB(SCREEN[p.variant % SCREEN.length])} pos={[0, 1.45, 0.292]} cast={false} />
      <Ms geo={G.plane(0.5, 0.1)} mat={MB('#ffffff')} pos={[0, 1.7, 0.295]} cast={false} />
      <group position={[0, 1.45, 0.294]}>
        <primitive object={parts.screen.root} />
      </group>
      {[-1, 1].map((s) => (
        <group key={s}>
          <RB size={[0.22, 0.9, 0.04]} pos={[s * 0.68, 1.45, 0.3]} color={p.color} r={0.02} cast={false} />
          <Ms geo={G.cyl(0.07, 0.07, 0.03, 16)} mat={M('#1b1d2a')} pos={[s * 0.68, 1.7, 0.33]} rot={[PI2, 0, 0]} cast={false} />
          <Ms geo={G.cyl(0.07, 0.07, 0.03, 16)} mat={M('#1b1d2a')} pos={[s * 0.68, 1.3, 0.33]} rot={[PI2, 0, 0]} cast={false} />
        </group>
      ))}
      <RB size={[1.6, 0.18, 0.4]} pos={[0, 2.0, 0.18]} color={p.color2} r={0.04} />
      <Ms geo={G.plane(1.4, 0.12)} mat={MB(shade(p.color2, 0.3))} pos={[0, 2.0, 0.382]} cast={false} />
      {/* the pads (on the floor in front: not part of the footprint, one stands on them) */}
      {[-0.42, 0.42].map((x) => <RB key={x} size={[0.78, 0.06, 0.82]} pos={[x, 0.03, 0.88]} color="#3a3d50" r={0.02} receive />)}
      {parts.pads.map((pad, i) => <primitive key={i} object={pad.g} />)}
    </group>
  );
}

/** two controllers lying on a cabinet top; the one of a player who picked it up is gone */
function usePads(spots: [number, number, number][], y: number, colors: THREE.Material[]) {
  return useMemo(
    () =>
      spots.map(([x, z, ry], i) => {
        const c = dyn(x, y, z);
        c.rotation.y = ry;
        c.add(mesh(G.rbox(0.16, 0.035, 0.09, 0.02), colors[i % colors.length], 0, 0, 0, { cast: false }));
        c.add(mesh(G.plane(0.06, 0.004), MB('#46c2ff'), 0, 0.019, -0.03, { r: [-PI2, 0, 0], cast: false }));
        return c;
      }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

/** a big TV on a low cabinet with a console and two controllers: two players stand in front of it */
function ConsoleTv({ p, theme, live }: { p: Prop; theme: RoomTheme; live: Live }) {
  const pads = usePads([[0.35, 0.1, 0.2], [0.55, 0.1, -0.3]], 0.52, [M('#46c2ff', { rough: 0.4 }), M('#ff5d73', { rough: 0.4 })]);
  const screen = useMemo(() => screenGame('split', 1.24, 0.68), []);
  useLive(live, (g, on, t) => {
    pads.forEach((c, i) => (c.visible = !holds(g, i)));
    screen.update(g, on, t);
  });
  return (
    <group>
      <RB size={[1.5, 0.48, 0.46]} pos={[0, 0.24, 0]} color={shade(theme.desk, -0.08)} r={0.03} />
      <RB size={[1.46, 0.02, 0.44]} pos={[0, 0.49, 0]} color={theme.deskTop} r={0.01} cast={false} />
      {/* the TV */}
      <RB size={[0.2, 0.05, 0.16]} pos={[0, 0.52, -0.05]} color={DARK} r={0.01} />
      <Ms geo={G.cyl(0.02, 0.02, 0.12, 8)} mat={M(DARK)} pos={[0, 0.6, -0.05]} />
      <RB size={[1.32, 0.76, 0.05]} pos={[0, 1.03, -0.06]} color={DARK} r={0.02} />
      <Ms geo={G.plane(1.24, 0.68)} mat={MB(SCREEN[p.variant % SCREEN.length])} pos={[0, 1.03, -0.033]} cast={false} />
      <Ms geo={G.plane(0.5, 0.08)} mat={MB('#ffffff')} pos={[0.2, 1.22, -0.031]} cast={false} />
      <group position={[0, 1.03, -0.031]}>
        <primitive object={screen.root} />
      </group>
      {/* the console and the controllers lying in front of it */}
      <RB size={[0.34, 0.07, 0.24]} pos={[-0.45, 0.535, 0.05]} color={p.variant % 2 ? '#f4f6fb' : '#20222e'} r={0.02} cast={false} />
      <Ms geo={G.plane(0.06, 0.008)} mat={MB('#46c2ff')} pos={[-0.45, 0.535, 0.171]} cast={false} />
      {pads.map((c, i) => <primitive key={i} object={c} />)}
      {/* a little rug where the players stand */}
      <RB size={[1.6, 0.012, 0.9]} pos={[0, 0.006, 1.65]} color={p.color2} r={0.004} cast={false} receive />
    </group>
  );
}

/** racing simulator: a frame with a screen, the wheel on its column, pedals, and the bucket seat in front (one sits there) */
function RacingSim({ p, live }: { p: Prop; live: Live }) {
  const parts = useMemo(() => {
    const wheel = dyn(0, RACE.wheelY, RACE.wheelZ);
    wheel.rotation.x = RACE.wheelTilt;
    const spin = group();
    spin.add(mesh(G.torus(RACE.rim, 0.022, Math.PI * 2, 8, 24), M('#1b1d2a', { rough: 0.5 }), 0, 0, 0));
    spin.add(mesh(G.rbox(0.26, 0.03, 0.04, 0.01), M(p.color, { rough: 0.7 }), 0, 0, 0, { cast: false }));
    spin.add(mesh(G.rbox(0.03, 0.12, 0.03, 0.01), M(p.color, { rough: 0.7 }), 0, -0.06, 0, { cast: false }));
    wheel.add(spin);
    const screen = screenGame('race', 0.78, 0.42);
    return { wheel, spin, screen };
  }, [p.color]);
  useLive(live, (g, on, t) => {
    parts.spin.rotation.z = on && g ? -g.steer * 0.9 : 0;
    parts.screen.update(g, on, t);
  });
  const sz = RACE.seatZ;
  return (
    <group>
      {/* frame and screen */}
      <RB size={[0.9, 0.06, 0.66]} pos={[0, 0.03, 0]} color={DARK} r={0.02} />
      {[-0.4, 0.4].map((x) => <RB key={x} size={[0.05, 1.15, 0.05]} pos={[x, 0.6, -0.28]} color={DARK} r={0.015} />)}
      <RB size={[0.86, 0.5, 0.06]} pos={[0, 1.0, -0.28]} color="#1b1d2a" r={0.02} />
      <Ms geo={G.plane(0.78, 0.42)} mat={MB(SCREEN[p.variant % SCREEN.length])} pos={[0, 1.0, -0.247]} cast={false} />
      <group position={[0, 1.0, -0.245]}>
        <primitive object={parts.screen.root} />
      </group>
      {/* wheel column, the wheel turning with the steering */}
      <RB size={[0.08, RACE.wheelY - 0.06, 0.08]} pos={[0, (RACE.wheelY - 0.06) / 2, RACE.wheelZ - 0.08]} color={DARK} r={0.02} />
      <primitive object={parts.wheel} />
      {/* pedals */}
      {[-0.1, 0.1].map((x) => <RB key={x} size={[0.07, 0.02, 0.12]} pos={[x, 0.09, sz - 0.34]} rot={[-0.5, 0, 0]} color="#8b92a6" r={0.005} cast={false} />)}
      {/* the bucket seat (in front of the footprint: one sits in it) */}
      <group position={[0, 0, sz]}>
        <RB size={[0.55, 0.1, 0.5]} pos={[0, RACE.seatTop - 0.05, 0.02]} color={p.color} r={0.04} />
        <RB size={[0.55, 0.75, 0.14]} pos={[0, RACE.seatTop + 0.33, 0.3]} rot={[0.2, 0, 0]} color={p.color} r={0.06} />
        <RB size={[0.6, RACE.seatTop - 0.1, 0.56]} pos={[0, (RACE.seatTop - 0.1) / 2, 0.05]} color={DARK} r={0.03} />
        {[-1, 1].map((s) => <RB key={s} size={[0.06, 0.2, 0.46]} pos={[s * 0.28, RACE.seatTop + 0.06, 0.04]} color={shade(p.color, -0.15)} r={0.02} cast={false} />)}
      </group>
    </group>
  );
}

/** virtual reality corner: a kiosk with a screen, the headset and a controller on a hook (gone while somebody wears them), a play mat */
function VrStation({ p, live }: { p: Prop; live: Live }) {
  const parts = useMemo(() => {
    const kit = dyn();
    const [hx, hy, hz] = VR.hook;
    kit.add(mesh(G.rbox(0.2, 0.1, 0.1, 0.03), M('#f4f6fb'), hx, hy, hz, { cast: false }));
    kit.add(mesh(G.plane(0.16, 0.05), MB('#20222e'), hx, hy, hz + 0.052, { cast: false }));
    kit.add(mesh(G.capsule(0.025, 0.08, 4, 8), M('#20222e'), -0.18, 0.66, 0.27, { cast: false }));
    const screen = screenGame('vr', 0.44, 0.34, p.variant);
    return { kit, screen };
  }, [p.variant]);
  useLive(live, (g, on, t) => {
    parts.kit.visible = !holds(g, 0, 0.5);
    parts.screen.update(g, on, t);
  });
  return (
    <group>
      <RB size={[0.62, 1.5, 0.42]} pos={[0, 0.75, 0]} color={p.color} r={0.06} />
      <Ms geo={G.plane(0.44, 0.34)} mat={MB(SCREEN[p.variant % SCREEN.length])} pos={[0, 1.18, 0.212]} cast={false} />
      <Ms geo={G.plane(0.3, 0.06)} mat={MB('#ffffff')} pos={[0, 0.9, 0.212]} cast={false} />
      <group position={[0, 1.18, 0.213]}>
        <primitive object={parts.screen.root} />
      </group>
      {/* the hooks */}
      <Ms geo={G.cyl(0.01, 0.01, 0.12, 6)} mat={CHROME} pos={[0.2, 0.7, 0.26]} rot={[PI2, 0, 0]} cast={false} />
      <Ms geo={G.cyl(0.01, 0.01, 0.1, 6)} mat={CHROME} pos={[-0.18, 0.72, 0.26]} rot={[PI2, 0, 0]} cast={false} />
      <primitive object={parts.kit} />
      {/* the play mat: a ring on the floor */}
      <Ms geo={G.cyl(0.7, 0.7, 0.012, 32)} mat={M(shade(p.color2, -0.05), { rough: 0.95 })} pos={[0, 0.006, 1.25]} receive cast={false} />
      <Ms geo={G.torus(0.62, 0.02, Math.PI * 2, 6, 40)} mat={MB(SCREEN[(p.variant + 1) % SCREEN.length])} pos={[0, 0.016, 1.25]} rot={[PI2, 0, 0]} cast={false} />
    </group>
  );
}

/** ping-pong table: two halves, the net across the middle, a paddle at each end (picked up by the players), the ball */
function PingPong({ p, live }: { p: Prop; live: Live }) {
  const top = p.variant % 2 ? '#2f7d5b' : '#2c5aa0';
  const parts = useMemo(() => {
    const paddles = [1, -1].map((s) => {
      const g = dyn(0.45 * s, 0.795, s * 1.0);
      g.rotation.y = s * 0.6;
      g.add(mesh(G.cyl(0.075, 0.075, 0.012, 16), M(s > 0 ? '#e63946' : '#1b1d2a'), 0, 0, 0, { cast: false }));
      g.add(mesh(G.rbox(0.03, 0.02, 0.1, 0.005), M('#c8a274'), 0, 0, 0.12, { cast: false }));
      return g;
    });
    const ball = mesh(G.sphere(0.02, 10, 8), M('#ffffff'), -0.2, 0.8, -0.4, { cast: false });
    ball.userData.dynamic = true;
    return { paddles, ball };
  }, []);
  useLive(live, (g, on) => {
    parts.paddles.forEach((pd, i) => (pd.visible = !holds(g, i)));
    if (on && g?.ballOn) parts.ball.position.set(g.ball[0], g.ball[1], g.ball[2]);
    else parts.ball.position.set(-0.2, 0.8, -0.4);
  });
  return (
    <group>
      {[[-0.65, 1.1], [0.65, 1.1], [-0.65, -1.1], [0.65, -1.1]].map(([x, z], i) => (
        <RB key={i} size={[0.06, 0.72, 0.06]} pos={[x, 0.36, z]} color={DARK} r={0.015} />
      ))}
      <RB size={[1.5, 0.05, 2.6]} pos={[0, PONG.y - 0.025, 0]} color={top} r={0.015} />
      <Ms geo={G.plane(0.02, 2.6)} mat={MB('#ffffff')} pos={[0, PONG.y + 0.002, 0]} rot={[-PI2, 0, 0]} cast={false} />
      {[-1, 1].map((s) => <Ms key={s} geo={G.plane(1.5, 0.02)} mat={MB('#ffffff')} pos={[0, PONG.y + 0.002, s * 1.29]} rot={[-PI2, 0, 0]} cast={false} />)}
      {/* the net */}
      <Ms geo={G.plane(1.6, 0.15)} mat={M('#f4f6fb', { opacity: 0.7, side: 2 })} pos={[0, 0.86, 0]} cast={false} />
      {[-1, 1].map((s) => <Ms key={s} geo={G.cyl(0.012, 0.012, 0.18, 6)} mat={CHROME} pos={[s * 0.8, 0.86, 0]} cast={false} />)}
      {parts.paddles.map((pd, i) => <primitive key={i} object={pd} />)}
      <primitive object={parts.ball} />
    </group>
  );
}

/** basketball arcade: a lane rising to a backboard with a hoop and a net, balls ready in the tray, the score on top */
function Hoops({ p, live }: { p: Prop; live: Live }) {
  const parts = useMemo(() => {
    const ballMat = M('#f08a24', { rough: 0.6 });
    const tray = HOOP.trayX.map((x) => {
      const b = mesh(G.sphere(HOOP.ball, 14, 10), ballMat, x, HOOP.trayY, HOOP.trayZ, { cast: false });
      b.userData.dynamic = true;
      return b;
    });
    const ball = mesh(G.sphere(HOOP.ball, 14, 10), ballMat, 0, 1, 1, { cast: false });
    ball.userData.dynamic = true;
    ball.visible = false;
    const flash = mesh(G.plane(0.86, 0.24), MB('#ffffff'), 0, 2.45, -0.985, { cast: false });
    flash.userData.dynamic = true;
    flash.visible = false;
    return { tray, ball, flash };
  }, []);
  useLive(live, (g, on) => {
    parts.tray.forEach((b, i) => (b.visible = !(on && g && g.out === i)));
    parts.ball.visible = !!(on && g?.ballOn);
    if (parts.ball.visible) parts.ball.position.set(g!.ball[0], g!.ball[1], g!.ball[2]);
    // the score board flashes on a basket
    parts.flash.visible = !!(on && g && g.gt - g.goalAt < 0.9 && Math.floor((g.gt - g.goalAt) * 8) % 2 === 0);
  });
  return (
    <group>
      {/* the front cabinet with the ball tray on top */}
      <RB size={[1.0, 0.8, 0.6]} pos={[0, 0.4, 0.8]} color={shade(p.color, -0.2)} r={0.04} />
      <RB size={[0.9, 0.06, 0.45]} pos={[0, 0.82, 0.8]} color={DARK} r={0.02} cast={false} />
      {parts.tray.map((b, i) => <primitive key={i} object={b} />)}
      {/* the lane, rising from the tray towards the hoop, with its side nets */}
      <group position={[0, 1.02, -0.25]} rotation={[0.23, 0, 0]}>
        <RB size={[0.96, 0.06, 1.55]} color={p.color} r={0.02} />
        {[-1, 1].map((s) => <Ms key={s} geo={G.plane(1.55, 0.9)} mat={M('#f4f6fb', { opacity: 0.3, side: 2 })} pos={[s * 0.47, 0.45, 0]} rot={[0, PI2, 0]} cast={false} />)}
      </group>
      <RB size={[0.9, 1.0, 0.06]} pos={[0, 0.5, -0.9]} color={shade(p.color, -0.3)} r={0.02} />
      {/* backboard, hoop and net */}
      {[-0.45, 0.45].map((x) => <RB key={x} size={[0.06, 2.4, 0.06]} pos={[x, 1.2, -1.05]} color={DARK} r={0.015} />)}
      <RB size={[1.0, 0.7, 0.05]} pos={[0, 1.95, -1.05]} color="#f4f6fb" r={0.02} />
      <Ms geo={G.plane(0.4, 0.3)} mat={M('#ff5d73')} pos={[0, 1.88, -1.024]} cast={false} />
      <Ms geo={G.torus(0.16, 0.012, Math.PI * 2, 6, 24)} mat={M('#ff8a3d', { metal: 0.4 })} pos={[HOOP.hoop[0], HOOP.hoop[1], HOOP.hoop[2]]} rot={[PI2, 0, 0]} cast={false} />
      <Ms geo={G.cyl(0.16, 0.1, 0.22, 12)} mat={M('#ffffff', { opacity: 0.5, side: 2 })} pos={[0, HOOP.hoop[1] - 0.11, HOOP.hoop[2]]} cast={false} />
      {/* the score */}
      <RB size={[1.0, 0.3, 0.12]} pos={[0, 2.45, -1.05]} color={DARK} r={0.02} />
      <Ms geo={G.plane(0.8, 0.2)} mat={MB(SCREEN[p.variant % SCREEN.length])} pos={[0, 2.45, -0.988]} cast={false} />
      <primitive object={parts.flash} />
      <primitive object={parts.ball} />
    </group>
  );
}

/** a PS5-style console with a big TV on a low cabinet, facing the sofa of a lounge corner (one plays sitting on the sofa) */
function PsConsole({ p, theme, live }: { p: Prop; theme: RoomTheme; live: Live }) {
  const white = M('#f4f6fb', { rough: 0.35 });
  const black = M('#1b1d2a', { rough: 0.4 });
  const pads = usePads([[-0.6, 0.1, 0.3], [-0.42, 0.1, -0.25]], 0.45, [white, black]);
  const screen = useMemo(() => screenGame('race', 1.34, 0.74), []);
  useLive(live, (g, on, t) => {
    // (the controllers go with the players on the sofa, whichever seat they took)
    const n = g ? players(g) : 0;
    pads.forEach((c, i) => (c.visible = i >= n));
    screen.update(g, on, t);
  });
  return (
    <group>
      <RB size={[1.5, 0.42, 0.44]} pos={[0, 0.21, 0]} color={shade(theme.desk, -0.12)} r={0.03} />
      <RB size={[1.46, 0.02, 0.42]} pos={[0, 0.43, 0]} color={theme.deskTop} r={0.01} cast={false} />
      {[-0.37, 0.37].map((x) => <RB key={x} size={[0.7, 0.3, 0.01]} pos={[x, 0.22, 0.222]} color={shade(theme.desk, -0.2)} r={0.005} cast={false} />)}
      {/* the TV on its foot, and a soundbar */}
      <RB size={[0.36, 0.03, 0.18]} pos={[0, 0.455, -0.06]} color="#20222e" r={0.01} />
      <Ms geo={G.cyl(0.025, 0.025, 0.1, 8)} mat={black} pos={[0, 0.52, -0.06]} />
      <RB size={[1.42, 0.82, 0.05]} pos={[0, 1.0, -0.07]} color="#16171f" r={0.02} />
      <Ms geo={G.plane(1.34, 0.74)} mat={MB(SCREEN[p.variant % SCREEN.length])} pos={[0, 1.0, -0.044]} cast={false} />
      <Ms geo={G.plane(0.62, 0.1)} mat={MB('#ffffff')} pos={[-0.25, 1.24, -0.042]} cast={false} />
      <Ms geo={G.plane(0.3, 0.05)} mat={MB('#ffd166')} pos={[0.35, 0.78, -0.042]} cast={false} />
      <group position={[0, 1.0, -0.041]}>
        <primitive object={screen.root} />
      </group>
      <RB size={[0.56, 0.07, 0.09]} pos={[-0.05, 0.48, 0.13]} color="#20222e" r={0.02} cast={false} />
      {/* the console lying flat on the cabinet beside the soundbar, in front of the TV: white shells over and under a black core, a blue light */}
      <group position={[0.5, 0.44, 0.08]}>
        <Ms geo={G.rbox(0.4, 0.022, 0.26, 0.02)} mat={white} pos={[0, 0.013, 0]} />
        <RB size={[0.36, 0.06, 0.22]} pos={[0, 0.054, 0]} color="#16171f" r={0.012} />
        <Ms geo={G.rbox(0.42, 0.024, 0.28, 0.02)} mat={white} pos={[0, 0.096, 0]} />
        <Ms geo={G.plane(0.3, 0.004)} mat={MB('#46c2ff')} pos={[0, 0.054, 0.111]} cast={false} />
      </group>
      {/* two controllers waiting on the cabinet */}
      {pads.map((c, i) => <primitive key={i} object={c} />)}
    </group>
  );
}

/** the same console without a cabinet: the TV on a bracket on the wall, the console lying on the floor under it, the controllers beside it */
function PsWall({ p, live }: { p: Prop; live: Live }) {
  const white = M('#f4f6fb', { rough: 0.35 });
  const black = M('#1b1d2a', { rough: 0.4 });
  const pads = usePads([[-0.2, 0.05, 0.4], [0.0, 0.08, -0.3]], 0.02, [white, black]);
  const screen = useMemo(() => screenGame('race', 1.34, 0.74), []);
  useLive(live, (g, on, t) => {
    const n = g ? players(g) : 0;
    pads.forEach((c, i) => (c.visible = i >= n));
    screen.update(g, on, t);
  });
  return (
    <group>
      {/* the bracket and the TV */}
      <RB size={[0.3, 0.2, 0.06]} pos={[0, 1.32, -0.13]} color="#3a3d50" r={0.01} cast={false} />
      <RB size={[1.42, 0.82, 0.05]} pos={[0, 1.32, -0.08]} color="#16171f" r={0.02} />
      <Ms geo={G.plane(1.34, 0.74)} mat={MB(SCREEN[p.variant % SCREEN.length])} pos={[0, 1.32, -0.054]} cast={false} />
      <Ms geo={G.plane(0.62, 0.1)} mat={MB('#ffffff')} pos={[-0.25, 1.56, -0.052]} cast={false} />
      <Ms geo={G.plane(0.3, 0.05)} mat={MB('#ffd166')} pos={[0.35, 1.1, -0.052]} cast={false} />
      <group position={[0, 1.32, -0.051]}>
        <primitive object={screen.root} />
      </group>
      {/* the cable down the wall */}
      <Ms geo={G.cyl(0.008, 0.008, 0.9, 6)} mat={black} pos={[0.32, 0.46, -0.14]} cast={false} />
      {/* the console lying on the floor, the controllers beside it */}
      <group position={[0.42, 0, 0.02]}>
        <Ms geo={G.rbox(0.4, 0.022, 0.26, 0.02)} mat={white} pos={[0, 0.013, 0]} />
        <RB size={[0.36, 0.06, 0.22]} pos={[0, 0.054, 0]} color="#16171f" r={0.012} />
        <Ms geo={G.rbox(0.42, 0.024, 0.28, 0.02)} mat={white} pos={[0, 0.096, 0]} />
        <Ms geo={G.plane(0.3, 0.004)} mat={MB('#46c2ff')} pos={[0, 0.054, 0.111]} cast={false} />
      </group>
      {pads.map((c, i) => <primitive key={i} object={c} />)}
    </group>
  );
}

/** The model of a game machine (null for any other prop). `roomId` / `idx` (the prop's index in the layout) let its parts move. */
export function GameMachine({ p, theme, roomId, idx }: MProps) {
  const live = useMemo(() => ({ roomId, idx }), [roomId, idx]);
  switch (p.kind) {
    case 'arcade': return <Arcade p={p} live={live} />;
    case 'arcadeDuo': return <Arcade p={p} duo live={live} />;
    case 'pinball': return <Pinball p={p} live={live} />;
    case 'clawMachine': return <ClawMachine p={p} live={live} />;
    case 'airHockey': return <AirHockey p={p} live={live} />;
    case 'foosball': return <Foosball p={p} live={live} />;
    case 'danceMachine': return <DanceMachine p={p} live={live} />;
    case 'consoleTv': return <ConsoleTv p={p} theme={theme} live={live} />;
    case 'racingSim': return <RacingSim p={p} live={live} />;
    case 'vrStation': return <VrStation p={p} live={live} />;
    case 'pingPong': return <PingPong p={p} live={live} />;
    case 'hoops': return <Hoops p={p} live={live} />;
    case 'psConsole': return <PsConsole p={p} theme={theme} live={live} />;
    case 'psWall': return <PsWall p={p} live={live} />;
    default: return null;
  }
}
