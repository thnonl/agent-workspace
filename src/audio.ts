/**
 * Tiny sound effects, all synthesised with the Web Audio API (no files, no music). They only play for the room
 * that is on screen. The browser only allows sound after the first click / key press.
 */
export type Sfx =
  | 'door' | 'pop' | 'talk' | 'ding' | 'chime' | 'key' | 'paper' | 'water' | 'sip' | 'page' | 'sizzle' | 'bite' | 'meow' | 'blip' | 'pour' | 'clink';

const MUTE_KEY = 'claude-office:muted';
/** overall level – effects are synthesised soft, this brings them up to a clearly audible volume */
const MASTER = 1.6;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();
let activeRoom: string | null = null;
const lastPlayed = new Map<string, number>();

export const isMuted = () => muted;

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
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
  return ctx;
}

// browsers start audio contexts suspended until the user has interacted with the page
if (typeof window !== 'undefined') {
  const unlock = () => {
    const c = ensure();
    if (c && c.state === 'suspended') void c.resume();
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

const MIN_GAP: Partial<Record<Sfx, number>> = { key: 70, pop: 160, talk: 240, blip: 200, water: 500, sizzle: 1500 };

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
export function sfx(name: Sfx, roomId?: string) {
  if (muted || typeof document === 'undefined' || document.hidden) return;
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
      noise(c, t, 0.025, 0.035, 'highpass', 2600 + r * 1500);
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
    case 'blip':
      tone(c, t, 500 + r * 200, 0.05, 0.03, 'sine', 950);
      break;
    case 'meow':
      tone(c, t, 620, 0.32, 0.045, 'sawtooth', 460, 0.05);
      tone(c, t + 0.02, 940, 0.28, 0.02, 'sine', 700, 0.05);
      break;
  }
}
