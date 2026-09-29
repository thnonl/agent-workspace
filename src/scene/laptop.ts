import * as THREE from 'three';
import { G, M, MB, group, mesh } from './kit';
import { bakeGroup } from './bake';

export interface LaptopRig {
  root: THREE.Group;
  lid: THREE.Group;
  logo: THREE.Mesh;
  lines: THREE.Mesh[];
  sparks: THREE.Mesh[];
}

/** A closed laptop lies flat, hinge at +z. `lid.rotation.x` = opening angle (0 closed → ~1.85 open). */
export function buildLaptop(accent: string, accent2: string): LaptopRig {
  const root = group();
  const body = M('#eef1f8', { rough: 0.45, metal: 0.15 });
  root.add(mesh(G.rbox(0.4, 0.026, 0.28, 0.012), body, 0, 0.013, 0));
  root.add(mesh(G.rbox(0.34, 0.006, 0.12, 0.003), M('#2b3042', { rough: 0.6 }), 0, 0.028, -0.03, { cast: false }));
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) root.add(mesh(G.box(0.03, 0.006, 0.026), M('#464d66', { rough: 0.5 }), -0.1225 + c * 0.035, 0.033, -0.065 + r * 0.035, { cast: false }));
  }
  root.add(mesh(G.rbox(0.11, 0.004, 0.06, 0.002), M('#d6dbe8'), 0, 0.028, 0.075, { cast: false }));

  const lid = group(0, 0.03, 0.14);
  lid.add(mesh(G.rbox(0.4, 0.02, 0.28, 0.01), body, 0, 0.0, -0.14));
  // outer face (visible from the front while typing): glowing logo
  const logo = mesh(G.circle(0.045, 24), MB(accent), 0, 0.0105, -0.14, { r: [-Math.PI / 2, 0, 0], cast: false });
  lid.add(logo);
  lid.add(mesh(G.circle(0.06, 24), MB('#ffffff', 0.35), 0, 0.0103, -0.14, { r: [-Math.PI / 2, 0, 0], cast: false }));
  // inner face: screen with code lines
  lid.add(mesh(G.plane(0.36, 0.24), MB('#1d2134'), 0, -0.0105, -0.14, { r: [Math.PI / 2, 0, 0], cast: false }));
  const lines: THREE.Mesh[] = [];
  const cols = [accent, accent2, '#ffffff', accent2, accent];
  for (let i = 0; i < 5; i++) {
    const l = mesh(G.plane(0.2, 0.014), MB(cols[i], 0.9), -0.12, -0.0112, -0.14 + 0.085 - i * 0.036, { r: [Math.PI / 2, 0, 0], cast: false });
    l.geometry = G.plane(1, 0.014);
    lines.push(l);
    lid.add(l);
  }
  root.add(lid);

  const sparks: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const s = mesh(G.box(0.03, 0.03, 0.006), MB(i % 2 ? accent : accent2), 0, 0.3, 0.1, { cast: false });
    s.visible = false;
    sparks.push(s);
    root.add(s);
  }
  bakeGroup(lid, new Set<THREE.Object3D>([logo, ...lines]));
  bakeGroup(root, new Set<THREE.Object3D>([lid, ...sparks]));
  return { root, lid, logo, lines, sparks };
}
