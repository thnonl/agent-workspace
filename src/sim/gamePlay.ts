import type { PropKind } from '../world/layout';
import type { Sfx } from '../audio';

/**
 * What goes on at a game machine while somebody plays: the puck, the balls, the claw, the flippers, the rods, the wheel… and where the
 * players' hands are. One `GameLive` per machine (room + prop index). The first player at a machine runs its game clock (`stepGame`); every
 * player asks `gripOf` where to put the hands and where to look; the machine model (scene/gameMachines.tsx) draws the moving parts from the
 * same state. Everything is in the machine's own frame: the footprint centred on the origin, the front (where the players are) towards +z.
 */

export type V3 = [number, number, number];

// ------------------------------------------------------------------ the parts the hands go to (shared with the models)
/** arcade: the control panel (a tilted slab), the stick (a ball on a short shaft) and the buttons on it, per player at x = cx */
export const ARC = { panelY: 0.8, panelZ: 0.33, tilt: 0.25, stickDx: -0.12, ballUp: 0.1, btnDx: 0.02, btnGap: 0.06, duoX: 0.33 } as const;
/** pinball: the playfield (tilted slab, top at local y 0.1), the flippers, the bumpers and the buttons on the sides of the cabinet */
export const PIN = {
  y: 0.88, tilt: 0.07, halfW: 0.29, top: -0.6, flipZ: 0.48, flipX: 0.17, flipLen: 0.16,
  bumpers: [[-0.15, -0.3], [0.15, -0.3], [0, -0.1]] as const, btnX: 0.37, btnY: 0.88, btnZ: 0.55,
} as const;
/** claw crane: the panel on the cabinet front with the stick and the button, the case the claw moves in, the prize chute */
export const CLAW = { panelY: 0.82, panelZ: 0.5, stickX: -0.15, btnX: 0.1, restY: 1.62, pileY: 1.06, range: 0.27, chute: [0.27, 0.27] as const, flap: [0.2, 0.35, 0.47] as const } as const;
/** air hockey: the surface, the rails, the goals, the line each player defends */
export const HOCKEY = { y: 0.845, halfW: 0.48, halfL: 0.93, goal: 0.15, mallet: 0.05, puck: 0.035, guard: 0.8 } as const;
/** foosball: the rods (x), their height, where the handles are, the field */
export const FOOS = { rods: [-0.45, -0.3, -0.15, 0, 0.15, 0.3, 0.45] as const, y: 1.0, handle: 0.55, halfX: 0.53, halfZ: 0.29, men: [-0.18, 0, 0.18] as const, slide: 0.09 } as const;
/** racing simulator: the seat (one sits there) and the wheel in front of it */
export const RACE = { seatZ: 0.66, wheelY: 0.68, wheelZ: 0.36, wheelTilt: -0.9, rim: 0.14, seatTop: 0.33 } as const;
/** ping-pong: the table top, the ends, the net, where the ball is hit */
export const PONG = { y: 0.785, end: 1.3, hitZ: 1.45, hitY: 0.93, net: 0.935 } as const;
/** basketball arcade: the tray of balls, the hoop, the lane the balls roll back on */
export const HOOP = { trayY: 0.95, trayZ: 0.8, trayX: [-0.3, -0.1, 0.1, 0.3] as const, hoop: [0, 1.68, -0.86] as const, ball: 0.1 } as const;
/** VR corner: the headset on its hook */
export const VR = { hook: [0.2, 0.62, 0.32] as const } as const;

/** the lane of the basketball arcade: its surface height at depth z (it rises towards the hoop) */
export const laneY = (z: number) => 1.05 + HOOP.ball - (z + 0.25) * 0.234;

/** stick ball of an arcade player at cx, tilted by (tx, tz), in the machine frame */
export function arcadeStick(cx: number, tx: number, tz: number): V3 {
  const up = ARC.ballUp;
  // the shaft stands on the tilted panel; the tilt of the stick leans the ball sideways / forwards
  const lx = cx + ARC.stickDx + Math.sin(tx) * up;
  const ly = up * Math.cos(tx) * Math.cos(tz);
  const lz = Math.sin(tz) * up;
  return [lx, ARC.panelY + 0.03 + ly * Math.cos(ARC.tilt) - lz * Math.sin(ARC.tilt), ARC.panelZ + ly * Math.sin(ARC.tilt) + lz * Math.cos(ARC.tilt)];
}
/** a point on the arcade panel top (panel-local x, z) in the machine frame */
export function arcadePanel(x: number, z: number, up = 0.03): V3 {
  return [x, ARC.panelY + up * Math.cos(ARC.tilt) - z * Math.sin(ARC.tilt), ARC.panelZ + up * Math.sin(ARC.tilt) + z * Math.cos(ARC.tilt)];
}
/** a point on the pinball playfield (field-local x, height above the glass base y, z) in the machine frame */
export function pinField(x: number, y: number, z: number): V3 {
  const c = Math.cos(PIN.tilt);
  const s = Math.sin(PIN.tilt);
  return [x, PIN.y + y * c - z * s, y * s + z * c];
}
/** a point on the racing wheel's rim at angle a (0 = right of the hub, as one sits) in the machine frame */
export function wheelRim(a: number, r: number = RACE.rim): V3 {
  const x = Math.cos(a) * r;
  const y = Math.sin(a) * r;
  const t = RACE.wheelTilt;
  return [x, RACE.wheelY + y * Math.cos(t), RACE.wheelZ + y * Math.sin(t)];
}

// ------------------------------------------------------------------ live state
export interface Player {
  key: string;
  /** performance.now() of the last frame this player was at the machine */
  seen: number;
  /** 0..1: settling in / leaving */
  into: number;
}

export interface GameLive {
  kind: PropKind;
  slots: (Player | null)[];
  /** game clock (s) and the player who runs it */
  gt: number;
  stepBy: string;
  /** a free ball / puck: position, velocity, shown or not */
  ball: V3;
  vel: V3;
  ballOn: boolean;
  /** per slot: arcade stick tilt (x, z) and the button pressed (index, depth); air hockey mallets (x, z); foosball: the two rods in the hands */
  stick: [number, number][];
  btn: [number, number][];
  mallet: [number, number][];
  malletV: [number, number][];
  /** foosball: slide and spin per rod, and the time of the last kick per rod */
  rodSlide: number[];
  rodSpin: number[];
  /** pinball: flippers (left, right: 0 rest .. 1 up), bumper flashes, the ball waits for the plunger until `relaunch` */
  flip: [number, number];
  bump: number[];
  relaunch: number;
  /** claw: position over the case, drop 0..1, closed 0..1, the plush it holds (colour index, -1 none), a plush falling down the chute */
  claw: V3;
  clawDrop: number;
  clawClose: number;
  prize: number;
  prizeFall: number;
  /** claw: the toy won (colour index, -1 none; goalAt = when) */
  won: number;
  /** racing: the wheel turned (rad), the car on the screen (-1..1) */
  steer: number;
  car: number;
  /** dance: per slot the lit arrows (bit 0 left, 1 down, 2 up, 3 right) */
  lit: number[];
  /** ping-pong / air hockey / hoops: a point was just scored (game time), and by which slot */
  goalAt: number;
  goalBy: number;
  /** hoops: the tray ball that is out (-1 none) and the score */
  out: number;
  score: number;
  /** the console in front of the sofa: how many play and when that was last said */
  couch: number;
  couchSeen: number;
  /** scratch for the frame step of physics machines */
  last: number;
  /** a new random series for every game (the clock starts at 0 each time) */
  seed: number;
}

const lives = new Map<string, GameLive>();

function makeLive(kind: PropKind, n: number): GameLive {
  return {
    kind, slots: Array.from({ length: Math.max(1, n) }, () => null), gt: 0, stepBy: '',
    ball: [0, 0, 0], vel: [0, 0, 0], ballOn: false,
    stick: [[0, 0], [0, 0]], btn: [[-1, 0], [-1, 0]], mallet: [[0, 0.6], [0, -0.6]], malletV: [[0, 0], [0, 0]],
    rodSlide: FOOS.rods.map(() => 0), rodSpin: FOOS.rods.map(() => 0),
    flip: [0, 0], bump: [0, 0, 0], relaunch: 0,
    claw: [0, CLAW.restY, 0], clawDrop: 0, clawClose: 0, prize: -1, prizeFall: -1, won: -1,
    steer: 0, car: 0, lit: [0, 0], goalAt: -9, goalBy: -1, out: -1, score: 0, couch: 0, couchSeen: 0, last: 0, seed: 0,
  };
}

/** the live state of the machine `propIdx` in a room (made on first use) */
export function gameLive(roomId: string, propIdx: number, kind: PropKind, slots = 2): GameLive {
  const id = `${roomId}:${propIdx}`;
  let g = lives.get(id);
  if (!g || g.kind !== kind) {
    g = makeLive(kind, slots);
    lives.set(id, g);
  }
  return g;
}
/** the live state for drawing (undefined while nobody has played there yet) */
export function peekGame(roomId: string, propIdx: number): GameLive | undefined {
  return lives.get(`${roomId}:${propIdx}`);
}
/** drop a room's machines (the room was closed) */
export function dropGames(roomId: string) {
  for (const k of lives.keys()) if (k.startsWith(`${roomId}:`)) lives.delete(k);
}

/** a player counts while seen in the last 0.4 s */
const STALE_MS = 400;
export function playing(g: GameLive, slot: number, now = performance.now()): Player | null {
  const p = g.slots[slot];
  return p && now - p.seen < STALE_MS ? p : null;
}
export function players(g: GameLive, now = performance.now()): number {
  let n = 0;
  for (let i = 0; i < g.slots.length; i++) if (playing(g, i, now)) n++;
  return n;
}

/**
 * A player is at the machine this frame. Returns true when this player runs the game clock (the first one there; the next takes over when
 * that one has left).
 */
export function joinGame(g: GameLive, slot: number, key: string, into: number, now = performance.now()): boolean {
  const had = players(g, now);
  const p = g.slots[slot];
  if (p && p.key === key) {
    p.seen = now;
    p.into = into;
  } else g.slots[slot] = { key, seen: now, into };
  if (!had) restart(g);
  const by = g.stepBy ? g.slots.find((q) => q?.key === g.stepBy) : undefined;
  if (!by || now - by.seen >= STALE_MS) g.stepBy = key;
  return g.stepBy === key;
}

/** a new game begins (nobody played a moment ago) */
function restart(g: GameLive) {
  g.gt = 0;
  g.seed = Math.floor(Math.random() * 9973);
  g.ballOn = false;
  g.goalAt = -9;
  g.out = -1;
  g.won = -1;
  g.prize = -1;
  g.prizeFall = -1;
  g.clawDrop = 0;
  g.clawClose = 0;
  g.relaunch = 0.6;
  g.flip[0] = g.flip[1] = 0;
  switch (g.kind) {
    case 'airHockey':
      g.ball = [0, HOCKEY.y + 0.008, 0];
      g.vel = [0.35, 0, 1.1];
      g.ballOn = true;
      g.mallet[0] = [0, HOCKEY.guard];
      g.mallet[1] = [0, -HOCKEY.guard];
      break;
    case 'foosball':
      g.ball = [0, 0.962, 0];
      g.vel = [0.9, 0, 0.3];
      g.ballOn = true;
      break;
  }
}

/** a pseudo-random number 0..1 from an integer (the same every frame) */
export const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
/** the game's own random number 0..1 for an integer */
const rnd = (g: GameLive, n: number) => hash(n + g.seed * 7.31);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (t: number) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
const seg = (t: number, a: number, b: number) => smooth((t - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** a ball thrown from p to q in `dur` seconds, its top `apex` above the higher end; position at u (0..1) */
function arc(p: readonly number[], q: readonly number[], apex: number, u: number, out: V3) {
  const top = Math.max(p[1], q[1]) + apex;
  // parabola through p (u=0), q (u=1) with the given top: y = p + b u + c u^2
  const dy = q[1] - p[1];
  const h = top - p[1];
  // vertex height h reached at u0 = b / (-2c): solve with b + c = dy, -b^2 / 4c = h
  const b = 2 * (h + Math.sqrt(Math.max(0, h * (h - dy))));
  const c = dy - b;
  out[0] = lerp(p[0], q[0], u);
  out[1] = p[1] + b * u + c * u * u;
  out[2] = lerp(p[2], q[2], u);
  return out;
}

// ------------------------------------------------------------------ the game clock
/** claw: seconds per try, and how long a toy won is held up */
const CLAW_TRY = 12;
export const CLAW_SHOW = 4;
/** ping-pong: seconds per shot, shots per rally (the last one is missed) and the pause after a point */
const PONG_SHOT = 1.0;
const PONG_SHOTS = 6;
const PONG_PAUSE = 1.6;
const PONG_CYCLE = PONG_SHOT * PONG_SHOTS + PONG_PAUSE;
/** hoops: seconds per throw */
const HOOP_THROW = 3.2;

/** Advances the machine by dt seconds (only the player who runs the clock calls this). */
export function stepGame(g: GameLive, dt: number, sfx: (s: Sfx) => void) {
  dt = clamp(dt, 0, 0.1);
  const prev = g.gt;
  g.gt += dt;
  const gt = g.gt;
  const now = performance.now();
  const on = (i: number) => !!playing(g, i, now);
  switch (g.kind) {
    case 'arcade':
    case 'arcadeDuo': {
      for (let i = 0; i < 2; i++) {
        // the stick snaps between directions a few times a second; a button is hit now and then
        const k = Math.floor(gt * 2.6 + i * 0.37);
        const dir = Math.floor(rnd(g, k + i * 101) * 9);
        const tx = ((dir % 3) - 1) * 0.32;
        const tz = (Math.floor(dir / 3) - 1) * 0.26;
        const f = 1 - Math.exp(-dt * 22);
        g.stick[i][0] += (tx - g.stick[i][0]) * f;
        g.stick[i][1] += (tz - g.stick[i][1]) * f;
        const q = gt * 4.2 + i * 0.5;
        const tap = q % 1;
        const hit = rnd(g, Math.floor(q) * 7 + i) < 0.55;
        g.btn[i][0] = hit ? Math.floor(rnd(g, Math.floor(q) * 13 + i) * 3) : -1;
        g.btn[i][1] = hit ? Math.max(0, Math.sin(clamp(tap / 0.45, 0, 1) * Math.PI)) : 0;
        if (on(i) && hit && Math.floor(prev * 4.2 + i * 0.5) !== Math.floor(q) && rnd(g, Math.floor(q)) < 0.4) sfx('blip');
      }
      // the ships on the screen follow the sticks (steer: player 0, car: player 1)
      g.steer = clamp(g.steer + g.stick[0][0] * dt * 2.5, -1, 1);
      g.car = clamp(g.car + g.stick[1][0] * dt * 2.5, -1, 1);
      break;
    }
    case 'pinball':
      stepPinball(g, dt, sfx);
      break;
    case 'clawMachine':
      stepClaw(g, prev, sfx);
      break;
    case 'airHockey':
      stepHockey(g, dt, on, sfx);
      break;
    case 'foosball':
      stepFoos(g, dt, on, sfx);
      break;
    case 'racingSim':
    case 'consoleTv':
    case 'psConsole':
    case 'psWall': {
      const want = Math.sin(gt * 1.7) * 0.9 + Math.sin(gt * 4.1) * 0.3;
      g.steer += (want - g.steer) * (1 - Math.exp(-dt * 6));
      g.car = clamp(g.car + g.steer * dt * 0.9, -1, 1) * 0.995;
      break;
    }
    case 'pingPong':
      stepPong(g, prev, on, sfx);
      break;
    case 'hoops':
      stepHoops(g, prev, sfx);
      break;
    case 'danceMachine':
      break;
  }
}

function stepPinball(g: GameLive, dt: number, sfx: (s: Sfx) => void) {
  g.flip[0] = Math.max(0, g.flip[0] - dt * 4);
  g.flip[1] = Math.max(0, g.flip[1] - dt * 4);
  for (let i = 0; i < 3; i++) g.bump[i] = Math.max(0, g.bump[i] - dt * 3);
  const r = 0.022;
  if (!g.ballOn) {
    g.relaunch -= dt;
    if (g.relaunch > 0) return;
    // the plunger shoots the ball up the right lane
    g.ball = [0.26, 0.13, 0.55];
    g.vel = [-0.15, 0, -2.3];
    g.ballOn = true;
    sfx('pop');
  }
  const b = g.ball;
  const v = g.vel;
  // a few sub-steps: the ball is fast and the bumpers are small
  for (let n = 0; n < 3; n++) {
    const h = dt / 3;
    v[2] += 1.25 * h; // rolls down the tilted field, towards the player
    b[0] += v[0] * h;
    b[2] += v[2] * h;
    if (b[0] < -PIN.halfW + r) { b[0] = -PIN.halfW + r; v[0] = Math.abs(v[0]) * 0.8; }
    if (b[0] > PIN.halfW - r) { b[0] = PIN.halfW - r; v[0] = -Math.abs(v[0]) * 0.8; }
    if (b[2] < PIN.top + r) { b[2] = PIN.top + r; v[2] = Math.abs(v[2]) * 0.7; }
    PIN.bumpers.forEach(([bx, bz], i) => {
      const dx = b[0] - bx;
      const dz = b[2] - bz;
      const d = Math.hypot(dx, dz);
      if (d < 0.05 + r && d > 1e-4) {
        const nx = dx / d;
        const nz = dz / d;
        b[0] = bx + nx * (0.05 + r);
        b[2] = bz + nz * (0.05 + r);
        const sp = Math.max(1.1, Math.hypot(v[0], v[2]));
        v[0] = nx * sp;
        v[2] = nz * sp;
        if (g.bump[i] < 0.5) sfx('blip');
        g.bump[i] = 1;
      }
    });
    // the slopes above the flippers lead the ball to them
    if (b[2] > 0.3 && Math.abs(b[0]) > 0.16) v[0] -= Math.sign(b[0]) * 2.2 * h;
    if (b[2] > PIN.flipZ - 0.06 && v[2] > 0) {
      const side = b[0] < 0 ? 0 : 1;
      const k = Math.floor(g.gt * 10);
      if (Math.abs(b[0]) < 0.17 && rnd(g, k) < 0.85) {
        // flip it back up the field
        g.flip[side] = 1;
        v[2] = -(1.7 + rnd(g, k + 3) * 0.7);
        v[0] = (rnd(g, k + 5) - 0.5) * 1.4 + (side ? -0.35 : 0.35);
        sfx('clink');
      } else if (b[2] > 0.62) {
        g.ballOn = false;
        g.relaunch = 1.2;
      }
    }
  }
}

function stepClaw(g: GameLive, prev: number, sfx: (s: Sfx) => void) {
  const gt = g.gt;
  const k = Math.floor(gt / CLAW_TRY);
  const t = gt - k * CLAW_TRY;
  const tp = prev - k * CLAW_TRY;
  const tx = (rnd(g, k * 3 + 1) * 2 - 1) * CLAW.range;
  const tz = (rnd(g, k * 3 + 2) * 2 - 1) * CLAW.range * 0.8;
  const win = rnd(g, k * 3 + 7) < 0.4;
  const toy = Math.floor(rnd(g, k * 5 + 11) * 6);
  // 0.5..5: steer to the spot (overshooting a little), 5.4: the button, 5.6..7: down, close, 7.6..9: up, 9..10.4 to the chute, 10.6 open
  const steer = seg(t, 0.5, 5);
  const wob = Math.sin(t * 3.1) * 0.05 * (1 - steer) * steer * 4;
  // (the claw starts where the last try left it: over the chute after a win)
  const from = k > 0 && rnd(g, (k - 1) * 3 + 7) < 0.4 ? CLAW.chute : [0, 0];
  let x = lerp(from[0], tx, steer) + wob;
  let z = lerp(from[1], tz, steer) - wob * 0.6;
  const toChute = seg(t, 9, 10.4);
  if (win) {
    x = lerp(x, CLAW.chute[0], toChute);
    z = lerp(z, CLAW.chute[1], toChute);
  } else {
    x = lerp(x, 0, toChute);
    z = lerp(z, 0, toChute);
  }
  g.claw[0] = x;
  g.claw[2] = z;
  g.clawDrop = seg(t, 5.6, 6.9) * (1 - seg(t, 7.6, 9));
  g.clawClose = seg(t, 6.9, 7.4) * (1 - seg(t, win ? 10.5 : 8.1, win ? 10.8 : 8.4));
  g.claw[1] = lerp(CLAW.restY, CLAW.pileY + 0.08, g.clawDrop);
  // the toy: held from closing; it slips out on a lost try, falls down the chute on a win
  g.prize = t > 7.2 && (win ? t < 10.6 : t < 8.2) ? toy : -1;
  g.prizeFall = win && t >= 10.6 && t < 11.3 ? (t - 10.6) / 0.7 : -1;
  if (tp < 5.4 && t >= 5.4) sfx('blip');
  if (tp < 7.2 && t >= 7.2) sfx('clank');
  if (win && tp < 11.3 && t >= 11.3) {
    g.won = toy;
    g.goalAt = gt;
    sfx('levelup');
  }
}

function stepHockey(g: GameLive, dt: number, on: (i: number) => boolean, sfx: (s: Sfx) => void) {
  const b = g.ball;
  const v = g.vel;
  const lim = HOCKEY.halfW - HOCKEY.puck;
  const end = HOCKEY.halfL - HOCKEY.puck;
  // the mallets: the defender tracks where the puck will cross its line, the other one waits at home
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const m = g.mallet[i];
    const mv = g.malletV[i];
    let wx = 0;
    let wz = side * HOCKEY.guard;
    if (on(i)) {
      const coming = v[2] * side > 0;
      if (coming) {
        // predicted x at the guard line (bounces folded back), with a little error that changes per shot
        const tHit = Math.max(0, (side * HOCKEY.guard - b[2]) / (v[2] || 1e-3));
        let px = b[0] + v[0] * tHit;
        const span = 2 * lim;
        px = ((((px + lim) % (2 * span)) + 2 * span) % (2 * span));
        px = px > span ? 2 * span - px : px;
        px -= lim;
        const err = (rnd(g, Math.floor(g.gt / 1.3) * 17 + i) - 0.5) * 0.22;
        wx = clamp(px + err, -lim + 0.03, lim - 0.03);
        // step into the puck when it is close
        if (tHit < 0.18) wz = side * (HOCKEY.guard - 0.08);
      } else wx = b[0] * 0.35;
    } else wz = side * 0.62;
    const ax = wx - m[0];
    const az = wz - m[1];
    const sp = 1.8;
    const d = Math.hypot(ax, az);
    const step = Math.min(d, sp * dt);
    const nx = d > 1e-5 ? (ax / d) * step : 0;
    const nz = d > 1e-5 ? (az / d) * step : 0;
    mv[0] = dt > 0 ? nx / dt : 0;
    mv[1] = dt > 0 ? nz / dt : 0;
    m[0] += nx;
    m[1] += nz;
  }
  // the puck: glides, bounces off the rails, is hit by a mallet
  b[0] += v[0] * dt;
  b[2] += v[2] * dt;
  if (b[0] < -lim) { b[0] = -lim; v[0] = Math.abs(v[0]); sfx('clink'); }
  if (b[0] > lim) { b[0] = lim; v[0] = -Math.abs(v[0]); sfx('clink'); }
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    if (b[2] * side > end) {
      if (on(i) && Math.abs(b[0]) < HOCKEY.goal) {
        // into the goal of player i: a point for the other one; the puck comes back from the middle towards the loser
        g.goalAt = g.gt;
        g.goalBy = 1 - i;
        sfx('ding');
        b[0] = 0;
        b[2] = 0;
        v[0] = (rnd(g, Math.floor(g.gt)) - 0.5) * 0.8;
        v[2] = side * 0.9;
      } else {
        // nobody at that end (or it hit the end rail): it comes back
        b[2] = side * end;
        v[2] = -side * Math.abs(v[2]);
        sfx('clink');
      }
    }
    const m = g.mallet[i];
    const dx = b[0] - m[0];
    const dz = b[2] - m[1];
    const d = Math.hypot(dx, dz);
    const rr = HOCKEY.mallet + HOCKEY.puck;
    if (d < rr && d > 1e-4 && (v[2] * side > -0.2 || d < rr * 0.7)) {
      // a hit: off towards the other end at an angle (a bank shot now and then)
      const k = Math.floor(g.gt * 3) + i * 31;
      const speed = 1.5 + rnd(g, k) * 0.9;
      const ang = (rnd(g, k + 1) - 0.5) * 1.3 + (b[0] - m[0]) * 3;
      v[0] = Math.sin(ang) * speed;
      v[2] = -side * Math.cos(ang) * speed;
      b[0] = m[0] + (dx / d) * rr;
      b[2] = m[1] + (dz / d) * rr;
      sfx('clink');
    }
  }
  // a slow puck is hardly ever the case on an air table, but keep it moving
  const s = Math.hypot(v[0], v[2]);
  if (s < 0.5) {
    v[2] += (b[2] > 0 ? -1 : 1) * 0.6 * dt * 4;
  }
}

function stepFoos(g: GameLive, dt: number, on: (i: number) => boolean, sfx: (s: Sfx) => void) {
  const b = g.ball;
  const v = g.vel;
  const r = 0.022;
  b[0] += v[0] * dt;
  b[2] += v[2] * dt;
  v[0] *= 1 - 0.25 * dt;
  v[2] *= 1 - 0.25 * dt;
  if (b[2] < -FOOS.halfZ + r) { b[2] = -FOOS.halfZ + r; v[2] = Math.abs(v[2]); }
  if (b[2] > FOOS.halfZ - r) { b[2] = FOOS.halfZ - r; v[2] = -Math.abs(v[2]); }
  for (const side of [-1, 1]) {
    if (b[0] * side > FOOS.halfX - r) {
      if (Math.abs(b[2]) < 0.1) {
        g.goalAt = g.gt;
        g.goalBy = side > 0 ? 0 : 1;
        sfx('ding');
        b[0] = 0;
        b[2] = (rnd(g, Math.floor(g.gt)) - 0.5) * 0.3;
        v[0] = -side * 0.7;
        v[2] = (rnd(g, Math.floor(g.gt) + 9) - 0.5) * 0.8;
      } else {
        b[0] = side * (FOOS.halfX - r);
        v[0] = -side * Math.abs(v[0]) * 0.8;
        sfx('clink');
      }
    }
  }
  if (Math.hypot(v[0], v[2]) < 0.15) v[0] += (b[0] > 0 ? -1 : 1) * 0.4;
  // the rods in the players' hands: slide a man in front of the ball, kick it when it comes by
  FOOS.rods.forEach((x, i) => {
    const owner = i % 2 ? 0 : 1;
    if (!heldRods(owner).includes(i) || !on(owner)) {
      g.rodSlide[i] *= 1 - Math.min(1, dt * 3);
      g.rodSpin[i] *= 1 - Math.min(1, dt * 4);
      return;
    }
    let best: number = FOOS.men[0];
    for (const m of FOOS.men) if (Math.abs(b[2] - m) < Math.abs(b[2] - best)) best = m;
    const want = clamp(b[2] - best, -FOOS.slide, FOOS.slide);
    g.rodSlide[i] += clamp(want - g.rodSlide[i], -1.2 * dt, 1.2 * dt);
    g.rodSpin[i] *= 1 - Math.min(1, dt * 5);
    // owner 0 shoots towards -x, owner 1 towards +x
    const dir = owner === 0 ? -1 : 1;
    const near = Math.abs(b[0] - x) < 0.05 && Math.abs(b[2] - (best + g.rodSlide[i])) < 0.05;
    if (near && v[0] * dir <= 0.3) {
      const k = Math.floor(g.gt * 5) + i;
      v[0] = dir * (1.0 + rnd(g, k) * 0.9);
      v[2] = (rnd(g, k + 2) - 0.5) * 1.1;
      b[0] = x + dir * 0.05;
      g.rodSpin[i] = -dir * 1.6;
      sfx('clink');
    }
  });
}
/** foosball: the two rods each player holds (the ones in front of their shoulders) */
export const heldRods = (slot: number): [number, number] => (slot === 0 ? [1, 5] : [2, 4]);

function stepPong(g: GameLive, prev: number, on: (i: number) => boolean, sfx: (s: Sfx) => void) {
  const both = on(0) && on(1);
  if (!both) {
    // alone: keeping the ball up on the paddle
    const slot = on(0) ? 0 : 1;
    const p = pongPaddle(g, slot, g.gt);
    const u = (g.gt % 0.6) / 0.6;
    g.ball[0] = p[0];
    g.ball[1] = p[1] + 0.02 + 4 * u * (1 - u) * 0.32;
    g.ball[2] = p[2];
    g.ballOn = true;
    if (Math.floor(prev / 0.6) !== Math.floor(g.gt / 0.6)) sfx('pop');
    return;
  }
  const s = pongShot(g.gt);
  g.ballOn = true;
  if (s.k < PONG_SHOTS) {
    const from = pongHit(g, s.cyc, s.k);
    const to = pongHit(g, s.cyc, s.k + 1);
    const miss = s.k === PONG_SHOTS - 1;
    // the bounce on the receiver's half
    const side = s.k % 2 === 0 ? -1 : 1; // shot k goes from slot (k % 2) to the other: slot 0 is at +z
    const bz = side * 0.68;
    const bx = lerp(from[0], to[0], 0.62);
    const bounce = [bx, PONG.y + 0.02, bz];
    const target = miss ? [to[0] * 1.6, PONG.y - 0.3, side * 2.3] : to;
    if (s.u < 0.6) arc(from, bounce, 0.22, s.u / 0.6, g.ball);
    else arc(bounce, target, 0.25, (s.u - 0.6) / 0.4, g.ball);
    const kp = Math.floor(prev / PONG_SHOT);
    if (kp !== Math.floor(g.gt / PONG_SHOT)) sfx('pop');
    if (prev % PONG_SHOT < 0.6 && s.u >= 0.6) sfx('blip');
  } else {
    // after the point: the ball is on the floor behind the one who missed, then a new serve
    const side = (PONG_SHOTS - 1) % 2 === 0 ? -1 : 1;
    const w = (g.gt % PONG_CYCLE - PONG_SHOT * PONG_SHOTS) / PONG_PAUSE;
    g.ball[0] = pongHit(g, s.cyc, PONG_SHOTS)[0] * 1.6;
    g.ball[1] = 0.03 + Math.abs(Math.sin(w * Math.PI * 3)) * 0.25 * (1 - w);
    g.ball[2] = side * (2.3 + w * 0.4);
    if (g.goalAt < g.gt - PONG_PAUSE) {
      g.goalAt = g.gt;
      g.goalBy = side > 0 ? 1 : 0;
    }
  }
}
/** ping-pong rally: cycle number, shot within it (PONG_SHOTS = the pause), and how far the shot has flown (0..1) */
export function pongShot(gt: number) {
  const cyc = Math.floor(gt / PONG_CYCLE);
  const w = gt - cyc * PONG_CYCLE;
  const k = Math.floor(w / PONG_SHOT);
  return { cyc, k: Math.min(k, PONG_SHOTS), u: k >= PONG_SHOTS ? 1 : (w - k * PONG_SHOT) / PONG_SHOT };
}
/** where shot k of a rally is hit (slot k % 2: slot 0 at +z) */
export function pongHit(g: GameLive, cyc: number, k: number): V3 {
  const side = k % 2 === 0 ? 1 : -1;
  return [(rnd(g, cyc * 13 + k) - 0.5) * 0.7, PONG.hitY, side * PONG.hitZ];
}
/** the paddle of `slot` at game time gt (machine frame) */
export function pongPaddle(g: GameLive, slot: number, gt: number): V3 {
  const side = slot === 0 ? 1 : -1;
  const ready: V3 = [armSide(slot) * 0.16, PONG.hitY, side * PONG.hitZ];
  const now = performance.now();
  if (!(playing(g, 0, now) && playing(g, 1, now))) {
    const u = (gt % 0.6) / 0.6;
    return [ready[0], PONG.hitY - 0.05 + Math.sin(u * Math.PI * 2) * 0.02, side * (PONG.hitZ + 0.05)];
  }
  const s = pongShot(gt);
  // my next hit: the shot that ends at me
  let kNext = s.k + 1;
  if ((kNext % 2 === 0 ? 0 : 1) !== slot) kNext++;
  const hitAt = pongHit(g, s.cyc, kNext);
  const tTo = (kNext - s.k - s.u) * PONG_SHOT; // seconds until my hit
  const missing = kNext === PONG_SHOTS;
  if (s.k >= PONG_SHOTS || tTo > 1.4) return ready;
  // back-swing, meet the ball, follow through towards the net
  const pre = clamp(1 - tTo / 0.9, 0, 1);
  const p: V3 = [lerp(ready[0], hitAt[0], smooth(pre)), PONG.hitY, side * PONG.hitZ];
  const back = Math.sin(clamp((pre - 0.35) / 0.55, 0, 1) * Math.PI);
  p[2] += side * 0.12 * back;
  p[1] -= 0.06 * back;
  if (missing && pre > 0.6) p[0] += (hitAt[0] > 0 ? -1 : 1) * 0.25 * (pre - 0.6);
  // the follow-through of my last hit
  const kLast = kNext - 2;
  if (kLast >= 0) {
    const since = (s.k - kLast + s.u) * PONG_SHOT;
    if (since < 0.5) {
      const f = Math.sin((since / 0.5) * Math.PI);
      p[2] -= side * 0.16 * f;
      p[1] += 0.12 * f;
    }
  }
  return p;
}

function stepHoops(g: GameLive, prev: number, sfx: (s: Sfx) => void) {
  const k = Math.floor(g.gt / HOOP_THROW);
  const t = g.gt - k * HOOP_THROW;
  const tp = prev - k * HOOP_THROW;
  const i = k % 4;
  const score = rnd(g, k * 7 + 1) < 0.62;
  g.out = t > 0.55 ? i : -1;
  const hand = hoopHands(g.gt);
  if (t <= 0.55) g.ballOn = false;
  else if (t < HOOP_REL) {
    g.ballOn = true;
    g.ball[0] = hand[0];
    g.ball[1] = hand[1];
    g.ball[2] = hand[2];
  } else {
    // flight to the hoop (0.7 s); through it or off the rim; down onto the lane and rolling back to the tray
    g.ballOn = true;
    const ft = (t - HOOP_REL) / 0.6;
    const rel = hoopHands(k * HOOP_THROW + HOOP_REL);
    const rim: V3 = score ? [HOOP.hoop[0], HOOP.hoop[1] + 0.02, HOOP.hoop[2]] : [(rnd(g, k) < 0.5 ? -1 : 1) * 0.17, HOOP.hoop[1] + 0.06, HOOP.hoop[2] + 0.05];
    if (ft < 1) arc(rel, rim, 0.45, ft, g.ball);
    else {
      const t2 = t - HOOP_REL - 0.6;
      const drop: V3 = score ? [0, laneY(HOOP.hoop[2]), HOOP.hoop[2]] : [rim[0] * 1.4, laneY(-0.4), -0.4];
      if (t2 < 0.25) arc(rim, drop, score ? 0 : 0.18, t2 / 0.25, g.ball);
      else {
        const r = clamp((t2 - 0.25) / 0.7, 0, 1);
        const z = lerp(drop[2], 0.45, r * r);
        g.ball[0] = lerp(drop[0], HOOP.trayX[i], r);
        g.ball[1] = laneY(z);
        g.ball[2] = z;
        if (r >= 1) {
          g.ballOn = false;
          g.out = -1;
        }
      }
    }
    if (tp < HOOP_REL + 0.6 && t >= HOOP_REL + 0.6) {
      if (score) {
        g.score++;
        g.goalAt = g.gt;
        sfx('ding');
      } else sfx('clank');
    }
  }
}
/** hoops: the ball leaves the hands this far into a throw */
const HOOP_REL = 1.55;
/** hoops: where the two hands hold the ball at game time gt (the ball's centre, machine frame) */
export function hoopHands(gt: number): V3 {
  const k = Math.floor(gt / HOOP_THROW);
  const t = gt - k * HOOP_THROW;
  const i = k % 4;
  const tray: V3 = [HOOP.trayX[i], HOOP.trayY + 0.02, HOOP.trayZ + 0.06];
  const chest: V3 = [0, 0.97, 1.13];
  const up: V3 = [0, 1.13, 1.1];
  const out = [0, 0, 0] as V3;
  if (t < 0.55) {
    // reach down to the next ball in the tray
    const u = smooth(t / 0.55);
    for (let j = 0; j < 3; j++) out[j] = lerp(chest[j], tray[j], u);
  } else if (t < 1.1) {
    const u = smooth((t - 0.55) / 0.55);
    for (let j = 0; j < 3; j++) out[j] = lerp(tray[j], chest[j], u);
  } else if (t < HOOP_REL) {
    const u = smooth((t - 1.1) / (HOOP_REL - 1.1));
    for (let j = 0; j < 3; j++) out[j] = lerp(chest[j], up[j], u);
  } else {
    // the follow-through, then back down to the chest
    const u = smooth((t - HOOP_REL) / 0.35) * (1 - smooth((t - HOOP_REL - 0.5) / 0.6));
    out[0] = 0;
    out[1] = lerp(chest[1], up[1] + 0.06, u);
    out[2] = lerp(chest[2], up[2] - 0.06, u);
  }
  return out;
}

// ------------------------------------------------------------------ the hands
/**
 * Where a player's hands go (machine frame) and where they look. `hands[0]` is the hand that holds a thing (the rig's right hand),
 * `hands[1]` the other; `free` lets the two be swapped to whichever hand is nearer. `side`: step sideways along the machine (metres);
 * `lean`: forward lean of the body.
 */
export interface Grip {
  hands: [V3 | null, V3 | null];
  free: boolean;
  look: V3 | null;
  lean: number;
  side: number;
}
const grip: Grip = { hands: [null, null], free: true, look: null, lean: 0, side: 0 };
const h0: V3 = [0, 0, 0];
const h1: V3 = [0, 0, 0];
const lk: V3 = [0, 0, 0];
const set = (o: V3, v: readonly number[]) => {
  o[0] = v[0];
  o[1] = v[1];
  o[2] = v[2];
  return o;
};

/**
 * the machine-frame x side of the hand that holds things (the rig's right arm, at the rig's +x) for a player facing the machine: slot 0
 * stands at +z looking towards -z (rig +x = machine -x), slot 1 at -z looking towards +z. A mallet / paddle stays on that side of the body
 * (the shoulder cannot swing the arm across the chest).
 */
export const armSide = (slot: number) => (slot === 0 ? -1 : 1);

/** the arms lag behind the pose a little (the rig follows it smoothly): aim this far ahead */
const LEAD = 0.055;

/** The grip of player `slot` this frame (a shared object: copy what is kept). */
export function gripOf(g: GameLive, slot: number): Grip {
  const gr = grip;
  gr.hands[0] = gr.hands[1] = null;
  gr.free = true;
  gr.look = null;
  gr.lean = 0;
  gr.side = 0;
  const gt = g.gt + LEAD;
  switch (g.kind) {
    case 'arcade':
    case 'arcadeDuo': {
      const cx = g.kind === 'arcadeDuo' ? (slot === 0 ? -ARC.duoX : ARC.duoX) : 0;
      const st = g.stick[slot];
      const ball = arcadeStick(cx, st[0], st[1]);
      gr.hands[0] = set(h0, [ball[0], ball[1] + 0.045, ball[2] + 0.02]);
      const [bi, bd] = g.btn[slot];
      const bx = cx + ARC.btnDx + (bi < 0 ? 1 : bi) * ARC.btnGap;
      const bz = -0.04 + ((bi < 0 ? 1 : bi) % 2) * 0.03;
      set(h1, arcadePanel(bx, bz, 0.1 - 0.03 * bd));
      gr.hands[1] = h1;
      gr.look = set(lk, [cx, 1.38, 0.05]);
      gr.lean = 0.06;
      break;
    }
    case 'pinball': {
      gr.hands[0] = set(h0, [-PIN.btnX - 0.04 + g.flip[0] * 0.012, PIN.btnY, PIN.btnZ]);
      gr.hands[1] = set(h1, [PIN.btnX + 0.04 - g.flip[1] * 0.012, PIN.btnY, PIN.btnZ]);
      gr.look = g.ballOn ? set(lk, pinField(g.ball[0], 0.13, g.ball[2])) : set(lk, pinField(0.2, 0.13, 0.4));
      gr.lean = 0.2;
      break;
    }
    case 'clawMachine': {
      // the stick tilts the way the claw moves; the button goes down as the claw drops
      const dx = clamp((g.claw[0] - lerp(g.claw[0], 0, 0.5)) * 2, -0.3, 0.3);
      gr.hands[0] = set(h0, [CLAW.stickX + Math.sin(g.gt * 3.1) * 0.02 * (1 - g.clawDrop) + dx * 0.05, CLAW.panelY + 0.03 + 0.11 + 0.04, CLAW.panelZ + 0.02]);
      const press = g.clawDrop > 0 && g.clawDrop < 0.25 ? 1 : 0;
      gr.hands[1] = set(h1, [CLAW.btnX, CLAW.panelY + 0.07 + 0.06 - press * 0.03, CLAW.panelZ]);
      if (g.won >= 0) {
        // the toy won: held up with both hands
        const tt = g.gt - g.goalAt;
        if (tt < CLAW_SHOW) {
          const lift = smooth(tt / 0.8);
          // (in front of the face: the player stands at z 0.7 looking towards -z)
          gr.hands[0] = set(h0, [-0.09, lerp(0.98, 1.12, lift), 0.5]);
          gr.hands[1] = set(h1, [0.09, lerp(0.98, 1.12, lift), 0.5]);
          gr.look = set(lk, [0, 1.1, 0.45]);
          gr.lean = 0;
          break;
        }
      }
      if (g.prizeFall >= 0.3) {
        // fishing the toy out of the flap
        gr.hands[0] = set(h0, [CLAW.flap[0], CLAW.flap[1] + 0.05, CLAW.flap[2] + 0.05]);
        gr.lean = 0.45;
      }
      gr.look = set(lk, [g.claw[0], g.claw[1] - 0.08, g.claw[2]]);
      gr.lean = Math.max(gr.lean, 0.05);
      break;
    }
    case 'airHockey': {
      const m = g.mallet[slot];
      const mv = g.malletV[slot];
      gr.hands[0] = set(h0, [m[0] + mv[0] * LEAD, HOCKEY.y + 0.1, m[1] + mv[1] * LEAD]);
      gr.free = false;
      const side = slot === 0 ? 1 : -1;
      // the free hand rests on the rail
      gr.hands[1] = set(h1, [m[0] * 0.3 + (slot === 0 ? 0.28 : -0.28), HOCKEY.y + 0.08, side * (HOCKEY.halfL + 0.03)]);
      gr.look = set(lk, [g.ball[0], HOCKEY.y, g.ball[2]]);
      gr.lean = 0.18;
      // side-steps with the mallet (the machine frame x is the player's left for slot 0)
      gr.side = clamp(m[0] - armSide(slot) * 0.14, -0.35, 0.35);
      break;
    }
    case 'foosball': {
      const side = slot === 0 ? 1 : -1;
      const [a, b] = heldRods(slot);
      gr.hands[0] = set(h0, [FOOS.rods[a], FOOS.y + 0.02, side * FOOS.handle + g.rodSlide[a]]);
      gr.hands[1] = set(h1, [FOOS.rods[b], FOOS.y + 0.02, side * FOOS.handle + g.rodSlide[b]]);
      gr.look = set(lk, [g.ball[0], 0.96, g.ball[2]]);
      gr.lean = 0.22;
      break;
    }
    case 'racingSim': {
      const a = -g.steer * 0.9;
      gr.hands[0] = set(h0, wheelRim(Math.PI + a));
      gr.hands[1] = set(h1, wheelRim(a));
      gr.look = set(lk, [0, 1.0, -0.28]);
      gr.lean = 0.02;
      break;
    }
    case 'pingPong': {
      const p = pongPaddle(g, slot, gt);
      gr.hands[0] = set(h0, [p[0], p[1] - 0.05, p[2] + (slot === 0 ? 0.08 : -0.08)]);
      gr.free = false;
      gr.look = g.ballOn ? set(lk, g.ball) : null;
      gr.lean = 0.12;
      gr.side = clamp(p[0] - armSide(slot) * 0.18, -0.45, 0.45);
      break;
    }
    case 'hoops': {
      const b = hoopHands(gt);
      const k = Math.floor(gt / HOOP_THROW);
      const tt = gt - k * HOOP_THROW;
      // both hands round the ball until it is thrown; after that they follow through
      gr.hands[0] = set(h0, [b[0] - HOOP.ball - 0.03, b[1], b[2] + 0.03]);
      gr.hands[1] = set(h1, [b[0] + HOOP.ball + 0.03, b[1], b[2] + 0.03]);
      gr.look = tt > 0.15 && tt < 0.8 ? set(lk, [b[0], HOOP.trayY, HOOP.trayZ]) : g.ballOn && tt > HOOP_REL ? set(lk, g.ball) : set(lk, HOOP.hoop);
      gr.lean = tt < 1.0 ? 0.42 * Math.sin(clamp(tt / 1.0, 0, 1) * Math.PI) : 0;
      // a step towards the ball in the tray
      gr.side = clamp(b[0] * 0.85, -0.3, 0.3);
      break;
    }
  }
  return gr;
}

/**
 * dance: the arrows lit under a dancer whose legs follow beat phase b (the rig's left thigh is up while sin b > 0, the right one the half
 * after). Bits = the arrows of the pad model: 0 up (towards the machine), 1 down, 2 left (-x), 3 right (+x). The player faces -z, so the
 * rig's left leg (at the rig's -x) stands on the +x side.
 */
export function danceArrows(b: number): number {
  const n = Math.floor(b / Math.PI);
  const rigLeft = n % 2 !== 0; // that foot has just come down
  const sel = Math.floor(n / 2) % 4;
  // sideways with the foot, every other pair up and down
  const arrow = sel === 1 ? (rigLeft ? 0 : 1) : sel === 3 ? (rigLeft ? 1 : 0) : rigLeft ? 3 : 2;
  const into = b / Math.PI - n;
  return into < 0.6 ? 1 << arrow : 0;
}
