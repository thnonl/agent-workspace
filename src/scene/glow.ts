import * as THREE from 'three';
import { env } from '../env';
import { DUST, FX, HALO } from './fx';
import { frame } from '../sim/frame';

/**
 * 0-1 per room: its lights are on. Somebody inside switches them on, the last one to leave switches them off (kept up to date by
 * EnvSync in Scene.tsx). A room that is not in the map counts as lit.
 */
export const roomLit = new Map<string, number>();
export const litOf = (id: string | null | undefined): number => (id ? roomLit.get(id) ?? 1 : 1);
/** how much the lamps shine in the room on screen: the time of day, and whether anybody is in (the shared lamp materials follow it) */
export const lampsNow = (): number => env.lamps * litOf(frame.activeId);

/**
 * Materials that react to the time of day (lamps, bulbs, window glass, light cones).
 * They are shared objects, so merged / baked meshes update automatically.
 */
const lamps = new Map<string, THREE.MeshStandardMaterial>();

/** Lamp shade that starts glowing when the room lights come on. */
export function glowMat(color: string, rough = 0.5): THREE.MeshStandardMaterial {
  const key = `${color}|${rough}`;
  let m = lamps.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, emissive: new THREE.Color(color).lerp(new THREE.Color('#ffdf9a'), 0.6), emissiveIntensity: 0.1 });
    lamps.set(key, m);
  }
  return m;
}

export const GLOW = {
  bulb: new THREE.MeshBasicMaterial({ color: '#e8dfa8' }),
  glass: new THREE.MeshStandardMaterial({
    color: '#cdefff', roughness: 0.05, transparent: true, opacity: 0.32, emissive: new THREE.Color('#ffcf7a'), emissiveIntensity: 0,
  }),
  cone: new THREE.MeshBasicMaterial({ color: '#ffe6a8', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  sunbeam: new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0.26, depthWrite: false, vertexColors: true }),
};

const bulbDim = new THREE.Color('#d8cf9c');
const bulbBright = new THREE.Color('#fffbd6');
const glassDay = new THREE.Color('#cdefff');
const glassNight = new THREE.Color('#25305e');
const beamDay = new THREE.Color('#fff6c8');
const beamMoon = new THREE.Color('#b9c8ff');

export function updateGlow() {
  const on = lampsNow();
  for (const m of lamps.values()) m.emissiveIntensity = 0.08 + 1.5 * on;
  GLOW.bulb.color.copy(bulbDim).lerp(bulbBright, on);
  GLOW.glass.emissiveIntensity = 0.75 * on;
  GLOW.glass.color.copy(glassDay).lerp(glassNight, env.night);
  GLOW.glass.opacity = 0.32 + 0.3 * env.night;
  GLOW.cone.opacity = 0.16 * on;
  GLOW.sunbeam.color.copy(beamDay).lerp(beamMoon, env.night);
  GLOW.sunbeam.opacity = (0.2 * env.day + 0.07 * env.night) * (1 - 0.85 * env.overcast);
  FX.pool.opacity = 0.5 * env.lamps;
  HALO.opacity = 0.42 * env.lamps;
  // (each room draws its pools and halos with its own copy of these, dimmed by its own lights: see RoomLightFx)
  DUST.opacity = 0.75 * env.day * (1 - env.overcast);
}
