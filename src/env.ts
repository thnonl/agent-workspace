/** Time-of-day model. `hour` is the local system time (0-24, fractional). */
export interface EnvState {
  hour: number;
  /** 1 in full daylight, 0 at night */
  day: number;
  night: number;
  /** warm sunrise / sunset tint (0-1) */
  warm: number;
  /** 0-1: how much the room lamps are switched on */
  lamps: number;
  /** 0-1: cloud cover / rain outside (dims the daylight, fades the sunbeams) */
  overcast: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const bell = (h: number, c: number, w: number) => Math.exp(-(((h - c) / w) ** 2));

export function envForHour(hIn: number): EnvState {
  const hour = ((hIn % 24) + 24) % 24;
  const day = smooth(5.2, 7.6, hour) * (1 - smooth(17.2, 19.8, hour));
  const warm = Math.max(bell(hour, 6.4, 1.1), bell(hour, 18.6, 1.2)) * 0.9;
  const night = 1 - day;
  const lamps = smooth(0.22, 0.65, night);
  return { hour, day, night, warm, lamps, overcast: 0 };
}

/** The live (damped) environment read by every scene component. */
export const env: EnvState = envForHour(12);

export function stepEnv(target: EnvState, dt: number, overcast = 0) {
  const k = 1 - Math.exp(-2.2 * dt);
  env.hour = target.hour;
  env.day += (target.day - env.day) * k;
  env.night = 1 - env.day;
  env.warm += (target.warm - env.warm) * k;
  env.lamps += (target.lamps - env.lamps) * k;
  env.overcast += (overcast - env.overcast) * (1 - Math.exp(-0.8 * dt));
}

export const HOUR_PRESETS = { day: 12.5, dusk: 18.6, night: 23 } as const;

// --------------------------------------------------------------------- sky
// Colours are mixed in linear light, like THREE.Color does, but without pulling three into the entry chunk.
type RGB = [number, number, number];
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const rgb = (hex: string): RGB => [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255)) as RGB;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const toHex = (c: RGB) => `#${c.map((v) => Math.round(clamp01(toSrgb(v)) * 255).toString(16).padStart(2, '0')).join('')}`;

const night1 = rgb('#141a4d');
const night2 = rgb('#4a3a86');
const warm1 = rgb('#ff9d8a');
const warm2 = rgb('#ffc98f');

/** CSS gradient colours for the backdrop, from the room theme's daytime sky. */
export function skyColors(theme: [string, string], e: EnvState = env): [string, string] {
  const top = mix(mix(rgb(theme[0]), night1, e.night * 0.92), warm1, e.warm * 0.55);
  const bottom = mix(mix(rgb(theme[1]), night2, e.night * 0.9), warm2, e.warm * 0.6);
  return [toHex(top), toHex(bottom)];
}

/** Position of the sun (0-1 across the sky) or moon at the given hour; null when below the horizon. */
export function celestial(hour: number): { kind: 'sun' | 'moon'; x: number; y: number; alpha: number } {
  const h = ((hour % 24) + 24) % 24;
  const isDay = h >= 5.5 && h < 18.5;
  const p = isDay ? (h - 5.5) / 13 : (((h - 18.5 + 24) % 24) / 11);
  const arc = Math.sin(Math.PI * clamp01(p));
  return { kind: isDay ? 'sun' : 'moon', x: 0.08 + 0.84 * clamp01(p), y: 0.2 - 0.13 * arc, alpha: Math.min(1, arc * 3) };
}
