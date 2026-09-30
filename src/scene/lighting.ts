import * as THREE from 'three';
import { env } from '../env';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

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
