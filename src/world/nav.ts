export const CELL = 0.25;

export interface V2 {
  x: number;
  z: number;
}

/** Axis-aligned rectangle given by its centre and full size. */
export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

/**
 * Occupancy grid over the room floor (room-local coordinates, origin at the centre)
 * with an A* path finder + line-of-sight smoothing.
 */
export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private blocked: Uint8Array;

  constructor(readonly width: number, readonly depth: number) {
    this.cols = Math.ceil(width / CELL);
    this.rows = Math.ceil(depth / CELL);
    this.blocked = new Uint8Array(this.cols * this.rows);
  }

  private ix(x: number) {
    return Math.floor((x + this.width / 2) / CELL);
  }
  private iz(z: number) {
    return Math.floor((z + this.depth / 2) / CELL);
  }
  private cx(ix: number) {
    return -this.width / 2 + (ix + 0.5) * CELL;
  }
  private cz(iz: number) {
    return -this.depth / 2 + (iz + 0.5) * CELL;
  }
  private inside(ix: number, iz: number) {
    return ix >= 0 && iz >= 0 && ix < this.cols && iz < this.rows;
  }

  isBlocked(x: number, z: number): boolean {
    const ix = this.ix(x);
    const iz = this.iz(z);
    return !this.inside(ix, iz) || this.blocked[iz * this.cols + ix] === 1;
  }

  /** Block every cell whose centre lies inside the rectangle grown by `pad`. */
  blockRect(r: Rect, pad = 0) {
    const x0 = r.x - r.w / 2 - pad;
    const x1 = r.x + r.w / 2 + pad;
    const z0 = r.z - r.d / 2 - pad;
    const z1 = r.z + r.d / 2 + pad;
    for (let iz = Math.max(0, this.iz(z0)); iz <= Math.min(this.rows - 1, this.iz(z1)); iz++) {
      for (let ix = Math.max(0, this.ix(x0)); ix <= Math.min(this.cols - 1, this.ix(x1)); ix++) {
        const cx = this.cx(ix);
        const cz = this.cz(iz);
        if (cx >= x0 && cx <= x1 && cz >= z0 && cz <= z1) this.blocked[iz * this.cols + ix] = 1;
      }
    }
  }

  /**
   * Block a rectangle rotated by `rot` (local +z = (sin rot, cos rot)), grown by `pad`.
   * `oz` shifts the rectangle along its own z axis.
   */
  blockOriented(x: number, z: number, w: number, d: number, rot: number, pad = 0, oz = 0) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const cx = x + oz * s;
    const cz = z + oz * c;
    const hw = w / 2 + pad;
    const hd = d / 2 + pad;
    const ext = Math.abs(hw * c) + Math.abs(hd * s);
    const extZ = Math.abs(hw * s) + Math.abs(hd * c);
    for (let iz = Math.max(0, this.iz(cz - extZ)); iz <= Math.min(this.rows - 1, this.iz(cz + extZ)); iz++) {
      for (let ix = Math.max(0, this.ix(cx - ext)); ix <= Math.min(this.cols - 1, this.ix(cx + ext)); ix++) {
        const dx = this.cx(ix) - cx;
        const dz = this.cz(iz) - cz;
        const lx = dx * c - dz * s;
        const lz = dx * s + dz * c;
        if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) this.blocked[iz * this.cols + ix] = 1;
      }
    }
  }

  /** Border cells (walls) are never walkable. */
  blockBorder(thickness = 0.3) {
    this.blockRect({ x: 0, z: -this.depth / 2 + thickness / 2, w: this.width, d: thickness }, 0);
    this.blockRect({ x: -this.width / 2 + thickness / 2, z: 0, w: thickness, d: this.depth }, 0);
    this.blockRect({ x: this.width / 2 - thickness / 2, z: 0, w: thickness, d: this.depth }, 0);
    this.blockRect({ x: 0, z: this.depth / 2 - thickness / 2, w: this.width, d: thickness }, 0);
  }

  private nearestFree(ix: number, iz: number): [number, number] | null {
    if (this.inside(ix, iz) && !this.blocked[iz * this.cols + ix]) return [ix, iz];
    for (let r = 1; r < 12; r++) {
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = ix + dx;
          const z = iz + dz;
          if (!this.inside(x, z) || this.blocked[z * this.cols + x]) continue;
          const d = dx * dx + dz * dz;
          if (d < bestD) {
            bestD = d;
            best = [x, z];
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  lineFree(a: V2, b: V2): boolean {
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(dist / (CELL * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (this.isBlocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  /** Returns waypoints (excluding `from`, ending exactly at `to`) or null when unreachable. */
  findPath(from: V2, to: V2): V2[] | null {
    const s = this.nearestFree(this.ix(from.x), this.iz(from.z));
    const g = this.nearestFree(this.ix(to.x), this.iz(to.z));
    if (!s || !g) return null;
    const { cols } = this;
    const N = this.cols * this.rows;
    const gScore = new Float32Array(N).fill(Infinity);
    const parent = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap: [number, number][] = []; // [f, idx]
    const push = (f: number, idx: number) => {
      heap.push([f, idx]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = (): number => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top[1];
    };
    const start = s[1] * cols + s[0];
    const goal = g[1] * cols + g[0];
    const h = (idx: number) => {
      const dx = Math.abs((idx % cols) - g[0]);
      const dz = Math.abs(Math.floor(idx / cols) - g[1]);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    gScore[start] = 0;
    push(h(start), start);
    let found = false;
    while (heap.length) {
      const cur = pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === goal) {
        found = true;
        break;
      }
      const cx = cur % cols;
      const cz = Math.floor(cur / cols);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (!this.inside(nx, nz)) continue;
          const ni = nz * cols + nx;
          if (this.blocked[ni] || closed[ni]) continue;
          if (dx && dz && (this.blocked[cz * cols + nx] || this.blocked[nz * cols + cx])) continue; // no corner cutting
          const ng = gScore[cur] + (dx && dz ? 1.414 : 1);
          if (ng < gScore[ni]) {
            gScore[ni] = ng;
            parent[ni] = cur;
            push(ng + h(ni), ni);
          }
        }
      }
    }
    if (!found) return null;
    const cells: V2[] = [];
    for (let i = goal; i !== -1; i = parent[i]) cells.push({ x: this.cx(i % cols), z: this.cz(Math.floor(i / cols)) });
    cells.reverse();
    cells[0] = { x: from.x, z: from.z };
    cells[cells.length - 1] = { x: to.x, z: to.z };
    // string pulling
    const out: V2[] = [];
    let i = 0;
    while (i < cells.length - 1) {
      let j = cells.length - 1;
      while (j > i + 1 && !this.lineFree(cells[i], cells[j])) j--;
      out.push(cells[j]);
      i = j;
    }
    return out;
  }
}
