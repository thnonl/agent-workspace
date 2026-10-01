/**
 * Tiny sound effects, all synthesised with the Web Audio API (no files, no music). They only play for the room
 * that is on screen. The browser only allows sound after the first click / key press.
 */
import { playMeow } from './meow';
import { pageActive } from './pipHost';
import { getSetting, setSetting } from './settings';

/**
 * Real cat recordings: public/sfx/meow/index.json lists the clips (made by scripts/process-meow.mjs). They are fetched and decoded
 * the first time a cat meows; until then – and when there are none – the synthesised meow is used.
 */
const MEOW_DIR = `${import.meta.env.BASE_URL}sfx/meow/`;
let meowClips: AudioBuffer[] = [];
let meowLoading = false;
/** the clips played last: a cat does not repeat itself within a few meows */
const recentClips: number[] = [];

function loadMeowClips(c: AudioContext) {
  if (meowLoading) return;
  meowLoading = true;
  void (async () => {
    try {
      const names: unknown = await (await fetch(`${MEOW_DIR}index.json`)).json();
      if (!Array.isArray(names)) return;
      const clips = await Promise.all(
        names.map(async (n) => {
          try {
            return await c.decodeAudioData(await (await fetch(`${MEOW_DIR}${String(n)}`)).arrayBuffer());
          } catch {
            return null;
          }
        }),
      );
      meowClips = clips.filter((b): b is AudioBuffer => !!b);
    } catch {
      /* no recordings (or no network): the synthesised meow stays */
    }
  })();
}

/**
 * One of the recordings (never one of the last few), at the cat's pitch and a little different every time: its pitch is a bit
 * off, glides up or down by a few percent while it plays, it is louder or softer – and sometimes the cat meows twice.
 */
function playMeowClip(c: AudioContext, out: AudioNode, t: number, pitch: number, again = true) {
  const n = meowClips.length;
  let i = Math.floor(Math.random() * n);
  for (let tries = 0; tries < 8 && recentClips.includes(i); tries++) i = Math.floor(Math.random() * n);
  recentClips.push(i);
  if (recentClips.length > Math.min(4, n - 1)) recentClips.shift();
  const buf = meowClips[i];
  const rate = Math.min(1.5, Math.max(0.7, pitch)) * (0.93 + Math.random() * 0.14);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.setValueAtTime(rate, t);
  const len = buf.duration / rate;
  if (Math.random() < 0.55) src.playbackRate.linearRampToValueAtTime(rate * (Math.random() < 0.5 ? 0.92 + Math.random() * 0.05 : 1.03 + Math.random() * 0.07), t + len);
  const g = c.createGain();
  g.gain.value = 0.045 + Math.random() * 0.03;
  src.connect(g).connect(out);
  src.start(t);
  if (again && n > 1 && Math.random() < 0.16) playMeowClip(c, out, t + len + 0.06 + Math.random() * 0.18, pitch * (0.9 + Math.random() * 0.2), false);
}
export type Sfx =
  | 'door' | 'pop' | 'talk' | 'ding' | 'chime' | 'key' | 'paper' | 'water' | 'sip' | 'page' | 'sizzle' | 'bite' | 'meow' | 'blip' | 'pour' | 'clink'
  | 'doorbell' | 'inhale' | 'exhale' | 'thud' | 'huff' | 'clank' | 'pickup' | 'swipe' | 'mail' | 'ask'
  | 'shutter' | 'fanfare' | 'confetti' | 'sparkle' | 'levelup' | 'achieve' | 'puff' | 'radio' | 'clap' | 'flush';

const MUTE_KEY = 'claude-office:muted';
/** overall level – effects are synthesised soft, this brings them up to a clearly audible volume */
const MASTER = 1.6;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let outBus: DynamicsCompressorNode | null = null;
let muted = (() => {
  try {
    return getSetting(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();
let activeRoom: string | null = null;
const lastPlayed = new Map<string, number>();

export const isMuted = () => muted;

// whether sound can be heard yet: the browser keeps the audio context suspended until the first click or key press
const stateListeners = new Set<() => void>();
const notifyState = () => stateListeners.forEach((f) => f());
export const audioRunning = () => ctx?.state === 'running';
export function subscribeAudioState(f: () => void): () => void {
  stateListeners.add(f);
  return () => {
    stateListeners.delete(f);
  };
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    setSetting(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* private mode – the choice is simply not remembered */
  }
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : MASTER, ctx.currentTime, 0.02);
}

/** The room whose sounds are heard. */
export function setAudioRoom(id: string | null) {
  activeRoom = id;
}

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  ctx.onstatechange = notifyState;
  master = ctx.createGain();
  master.gain.value = muted ? 0 : MASTER;
  // limiter so overlapping effects at the higher master level do not clip
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  master.connect(limiter).connect(ctx.destination);
  outBus = limiter;
  if (import.meta.env.DEV) Object.assign(window, { __audio: { ctx, out: limiter } });
  return ctx;
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/**
 * The audio graph for the music / ambience engine (music.ts): `sfx` is the bus of the sound effects (muted by M and the
 * mute button, along with the ambience), `out` the final limiter (the music goes straight there, it has its own switch).
 * Null until the browser has let the page make sound (first click or key press).
 */
export function audioGraph(): { ctx: AudioContext; sfx: GainNode; out: AudioNode; noise: AudioBuffer } | null {
  if (!ctx || !master || !outBus) return null;
  return { ctx, sfx: master, out: outBus, noise: noiseBuffer(ctx) };
}

// browsers start audio contexts suspended until the user has interacted with the page
/** resumes the audio context; the floating window (pip.ts) calls it too, since a click there is not a click on the page */
export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') void c.resume();
  notifyState();
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio);
}

const MIN_GAP: Partial<Record<Sfx, number>> = { shutter: 500, fanfare: 1500, confetti: 400, sparkle: 600, levelup: 2000, achieve: 1500, puff: 400, radio: 300, clap: 3000, key: 70, pop: 160, talk: 240, blip: 200, water: 500, sizzle: 1500, flush: 6000, doorbell: 4000, inhale: 2500, exhale: 2500, thud: 130, huff: 900, clank: 250, pickup: 3000, swipe: 2500, mail: 2500, ask: 3000 };

function tone(c: AudioContext, at: number, freq: number, dur: number, gain: number, type: OscillatorType = 'sine', to?: number, attack = 0.008) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + dur + 0.02);
}

function noise(c: AudioContext, at: number, dur: number, gain: number, filter: BiquadFilterType, freq: number, to?: number, q = 1) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, at);
  if (to) f.frequency.exponentialRampToValueAtTime(to, at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.03, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(at, Math.random());
  src.stop(at + dur + 0.02);
}

/** Plays an effect. With a room id it is only heard while that room is the one on screen. */
export function sfx(name: Sfx, roomId?: string, pitch = 1) {
  if (muted || typeof document === 'undefined' || !pageActive()) return;
  if (roomId && roomId !== activeRoom) return;
  const c = ctx;
  if (!c || c.state !== 'running' || !master) return;
  const nowMs = performance.now();
  const gap = MIN_GAP[name] ?? 60;
  if (nowMs - (lastPlayed.get(name) ?? -1e9) < gap) return;
  lastPlayed.set(name, nowMs);
  const t = c.currentTime + 0.005;
  const r = Math.random();
  switch (name) {
    case 'door':
      tone(c, t, 190, 0.14, 0.09, 'triangle', 110);
      noise(c, t, 0.05, 0.05, 'lowpass', 900);
      tone(c, t + 0.16, 640, 0.18, 0.03, 'sine', 520);
      break;
    case 'pop':
      tone(c, t, 480 + r * 60, 0.07, 0.05, 'sine', 780 + r * 80);
      break;
    case 'talk': {
      const n = 2 + Math.floor(r * 3);
      for (let i = 0; i < n; i++) tone(c, t + i * 0.075, 260 + Math.random() * 220, 0.06, 0.045, 'triangle');
      break;
    }
    case 'ding':
      tone(c, t, 880, 0.35, 0.07);
      tone(c, t + 0.09, 1320, 0.45, 0.05);
      break;
    case 'chime':
      [660, 830, 990, 1320].forEach((f, i) => tone(c, t + i * 0.13, f, 0.6, 0.06));
      break;
    case 'key':
      // a soft, low tap (band-passed, short decay) instead of a sharp click
      noise(c, t, 0.04, 0.014, 'bandpass', 1500 + r * 500, 800, 0.7);
      break;
    case 'paper':
      noise(c, t, 0.32, 0.06, 'bandpass', 1500, 3200, 0.7);
      break;
    case 'water':
      noise(c, t, 1.0, 0.05, 'bandpass', 1400, 2600, 0.8);
      break;
    case 'pour':
      noise(c, t, 1.4, 0.04, 'bandpass', 2200, 1600, 0.6);
      break;
    case 'sip':
      tone(c, t, 320, 0.12, 0.05, 'sine', 170);
      tone(c, t + 0.16, 300, 0.1, 0.04, 'sine', 160);
      break;
    case 'page':
      noise(c, t, 0.14, 0.05, 'bandpass', 3800, 2400, 0.9);
      break;
    case 'sizzle':
      noise(c, t, 1.8, 0.035, 'highpass', 4500, 6500, 0.5);
      break;
    case 'bite':
      tone(c, t, 1500, 0.025, 0.035, 'square');
      tone(c, t + 0.07, 1250, 0.025, 0.03, 'square');
      break;
    case 'clink':
      tone(c, t, 2100, 0.12, 0.03);
      tone(c, t + 0.03, 3100, 0.1, 0.02);
      break;
    case 'flush':
      // a toilet flush: a rushing, slowly falling noise and a gurgle
      noise(c, t, 1.6, 0.05, 'bandpass', 1800, 600, 0.5);
      tone(c, t + 1.0, 190, 0.5, 0.025, 'sine', 120);
      break;
    case 'thud':
      noise(c, t, 0.09, 0.1, 'lowpass', 700, 180);
      tone(c, t, 130 + r * 30, 0.14, 0.12, 'sine', 55, 0.004);
      break;
    case 'huff':
      noise(c, t, 0.34, 0.045, 'bandpass', 1300, 650, 0.6);
      break;
    case 'clank':
      tone(c, t, 1250 + r * 150, 0.1, 0.045, 'triangle');
      tone(c, t + 0.025, 1900, 0.08, 0.03, 'triangle');
      noise(c, t, 0.04, 0.04, 'lowpass', 1800);
      break;
    case 'pickup':
      // a phone picked up: two soft rising beeps
      tone(c, t, 720, 0.09, 0.03, 'sine', 900);
      tone(c, t + 0.13, 960, 0.12, 0.03, 'sine', 1120);
      break;
    case 'mail':
      // new mail: a soft two-note chime
      tone(c, t, 988, 0.22, 0.05);
      tone(c, t + 0.12, 1480, 0.4, 0.04);
      break;
    case 'ask':
      // the agent needs an answer: a two-note rising chime
      tone(c, t, 660, 0.2, 0.06);
      tone(c, t + 0.14, 990, 0.45, 0.06);
      break;
    case 'swipe':
      noise(c, t, 0.09, 0.03, 'bandpass', 2600, 4200, 0.8);
      tone(c, t + 0.05, 1400, 0.04, 0.012);
      break;
    case 'blip':
      tone(c, t, 500 + r * 200, 0.05, 0.03, 'sine', 950);
      break;
    case 'doorbell':
      tone(c, t, 784, 0.5, 0.06);
      tone(c, t + 0.28, 622, 0.7, 0.06);
      break;
    case 'inhale':
      noise(c, t, 0.7, 0.03, 'bandpass', 900, 1700, 0.6);
      break;
    case 'exhale':
      noise(c, t, 1.4, 0.025, 'bandpass', 1500, 700, 0.5);
      break;
    case 'shutter':
      noise(c, t, 0.03, 0.09, 'highpass', 3200);
      noise(c, t + 0.07, 0.06, 0.07, 'bandpass', 1900, 1200, 0.8);
      break;
    case 'fanfare':
      // a short "we did it" flourish ending on a bright chord
      [523, 659, 784].forEach((f, i) => tone(c, t + i * 0.11, f, 0.22, 0.06, 'triangle'));
      [1047, 1319, 1568].forEach((f) => tone(c, t + 0.36, f, 0.9, 0.045, 'triangle'));
      tone(c, t + 0.36, 523, 0.9, 0.05, 'sine');
      break;
    case 'confetti':
      noise(c, t, 0.14, 0.1, 'bandpass', 1100, 260, 0.7);
      for (let i = 0; i < 6; i++) tone(c, t + 0.05 + i * 0.045, 1800 + Math.random() * 2200, 0.09, 0.018, 'sine');
      break;
    case 'sparkle':
      tone(c, t, 1568, 0.18, 0.04);
      tone(c, t + 0.08, 2093, 0.3, 0.035);
      tone(c, t + 0.16, 2637, 0.4, 0.025);
      break;
    case 'levelup':
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, t + i * 0.09, f, 0.3, 0.055, 'triangle'));
      tone(c, t + 0.5, 1568, 0.7, 0.04);
      break;
    case 'achieve':
      tone(c, t, 784, 0.25, 0.05, 'triangle');
      tone(c, t + 0.12, 988, 0.25, 0.05, 'triangle');
      tone(c, t + 0.24, 1319, 0.6, 0.05, 'triangle');
      break;
    case 'puff':
      noise(c, t, 0.22, 0.05, 'lowpass', 1400, 500);
      break;
    case 'radio':
      noise(c, t, 0.05, 0.05, 'bandpass', 2400);
      tone(c, t + 0.06, 880, 0.08, 0.03, 'square');
      tone(c, t + 0.15, 660, 0.08, 0.03, 'square');
      break;
    case 'clap':
      for (let i = 0; i < 9; i++) noise(c, t + i * 0.075 + Math.random() * 0.03, 0.05, 0.05, 'bandpass', 1500 + Math.random() * 1500, 900, 0.9);
      break;
    case 'meow':
      loadMeowClips(c);
      if (meowClips.length) playMeowClip(c, master, t, pitch);
      else playMeow(c, master, t, pitch, r, 0.04);
      break;
  }
}

if (import.meta.env.DEV && typeof window !== "undefined") Object.assign(window, { __sfx: sfx });
