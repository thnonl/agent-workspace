import { audioGraph, subscribeAudioState } from './audio';
import { pageActive } from './pipHost';

/**
 * Lo-fi music and ambience, made up on the fly with the Web Audio API (no files): a slow beat, a bass, electric-piano chords
 * and a lazy pentatonic melody; rain on the roof and crickets by night. The mood follows the time of day and the weather.
 */
export type Mood = 'day' | 'dusk' | 'night' | 'rain';

const want = { music: false, mood: 'day' as Mood, rain: 0, crickets: 0 };

interface Chord {
  bass: number;
  pad: number[];
}
const PROGRESSIONS: Record<Mood, Chord[][]> = {
  day: [
    [{ bass: 36, pad: [59, 64, 67, 71] }, { bass: 33, pad: [57, 60, 64, 67] }, { bass: 38, pad: [57, 60, 65, 69] }, { bass: 31, pad: [59, 62, 65, 67] }],
    [{ bass: 36, pad: [60, 64, 67, 71] }, { bass: 41, pad: [60, 64, 67, 69] }, { bass: 36, pad: [60, 64, 67, 71] }, { bass: 43, pad: [59, 62, 65, 67] }],
  ],
  dusk: [
    [{ bass: 29, pad: [57, 60, 64, 69] }, { bass: 28, pad: [59, 62, 64, 67] }, { bass: 38, pad: [57, 60, 65, 69] }, { bass: 36, pad: [59, 64, 67, 71] }],
    [{ bass: 29, pad: [60, 64, 69, 72] }, { bass: 31, pad: [59, 62, 67, 71] }, { bass: 33, pad: [57, 60, 64, 67] }, { bass: 34, pad: [58, 62, 65, 69] }],
  ],
  night: [
    [{ bass: 33, pad: [59, 60, 64, 67] }, { bass: 29, pad: [57, 60, 64, 69] }, { bass: 36, pad: [59, 64, 67, 71] }, { bass: 31, pad: [59, 62, 64, 67] }],
    [{ bass: 33, pad: [57, 60, 64, 67] }, { bass: 38, pad: [57, 60, 65, 69] }, { bass: 40, pad: [59, 62, 64, 67] }, { bass: 33, pad: [57, 60, 64, 67] }],
  ],
  rain: [
    [{ bass: 38, pad: [57, 60, 64, 65] }, { bass: 34, pad: [58, 62, 65, 69] }, { bass: 29, pad: [57, 60, 64, 69] }, { bass: 36, pad: [60, 62, 64, 67] }],
    [{ bass: 38, pad: [57, 60, 65, 69] }, { bass: 31, pad: [59, 62, 65, 67] }, { bass: 36, pad: [59, 64, 67, 71] }, { bass: 33, pad: [57, 60, 64, 67] }],
  ],
};
const BPM: Record<Mood, number> = { day: 80, dusk: 74, night: 66, rain: 70 };
/** C major pentatonic (A minor pentatonic), two octaves: fits every chord above */
const SCALE = [72, 74, 76, 79, 81, 84, 86, 88];
const MUSIC_LEVEL = 0.42;

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

interface Engine {
  ctx: AudioContext;
  noise: AudioBuffer;
  musicGain: GainNode;
  bus: GainNode;
  rainGain: GainNode;
  cricketGain: GainNode;
}
let eng: Engine | null = null;

let timer = 0;
let nextT = 0;
let step = 0;
let bar = 0;
let prog: Chord[] = PROGRESSIONS.day[0];
let melody = 3;
let playingMood: Mood = 'day';

function build(): Engine | null {
  if (eng) return eng;
  const g = audioGraph();
  if (!g) return null;
  const { ctx, noise } = g;
  // music: voices -> bus -> warm low-pass -> (+ echo) -> music gain -> limiter
  const musicGain = ctx.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(g.out);
  const bus = ctx.createGain();
  const warm = ctx.createBiquadFilter();
  warm.type = 'lowpass';
  warm.frequency.value = 2600;
  warm.Q.value = 0.4;
  bus.connect(warm).connect(musicGain);
  const echo = ctx.createDelay(1);
  echo.delayTime.value = 0.375;
  const fb = ctx.createGain();
  fb.gain.value = 0.34;
  const echoTone = ctx.createBiquadFilter();
  echoTone.type = 'lowpass';
  echoTone.frequency.value = 1700;
  bus.connect(echo);
  echo.connect(echoTone).connect(fb).connect(echo);
  echoTone.connect(musicGain);

  // rain: hiss and a lower patter, through the effects bus (muted with the sound effects)
  const rainGain = ctx.createGain();
  rainGain.gain.value = 0;
  rainGain.connect(g.sfx);
  for (const [type, freq, q, level] of [['bandpass', 1800, 0.35, 1], ['lowpass', 500, 0.7, 0.7]] as const) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const lv = ctx.createGain();
    lv.gain.value = level;
    src.connect(f).connect(lv).connect(rainGain);
    src.start(0, Math.random() * 1.5);
  }

  // crickets: a high tone chopped into chirps (fast LFO) that come in bursts (slow LFO)
  const cricketGain = ctx.createGain();
  cricketGain.gain.value = 0;
  cricketGain.connect(g.sfx);
  const tone = ctx.createOscillator();
  tone.frequency.value = 4300;
  const chirp = ctx.createGain();
  chirp.gain.value = 0;
  const burst = ctx.createGain();
  burst.gain.value = 0;
  const lfo1 = ctx.createOscillator();
  lfo1.frequency.value = 26;
  const d1 = ctx.createGain();
  d1.gain.value = 0.5;
  const o1 = ctx.createConstantSource();
  o1.offset.value = 0.5;
  lfo1.connect(d1).connect(chirp.gain);
  o1.connect(chirp.gain);
  const lfo2 = ctx.createOscillator();
  lfo2.frequency.value = 0.7;
  const d2 = ctx.createGain();
  d2.gain.value = 0.5;
  const o2 = ctx.createConstantSource();
  o2.offset.value = 0.45;
  lfo2.connect(d2).connect(burst.gain);
  o2.connect(burst.gain);
  tone.connect(chirp).connect(burst).connect(cricketGain);
  for (const n of [tone, lfo1, lfo2, o1, o2]) n.start();

  eng = { ctx, noise, musicGain, bus, rainGain, cricketGain };
  return eng;
}

// ---------------------------------------------------------------- voices
function voice(e: Engine, t: number, freq: number, dur: number, gain: number, type: OscillatorType = 'sine', attack = 0.01) {
  const o = e.ctx.createOscillator();
  const g = e.ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(e.bus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function hit(e: Engine, t: number, dur: number, gain: number, type: BiquadFilterType, freq: number, q = 1) {
  const s = e.ctx.createBufferSource();
  s.buffer = e.noise;
  const f = e.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = e.ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(e.bus);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.02);
}

function kick(e: Engine, t: number, gain = 0.5) {
  const o = e.ctx.createOscillator();
  const g = e.ctx.createGain();
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
  o.connect(g).connect(e.bus);
  o.start(t);
  o.stop(t + 0.36);
}

function piano(e: Engine, t: number, m: number, gain: number, dur = 2.2) {
  const f = mtof(m);
  voice(e, t, f, dur, gain, 'sine', 0.012);
  voice(e, t, f * 2.003, dur * 0.45, gain * 0.28, 'sine', 0.006);
  voice(e, t, f * 0.997, dur * 0.8, gain * 0.5, 'triangle', 0.02);
}

function pickProgression() {
  const list = PROGRESSIONS[want.mood];
  prog = list[Math.floor(Math.random() * list.length)];
  playingMood = want.mood;
}

function play(e: Engine, s: number, t: number, beat: number) {
  const chord = prog[bar];
  const night = playingMood === 'night' || playingMood === 'rain';
  if (s === 0) {
    chord.pad.forEach((m, i) => piano(e, t + i * 0.028 + Math.random() * 0.01, m - 12, 0.05 - i * 0.004, 3.2));
    piano(e, t, chord.bass + 12, 0.07, 1.4);
  }
  if (s === 0 || s === 10) voice(e, t, mtof(chord.bass), s === 0 ? 0.75 : 0.45, 0.2, 'sine', 0.012);
  if (s === 8 && bar % 2 === 1) voice(e, t, mtof(chord.bass + 7), 0.4, 0.14, 'sine', 0.012);
  // a second, lighter strum on the "and" of 3 gives the chords a pulse
  if (s === 7 || (s === 14 && !night)) chord.pad.slice(1, 4).forEach((m, i) => piano(e, t + i * 0.02, m - 12, 0.022, 0.8));
  // drums
  if (s === 0 || s === 10 || (s === 7 && bar % 2)) kick(e, t, s === 0 ? 0.55 : 0.4);
  if (s === 4 || s === 12) {
    hit(e, t, 0.16, 0.16, 'bandpass', 1700, 0.9);
    voice(e, t, 190, 0.09, 0.05, 'triangle', 0.002);
  }
  if (s % 2 === 0) hit(e, t + (s % 4 === 2 ? beat * 0.06 : 0), 0.035, night ? 0.045 : 0.06 + (s % 4 === 0 ? 0.025 : 0), 'highpass', 8200, 0.5);
  else if (Math.random() < 0.18) hit(e, t, 0.02, 0.025, 'highpass', 9000, 0.5);
  // vinyl crackle
  if (Math.random() < 0.16) hit(e, t + Math.random() * beat * 0.25, 0.012, 0.03 + Math.random() * 0.03, 'highpass', 2500, 0.5);
  // melody: a lazy random walk on the pentatonic scale
  if (s % 2 === 0 && Math.random() < (night ? 0.2 : 0.3) && !(s === 0 && bar % 2 === 0)) {
    melody = Math.max(0, Math.min(SCALE.length - 1, melody + Math.floor(Math.random() * 5) - 2));
    const m = SCALE[melody] - (night ? 12 : 0);
    const len = (1 + Math.floor(Math.random() * 3)) * beat;
    voice(e, t + Math.random() * 0.02, mtof(m), 0.7 + len, 0.05, 'sine', 0.02);
    voice(e, t, mtof(m) * 2, 0.35, 0.012, 'sine', 0.01);
  }
}

function tick() {
  const e = eng;
  if (!e) return;
  const beat = 60 / BPM[playingMood] / 4;
  while (nextT < e.ctx.currentTime + 0.4) {
    play(e, step, nextT, beat);
    nextT += beat;
    step = (step + 1) % 16;
    if (step === 0) {
      bar = (bar + 1) % 4;
      if (bar === 0) pickProgression();
    }
  }
}

function startMusic(e: Engine) {
  if (timer) return;
  nextT = e.ctx.currentTime + 0.15;
  step = 0;
  bar = 0;
  pickProgression();
  timer = window.setInterval(tick, 90);
}

function stopMusic() {
  window.clearInterval(timer);
  timer = 0;
}

/** Brings the engine in line with what is wanted (called on every change, when the audio state changes and when the tab is shown / hidden). */
function sync() {
  const e = build();
  if (!e) return;
  const audible = pageActive() && e.ctx.state === 'running';
  const t = e.ctx.currentTime;
  e.musicGain.gain.setTargetAtTime(want.music && audible ? MUSIC_LEVEL : 0, t, 0.6);
  e.rainGain.gain.setTargetAtTime(audible ? want.rain * 0.07 : 0, t, 0.8);
  e.cricketGain.gain.setTargetAtTime(audible ? want.crickets * 0.012 : 0, t, 0.8);
  if (want.music && audible) startMusic(e);
  else if (timer) {
    // let the fade finish before the notes stop being scheduled
    const stopAt = window.setTimeout(() => {
      if (!(want.music && pageActive())) stopMusic();
    }, 1500);
    void stopAt;
  }
}

/** Music on / off and its mood, rain and cricket level (0-1). */
export function setAtmosphere(a: Partial<typeof want>) {
  Object.assign(want, a);
  sync();
}

if (typeof document !== 'undefined') {
  subscribeAudioState(sync);
  document.addEventListener('visibilitychange', sync);
}
