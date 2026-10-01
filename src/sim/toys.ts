import type { RoomLayout } from '../world/layout';

/** A cat toy that moves: a ball of yarn that rolls, a toy mouse that skids and hops. Cats kick it, `ToyView` draws it. */
export interface ToyState {
  layout: RoomLayout;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** direction the toy faces (mouse) */
  rot: number;
  /** how far the ball has rolled (radians) */
  roll: number;
  /** mouse: height of the little hops after a kick */
  hop: number;
  hopV: number;
}

const states = new Map<string, ToyState>();

export function toyState(roomId: string, layout: RoomLayout, i: number): ToyState {
  const key = `${roomId}#${i}`;
  let st = states.get(key);
  if (!st || st.layout !== layout) {
    const t = layout.toys[i];
    st = { layout, x: t.x, z: t.z, vx: 0, vz: 0, rot: t.rot, roll: 0, hop: 0, hopV: 0 };
    states.set(key, st);
  }
  return st;
}

/** hit the toy: `speed` m/s along (dx, dz) */
export function kickToy(st: ToyState, dx: number, dz: number, speed: number, mouse: boolean) {
  const d = Math.hypot(dx, dz) || 1;
  st.vx = (dx / d) * speed;
  st.vz = (dz / d) * speed;
  if (mouse) {
    st.rot = Math.atan2(dx, dz);
    st.hopV = 1.9;
  }
}

export function stepToy(st: ToyState, mouse: boolean, dt: number) {
  const nav = st.layout.nav;
  const moving = st.vx !== 0 || st.vz !== 0;
  if (moving) {
    const nx = st.x + st.vx * dt;
    const nz = st.z + st.vz * dt;
    // a wall, a desk or a chair: bounce off it
    if (nav.isBlocked(nx, st.z)) st.vx *= -0.55;
    else st.x = nx;
    if (nav.isBlocked(st.x, nz)) st.vz *= -0.55;
    else st.z = nz;
    const f = Math.exp(-(mouse ? 4.2 : 1.5) * dt);
    st.vx *= f;
    st.vz *= f;
    const sp = Math.hypot(st.vx, st.vz);
    if (!mouse) st.roll += (sp * dt) / 0.1;
    if (sp < 0.03) st.vx = st.vz = 0;
  }
  if (mouse && (st.hop > 0 || st.hopV > 0)) {
    st.hopV -= 9 * dt;
    st.hop = Math.max(0, st.hop + st.hopV * dt);
    if (st.hop === 0 && st.hopV < 0) st.hopV = st.hopV < -0.6 ? -st.hopV * 0.3 : 0;
  }
}
