// Post-build step: writes .br and .gz next to every compressible file in dist/ so the static server can send them as they are.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const compressible = new Set(['.html', '.js', '.css', '.svg', '.json', '.ico', '.txt', '.map']);
const MIN_BYTES = 1024;

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, e.name);
    if (e.isDirectory()) walk(file);
    else if (compressible.has(path.extname(file))) pack(file);
  }
}

function pack(file) {
  const src = fs.readFileSync(file);
  if (src.length < MIN_BYTES) return;
  const br = zlib.brotliCompressSync(src, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: src.length } });
  const gz = zlib.gzipSync(src, { level: 9 });
  if (br.length < src.length) fs.writeFileSync(`${file}.br`, br);
  if (gz.length < src.length) fs.writeFileSync(`${file}.gz`, gz);
}

if (fs.existsSync(root)) walk(root);
