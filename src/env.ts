import * as THREE from 'three';

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
  return { hour, day, night, warm, lamps };
}

/** The live (damped) environment read by every scene component. */
export const env: EnvState = envForHour(12);

export function stepEnv(target: EnvState, dt: number) {
  const k = 1 - Math.exp(-2.2 * dt);
  env.hour = target.hour;
  env.day += (target.day - env.day) * k;
  env.night = 1 - env.day;
  env.warm += (target.warm - env.warm) * k;
  env.lamps += (target.lamps - env.lamps) * k;
}

export const HOUR_PRESETS = { day: 12.5, dusk: 18.6, night: 23 } as const;

// ---------------------------------------------------------------- lighting
const c = {
  sun: new THREE.Color('#fff3e2'),
  warm: new THREE.Color('#ffae70'),
  moon: new THREE.Color('#8fa5ff'),
  lamp: new THREE.Color('#ffddb0'),
  skyDay: new THREE.Color('#ffffff'),
  skyNight: new THREE.Color('#6472c4'),
  groundDay: new THREE.Color('#ffd9c4'),
  groundNight: new THREE.Color('#2b2450'),
};

export interface LightParams {
  dirColor: THREE.Color;
  dirIntensity: number;
  dirOffset: THREE.Vector3;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
}

const params: LightParams = {
  dirColor: new THREE.Color(),
  dirIntensity: 1,
  dirOffset: new THREE.Vector3(),
  hemiSky: new THREE.Color(),
  hemiGround: new THREE.Color(),
  hemiIntensity: 1,
};

export function lightParams(): LightParams {
  const a = clamp01((env.hour - 6) / 12) * Math.PI;
  const sun = new THREE.Vector3(6 + Math.cos(a) * 7, 7 + Math.sin(a) * 11, 9);
  const moon = new THREE.Vector3(-4, 15, 8);
  params.dirOffset.copy(sun).lerp(moon, env.night);
  // at night the shadow-casting light stands in for the room lamps: warm, and strong enough that people and furniture still cast clear shadows
  params.dirColor.copy(c.sun).lerp(c.warm, env.warm * env.day).lerp(c.moon, env.night).lerp(c.lamp, env.lamps);
  params.dirIntensity = 0.42 + 1.5 * env.day + 0.25 * env.warm + 1.05 * env.lamps * env.night;
  params.hemiSky.copy(c.skyNight).lerp(c.skyDay, env.day);
  params.hemiGround.copy(c.groundNight).lerp(c.groundDay, env.day);
  params.hemiIntensity = 0.44 + 0.62 * env.day;
  return params;
}

// --------------------------------------------------------------------- sky
const night1 = new THREE.Color('#141a4d');
const night2 = new THREE.Color('#4a3a86');
const warm1 = new THREE.Color('#ff9d8a');
const warm2 = new THREE.Color('#ffc98f');

/** CSS gradient colours for the backdrop, from the room theme's daytime sky. */
export function skyColors(theme: [string, string], e: EnvState = env): [string, string] {
  const top = new THREE.Color(theme[0]).lerp(night1, e.night * 0.92).lerp(warm1, e.warm * 0.55);
  const bottom = new THREE.Color(theme[1]).lerp(night2, e.night * 0.9).lerp(warm2, e.warm * 0.6);
  return [`#${top.getHexString()}`, `#${bottom.getHexString()}`];
}

/** Position of the sun (0-1 across the sky) or moon at the given hour; null when below the horizon. */
export function celestial(hour: number): { kind: 'sun' | 'moon'; x: number; y: number; alpha: number } {
  const h = ((hour % 24) + 24) % 24;
  const isDay = h >= 5.5 && h < 18.5;
  const p = isDay ? (h - 5.5) / 13 : (((h - 18.5 + 24) % 24) / 11);
  const arc = Math.sin(Math.PI * clamp01(p));
  return { kind: isDay ? 'sun' : 'moon', x: 0.08 + 0.84 * clamp01(p), y: 0.2 - 0.13 * arc, alpha: Math.min(1, arc * 3) };
}
