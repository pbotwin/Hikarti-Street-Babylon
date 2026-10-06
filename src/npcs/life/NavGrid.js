import { L } from '../../world/Layout.js';
import { surfaceAt } from '../../world/Surfaces.js';

const CELL = 0.5;
const BLOCK = 0, WALK = 1, ROAD = 2, CROSS = 3, GRASS = 4;
// Step costs per kind: pavements and paths are cheap, lawns a little more,
// roads expensive except on crossings, so routes keep to the sidewalks and
// cross at zebras unless the detour is long.
const COST = [Infinity, 1, 3.2, 1.1, 1.5];
// Riding a bike: keep to the road, pavements only to get on / off.
const RIDE = [Infinity, 2.2, 1, 1, 4];

/**
 * Walkability grid over the whole town (0.5 m cells), built from the real
 * collision world in small time slices so loading never stalls. A* with an
 * octile heuristic, then the path is shortened with grid line-of-sight.
 */
export class NavGrid {
  constructor(collision) {
    this.collision = collision;
    this.x0 = -132; this.z0 = (L.playMinZ ?? -45) - 8;
    this.x1 = 132; this.z1 = (L.playMaxZ ?? 360) + 4;
    this.w = Math.ceil((this.x1 - this.x0) / CELL);
    this.h = Math.ceil((this.z1 - this.z0) / CELL);
    this.kind = new Uint8Array(this.w * this.h);
    this.y = new Float32Array(this.w * this.h);
    this.ready = false;
    this._row = 0;
    this._tmp = [];
    // A* scratch (reused).
    const n = this.w * this.h;
    this.g = new Float32Array(n);
    this.from = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.stamp = 0;
    this.heap = new MinHeap();
  }

  /** Build some rows; returns true when done. Call every frame until ready. */
  buildSlice(budgetMs = 4) {
    const t0 = performance.now();
    const col = this.collision;
    const crossZ = [...(L.crosswalks || []), 70, 88, 106, 132];
    while (this._row < this.h && performance.now() - t0 < budgetMs) {
      const r = this._row++;
      const z = this.z0 + (r + 0.5) * CELL;
      for (let c = 0; c < this.w; c++) {
        const x = this.x0 + (c + 0.5) * CELL;
        const i = r * this.w + c;
        // Floors only (pavement, kerbs, decks ≤ 0.45 m): seats and tables stay obstacles.
        const gy = col.groundHeight(x, z, 0.22, 0.2, 0.25);
        this.y[i] = gy;
        // Blocked by anything solid between ankle and head height.
        // Margin wider than half a cell: walkers (radius 0.22) never brush corners.
        const m = 0.34;
        const list = col._query(x - m, z - m, x + m, z + m, this._tmp);
        let blocked = false;
        for (const b of list) {
          if (b.maxY <= gy + 0.36 || b.minY >= gy + 1.7) continue;
          if (x + m > b.minX && x - m < b.maxX && z + m > b.minZ && z - m < b.maxZ) { blocked = true; break; }
        }
        if (blocked) { this.kind[i] = BLOCK; continue; }
        const surf = surfaceAt(x, z);
        if (surf === 'asphalt') {
          const onZebra = Math.abs(x) < L.roadHalf + 0.5 && crossZ.some((cz) => Math.abs(z - cz) < 2.0);
          this.kind[i] = onZebra ? CROSS : ROAD;
        } else this.kind[i] = surf === 'grass' || surf === 'sand' ? GRASS : WALK;
      }
    }
    if (this._row >= this.h) this.ready = true;
    return this.ready;
  }

  cell(x, z) {
    const c = Math.floor((x - this.x0) / CELL), r = Math.floor((z - this.z0) / CELL);
    if (c < 0 || r < 0 || c >= this.w || r >= this.h) return -1;
    return r * this.w + c;
  }

  kindAt(x, z) { const i = this.cell(x, z); return i < 0 ? BLOCK : this.kind[i]; }
  isRoad(x, z) { const k = this.kindAt(x, z); return k === ROAD || k === CROSS; }
  walkable(x, z) { return this.kindAt(x, z) !== BLOCK; }

  /** Nearest walkable cell centre to (x, z) within r metres. */
  nearestWalkable(x, z, r = 3) {
    const i0 = this.cell(x, z);
    if (i0 >= 0 && this.kind[i0] !== BLOCK) return { x, z };
    const n = Math.ceil(r / CELL);
    for (let d = 1; d <= n; d++) {
      for (let dz = -d; dz <= d; dz++) {
        for (let dx = -d; dx <= d; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue;
          const xx = x + dx * CELL, zz = z + dz * CELL;
          if (this.walkable(xx, zz)) return { x: xx, z: zz };
        }
      }
    }
    return null;
  }

  /**
   * A* from (ax, az) to (bx, bz). Returns [{x, z, road}] waypoints (smoothed)
   * or null. maxNodes bounds the search (long trips across town are fine).
   */
  path(ax, az, bx, bz, maxNodes = 90000, vehicles = null, ride = false) {
    const cost = ride ? RIDE : COST;
    if (!this.ready) return null;
    // Vehicles (parked or moving) are obstacles for this search.
    const dyn = this._dyn || (this._dyn = new Uint32Array(this.w * this.h));
    const dstamp = (this._dstamp = (this._dstamp || 0) + 1);
    for (const v of vehicles || []) {
      const c = Math.cos(v.yaw), s = Math.sin(v.yaw), hx = (v.dims?.w || 1.6) / 2 + 0.3, hz = (v.dims?.len || 3) / 2 + 0.3;
      for (let a = -hx; a <= hx; a += CELL * 0.7) for (let b = -hz; b <= hz; b += CELL * 0.7) {
        const i = this.cell(v.x + a * c + b * s, v.z - a * s + b * c);
        if (i >= 0) dyn[i] = dstamp;
      }
    }
    const s = this.nearestWalkable(ax, az, 2), e = this.nearestWalkable(bx, bz, 2.5);
    if (!s || !e) return null;
    const start = this.cell(s.x, s.z), goal = this.cell(e.x, e.z);
    if (start < 0 || goal < 0) return null;
    const W = this.w, stamp = ++this.stamp;
    const gx = goal % W, gz = (goal / W) | 0;
    const hfn = (i) => {
      const dx = Math.abs((i % W) - gx), dz = Math.abs(((i / W) | 0) - gz);
      return (dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz));
    };
    const heap = this.heap; heap.clear();
    this.g[start] = 0; this.from[start] = -1; this.seen[start] = stamp;
    heap.push(start, hfn(start));
    let expanded = 0, found = false;
    const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    const closed = this._closed || (this._closed = new Uint32Array(W * this.h));
    while (heap.size) {
      const cur = heap.pop();
      if (closed[cur] === stamp) continue;
      closed[cur] = stamp;
      // Close enough (goals inside furniture are approached, then stepped onto).
      if (cur === goal || hfn(cur) < 2.1) { found = true; this._end = cur; break; }
      if (++expanded > maxNodes) break;
      const cx = cur % W, cz = (cur / W) | 0;
      for (const [dx, dz, len] of D) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= this.h) continue;
        const ni = nz * W + nx;
        const k = this.kind[ni];
        if (k === BLOCK || (dyn[ni] === dstamp && ni !== goal)) continue;
        // No cutting corners past blocked cells.
        if (dx && dz && (this.kind[cz * W + nx] === BLOCK || this.kind[nz * W + cx] === BLOCK)) continue;
        // Kerb steps over 0.35 m are walls.
        if (Math.abs(this.y[ni] - this.y[cur]) > 0.35) continue;
        const ng = this.g[cur] + len * cost[k];
        if (this.seen[ni] === stamp && ng >= this.g[ni]) continue;
        this.seen[ni] = stamp; this.g[ni] = ng; this.from[ni] = cur;
        heap.push(ni, ng + hfn(ni) * 1.25);
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = this._end; i !== -1; i = this.from[i]) cells.push(i);
    cells.reverse();
    // Smooth: keep a waypoint only where line of sight (on equal-kind cells) breaks.
    const pts = [];
    const P = (i) => ({ x: this.x0 + ((i % W) + 0.5) * CELL, z: this.z0 + (((i / W) | 0) + 0.5) * CELL, road: this.kind[i] === ROAD || this.kind[i] === CROSS });
    let anchor = 0;
    pts.push(P(cells[0]));
    for (let i = 2; i < cells.length; i++) {
      if (!this._los(cells[anchor], cells[i])) {
        pts.push(P(cells[i - 1]));
        anchor = i - 1;
      }
    }
    pts.push({ x: bx, z: bz, road: this.isRoad(bx, bz) });
    // Split road segments so the walker knows where the kerb is.
    return pts;
  }

  /** Grid line of sight that also refuses to change between road and pavement mid-line. */
  _los(a, b) {
    const W = this.w;
    let x0 = a % W, z0 = (a / W) | 0;
    const x1 = b % W, z1 = (b / W) | 0;
    const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0), sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;
    const road0 = this.kind[a] === ROAD;
    for (;;) {
      const i = z0 * W + x0;
      const k = this.kind[i];
      if (k === BLOCK || (k === ROAD) !== road0) return false;
      if (x0 === x1 && z0 === z1) return true;
      const e2 = 2 * err;
      if (e2 > -dz) { err -= dz; x0 += sx; }
      if (e2 < dx) { err += dx; z0 += sz; }
    }
  }
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  clear() { this.k.length = 0; this.p.length = 0; }
  push(key, pri) {
    const k = this.k, p = this.p;
    let i = k.length; k.push(key); p.push(pri);
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (p[j] <= pri) break;
      k[i] = k[j]; p[i] = p[j]; i = j;
    }
    k[i] = key; p[i] = pri;
  }
  pop() {
    const k = this.k, p = this.p, top = k[0];
    const lk = k.pop(), lp = p.pop();
    if (k.length) {
      let i = 0;
      const n = k.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && p[c + 1] < p[c]) c++;
        if (p[c] >= lp) break;
        k[i] = k[c]; p[i] = p[c]; i = c;
      }
      k[i] = lk; p[i] = lp;
    }
    return top;
  }
}
