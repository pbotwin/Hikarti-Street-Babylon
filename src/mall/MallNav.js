/**
 * Routes on the mall's walk graph (`layout.nav`, see MALL.md) for the
 * shoppers and her scripted walks (MallWorld owns the one instance): A* between the graph nodes nearest the start and the goal that
 * can be reached in a straight line (a node just behind a shelf is near but
 * not reachable). The graph's links are what keeps shoppers and their carts
 * out of the shelves; the collision world only nudges them.
 *
 * Two floors: a node is [x, z, y] and only nodes on the floor at hand are
 * near a point (the gallery above the concourse is nearer to it in x and z
 * than most of the concourse). The floors meet at the escalators, links
 * that go one way (`rides`): a route point reached by one carries its
 * index (`ride`, else -1), so whoever follows the route rides it there.
 *
 * Planning happens a few times per shopper per minute, never per frame, but
 * still reuses its work arrays: paths are written into the caller's own
 * point list.
 */
const EYE = 0.7;   // sight line height above a floor: above the floor trim, below the shelf tops
const LEVEL = 1.5; // a node within this of a height is on that floor

export class MallNav {
  constructor(nav, collision, floorY = 0) {
    this.collision = collision;
    this.floorY = floorY;
    this.nodes = nav?.nodes || [];
    const n = this.nodes.length;
    // Neighbours and, alongside, the ride each link is (-1: walked).
    this.adj = Array.from({ length: n }, () => []);
    this.adjRide = Array.from({ length: n }, () => []);
    const link = (a, b, ride) => { this.adj[a].push(b); this.adjRide[a].push(ride); };
    for (const [a, b] of nav?.links || []) {
      if (a >= n || b >= n) continue;
      link(a, b, -1);
      link(b, a, -1);
    }
    for (const [a, b, i] of nav?.rides || []) if (a < n && b < n) link(a, b, i);
    this.g = new Float64Array(n);
    this.f = new Float64Array(n);
    this.from = new Int32Array(n);
    this.via = new Int32Array(n);
    this.state = new Uint8Array(n);   // 0 new, 1 open, 2 closed
    this.open = [];
  }

  get ready() { return this.nodes.length > 1; }

  /**
   * Nothing in the way on the straight line from (x0, z0) to (x1, z1) on the
   * floor at y, or (`r`) on a band that wide either side of it.
   */
  clear(x0, z0, x1, z1, r = 0, y = this.floorY) {
    const dx = x1 - x0, dz = z1 - z0, d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const ux = dx / d, uz = dz / d, c = this.collision, ey = y + EYE;
    if (c.raycast(x0, ey, z0, ux, 0, uz, d) < d - 0.05) return false;
    if (!r) return true;
    return c.raycast(x0 + uz * r, ey, z0 - ux * r, ux, 0, uz, d) >= d - 0.05
      && c.raycast(x0 - uz * r, ey, z0 + ux * r, ux, 0, uz, d) >= d - 0.05;
  }

  /** The nearest node on the floor at y reachable in a straight line from (x, z) (-1: none of the closest few). */
  nearest(x, z, y = this.floorY) {
    const nodes = this.nodes, tried = this._tried || (this._tried = new Set());
    tried.clear();
    for (let attempt = 0; attempt < 6; attempt++) {
      let best = -1, bd = Infinity;
      for (let i = 0; i < nodes.length; i++) {
        if (tried.has(i) || Math.abs((nodes[i][2] || 0) - y) > LEVEL) continue;
        const d = (nodes[i][0] - x) ** 2 + (nodes[i][1] - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) return -1;
      if (this.clear(x, z, nodes[best][0], nodes[best][1], 0, y)) return best;
      tried.add(best);
    }
    return -1;
  }

  /**
   * Route from (x0, z0) on the floor at y0 to (x1, z1) on the floor at y1
   * into `out`, a reused list of { x, z, ride } whose `count` is set to the
   * route's length (the start itself is left out, the goal is last). False
   * when the graph doesn't connect them (the route is then the goal alone).
   */
  path(x0, z0, x1, z1, out, y0 = this.floorY, y1 = y0) {
    let n = 0, ok = true;
    const same = Math.abs(y1 - y0) < LEVEL;
    if (this.ready && !(same && this.clear(x0, z0, x1, z1, 0, y0))) {
      const a = this.nearest(x0, z0, y0), b = a >= 0 ? this.nearest(x1, z1, y1) : -1;
      ok = b >= 0 && this._search(a, b);
      if (ok) {
        for (let i = b; i !== -1; i = this.from[i]) n++;
        let k = n;
        for (let i = b; i !== -1; i = this.from[i]) setPoint(out, --k, this.nodes[i][0], this.nodes[i][1], this.via[i]);
        // Don't double back to a node behind the start, or past the goal (never past a ride's ends).
        if (n > 1 && out[1].ride < 0 && this.clear(x0, z0, out[1].x, out[1].z, 0, y0)) {
          for (let i = 1; i < n; i++) setPoint(out, i - 1, out[i].x, out[i].z, out[i].ride);
          n--;
        }
        if (n > 1 && out[n - 1].ride < 0 && this.clear(out[n - 2].x, out[n - 2].z, x1, z1, 0, y1)) n--;
      }
    }
    setPoint(out, n++, x1, z1, -1);
    out.count = n;
    return ok;
  }

  _search(a, b) {
    const { nodes, g, f, from, via, state, open, adj, adjRide } = this;
    state.fill(0);
    open.length = 0;
    const h = (i) => Math.hypot(nodes[i][0] - nodes[b][0], nodes[i][1] - nodes[b][1]);
    g[a] = 0; f[a] = h(a); from[a] = -1; via[a] = -1; state[a] = 1; open.push(a);
    while (open.length) {
      // Few hundred nodes: a linear scan of the open list beats a heap's bookkeeping.
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === b) return true;
      state[cur] = 2;
      const list = adj[cur], rides = adjRide[cur];
      for (let k = 0; k < list.length; k++) {
        const nb = list[k];
        if (state[nb] === 2) continue;
        const cost = g[cur] + Math.hypot(nodes[nb][0] - nodes[cur][0], nodes[nb][1] - nodes[cur][1]);
        if (state[nb] === 1 && cost >= g[nb]) continue;
        g[nb] = cost; f[nb] = cost + h(nb); from[nb] = cur; via[nb] = rides[k];
        if (state[nb] !== 1) { state[nb] = 1; open.push(nb); }
      }
    }
    return false;
  }
}

function setPoint(list, i, x, z, ride) {
  const p = list[i] || (list[i] = { x: 0, z: 0, ride: -1 });
  p.x = x; p.z = z; p.ride = ride;
}
