import * as THREE from 'three';

/**
 * Shared soft sprites and materials of the cheap "fake light" effects: floor shadows, light pools, halos, dust, confetti.
 * All of them are plain unlit textures – no shadow map, no post-processing.
 */

let profileTex: THREE.CanvasTexture | null = null;
let blobTex: THREE.CanvasTexture | null = null;
let glowTex: THREE.CanvasTexture | null = null;
let dotTex: THREE.CanvasTexture | null = null;

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

function alphaCanvas(size: number, alphaAt: (x: number, y: number) => number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const a = alphaAt((i + 0.5) / size, (j + 0.5) / size);
      const k = (j * size + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = Math.round(255 * a);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Separable profile: 0 → 1 over u = 0..0.4, plateau 0.4..0.6, 1 → 0 over 0.6..1 (used by the nine-slice AO quads of RoomAO). */
export function profileTexture(): THREE.CanvasTexture {
  if (!profileTex) {
    const f = (u: number) => (u < 0.4 ? smooth(u / 0.4) : u > 0.6 ? smooth((1 - u) / 0.4) : 1);
    profileTex = alphaCanvas(64, (x, y) => f(x) * f(y));
    profileTex.wrapS = profileTex.wrapT = THREE.ClampToEdgeWrapping;
  }
  return profileTex;
}

/** Round, soft shadow blob (dark centre, feathered edge). */
export function blobTexture(): THREE.CanvasTexture {
  if (!blobTex) {
    blobTex = alphaCanvas(64, (x, y) => {
      const d = Math.hypot(x - 0.5, y - 0.5) * 2;
      return smooth(1 - d) ** 1.25;
    });
  }
  return blobTex;
}

/** Round glow with a hot core, for halos and light pools. */
export function glowTexture(): THREE.CanvasTexture {
  if (!glowTex) {
    glowTex = alphaCanvas(64, (x, y) => {
      const d = Math.hypot(x - 0.5, y - 0.5) * 2;
      return Math.min(1, smooth(1 - d) * 0.8 + Math.exp(-d * d * 14) * 0.5);
    });
  }
  return glowTex;
}

/** Small crisp dot (dust motes, sparkles, rain). */
export function dotTexture(): THREE.CanvasTexture {
  if (!dotTex) {
    dotTex = alphaCanvas(32, (x, y) => {
      const d = Math.hypot(x - 0.5, y - 0.5) * 2;
      return smooth((1 - d) * 2.2);
    });
  }
  return dotTex;
}

export const FX = {
  /** dark ambient-occlusion patches on the floor (rooms) */
  ao: new THREE.MeshBasicMaterial({ map: null, color: '#1c1330', transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  /** soft shadow under every person and cat */
  blob: new THREE.MeshBasicMaterial({ map: null, color: '#1c1330', transparent: true, opacity: 0.34, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  /** warm pool of light on the floor / desk under a lamp (opacity follows the room lights) */
  pool: new THREE.MeshBasicMaterial({ map: null, color: '#ffc77a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
};

/** glow around a bulb (points, additive, always on top so a lamp shade cannot hide it) */
export const HALO = new THREE.PointsMaterial({ size: 1.15, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, color: '#ffcf8a' });
/** dust motes drifting through the window light */
export const DUST = new THREE.PointsMaterial({ size: 0.075, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: '#fff3cf' });

let ready = false;
/** Textures are made on first use (needs the DOM, so not at import time). */
export function initFx() {
  if (ready) return;
  ready = true;
  FX.ao.map = profileTexture();
  FX.blob.map = blobTexture();
  FX.pool.map = glowTexture();
  HALO.map = glowTexture();
  DUST.map = dotTexture();
  FX.ao.needsUpdate = FX.blob.needsUpdate = FX.pool.needsUpdate = true;
}

/** One soft quad lying on the floor: unit plane in XY, to be rotated to the XZ plane by the caller. */
let blobGeo: THREE.PlaneGeometry | null = null;
export function blobGeometry(): THREE.PlaneGeometry {
  if (!blobGeo) {
    blobGeo = new THREE.PlaneGeometry(1, 1);
    blobGeo.rotateX(-Math.PI / 2);
  }
  return blobGeo;
}

if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __fx: FX });
