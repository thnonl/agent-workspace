import { audioGraph, subscribeAudioState } from './audio';
import { pageActive } from './pipHost';

/**
 * Lo-fi music and ambience, made up on the fly with the Web Audio API (no files). The music is composed, not random: every
 * mood has its own written chord loops and a short hook, played in a fixed song form (intro, groove, hook, bridge, hook again,
 * outro), over swung boom-bap drums, a bass line and electric-piano chords. Only the tiniest human timing and velocity wobble
 * is left to chance. Crickets by night. The mood follows the time of day and the weather (the weather itself makes no sound).
 */
export type Mood = 'day' | 'dusk' | 'night' | 'rain';

const want = { music: false, mood: 'day' as Mood, crickets: 0 };

// ---------------------------------------------------------------- the pieces
/** `bass` is the root (MIDI), `keys` a close, rootless voicing that moves by steps from chord to chord */
interface Chord {
  bass: number;
  keys: number[];
}
const c = (bass: number, ...keys: number[]): Chord => ({ bass, keys });
/** one bar: one chord, or two (the second one comes in on the third beat) */
type Bar = Chord[];

const Cmaj9 = c(36, 59, 62, 64, 67);
const Am9 = c(33, 60, 64, 67, 71);
const Am9l = c(33, 55, 59, 60, 64);
const Am7 = c(33, 55, 60, 64, 67);
const Dm9 = c(38, 60, 64, 65, 69);
const Dm9l = c(38, 57, 60, 64, 65);
const G9 = c(31, 59, 62, 65, 69);
const Gm9 = c(31, 58, 62, 65, 69);
const Fmaj9 = c(29, 60, 64, 67, 69);
const Fmaj9l = c(29, 57, 60, 64, 67);
const Em7 = c(40, 59, 62, 64, 67);
const Em7b5 = c(40, 58, 62, 64, 67);
const Bbmaj9 = c(34, 60, 62, 65, 69);
const Bbmaj9l = c(34, 57, 60, 62, 65);
const C9 = c(36, 58, 62, 64, 67);
const E7b9 = c(40, 56, 59, 62, 65);
const A7b9 = c(33, 61, 64, 67, 70);

/**
 * `melA` / `melB`: the hook, 8 bars each (4 bars the first time round, 4 bars the second time). One row per bar, one pitch per
 * note of the rhythm (see CALL / ANSWER below), 0 is a rest. A is a call over the A chords, B an answer over the B chords.
 */
interface Piece {
  bpm: number;
  /** drum level: the night is gentler */
  drums: number;
  A: Bar[];
  B: Bar[];
  melA: number[][];
  melB: number[][];
}
const PIECES: Record<Mood, Piece> = {
  // C major: I - vi - ii - V, then IV - iii - vi - ii/V
  day: {
    bpm: 76,
    drums: 1,
    A: [[Cmaj9], [Am9], [Dm9], [G9]],
    B: [[Fmaj9], [Em7], [Am9], [Dm9, G9]],
    melA: [
      [79, 76, 74, 76], [76, 72, 71, 72], [77, 74, 72, 74], [74, 71, 77, 76],
      [81, 79, 76, 79], [76, 72, 71, 72], [77, 74, 72, 74], [74, 71, 76, 72],
    ],
    melB: [
      [81, 79, 76, 77], [79, 76, 74, 71], [72, 76, 79, 83], [77, 74, 71, 74, 77],
      [77, 81, 79, 76], [79, 76, 74, 71], [72, 76, 79, 83], [77, 74, 71, 74, 76],
    ],
  },
  // F major: I - vi - ii - V, then IV - iii - ii - V
  dusk: {
    bpm: 72,
    drums: 0.95,
    A: [[Fmaj9l], [Dm9l], [Gm9], [C9]],
    B: [[Bbmaj9l], [Am7], [Gm9], [C9]],
    melA: [
      [81, 79, 76, 77], [81, 77, 76, 74], [82, 79, 77, 74], [76, 74, 70, 72],
      [81, 79, 77, 81], [81, 77, 76, 74], [82, 79, 77, 74], [74, 70, 76, 77],
    ],
    melB: [
      [74, 77, 81, 77], [76, 72, 79, 76], [77, 74, 70, 74], [72, 76, 79, 82, 81],
      [74, 77, 81, 79], [76, 72, 79, 76], [77, 74, 70, 74], [72, 76, 79, 76, 77],
    ],
  },
  // A minor: i - VI - iv - V7(b9), then iv - bVII - III - VI/V7(b9)
  night: {
    bpm: 66,
    drums: 0.8,
    A: [[Am9l], [Fmaj9l], [Dm9l], [E7b9]],
    B: [[Dm9l], [G9], [Cmaj9], [Fmaj9l, E7b9]],
    melA: [
      [0, 76, 0, 72], [0, 81, 0, 76], [0, 77, 0, 74], [71, 0, 74, 68],
      [0, 79, 0, 76], [0, 81, 0, 76], [0, 77, 0, 74], [71, 0, 74, 69],
    ],
    melB: [
      [77, 0, 74, 0], [74, 0, 71, 0], [76, 0, 79, 0], [77, 0, 68, 71, 76],
      [74, 0, 77, 0], [74, 0, 71, 0], [79, 0, 76, 0], [77, 0, 68, 71, 76],
    ],
  },
  // D minor: i - bVI - iv - V7(b9), then iv - i - iiø - bVI/V7(b9)
  rain: {
    bpm: 68,
    drums: 0.85,
    A: [[Dm9], [Bbmaj9], [Gm9], [A7b9]],
    B: [[Gm9], [Dm9], [Em7b5], [Bbmaj9, A7b9]],
    melA: [
      [81, 77, 0, 74], [81, 77, 0, 72], [82, 79, 0, 74], [76, 0, 73, 74],
      [81, 77, 0, 76], [81, 77, 0, 72], [82, 79, 0, 74], [76, 0, 79, 77],
    ],
    melB: [
      [77, 0, 74, 70], [76, 0, 72, 69], [74, 0, 70, 67], [72, 0, 73, 76, 74],
      [77, 0, 74, 70], [76, 0, 72, 69], [74, 0, 70, 67], [72, 0, 73, 76, 77],
    ],
  },
};

/** [step, length] of the notes of the hook (16 steps = 1 bar). The call is syncopated and the answer lands on the beats. */
const CALL: number[][] = [[2, 3], [6, 2], [8, 2], [10, 6]];
const CALL_END: number[][] = [[2, 3], [6, 2], [10, 2], [12, 4]];
const ANSWER: number[][] = [[0, 4], [4, 4], [8, 3], [12, 4]];
const ANSWER_END: number[][] = [[0, 4], [4, 4], [8, 2], [10, 2], [12, 4]];

/** How far each sixteenth is pushed back to make the groove swing (in steps): the off-beat eighth lands at ~58 %, not 50 % */
const SWING = [0, 0.1, 0.34, 0.4];

// song form, in bars: 0-3 intro, 4-11 groove (hook joins in bar 8), 12-19 bridge, 20-27 hook again, 28-31 outro; then back to bar 4
const SONG_LEN = 32;
const LOOP_FROM = 4;

const MUSIC_LEVEL = 0.42;

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);
/** a few milliseconds of human wobble */
const human = (ms: number) => ((Math.random() - 0.5) * ms) / 500;
const vel = () => 0.93 + Math.random() * 0.14;

// ---------------------------------------------------------------- the engine
interface Engine {
  ctx: AudioContext;
  noise: AudioBuffer;
  musicGain: GainNode;
  /** chords and hook: wobbles like tape, warm, with room; ducks a little on every kick */
  keys: GainNode;
  /** the hook: goes through `keys`, and sends a lot to the echo */
  mel: GainNode;
  bass: GainNode;
  drum: GainNode;
  echo: DelayNode;
  cricketGain: GainNode;
}
let eng: Engine | null = null;

let timer = 0;
let nextT = 0;
let step = 0;
let pos = 0;
let playingMood: Mood = 'day';

/** a soft room: noise that fades out and gets darker as it goes */
function roomImpulse(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 1.9);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      lp += ((Math.random() * 2 - 1) - lp) * (0.5 - 0.42 * x);
      d[i] = lp * (1 - x) ** 2.4 * 2.2;
    }
  }
  return buf;
}

/** dust and pops of a record: clicks of different size over a faint hiss, in a loop long enough not to be noticed */
function vinylLoop(ctx: AudioContext): AudioBuffer {
  const len = ctx.sampleRate * 9;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.03;
  const clicks = 9 * 9;
  for (let n = 0; n < clicks; n++) {
    const at = Math.floor(Math.random() * (len - 400));
    const a = (0.25 + Math.random() * Math.random() * 0.75) * (Math.random() < 0.5 ? -1 : 1);
    const tail = 6 + Math.random() * 30;
    for (let i = 0; i < 300; i++) d[at + i] += a * Math.exp(-i / tail) * (i % 2 ? -0.6 : 1);
  }
  return buf;
}

function build(): Engine | null {
  if (eng) return eng;
  const g = audioGraph();
  if (!g) return null;
  const { ctx, noise } = g;
  const musicGain = ctx.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(g.out);

  // chords and hook -> tape wobble -> warm low-pass -> out, with a send to the room and one to the echo
  const keys = ctx.createGain();
  const mel = ctx.createGain();
  mel.connect(keys);
  const vib = ctx.createDelay(0.05);
  vib.delayTime.value = 0.01;
  for (const [hz, depth] of [[0.55, 0.0004], [0.13, 0.0007]]) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = hz;
    const d = ctx.createGain();
    d.gain.value = depth;
    lfo.connect(d).connect(vib.delayTime);
    lfo.start();
  }
  const keysHp = ctx.createBiquadFilter();
  keysHp.type = 'highpass';
  keysHp.frequency.value = 110;
  const warm = ctx.createBiquadFilter();
  warm.type = 'lowpass';
  warm.frequency.value = 3000;
  warm.Q.value = 0.5;
  keys.connect(keysHp).connect(vib).connect(warm).connect(musicGain);

  const room = ctx.createConvolver();
  room.buffer = roomImpulse(ctx);
  const roomOut = ctx.createGain();
  roomOut.gain.value = 0.8;
  room.connect(roomOut).connect(musicGain);
  const keysRoom = ctx.createGain();
  keysRoom.gain.value = 0.3;
  warm.connect(keysRoom).connect(room);

  const echo = ctx.createDelay(1.5);
  echo.delayTime.value = 0.5;
  const fb = ctx.createGain();
  fb.gain.value = 0.3;
  const echoTone = ctx.createBiquadFilter();
  echoTone.type = 'lowpass';
  echoTone.frequency.value = 1800;
  const keysEcho = ctx.createGain();
  keysEcho.gain.value = 0.14;
  warm.connect(keysEcho).connect(echo);
  const melEcho = ctx.createGain();
  melEcho.gain.value = 0.38;
  mel.connect(melEcho).connect(echo);
  echo.connect(echoTone).connect(fb).connect(echo);
  echoTone.connect(musicGain);
  echoTone.connect(room);

  // bass: straight to the output, round
  const bass = ctx.createGain();
  const bassLp = ctx.createBiquadFilter();
  bassLp.type = 'lowpass';
  bassLp.frequency.value = 760;
  bass.connect(bassLp).connect(musicGain);

  // drums: a little dull, a little room
  const drum = ctx.createGain();
  const drumLp = ctx.createBiquadFilter();
  drumLp.type = 'lowpass';
  drumLp.frequency.value = 7000;
  drum.connect(drumLp).connect(musicGain);
  const drumRoom = ctx.createGain();
  drumRoom.gain.value = 0.1;
  drumLp.connect(drumRoom).connect(room);

  // vinyl: always there, very quiet
  const vinyl = ctx.createBufferSource();
  vinyl.buffer = vinylLoop(ctx);
  vinyl.loop = true;
  const vinylHp = ctx.createBiquadFilter();
  vinylHp.type = 'highpass';
  vinylHp.frequency.value = 1400;
  const vinylGain = ctx.createGain();
  vinylGain.gain.value = 0.05;
  vinyl.connect(vinylHp).connect(vinylGain).connect(musicGain);
  vinyl.start();

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

  eng = { ctx, noise, musicGain, keys, mel, bass, drum, echo, cricketGain };
  return eng;
}

// ---------------------------------------------------------------- voices
function osc(e: Engine, out: AudioNode, t: number, freq: number, dur: number, gain: number, type: OscillatorType, attack: number, detune = 0) {
  const o = e.ctx.createOscillator();
  const g = e.ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Electric piano, two-operator FM: a bright "bark" at the strike that mellows into a soft bell tone, and dies away like a tine. */
function ep(e: Engine, out: AudioNode, t: number, midi: number, gain: number, dur: number, bright = 1) {
  const f = mtof(midi);
  const car = e.ctx.createOscillator();
  const mod = e.ctx.createOscillator();
  const index = e.ctx.createGain();
  const amp = e.ctx.createGain();
  car.frequency.value = f;
  car.detune.value = (Math.random() - 0.5) * 6;
  mod.frequency.value = f;
  index.gain.setValueAtTime(f * 1.5 * bright, t);
  index.gain.exponentialRampToValueAtTime(f * 0.1 * bright, t + 0.55);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  mod.connect(index).connect(car.frequency);
  car.connect(amp).connect(out);
  car.start(t);
  mod.start(t);
  car.stop(t + dur + 0.05);
  mod.stop(t + dur + 0.05);
}

function bassNote(e: Engine, t: number, midi: number, dur: number, gain: number) {
  const f = mtof(midi);
  // laptop speakers do not reproduce 40-80 Hz: the triangle and the saw (low-passed) carry the note up where they can be heard
  osc(e, e.bass, t, f, dur, gain, 'triangle', 0.01);
  osc(e, e.bass, t, f, dur * 0.8, gain * 0.35, 'sawtooth', 0.01);
  osc(e, e.bass, t, f * 2, dur * 0.5, gain * 0.25, 'sine', 0.01);
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
  s.connect(f).connect(g).connect(e.drum);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.02);
}

function kick(e: Engine, t: number, gain: number) {
  const o = e.ctx.createOscillator();
  const g = e.ctx.createGain();
  // (a triangle that falls from 170 to 58 Hz plus a click: audible on small speakers, not only a sub rumble)
  o.type = 'triangle';
  o.frequency.setValueAtTime(170, t);
  o.frequency.exponentialRampToValueAtTime(58, t + 0.11);
  g.gain.setValueAtTime(gain * 1.1, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g).connect(e.drum);
  o.start(t);
  o.stop(t + 0.34);
  hit(e, t, 0.014, gain * 0.5, 'bandpass', 1400, 0.8);
  // the chords and the hook duck a little under the kick, so the beat breathes
  e.keys.gain.setValueAtTime(0.8, t);
  e.keys.gain.linearRampToValueAtTime(1, t + 0.22);
}

function snare(e: Engine, t: number, gain: number) {
  hit(e, t, 0.2, gain, 'bandpass', 1900, 0.7);
  hit(e, t, 0.07, gain * 0.6, 'highpass', 4800, 0.5);
  osc(e, e.drum, t, 190, 0.12, gain * 0.5, 'triangle', 0.002);
}

// ---------------------------------------------------------------- the song
type Role = 'intro' | 'groove' | 'bridge' | 'hook' | 'outro';
const roleOf = (p: number): Role => (p < 4 ? 'intro' : p < 12 ? 'groove' : p < 20 ? 'bridge' : p < 28 ? 'hook' : 'outro');

function barsOf(piece: Piece, p: number): Bar {
  return (roleOf(p) === 'bridge' ? piece.B : piece.A)[p % 4];
}

/** the hook of this bar: pitches and where they go, or null */
function hookOf(piece: Piece, p: number): { notes: number[]; at: number[][] } | null {
  const role = roleOf(p);
  const end = p % 4 === 3;
  if (role === 'bridge') return { notes: piece.melB[p - 12], at: end ? ANSWER_END : ANSWER };
  const row = role === 'groove' ? (p >= 8 ? p - 8 : -1) : role === 'hook' ? p - 20 : role === 'outro' ? 4 + (p - 28) : -1;
  return row < 0 ? null : { notes: piece.melA[row], at: end ? CALL_END : CALL };
}

function play(e: Engine, s: number, t0: number, sd: number) {
  const piece = PIECES[playingMood];
  const role = roleOf(pos);
  const bi = pos % 4;
  const bar = barsOf(piece, pos);
  const two = bar.length > 1;
  const chord = two && s >= 8 ? bar[1] : bar[0];
  const t = t0 + SWING[s % 4] * sd;
  // the mood changes at the end of a 4-bar loop: do not lean into a chord of the old piece then
  const leaving = want.mood !== playingMood && bi === 3;
  const nextPos = pos + 1 >= SONG_LEN ? LOOP_FROM : pos + 1;
  const next = leaving ? null : barsOf(piece, nextPos)[0];

  // ---- chords: a full stab on the downbeat, a soft one on the "and" of 3, and every other bar a push into the next chord
  const downbeat = s === 0 || (s === 8 && two);
  if (downbeat) {
    const ring = (two ? 8 : 16) * sd + 0.9;
    chord.keys.forEach((m, i) => ep(e, e.keys, t + i * 0.022 + human(8), m, (0.052 - i * 0.003) * vel(), ring));
    if (role === 'intro' || role === 'bridge' || role === 'outro') {
      // a slow pad of the same chord underneath
      for (const m of chord.keys.slice(0, 3)) {
        osc(e, e.keys, t, mtof(m), ring + 1.2, 0.011, 'sine', 0.9, -5);
        osc(e, e.keys, t, mtof(m), ring + 1.2, 0.011, 'sine', 0.9, 5);
      }
    }
  }
  if (s === 10) chord.keys.slice(1).forEach((m, i) => ep(e, e.keys, t + i * 0.018 + human(8), m, 0.026 * vel(), 0.9));
  if (s === 14 && bi % 2 === 1 && next) next.keys.slice(1).forEach((m, i) => ep(e, e.keys, t + i * 0.018 + human(8), m, 0.028 * vel(), 1.6));

  // ---- bass: root, a lazy octave, the fifth (or the second chord), a half-step walk into the next chord
  if (role !== 'intro' || pos >= 2) {
    const b = (at: number, midi: number, len: number, gain: number) => bassNote(e, at + human(6), midi, len * sd, gain * vel());
    if (s === 0) b(t, chord.bass, 6, 0.24);
    if (s === 6 && !two) b(t, chord.bass + 12, 2, 0.1);
    if (s === 8) b(t, two ? chord.bass : chord.bass + 7, 4, two ? 0.22 : 0.15);
    if (s === 14 && bi % 2 === 1 && next) b(t, next.bass - 1, 2, 0.12);
  }

  // ---- drums
  const lead = role === 'intro' && pos >= 2;
  if (lead || role === 'groove' || role === 'bridge' || role === 'hook') {
    const d = piece.drums * (lead ? 0.7 : 1);
    const fill = pos % 8 === 7;
    const k = (gain: number) => kick(e, t0 + human(4), gain * d);
    if (s === 0) k(0.6);
    if (s === 6) k(bi % 2 === 1 ? 0.4 : 0.28);
    if (s === 10) k(0.48);
    if (!lead && (s === 4 || (s === 12 && !fill))) snare(e, t + 0.012 + human(4), 0.3 * d * vel());
    if (fill && !lead && s >= 12) snare(e, t, [0.16, 0.12, 0.16, 0.24][s - 12] * d);
    if (s === 15 && bi % 2 === 1 && !fill) snare(e, t, 0.09 * d);
    if (s === 7 && bi === 3) snare(e, t, 0.07 * d);
    // hi-hats: straight eighths, strong on the beat; an open one at the end of every 4th bar; more of them in the bridge
    if (s % 2 === 0 && !(fill && s >= 14)) hit(e, t + human(4), 0.035, (s % 4 === 0 ? 0.11 : 0.065) * d * vel(), 'highpass', 8200, 0.5);
    if (s === 14 && bi === 3 && !fill) hit(e, t, 0.14, 0.08 * d, 'highpass', 7600, 0.5);
    if (role === 'bridge' && s % 2 === 1) hit(e, t, 0.02, 0.03 * d, 'highpass', 9000, 0.5);
  }

  // ---- the hook
  const hook = hookOf(piece, pos);
  if (hook) {
    hook.at.forEach(([at, len], i) => {
      const m = hook.notes[i];
      if (m && at === s) ep(e, e.mel, t + human(10), m, (role === 'outro' ? 0.04 : 0.05) * vel(), len * sd + 1.1, 0.7);
    });
  }
}

/** Schedules every step that falls before `until` (seconds on the audio clock). */
function schedule(e: Engine, until: number) {
  while (nextT < until) {
    const sd = 60 / PIECES[playingMood].bpm / 4;
    play(e, step, nextT, sd);
    nextT += sd;
    step = (step + 1) % 16;
    if (step === 0) {
      pos = pos + 1 >= SONG_LEN ? LOOP_FROM : pos + 1;
      // a new mood takes over at the end of a 4-bar loop, with a fresh intro
      if (pos % 4 === 0 && want.mood !== playingMood) setPiece(e, want.mood);
    }
  }
}

function setPiece(e: Engine, mood: Mood) {
  playingMood = mood;
  pos = 0;
  e.echo.delayTime.setTargetAtTime((60 / PIECES[mood].bpm) * 0.75, e.ctx.currentTime, 0.05);
}

function startMusic(e: Engine) {
  if (timer) return;
  nextT = e.ctx.currentTime + 0.15;
  step = 0;
  setPiece(e, want.mood);
  timer = window.setInterval(() => {
    if (eng) schedule(eng, eng.ctx.currentTime + 0.4);
  }, 90);
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
  e.cricketGain.gain.setTargetAtTime(audible ? want.crickets * 0.006 : 0, t, 0.8);
  if (want.music && audible) startMusic(e);
  else if (timer) {
    // let the fade finish before the notes stop being scheduled
    window.setTimeout(() => {
      if (!(want.music && pageActive())) stopMusic();
    }, 1500);
  }
}

/** Music on / off and its mood, and the cricket level (0-1). */
export function setAtmosphere(a: Partial<typeof want>) {
  Object.assign(want, a);
  sync();
}

if (typeof document !== 'undefined') {
  subscribeAudioState(sync);
  document.addEventListener('visibilitychange', sync);
}
