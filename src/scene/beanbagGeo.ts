import * as THREE from 'three';

/**
 * One soft bean bag as a single skin: a dome that slumps toward the front, a hollow where one sits and a high back that
 * rises behind it. The front of the bag is +z (the person sits facing +z), the floor is y 0.
 */
export interface BagShape {
  /** half width / half depth of the footprint */
  rx: number;
  rz: number;
  /** height of the plain dome in the middle */
  h: number;
  /** 0 = the same height all over, 1 = the back twice as high as the front is low */
  tilt: number;
  /** extra rise of the back, its depth, and the hollow of the seat (depth, z, width) */
  hump: number;
  dent: number;
  dentZ: number;
  dentW: number;
  /** footprint exponent: 2 = oval, 3+ = squarer */
  square: number;
}

export const BAG_SHAPES: BagShape[] = [
  // the plain slumped sack
  { rx: 0.47, rz: 0.47, h: 0.4, tilt: 0.75, hump: 0.28, dent: 0.15, dentZ: 0.04, dentW: 0.2, square: 2.2 },
  // pear shaped: narrow, with a tall back
  { rx: 0.4, rz: 0.475, h: 0.42, tilt: 0.85, hump: 0.31, dent: 0.15, dentZ: 0.02, dentW: 0.17, square: 2 },
  // a wide, squarish cushion
  { rx: 0.475, rz: 0.46, h: 0.37, tilt: 0.7, hump: 0.25, dent: 0.14, dentZ: 0.04, dentW: 0.23, square: 3.4 },
  // long lounger: lower, with a broad shallow seat
  { rx: 0.44, rz: 0.475, h: 0.36, tilt: 0.8, hump: 0.27, dent: 0.12, dentZ: 0.08, dentW: 0.21, square: 2.6 },
];

const smooth = (x: number) => x * x * (3 - 2 * x);

/** the height of the surface at (x, z) for a point `r` of the way from the middle to the edge (0..1) */
export function bagHeight(s: BagShape, x: number, z: number, r: number): number {
  const dome = s.h * Math.pow(Math.max(0, 1 - r * r), 0.55);
  const lean = Math.max(0.2, 1 - s.tilt * (z / s.rz));
  const back = s.hump * Math.exp(-(((z + 0.31) / 0.22) ** 2) - (x / (s.rx * 0.8)) ** 2) * (1 - r ** 4);
  const hollow = s.dent * Math.exp(-((x / s.dentW) ** 2) - (((z - s.dentZ) / (s.dentW * 1.25)) ** 2));
  const wrinkle = 0.014 * Math.sin(x * 7 + 2) * Math.sin(z * 6 - 1) * (1 - r * r);
  return Math.max(0, (dome + back) * lean - hollow + wrinkle * smooth(Math.min(1, r * 4)));
}

export function bagGeometry(model: number): THREE.BufferGeometry {
  const s = BAG_SHAPES[model % BAG_SHAPES.length];
  const M = 64;
  const N = 22;
  const pos: number[] = [0, bagHeight(s, 0, 0, 0), 0];
  for (let i = 1; i <= N; i++) {
    // (rings crowd toward the edge, where the skin turns down)
    const r = Math.sin((i / N) * (Math.PI / 2));
    for (let j = 0; j < M; j++) {
      const a = (j / M) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const k = Math.pow(Math.pow(Math.abs(c), s.square) + Math.pow(Math.abs(sn), s.square), -1 / s.square);
      const x = s.rx * k * c * r;
      const z = s.rz * k * sn * r;
      pos.push(x, bagHeight(s, x, z, r), z);
    }
  }
  const idx: number[] = [];
  const ring = (i: number, j: number) => 1 + (i - 1) * M + (j % M);
  for (let j = 0; j < M; j++) idx.push(0, ring(1, j + 1), ring(1, j));
  for (let i = 1; i < N; i++) {
    for (let j = 0; j < M; j++) {
      idx.push(ring(i, j), ring(i, j + 1), ring(i + 1, j));
      idx.push(ring(i, j + 1), ring(i + 1, j + 1), ring(i + 1, j));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // (a baked room merges geometries that all carry the same attributes: this one needs a uv like the stock shapes)
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // (the winding above must face up: flip it when the middle's normal points down)
  if (g.getAttribute('normal').getY(0) < 0) {
    const flipped = idx.slice();
    for (let t = 0; t < flipped.length; t += 3) [flipped[t + 1], flipped[t + 2]] = [flipped[t + 2], flipped[t + 1]];
    g.setIndex(flipped);
    g.computeVertexNormals();
  }
  return g;
}
