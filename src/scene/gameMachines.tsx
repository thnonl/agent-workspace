import type { Prop } from '../world/layout';
import type { RoomTheme } from '../world/palettes';
import { G, M, MB, shade } from './kit';
import { RB, Ms } from './furniture';

/**
 * The game machines (a room has at most one, see GAMES in layout.ts). Every model stands in its own frame: the footprint of FOOT
 * centred on the origin, the front (where the players are) towards +z. Screens and lights are unlit materials, so they glow.
 */

const PI2 = Math.PI / 2;
const DARK = '#2a2d3e';
const CHROME = M('#c9d1de', { metal: 0.6, rough: 0.3 });
const SCREEN = ['#46c2ff', '#ff6fb5', '#7cf29a', '#ffd166'];

/** a joystick (ball on a stick) standing on a panel at y */
function Stick({ x, y, z, color }: { x: number; y: number; z: number; color: string }) {
  return (
    <>
      <Ms geo={G.cyl(0.012, 0.012, 0.09, 8)} mat={M(DARK)} pos={[x, y + 0.045, z]} cast={false} />
      <Ms geo={G.sphere(0.03, 12, 10)} mat={M(color, { rough: 0.35 })} pos={[x, y + 0.1, z]} cast={false} />
    </>
  );
}

/** a row of round buttons on a panel */
function Buttons({ x, y, z, n = 3, colors }: { x: number; y: number; z: number; n?: number; colors: string[] }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <Ms key={i} geo={G.cyl(0.022, 0.022, 0.02, 12)} mat={MB(colors[i % colors.length])} pos={[x + i * 0.06, y + 0.01, z + (i % 2) * 0.03]} cast={false} />
      ))}
    </>
  );
}

/** upright arcade cabinet: one (or two) players, joystick and buttons, a lit marquee on top */
function Arcade({ p, duo }: { p: Prop; duo?: boolean }) {
  const w = duo ? 1.28 : 0.78;
  const body = p.color;
  const glow = SCREEN[p.variant % SCREEN.length];
  return (
    <group>
      <RB size={[w, 1.2, 0.7]} pos={[0, 0.6, -0.02]} color={body} r={0.04} />
      <RB size={[w, 0.62, 0.42]} pos={[0, 1.5, -0.16]} color={body} r={0.04} />
      {/* side art stripes */}
      {[-1, 1].map((s) => <RB key={s} size={[0.02, 1.7, 0.5]} pos={[s * (w / 2 + 0.005), 0.95, -0.05]} color={p.color2} r={0.01} cast={false} />)}
      {/* screen, tilted back */}
      <group position={[0, 1.42, 0.07]} rotation={[-0.25, 0, 0]}>
        <RB size={[w - 0.12, 0.5, 0.04]} color={DARK} r={0.02} />
        <Ms geo={G.plane(w - 0.2, 0.4)} mat={MB(glow)} pos={[0, 0, 0.022]} cast={false} />
        <Ms geo={G.plane(w * 0.3, 0.06)} mat={MB('#ffffff')} pos={[-(w - 0.2) * 0.2, 0.12, 0.024]} cast={false} />
      </group>
      {/* marquee */}
      <RB size={[w, 0.2, 0.36]} pos={[0, 1.9, -0.12]} color={DARK} r={0.03} />
      <Ms geo={G.plane(w - 0.08, 0.15)} mat={MB(shade(p.color2, 0.25))} pos={[0, 1.9, 0.065]} cast={false} />
      {/* control panel */}
      <group position={[0, 1.02, 0.36]} rotation={[0.25, 0, 0]}>
        <RB size={[w, 0.06, 0.32]} color={DARK} r={0.02} />
        {(duo ? [-0.33, 0.33] : [0]).map((cx) => (
          <group key={cx}>
            <Stick x={cx - 0.12} y={0.03} z={0} color={cx < 0 ? '#ff5d73' : '#46c2ff'} />
            <Buttons x={cx + 0.02} y={0.03} z={-0.04} colors={['#ffd166', '#ff5d73', '#7cf29a']} />
          </group>
        ))}
      </group>
      {/* coin door */}
      <RB size={[0.22, 0.28, 0.02]} pos={[0, 0.5, 0.34]} color={shade(body, -0.25)} r={0.01} cast={false} />
      <Ms geo={G.plane(0.05, 0.08)} mat={MB('#ff8a3d')} pos={[0, 0.55, 0.352]} cast={false} />
    </group>
  );
}

/** pinball table: slanted playfield under glass on four legs, a backbox with the score at the back */
function Pinball({ p }: { p: Prop }) {
  return (
    <group>
      {[[-0.31, 0.6], [0.31, 0.6], [-0.31, -0.6], [0.31, -0.6]].map(([x, z], i) => (
        <Ms key={i} geo={G.cyl(0.03, 0.03, 0.8, 8)} mat={CHROME} pos={[x, 0.4, z]} />
      ))}
      <group position={[0, 0.88, 0]} rotation={[0.07, 0, 0]}>
        <RB size={[0.72, 0.2, 1.35]} color={p.color} r={0.04} />
        <Ms geo={G.plane(0.62, 1.24)} mat={MB(shade(p.color2, 0.2))} pos={[0, 0.101, 0]} rot={[-PI2, 0, 0]} cast={false} />
        {/* bumpers and flippers */}
        {[[-0.15, -0.3], [0.15, -0.3], [0, -0.1]].map(([x, z], i) => (
          <Ms key={i} geo={G.cyl(0.05, 0.05, 0.06, 14)} mat={MB(SCREEN[i])} pos={[x, 0.13, z]} cast={false} />
        ))}
        {[-1, 1].map((s) => <RB key={s} size={[0.16, 0.03, 0.04]} pos={[s * 0.1, 0.12, 0.5]} rot={[0, s * 0.4, 0]} color="#ffffff" r={0.01} cast={false} />)}
        <Ms geo={G.sphere(0.022, 10, 8)} mat={CHROME} pos={[0.2, 0.13, 0.2]} cast={false} />
        <Ms geo={G.plane(0.66, 1.3)} mat={M('#cdefff', { opacity: 0.25, rough: 0.05 })} pos={[0, 0.115, 0]} rot={[-PI2, 0, 0]} cast={false} />
      </group>
      {/* backbox */}
      <RB size={[0.72, 0.72, 0.16]} pos={[0, 1.3, -0.62]} color={DARK} r={0.03} />
      <Ms geo={G.plane(0.6, 0.55)} mat={MB(SCREEN[p.variant % SCREEN.length])} pos={[0, 1.32, -0.539]} cast={false} />
      <Ms geo={G.plane(0.4, 0.08)} mat={MB('#ffffff')} pos={[0, 1.5, -0.537]} cast={false} />
    </group>
  );
}

/** claw crane: a glass case full of plush toys over a cabinet, the claw hanging from the top */
function ClawMachine({ p }: { p: Prop }) {
  const toys = ['#ff8fb1', '#ffd166', '#7cc9ff', '#9be89b', '#c9a0ff', '#ff9f68'];
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
      {/* the claw */}
      <Ms geo={G.cyl(0.006, 0.006, 0.4, 6)} mat={CHROME} pos={[0.12, 1.56, -0.05]} cast={false} />
      {[0, 2.1, 4.2].map((a) => (
        <Ms key={a} geo={G.cone(0.02, 0.1, 6)} mat={CHROME} pos={[0.12 + Math.sin(a) * 0.04, 1.33, -0.05 + Math.cos(a) * 0.04]} rot={[Math.PI + Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4]} cast={false} />
      ))}
      {/* panel with the stick, and the prize flap */}
      <RB size={[0.7, 0.06, 0.2]} pos={[0, 0.92, 0.48]} color={DARK} r={0.02} />
      <Stick x={-0.15} y={0.95} z={0.48} color="#ff5d73" />
      <Buttons x={0.08} y={0.95} z={0.46} n={1} colors={['#7cf29a']} />
      <RB size={[0.28, 0.24, 0.02]} pos={[0.2, 0.35, 0.45]} color={DARK} r={0.01} cast={false} />
    </group>
  );
}

/** air hockey table: white field with a centre line and two goals, two mallets and a puck */
function AirHockey({ p }: { p: Prop }) {
  return (
    <group>
      {[[-0.45, 0.85], [0.45, 0.85], [-0.45, -0.85], [0.45, -0.85]].map(([x, z], i) => (
        <RB key={i} size={[0.08, 0.7, 0.08]} pos={[x, 0.35, z]} color={DARK} r={0.02} />
      ))}
      <RB size={[1.1, 0.14, 2.0]} pos={[0, 0.76, 0]} color={p.color} r={0.04} />
      <RB size={[0.96, 0.02, 1.86]} pos={[0, 0.835, 0]} color="#f4f8ff" r={0.01} cast={false} />
      <Ms geo={G.plane(0.96, 0.02)} mat={MB('#ff5d73')} pos={[0, 0.847, 0]} rot={[-PI2, 0, 0]} cast={false} />
      <Ms geo={G.torus(0.18, 0.008, Math.PI * 2, 6, 24)} mat={MB('#46c2ff')} pos={[0, 0.847, 0]} rot={[PI2, 0, 0]} cast={false} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <RB size={[0.3, 0.05, 0.03]} pos={[0, 0.85, s * 0.94]} color={DARK} r={0.01} cast={false} />
          <Ms geo={G.cyl(0.05, 0.05, 0.04, 16)} mat={M(s > 0 ? '#ff5d73' : '#46c2ff', { rough: 0.3 })} pos={[0.1 * s, 0.865, s * 0.6]} cast={false} />
          <Ms geo={G.cyl(0.02, 0.025, 0.05, 10)} mat={M(s > 0 ? '#ff5d73' : '#46c2ff', { rough: 0.3 })} pos={[0.1 * s, 0.905, s * 0.6]} cast={false} />
        </group>
      ))}
      <Ms geo={G.cyl(0.035, 0.035, 0.012, 14)} mat={M('#ffd166')} pos={[-0.12, 0.85, 0.1]} cast={false} />
    </group>
  );
}

/** foosball table: a green field in a box, rods with little players sticking out at both long sides */
function Foosball({ p }: { p: Prop }) {
  return (
    <group>
      {[[-0.6, 0.3], [0.6, 0.3], [-0.6, -0.3], [0.6, -0.3]].map(([x, z], i) => (
        <RB key={i} size={[0.08, 0.7, 0.08]} pos={[x, 0.35, z]} color={shade(p.color, -0.2)} r={0.02} />
      ))}
      <RB size={[1.25, 0.28, 0.76]} pos={[0, 0.82, 0]} color={p.color} r={0.04} />
      <RB size={[1.1, 0.02, 0.62]} pos={[0, 0.94, 0]} color="#4fb86f" r={0.01} cast={false} />
      <Ms geo={G.plane(0.02, 0.62)} mat={MB('#ffffff')} pos={[0, 0.952, 0]} rot={[-PI2, 0, 0]} cast={false} />
      {[-0.45, -0.3, -0.15, 0, 0.15, 0.3, 0.45].map((x, i) => (
        <group key={x}>
          <Ms geo={G.cyl(0.012, 0.012, 1.05, 8)} mat={CHROME} pos={[x, 1.0, 0]} rot={[PI2, 0, 0]} cast={false} />
          <Ms geo={G.cyl(0.03, 0.03, 0.09, 10)} mat={M(DARK)} pos={[x, 1.0, (i % 2 ? 1 : -1) * 0.52]} rot={[PI2, 0, 0]} cast={false} />
          {[-0.18, 0, 0.18].map((z) => (
            <RB key={z} size={[0.04, 0.12, 0.05]} pos={[x, 0.97, z]} color={i % 2 ? '#ff5d73' : '#46c2ff'} r={0.01} cast={false} />
          ))}
        </group>
      ))}
      <Ms geo={G.sphere(0.022, 10, 8)} mat={M('#ffffff')} pos={[0.07, 0.97, 0.05]} cast={false} />
    </group>
  );
}

/** dance machine: a tall cabinet with a big screen and speakers, two arrow pads on the floor in front of it */
function DanceMachine({ p }: { p: Prop }) {
  const arrow = ['#ff5d73', '#46c2ff', '#7cf29a', '#ffd166'];
  return (
    <group>
      <RB size={[1.6, 2.1, 0.58]} pos={[0, 1.05, 0]} color={DARK} r={0.05} />
      <Ms geo={G.plane(1.1, 0.75)} mat={MB(SCREEN[p.variant % SCREEN.length])} pos={[0, 1.45, 0.292]} cast={false} />
      <Ms geo={G.plane(0.5, 0.1)} mat={MB('#ffffff')} pos={[0, 1.7, 0.295]} cast={false} />
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
      {[-0.42, 0.42].map((x) => (
        <group key={x} position={[x, 0, 0.88]}>
          <RB size={[0.78, 0.06, 0.82]} pos={[0, 0.03, 0]} color="#3a3d50" r={0.02} receive />
          {[[0, -0.26, 0], [0, 0.26, Math.PI], [-0.26, 0, PI2], [0.26, 0, -PI2]].map(([ax, az, rot], i) => (
            <Ms key={i} geo={G.cone(0.08, 0.14, 3)} mat={MB(arrow[i])} pos={[ax, 0.065, az]} rot={[-PI2, 0, rot]} scale={[1, 1, 0.12]} cast={false} />
          ))}
        </group>
      ))}
    </group>
  );
}

/** a big TV on a low cabinet with a console and two controllers: two players stand in front of it */
function ConsoleTv({ p, theme }: { p: Prop; theme: RoomTheme }) {
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
      {/* the console and the controllers lying in front of it */}
      <RB size={[0.34, 0.07, 0.24]} pos={[-0.45, 0.535, 0.05]} color={p.variant % 2 ? '#f4f6fb' : '#20222e'} r={0.02} cast={false} />
      <Ms geo={G.plane(0.06, 0.008)} mat={MB('#46c2ff')} pos={[-0.45, 0.535, 0.171]} cast={false} />
      {[0.35, 0.55].map((x, i) => (
        <group key={x} position={[x, 0.52, 0.1]} rotation={[0, i ? -0.3 : 0.2, 0]}>
          <RB size={[0.15, 0.03, 0.08]} color={i ? '#ff5d73' : '#46c2ff'} r={0.012} cast={false} />
        </group>
      ))}
      {/* a little rug where the players stand */}
      <RB size={[1.6, 0.012, 0.9]} pos={[0, 0.006, 1.65]} color={p.color2} r={0.004} cast={false} receive />
    </group>
  );
}

/** racing simulator: a frame with a screen and a wheel, the bucket seat in front of it (one sits there) */
function RacingSim({ p }: { p: Prop }) {
  return (
    <group>
      {/* frame and screen */}
      <RB size={[0.9, 0.06, 0.66]} pos={[0, 0.03, 0]} color={DARK} r={0.02} />
      {[-0.4, 0.4].map((x) => <RB key={x} size={[0.05, 1.15, 0.05]} pos={[x, 0.6, -0.28]} color={DARK} r={0.015} />)}
      <RB size={[0.86, 0.5, 0.06]} pos={[0, 1.0, -0.28]} color="#1b1d2a" r={0.02} />
      <Ms geo={G.plane(0.78, 0.42)} mat={MB(SCREEN[p.variant % SCREEN.length])} pos={[0, 1.0, -0.247]} cast={false} />
      <Ms geo={G.plane(0.78, 0.06)} mat={MB('#5a5f78')} pos={[0, 0.88, -0.245]} cast={false} />
      {/* wheel on its column */}
      <RB size={[0.08, 0.6, 0.08]} pos={[0, 0.33, 0.18]} color={DARK} r={0.02} />
      <group position={[0, 0.72, 0.28]} rotation={[-0.9, 0, 0]}>
        <Ms geo={G.torus(0.14, 0.022, Math.PI * 2, 8, 24)} mat={M('#1b1d2a', { rough: 0.5 })} />
        <RB size={[0.26, 0.03, 0.04]} color={p.color} r={0.01} cast={false} />
      </group>
      {/* pedals */}
      {[-0.1, 0.1].map((x) => <RB key={x} size={[0.07, 0.02, 0.12]} pos={[x, 0.09, 0.45]} rot={[-0.5, 0, 0]} color="#8b92a6" r={0.005} cast={false} />)}
      {/* the bucket seat (in front of the footprint: one sits in it) */}
      <group position={[0, 0, 0.98]}>
        <RB size={[0.55, 0.12, 0.55]} pos={[0, 0.38, 0]} color={p.color} r={0.05} />
        <RB size={[0.55, 0.75, 0.14]} pos={[0, 0.7, 0.3]} rot={[0.2, 0, 0]} color={p.color} r={0.06} />
        <RB size={[0.6, 0.32, 0.6]} pos={[0, 0.16, 0.05]} color={DARK} r={0.03} />
        {[-1, 1].map((s) => <RB key={s} size={[0.06, 0.24, 0.5]} pos={[s * 0.27, 0.5, 0.02]} color={shade(p.color, -0.15)} r={0.02} cast={false} />)}
      </group>
    </group>
  );
}

/** virtual reality corner: a kiosk with a screen, the headset hanging on a hook, a round play mat in front */
function VrStation({ p }: { p: Prop }) {
  return (
    <group>
      <RB size={[0.62, 1.5, 0.42]} pos={[0, 0.75, 0]} color={p.color} r={0.06} />
      <Ms geo={G.plane(0.44, 0.34)} mat={MB(SCREEN[p.variant % SCREEN.length])} pos={[0, 1.18, 0.212]} cast={false} />
      <Ms geo={G.plane(0.3, 0.06)} mat={MB('#ffffff')} pos={[0, 0.9, 0.212]} cast={false} />
      {/* the headset and a controller on a hook */}
      <Ms geo={G.cyl(0.01, 0.01, 0.12, 6)} mat={CHROME} pos={[0.2, 0.7, 0.26]} rot={[PI2, 0, 0]} cast={false} />
      <RB size={[0.2, 0.1, 0.1]} pos={[0.2, 0.62, 0.32]} color="#f4f6fb" r={0.03} cast={false} />
      <Ms geo={G.plane(0.16, 0.05)} mat={MB('#20222e')} pos={[0.2, 0.62, 0.372]} cast={false} />
      <Ms geo={G.capsule(0.025, 0.08, 4, 8)} mat={M('#20222e')} pos={[-0.18, 0.66, 0.27]} cast={false} />
      {/* the play mat: a ring on the floor */}
      <Ms geo={G.cyl(0.7, 0.7, 0.012, 32)} mat={M(shade(p.color2, -0.05), { rough: 0.95 })} pos={[0, 0.006, 1.25]} receive cast={false} />
      <Ms geo={G.torus(0.62, 0.02, Math.PI * 2, 6, 40)} mat={MB(SCREEN[(p.variant + 1) % SCREEN.length])} pos={[0, 0.016, 1.25]} rot={[PI2, 0, 0]} cast={false} />
    </group>
  );
}

/** ping-pong table: two halves, the net across the middle, a paddle at each end */
function PingPong({ p }: { p: Prop }) {
  const top = p.variant % 2 ? '#2f7d5b' : '#2c5aa0';
  return (
    <group>
      {[[-0.65, 1.1], [0.65, 1.1], [-0.65, -1.1], [0.65, -1.1]].map(([x, z], i) => (
        <RB key={i} size={[0.06, 0.72, 0.06]} pos={[x, 0.36, z]} color={DARK} r={0.015} />
      ))}
      <RB size={[1.5, 0.05, 2.6]} pos={[0, 0.76, 0]} color={top} r={0.015} />
      <Ms geo={G.plane(0.02, 2.6)} mat={MB('#ffffff')} pos={[0, 0.787, 0]} rot={[-PI2, 0, 0]} cast={false} />
      {[-1, 1].map((s) => <Ms key={s} geo={G.plane(1.5, 0.02)} mat={MB('#ffffff')} pos={[0, 0.787, s * 1.29]} rot={[-PI2, 0, 0]} cast={false} />)}
      {/* the net */}
      <Ms geo={G.plane(1.6, 0.15)} mat={M('#f4f6fb', { opacity: 0.7, side: 2 })} pos={[0, 0.86, 0]} cast={false} />
      {[-1, 1].map((s) => <Ms key={s} geo={G.cyl(0.012, 0.012, 0.18, 6)} mat={CHROME} pos={[s * 0.8, 0.86, 0]} cast={false} />)}
      {/* paddles and a ball */}
      {[-1, 1].map((s) => (
        <group key={s} position={[0.45 * s, 0.795, s * 1.0]} rotation={[0, s * 0.6, 0]}>
          <Ms geo={G.cyl(0.075, 0.075, 0.012, 16)} mat={M(s > 0 ? '#e63946' : '#1b1d2a')} cast={false} />
          <RB size={[0.03, 0.02, 0.1]} pos={[0, 0, 0.12]} color="#c8a274" r={0.005} cast={false} />
        </group>
      ))}
      <Ms geo={G.sphere(0.02, 10, 8)} mat={M('#ffffff')} pos={[-0.2, 0.8, -0.4]} cast={false} />
    </group>
  );
}

/** basketball arcade: a lane rising to a backboard with a hoop and a net, balls ready in the tray, the score on top */
function Hoops({ p }: { p: Prop }) {
  return (
    <group>
      {/* the front cabinet with the ball tray on top */}
      <RB size={[1.0, 0.8, 0.6]} pos={[0, 0.4, 0.8]} color={shade(p.color, -0.2)} r={0.04} />
      <RB size={[0.9, 0.06, 0.45]} pos={[0, 0.82, 0.8]} color={DARK} r={0.02} cast={false} />
      {[-0.3, -0.1, 0.1, 0.3].map((x) => <Ms key={x} geo={G.sphere(0.1, 14, 10)} mat={M('#f08a24', { rough: 0.6 })} pos={[x, 0.95, 0.8]} cast={false} />)}
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
      <Ms geo={G.torus(0.16, 0.012, Math.PI * 2, 6, 24)} mat={M('#ff8a3d', { metal: 0.4 })} pos={[0, 1.68, -0.86]} rot={[PI2, 0, 0]} cast={false} />
      <Ms geo={G.cyl(0.16, 0.1, 0.22, 12)} mat={M('#ffffff', { opacity: 0.5, side: 2 })} pos={[0, 1.57, -0.86]} cast={false} />
      {/* the score */}
      <RB size={[1.0, 0.3, 0.12]} pos={[0, 2.45, -1.05]} color={DARK} r={0.02} />
      <Ms geo={G.plane(0.8, 0.2)} mat={MB(SCREEN[p.variant % SCREEN.length])} pos={[0, 2.45, -0.988]} cast={false} />
    </group>
  );
}

/** The model of a game machine (null for any other prop). */
export function GameMachine({ p, theme }: { p: Prop; theme: RoomTheme }) {
  switch (p.kind) {
    case 'arcade': return <Arcade p={p} />;
    case 'arcadeDuo': return <Arcade p={p} duo />;
    case 'pinball': return <Pinball p={p} />;
    case 'clawMachine': return <ClawMachine p={p} />;
    case 'airHockey': return <AirHockey p={p} />;
    case 'foosball': return <Foosball p={p} />;
    case 'danceMachine': return <DanceMachine p={p} />;
    case 'consoleTv': return <ConsoleTv p={p} theme={theme} />;
    case 'racingSim': return <RacingSim p={p} />;
    case 'vrStation': return <VrStation p={p} />;
    case 'pingPong': return <PingPong p={p} />;
    case 'hoops': return <Hoops p={p} />;
    default: return null;
  }
}
