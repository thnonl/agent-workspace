// Writes THIRD_PARTY_LICENSES.txt: the licence text of every npm package that ended up inside dist/.
// The list comes from a source map of a throw-away build, so it is exactly what is bundled.  Run: npm run licenses
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'licenses-'));

try {
  execFileSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', tmp, '--emptyOutDir', '--sourcemap'], {
    cwd: root,
    stdio: 'ignore',
  });

  /** package directory (…/node_modules/@scope/name) of every bundled source file */
  const dirs = new Set();
  const assets = path.join(tmp, 'assets');
  for (const f of fs.readdirSync(assets).filter((n) => n.endsWith('.map'))) {
    const map = JSON.parse(fs.readFileSync(path.join(assets, f), 'utf8'));
    for (const src of map.sources) {
      const abs = path.resolve(assets, src).split(path.sep).join('/');
      const at = abs.lastIndexOf('/node_modules/');
      if (at < 0) continue;
      const rest = abs.slice(at + '/node_modules/'.length).split('/');
      const n = rest[0].startsWith('@') ? 2 : 1;
      dirs.add(abs.slice(0, at) + '/node_modules/' + rest.slice(0, n).join('/'));
    }
  }

  const parts = [];
  for (const dir of [...dirs].sort()) {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const file = fs.readdirSync(dir).find((n) => /^(licen[sc]e|copying)(\.|$)/i.test(n));
    const text = file ? fs.readFileSync(path.join(dir, file), 'utf8').trim() : `(no licence file shipped; package.json says: ${pkg.license ?? 'unknown'})`;
    parts.push(`${'='.repeat(78)}\n${pkg.name}@${pkg.version} – ${pkg.license ?? 'see below'}\n${'='.repeat(78)}\n\n${text}\n`);
  }
  const head = 'This package bundles the following third-party software (see dist/). Their licence texts:\n\n';
  // the cat sounds are not an npm package: their credits are written by scripts/process-meow.mjs next to the files
  const credits = path.join(root, 'public', 'sfx', 'meow', 'CREDITS.txt');
  const sounds = fs.existsSync(credits) ? `\n${'='.repeat(78)}\nCat sounds (public/sfx/meow)\n${'='.repeat(78)}\n\n${fs.readFileSync(credits, 'utf8').trim()}\n` : '';
  fs.writeFileSync(path.join(root, 'THIRD_PARTY_LICENSES.txt'), head + parts.join('\n') + sounds);
  console.log(`${dirs.size} packages -> THIRD_PARTY_LICENSES.txt`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
