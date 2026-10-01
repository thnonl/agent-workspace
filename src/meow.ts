/**
 * A cat's meow, synthesised: a buzzy, slightly breathy voice (sawtooth) whose pitch climbs and falls ("mee-ow") and that is pushed
 * through two moving formant filters – the mouth opening from a thin "ee" (high second formant) to a round "ow" (low one).
 * A little vibrato comes in on the held part, a puff of air rides on the start and the end. `pitch` is the size of the cat
 * (above 1 = a kitten), `variant` (0-1) picks how long and how high this meow is.
 */
export function playMeow(c: BaseAudioContext, out: AudioNode, t: number, pitch = 1, variant = 0.5, level = 0.5) {
  const short = variant < 0.3; // a quick "mew"
  const dur = short ? 0.3 + variant * 0.3 : 0.62 + variant * 0.4;
  const f0 = 400 * pitch * (0.9 + variant * 0.22);

  // the voice: its pitch rises quickly, hangs, then sinks
  const voice = c.createOscillator();
  voice.type = 'sawtooth';
  const fr = voice.frequency;
  if (short) {
    fr.setValueAtTime(f0 * 0.95, t);
    fr.linearRampToValueAtTime(f0 * 1.5, t + dur * 0.45);
    fr.exponentialRampToValueAtTime(f0 * 1.2, t + dur);
  } else {
    fr.setValueAtTime(f0 * 0.8, t);
    fr.linearRampToValueAtTime(f0 * 1.5, t + dur * 0.28);
    fr.linearRampToValueAtTime(f0 * 1.3, t + dur * 0.5);
    fr.exponentialRampToValueAtTime(f0 * 0.6, t + dur);
  }
  // vibrato on the held part
  const lfo = c.createOscillator();
  lfo.frequency.value = 5.8 + variant * 1.6;
  const depth = c.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(f0 * 0.028, t + dur * 0.5);
  lfo.connect(depth).connect(fr);

  // the mouth: two formants sweeping from "ee" to "ow"
  const formant = (q: number, points: [number, number][], gain: number) => {
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(points[0][1], t + points[0][0] * dur);
    for (const [at, hz] of points.slice(1)) f.frequency.linearRampToValueAtTime(hz, t + at * dur);
    const g = c.createGain();
    g.gain.value = gain;
    voice.connect(f).connect(g);
    return g;
  };
  const sum = c.createGain();
  if (short) {
    formant(5, [[0, 420], [0.5, 760], [1, 620]], 1).connect(sum);
    formant(7, [[0, 2500], [0.5, 1900], [1, 1700]], 0.75).connect(sum);
  } else {
    formant(5, [[0, 380], [0.3, 560], [0.6, 880], [1, 520]], 1).connect(sum);
    formant(7, [[0, 2650], [0.3, 2150], [0.6, 1250], [1, 950]], 0.75).connect(sum);
  }
  formant(3, [[0, 3300], [1, 3000]], 0.16).connect(sum);

  // breath: a puff of filtered noise at the start and as the voice fades
  const len = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const air = c.createBufferSource();
  air.buffer = buf;
  const airF = c.createBiquadFilter();
  airF.type = 'bandpass';
  airF.frequency.value = 2800;
  airF.Q.value = 0.9;
  const airG = c.createGain();
  airG.gain.setValueAtTime(0.0001, t);
  airG.gain.linearRampToValueAtTime(0.11, t + 0.03);
  airG.gain.exponentialRampToValueAtTime(0.012, t + dur * 0.3);
  airG.gain.linearRampToValueAtTime(0.05, t + dur * 0.85);
  airG.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  air.connect(airF).connect(airG).connect(sum);

  // loudness: a soft start, a swell, a long fade
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(level, t + 0.05);
  env.gain.linearRampToValueAtTime(level * 0.9, t + dur * 0.5);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  sum.connect(env).connect(out);

  for (const n of [voice, lfo, air]) {
    n.start(t);
    n.stop(t + dur + 0.05);
  }
}
