/**
 * Routes on the mall's walk graph (`layout.nav`, see MALL.md) for the
 * shoppers and her scripted walks (MallWorld owns the one instance): A* between the graph nodes nearest the start and the goal that
 * can be reached in a straight line (a node just behind a shelf is near but
 * not reachable). The graph's links are what keeps shoppers and their carts
 * out of the shelves; the collision world only nudges them.
 *
 * Planning happens a few times per shopper per minute, never per frame, but
 * still reuses its work arrays: paths are written into the caller's own
 * point list.
 */
const EYE = 0.7;   // sight line height: above the floor trim, below the shelf tops

export class MallNav {
  constructor(nav, collision, floorY = 0) {
    this.collision = collision;
    this.y = floorY + EYE;
    this.nodes = nav?.nodes || [];
    const n = this.nodes.length;
    this.adj = Array.from({ length: n }, () => []);
    for (const [a, b] of nav?.links || []) {
      if (a >= n || b >= n) continue;
      this.adj[a].push(b);
      this.adj[b].push(a);
    }
    this.g = new Float64Array(n);
    this.f = new Float64Array(n);
    this.from = new Int32Array(n);
    this.state = new Uint8Array(n);   // 0 new, 1 open, 2 closed
    this.open = [];
  }

  get ready() { return this.nodes.length > 1; }

  /**
   * Nothing in the way on the straight line from (x0, z0) to (x1, z1), or
   * (`r`) on a band that wide either side of it.
   */
  clear(x0, z0, x1, z1, r = 0) {
    const dx = x1 - x0, dz = z1 - z0, d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const ux = dx / d, uz = dz / d, c = this.collision;
    if (c.raycast(x0, this.y, z0, ux, 0, uz, d) < d - 0.05) return false;
    if (!r) return true;
    return c.raycast(x0 + uz * r, this.y, z0 - ux * r, ux, 0, uz, d) >= d - 0.05
      && c.raycast(x0 - uz * r, this.y, z0 + ux * r, ux, 0, uz, d) >= d - 0.05;
  }

  /** The nearest node reachable in a straight line from (x, z) (-1: none of the closest few). */
  nearest(x, z) {
    const nodes = this.nodes, tried = this._tried || (this._tried = new Set());
    tried.clear();
    for (let attempt = 0; attempt < 6; attempt++) {
      let best = -1, bd = Infinity;
      for (let i = 0; i < nodes.length; i++) {
        if (tried.has(i)) continue;
        const d = (nodes[i][0] - x) ** 2 + (nodes[i][1] - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) return -1;
      if (this.clear(x, z, nodes[best][0], nodes[best][1])) return best;
      tried.add(best);
    }
    return -1;
  }

  /**
   * Route from (x0, z0) to (x1, z1) into `out`, a reused list of { x, z }
   * whose `count` is set to the route's length (the start itself is left
   * out, the goal is last). False when the graph doesn't connect them (the
   * route is then the goal alone).
   */
  path(x0, z0, x1, z1, out) {
    let n = 0, ok = true;
    if (this.ready && !this.clear(x0, z0, x1, z1)) {
      const a = this.nearest(x0, z0), b = a >= 0 ? this.nearest(x1, z1) : -1;
      ok = b >= 0 && this._search(a, b);
      if (ok) {
        for (let i = b; i !== -1; i = this.from[i]) n++;
        let k = n;
        for (let i = b; i !== -1; i = this.from[i]) setPoint(out, --k, this.nodes[i][0], this.nodes[i][1]);
        // Don't double back to a node behind the start, or past the goal.
        if (n > 1 && this.clear(x0, z0, out[1].x, out[1].z)) {
          for (let i = 1; i < n; i++) setPoint(out, i - 1, out[i].x, out[i].z);
          n--;
        }
        if (n > 1 && this.clear(out[n - 2].x, out[n - 2].z, x1, z1)) n--;
      }
    }
    setPoint(out, n++, x1, z1);
    out.count = n;
    return ok;
  }

  _search(a, b) {
    const { nodes, g, f, from, state, open, adj } = this;
    state.fill(0);
    open.length = 0;
    const h = (i) => Math.hypot(nodes[i][0] - nodes[b][0], nodes[i][1] - nodes[b][1]);
    g[a] = 0; f[a] = h(a); from[a] = -1; state[a] = 1; open.push(a);
    while (open.length) {
      // Few hundred nodes: a linear scan of the open list beats a heap's bookkeeping.
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === b) return true;
      state[cur] = 2;
      for (const nb of adj[cur]) {
        if (state[nb] === 2) continue;
        const cost = g[cur] + Math.hypot(nodes[nb][0] - nodes[cur][0], nodes[nb][1] - nodes[cur][1]);
        if (state[nb] === 1 && cost >= g[nb]) continue;
        g[nb] = cost; f[nb] = cost + h(nb); from[nb] = cur;
        if (state[nb] !== 1) { state[nb] = 1; open.push(nb); }
      }
    }
    return false;
  }
}

function setPoint(list, i, x, z) {
  const p = list[i] || (list[i] = { x: 0, z: 0 });
  p.x = x; p.z = z;
}
