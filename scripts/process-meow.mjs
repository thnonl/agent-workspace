// Turns the cat sounds you downloaded (assets-src/meow/*.mp3|wav|ogg|m4a|flac) into the small files the app plays
// (public/sfx/meow/meow-NN.mp3 + index.json + CREDITS.txt). Needs ffmpeg on the PATH.
//
//   node scripts/process-meow.mjs [inputDir] [outputDir]
//
// A download often holds several meows with pauses between them: every file is cut at its pauses and each single meow becomes a
// clip of its own (so a handful of downloads makes a dozen different sounds). Every clip is made mono at 22.05 kHz, freed from
// rumble and hiss, brought to the same loudness (peak-limited), faded in and out and encoded as ~36 kbps mp3 (a second is about
// 4.5 KB). The source files stay out of git (assets-src/ is ignored).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inDir = path.resolve(process.argv[2] ?? path.join(root, 'assets-src', 'meow'));
const outDir = path.resolve(process.argv[3] ?? path.join(root, 'public', 'sfx', 'meow'));
/** a meow longer than this is cut off (with a fade), shorter than MIN_S is not a meow but a click */
const MAX_S = 1.5;
const MIN_S = 0.22;
/** how many clips are kept in all, and at most from one download (the rest are skipped: variety over quantity) */
const MAX_CLIPS = 16;
const MAX_PER_FILE = 4;
/** a pause shorter than this does not split a meow; quieter than SILENCE_DB counts as a pause */
const PAUSE_S = 0.14;
const SILENCE_DB = -36;
/** the mean level every clip is brought to (dBFS); the peak never goes above PEAK_DB */
const TARGET_MEAN_DB = -21;
const PEAK_DB = -2;
const BITRATE = '36k';

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const ffmpeg = (args) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
/** ffmpeg's analysis filters print on stderr */
const probeLog = (file, filter) => String(spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', filter, '-f', 'null', '-'], { encoding: 'utf8' }).stderr ?? '');
const duration = (file) => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]).trim());

/** mean and peak level of a file in dBFS */
function levels(file) {
  const text = probeLog(file, 'volumedetect');
  const mean = /mean_volume:\s*(-?[\d.]+) dB/.exec(text);
  const max = /max_volume:\s*(-?[\d.]+) dB/.exec(text);
  return { mean: mean ? Number(mean[1]) : -20, max: max ? Number(max[1]) : -3 };
}

/** the stretches of sound between the pauses: [[start, end], ...] in seconds */
function sounds(file, total) {
  const text = probeLog(file, `silencedetect=noise=${SILENCE_DB}dB:d=${PAUSE_S}`);
  const quiet = [];
  let open = null;
  for (const line of text.split('\n')) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    const e = /silence_end:\s*(-?[\d.]+)/.exec(line);
    if (s) open = Math.max(0, Number(s[1]));
    if (e && open !== null) {
      quiet.push([open, Number(e[1])]);
      open = null;
    }
  }
  if (open !== null) quiet.push([open, total]);
  const out = [];
  let at = 0;
  for (const [a, b] of quiet) {
    if (a - at >= MIN_S) out.push([at, a]);
    at = Math.max(at, b);
  }
  if (total - at >= MIN_S) out.push([at, total]);
  return out;
}

if (!fs.existsSync(inDir)) {
  console.error(`No input folder: ${inDir}\nPut the downloaded cat sounds there and run this again.`);
  process.exit(1);
}
try {
  run('ffmpeg', ['-version']);
} catch {
  console.error('ffmpeg was not found on the PATH.');
  process.exit(1);
}
const inputs = fs
  .readdirSync(inDir)
  .filter((f) => /\.(mp3|wav|ogg|oga|m4a|flac|aac)$/i.test(f))
  .sort();
if (!inputs.length) {
  console.error(`No audio files in ${inDir}`);
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-meow-'));

// 1. every download -> mono 22.05 kHz, no rumble, no hiss -> its single meows
const candidates = [];
inputs.forEach((name, fi) => {
  const clean = path.join(tmp, `src${fi}.wav`);
  ffmpeg(['-i', path.join(inDir, name), '-ac', '1', '-ar', '22050', '-af', 'highpass=f=160,lowpass=f=9000', clean]);
  const total = duration(clean);
  const parts = sounds(clean, total);
  parts.slice(0, MAX_PER_FILE).forEach(([a, b], pi) => {
    const start = Math.max(0, a - 0.02);
    const len = Math.min(MAX_S, b - start + 0.06);
    const file = path.join(tmp, `cut${fi}-${pi}.wav`);
    ffmpeg(['-ss', start.toFixed(3), '-t', len.toFixed(3), '-i', clean, file]);
    candidates.push({ from: name, file, start, len, rank: pi * inputs.length + fi });
  });
});

// 2. keep the most varied ones: the first meow of every download, then the second of every download...
candidates.sort((x, y) => x.rank - y.rank);
const chosen = candidates.slice(0, MAX_CLIPS);

fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) if (/^meow-\d+\.mp3$/.test(f)) fs.rmSync(path.join(outDir, f));
const written = [];
let total = 0;
chosen.forEach((c, i) => {
  const n = String(i + 1).padStart(2, '0');
  const out = path.join(outDir, `meow-${n}.mp3`);
  const leveled = path.join(tmp, `lv${n}.wav`);
  // 3. the same loudness for every clip, the peaks kept in check, a short fade in and a longer fade out
  const { mean, max } = levels(c.file);
  const gain = Math.min(TARGET_MEAN_DB - mean, PEAK_DB - max);
  const d = duration(c.file);
  const fadeOut = Math.min(0.14, d / 3);
  ffmpeg(['-i', c.file, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.8:level=false,afade=t=in:d=0.008,afade=t=out:st=${Math.max(0, d - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`, leveled]);
  // 4. small mp3 (every browser decodes it)
  ffmpeg(['-i', leveled, '-ac', '1', '-ar', '22050', '-codec:a', 'libmp3lame', '-b:a', BITRATE, '-map_metadata', '-1', out]);
  const size = fs.statSync(out).size;
  total += size;
  written.push({ file: path.basename(out), from: c.from, at: c.start, seconds: d, size });
});

fs.writeFileSync(path.join(outDir, 'index.json'), `${JSON.stringify(written.map((w) => w.file))}\n`);
fs.writeFileSync(
  path.join(outDir, 'CREDITS.txt'),
  `Cat sounds (Pixabay Content License, https://pixabay.com/service/license-summary/), cut into single meows, filtered and re-encoded.\nOriginal files:\n${written.map((w) => `  ${w.file}  <-  ${w.from} (from ${w.at.toFixed(2)} s)`).join('\n')}\n`,
);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`${written.length} clips from ${inputs.length} files -> ${path.relative(root, outDir)}  (${candidates.length - written.length} more meows were left out)`);
for (const w of written) console.log(`  ${w.file}  ${w.seconds.toFixed(2)} s  ${(w.size / 1024).toFixed(1)} KB   <- ${w.from.slice(0, 48)} @ ${w.at.toFixed(2)}`);
console.log(`total ${(total / 1024).toFixed(1)} KB`);
