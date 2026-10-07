import { Color3, DynamicTexture, Matrix, Mesh, PBRMaterial, Quaternion, Texture, Vector3, VertexData } from '@babylonjs/core';

/**
 * Building blocks for Hikari Mall's scenery: the shared materials (a few
 * plain vertex-coloured finishes and the painted surfaces: floors, ceiling
 * tiles, asphalt, cladding) and `Batch`, which merges every box, quad and
 * shape added to it into one mesh per material. The whole mall is a few
 * dozen draw calls this way, and the plain finishes take their colour per
 * vertex, so a white shelf and a green sign band are one draw.
 */

/** A hex colour as a lit albedo wants it (linear). */
export const lin = (hex) => Color3.FromHexString(hex).toLinearSpace();
const WHITE = new Color3(1, 1, 1);
const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];

/** The mall's colours (linear), shared by the builders. */
export const C = Object.fromEntries(Object.entries({
  white: '#ffffff', snow: '#e6e4df', paint: '#dfdbd2', warm: '#d9d0c2', paintLine: '#e8e6df', navy: '#26324a', green: '#2f8f5b', pink: '#e27c9a', blush: '#f6dbe3',
  frame: '#3a3d42', steel: '#b9bec4', dark: '#24272c', black: '#141518', wood: '#b98552', oak: '#d6b58a', walnut: '#6b4a32',
  leaf: '#4f8a3c', soil: '#4a3a2c', yellow: '#f2c230', blue: '#2f6fb3', red: '#d2463c', grey: '#8d9096', concrete: '#b9b4ab',
  rubber: '#2a2b2e', shelf: '#dddad3', light: '#fff6e8', cold: '#e9f6ff',
  orange: '#e8892f', purple: '#5b3b8a', teal: '#2a9d8f', cream: '#f4ead8', stone: '#c9bfb1', charcoal: '#3b3f46',
  gold: '#c9a227', water: '#4f9fc4', maroon: '#7a2e2e', tinted: '#2c3a4a', sky: '#a9cde6',
}).map(([k, v]) => [k, lin(v)]));

export class MallMaterials {
  // Not frozen: a frozen material keeps the environment's light it was bound
  // with, and the mall swaps sky and store photo at the door.
  constructor(scene) {
    this.scene = scene;
    this.all = [];
    this.textures = [];
    // Plain finishes (colour per vertex).
    this.matte = this._pbr('mall:matte', { roughness: 0.85 });
    this.satin = this._pbr('mall:satin', { roughness: 0.45 });
    this.gloss = this._pbr('mall:gloss', { roughness: 0.2 });
    this.metal = this._pbr('mall:metal', { roughness: 0.38, metallic: 1 });
    this.chrome = this._pbr('mall:chrome', { roughness: 0.12, metallic: 1 });
    // Light panels, lamp heads, fridge light strips: unlit, bright enough to bloom.
    this.glow = this._pbr('mall:glow', { unlit: true });
    this.glass = this._pbr('mall:glass', { roughness: 0.04, metallic: 0.15, color: '#d7e8ef' });
    this.glass.alpha = 0.16;
    this.glass.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    // Reflections fade with the glass's opacity (Babylon keeps them full by default: misted panes).
    this.glass.useRadianceOverAlpha = this.glass.useSpecularOverAlpha = false;
    this.glass.environmentIntensity = 1.4;
    this.glass.backFaceCulling = false;
    // Curtains: seen from both sides.
    this.fabric = this._pbr('mall:fabric', { roughness: 0.9 });
    this.fabric.backFaceCulling = false;
    this.fabric.twoSidedLighting = true;
    this.mirror = this._pbr('mall:mirror', { roughness: 0.03, metallic: 1, color: '#e8ecef' });
    this.mirror.environmentIntensity = 1;

    // Painted surfaces: each texture covers `span` metres (uv are metres).
    this.hallFloor = this._painted('mall:hallFloor', paintTerrazzo, 2.4, { roughness: 0.2, aniso: 8 });
    this.marketFloor = this._painted('mall:marketFloor', paintVinyl, 2.4, { roughness: 0.32, aniso: 8 });
    this.woodFloor = this._painted('mall:woodFloor', paintPlanks, 2.4, { roughness: 0.42, aniso: 8 });
    this.ceiling = this._painted('mall:ceiling', paintCeiling, 2.4, { roughness: 0.9 });
    this.asphalt = this._painted('mall:asphalt', paintAsphalt, 4, { roughness: 0.92, aniso: 8 });
    this.paving = this._painted('mall:paving', paintPaving, 2.4, { roughness: 0.85, aniso: 8 });
    this.cladding = this._painted('mall:cladding', paintCladding, 6, { roughness: 0.6 });
    this.grass = this._painted('mall:grass', paintGrass, 3, { roughness: 1, aniso: 4 });
    this.wood = this._painted('mall:wood', paintPlanks, 1.2, { roughness: 0.55 });
    // Shelf-edge strips carry their own uv (one tile per 0.8 m along, the strip's height across).
    this.strip = this._painted('mall:priceStrip', paintPriceStrip, 1, { roughness: 0.5, height: 64 });
    for (const m of [this.hallFloor, this.marketFloor, this.woodFloor]) m.environmentIntensity = 1.1;
  }

  _pbr(name, { roughness = 0.6, metallic = 0, color = null, unlit = false }) {
    const m = new PBRMaterial(name, this.scene);
    m.albedoColor = color ? lin(color) : WHITE.clone();
    m.roughness = roughness;
    m.metallic = metallic;
    m.unlit = unlit;
    this.all.push(m);
    return m;
  }

  _painted(name, paint, span, { roughness, aniso = 4, height = 512 }) {
    const tex = new DynamicTexture(name, { width: 512, height }, this.scene, true, Texture.TRILINEAR_SAMPLINGMODE);
    paint(tex.getContext(), 512, height);
    tex.update();
    tex.wrapU = tex.wrapV = Texture.WRAP_ADDRESSMODE;
    tex.uScale = 1 / span;
    tex.vScale = 512 / height / span;
    tex.anisotropicFilteringLevel = aniso;
    this.textures.push(tex);
    const m = this._pbr(name, { roughness });
    m.albedoTexture = tex;
    return m;
  }

  dispose() {
    for (const m of this.all) m.dispose();
    for (const t of this.textures) t.dispose();
    this.all.length = this.textures.length = 0;
  }
}

// ---------------------------------------------------------------- batches
/**
 * Geometry merged per material. Positions are in the parent's frame; uv are
 * metres on each face's own plane unless given.
 */
export class Batch {
  constructor(scene, name) {
    this.scene = scene;
    this.name = name;
    this.groups = new Map();      // material -> arrays
  }

  _g(mat) {
    let g = this.groups.get(mat);
    if (!g) this.groups.set(mat, (g = { pos: [], nrm: [], uv: [], col: [], idx: [] }));
    return g;
  }

  /**
   * One quad from corner `o` along edges u and v (its front faces u × v),
   * uv metres (or the atlas rect [u0, v0, u1, v1] across it).
   */
  face(mat, color, o, u, v, rect = null) {
    const g = this._g(mat), b = g.pos.length / 3;
    const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    // Metre uv on the face's own plane, anchored in the world grid so neighbouring faces continue the pattern.
    const ax = Math.abs(nx) > Math.abs(ny) && Math.abs(nx) > Math.abs(nz) ? 0 : Math.abs(ny) > Math.abs(nz) ? 1 : 2;
    const pu = ax === 0 ? 2 : 0, pv = ax === 1 ? 2 : 1;
    for (const [a, c] of CORNERS) {
      const px = o[0] + u[0] * a + v[0] * c, py = o[1] + u[1] * a + v[1] * c, pz = o[2] + u[2] * a + v[2] * c;
      g.pos.push(px, py, pz);
      g.nrm.push(nx / l, ny / l, nz / l);
      if (rect) g.uv.push(rect[0] + (rect[2] - rect[0]) * a, rect[1] + (rect[3] - rect[1]) * c);
      else { const p = [px, py, pz]; g.uv.push(p[pu], p[pv]); }
      g.col.push(color.r, color.g, color.b, 1);
    }
    // Babylon's front face winds against u × v in this right-handed scene.
    g.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }

  /** One triangle a, b, c ([x, y, z]), its front facing (b − a) × (c − a); uv metres on its plane. */
  tri(mat, color, a, b, c) {
    const g = this._g(mat), i = g.pos.length / 3;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
    const flat = Math.abs(ny) > Math.max(Math.abs(nx), Math.abs(nz));
    for (const p of [a, b, c]) {
      g.pos.push(p[0], p[1], p[2]);
      g.nrm.push(nx / l, ny / l, nz / l);
      g.uv.push(flat ? p[0] : p[0] + p[2], flat ? p[2] : p[1]);
      g.col.push(color.r, color.g, color.b, 1);
    }
    g.idx.push(i, i + 2, i + 1);
  }

  /**
   * A sloped slab: its top runs along x from (xa, ya) to (xb, yb), t thick
   * (vertically), across z0..z1 — ramps, escalator trusses.
   */
  slope(mat, color, xa, ya, xb, yb, z0, z1, t) {
    const dx = xb - xa, dy = yb - ya, dz = z1 - z0;
    this.face(mat, color, [xa, ya, z0], [0, 0, dz], [dx, dy, 0]);
    this.face(mat, color, [xa, ya - t, z0], [dx, dy, 0], [0, 0, dz]);
    this.face(mat, color, [xa, ya - t, z0], [0, t, 0], [dx, dy, 0]);
    this.face(mat, color, [xa, ya - t, z1], [dx, dy, 0], [0, t, 0]);
    this.face(mat, color, [xa, ya - t, z0], [0, 0, dz], [0, t, 0]);
    this.face(mat, color, [xb, yb - t, z0], [0, t, 0], [0, 0, dz]);
  }

  /** Axis-aligned box between two corners (no bottom face when it stands on the floor). */
  box(mat, color, x0, y0, z0, x1, y1, z1) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    this.face(mat, color, [x1, y0, z0], [0, dy, 0], [0, 0, dz]);
    this.face(mat, color, [x0, y0, z0], [0, 0, dz], [0, dy, 0]);
    this.face(mat, color, [x0, y1, z0], [0, 0, dz], [dx, 0, 0]);
    if (y0 > 0.005) this.face(mat, color, [x0, y0, z0], [dx, 0, 0], [0, 0, dz]);
    this.face(mat, color, [x0, y0, z1], [dx, 0, 0], [0, dy, 0]);
    this.face(mat, color, [x0, y0, z0], [0, dy, 0], [dx, 0, 0]);
  }

  /** Box by centre and size. */
  cube(mat, color, cx, cy, cz, sx, sy, sz) {
    this.box(mat, color, cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2);
  }

  /** Horizontal rectangle facing up (or down). */
  flat(mat, color, x0, z0, x1, z1, y, down = false) {
    if (down) this.face(mat, color, [x0, y, z0], [x1 - x0, 0, 0], [0, 0, z1 - z0]);
    else this.face(mat, color, [x0, y, z0], [0, 0, z1 - z0], [x1 - x0, 0, 0]);
  }

  /**
   * Upright rectangle seen from `facing` (unit x, z): centre (cx, cz), width
   * w across, from y0 to y1; `rect` maps an atlas picture onto it.
   */
  panel(mat, color, cx, cz, facing, w, y0, y1, rect = null) {
    const rx = facing[1], rz = -facing[0];       // viewer's right (up × facing)
    this.face(mat, color, [cx - rx * w / 2, y0, cz - rz * w / 2], [rx * w, 0, rz * w], [0, y1 - y0, 0], rect);
  }

  /** Any vertex data (Babylon's builders), placed by `matrix`. */
  shape(mat, color, vd, matrix) {
    const g = this._g(mat), b = g.pos.length / 3;
    const p = new Vector3(), n = new Vector3();
    const P = vd.positions, N = vd.normals, U = vd.uvs;
    for (let i = 0; i < P.length / 3; i++) {
      Vector3.TransformCoordinatesFromFloatsToRef(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], matrix, p);
      Vector3.TransformNormalFromFloatsToRef(N[i * 3], N[i * 3 + 1], N[i * 3 + 2], matrix, n);
      n.normalize();
      g.pos.push(p.x, p.y, p.z);
      g.nrm.push(n.x, n.y, n.z);
      g.uv.push(U ? U[i * 2] : 0, U ? U[i * 2 + 1] : 0);
      g.col.push(color.r, color.g, color.b, 1);
    }
    for (const i of vd.indices) g.idx.push(b + i);
  }

  /** Upright cylinder standing at y0 (r at the bottom, rTop at the top). */
  cylinder(mat, color, x, y0, z, r, h, n = 12, rTop = r) {
    this.shape(mat, color, VertexData.CreateCylinder({ height: h, diameterTop: rTop * 2, diameterBottom: r * 2, tessellation: n }), Matrix.Translation(x, y0 + h / 2, z));
  }

  /** A round bar from a to b ([x, y, z]). */
  rod(mat, color, a, b, r, n = 8) {
    const d = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = d.length();
    const q = Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, d.normalize(), new Quaternion());
    const m = Matrix.Compose(Vector3.One(), q, new Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2));
    this.shape(mat, color, VertexData.CreateCylinder({ height: len, diameter: r * 2, tessellation: n }), m);
  }

  /** Ellipsoid (radius r, squashed / stretched by sy vertically). */
  sphere(mat, color, x, y, z, r, sy = 1, segments = 8) {
    this.shape(mat, color, VertexData.CreateSphere({ diameter: r * 2, segments }), Matrix.Scaling(1, sy, 1).multiply(Matrix.Translation(x, y, z)));
  }

  /** Box by centre and size, turned by yaw (and pitch: tipped forward about its own x). */
  turned(mat, color, cx, cy, cz, sx, sy, sz, yaw, pitch = 0) {
    const m = Matrix.RotationX(pitch).multiply(Matrix.RotationY(yaw)).multiply(Matrix.Translation(cx, cy, cz));
    this.shape(mat, color, VertexData.CreateBox({ width: sx, height: sy, depth: sz }), m);
  }

  /** The merged meshes, one per material, under `parent` (frozen in place). */
  build(parent) {
    const out = [];
    for (const [mat, g] of this.groups) {
      if (!g.idx.length) continue;
      const mesh = new Mesh(`${this.name}:${mat.name}`, this.scene);
      const vd = new VertexData();
      vd.positions = new Float32Array(g.pos);
      vd.normals = new Float32Array(g.nrm);
      vd.uvs = new Float32Array(g.uv);
      vd.colors = new Float32Array(g.col);
      vd.indices = g.pos.length / 3 > 65535 ? new Uint32Array(g.idx) : new Uint16Array(g.idx);
      vd.applyToMesh(mesh);
      mesh.material = mat;
      mesh.parent = parent;
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      mesh.computeWorldMatrix(true);
      mesh.freezeWorldMatrix();
      out.push(mesh);
    }
    this.groups.clear();
    return out;
  }
}

/**
 * The site under construction: batches per zone (merged separately, so a
 * zone off screen is culled as a whole), and collision boxes given in the
 * site frame, kept so they can be taken out again.
 */
export class SiteBuilder {
  constructor(scene, root, transform, collision) {
    Object.assign(this, { scene, root, T: transform, collision });
    this.zones = new Map();
    this.boxes = [];
  }

  /**
   * A zone's batches: `cast` goes to the shadow map (fixtures, furniture),
   * `still` doesn't (shell, floors, glass, lights, signs).
   */
  zone(name) {
    let z = this.zones.get(name);
    if (!z) this.zones.set(name, (z = { cast: new Batch(this.scene, `mall:${name}`), still: new Batch(this.scene, `mall:${name}~`) }));
    return z;
  }

  /** A collision box over a site-frame rectangle. */
  collide(x0, z0, x1, z1, y0, y1, opts) {
    const r = this.T.rect({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
    this.boxes.push(this.collision.addBox(r.x0, y0, r.z0, r.x1, y1, r.z1, opts));
  }

  /** Merge every zone: { meshes, casters }. */
  build() {
    const meshes = [], casters = [];
    for (const { cast, still } of this.zones.values()) {
      const c = cast.build(this.root);
      meshes.push(...c, ...still.build(this.root));
      casters.push(...c);
    }
    this.zones.clear();
    return { meshes, casters };
  }
}

/** A square planter with a leafy shrub. */
export function planter(b, M, x, z, r, h = 0.6) {
  b.box(M.satin, C.frame, x - r, 0, z - r, x + r, h, z + r);
  b.box(M.matte, C.soil, x - r + 0.06, h - 0.04, z - r + 0.06, x + r - 0.06, h - 0.02, z + r - 0.06);
  b.sphere(M.matte, C.leaf, x, h + r * 0.55, z, r * 0.85, 0.8, 10);
  b.sphere(M.matte, C.leaf, x + r * 0.3, h + r * 0.95, z - r * 0.2, r * 0.55, 0.9, 8);
}

// ---------------------------------------------------------------- painters
/** Deterministic noise for the painters. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const speckle = (g, w, h, n, colors, rMax, seed) => {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    g.globalAlpha = 0.25 + r() * 0.6;
    g.beginPath(); g.arc(r() * w, r() * h, 0.4 + r() * rMax, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
};
const grid = (g, w, h, step, color, width) => {
  g.fillStyle = color;
  for (let x = 0; x < w; x += step) g.fillRect(x, 0, width, h);
  for (let y = 0; y < h; y += step) g.fillRect(0, y, w, width);
};

/** Polished terrazzo, 1.2 m slabs (texture = 2.4 m). */
function paintTerrazzo(g, w, h) {
  g.fillStyle = '#d9d1c4'; g.fillRect(0, 0, w, h);
  const r = rng(11);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = `rgba(${200 + r() * 30},${190 + r() * 30},${175 + r() * 30},0.25)`;
    g.fillRect((i % 2) * w / 2, Math.floor(i / 2) * h / 2, w / 2, h / 2);
  }
  speckle(g, w, h, 2600, ['#8d8a86', '#b9a48f', '#5d5a58', '#c98c6c', '#f8f5ef'], 1.6, 3);
  grid(g, w, h, w / 2, 'rgba(120,110,100,0.45)', 2);
}

/** Supermarket vinyl tiles, 60 cm. */
function paintVinyl(g, w, h) {
  const r = rng(5), n = 4, s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const k = 218 + r() * 12;
    g.fillStyle = `rgb(${k},${k - 2},${k - 6})`;
    g.fillRect(i * s, j * s, s, s);
  }
  speckle(g, w, h, 1400, ['#cfc9bf', '#ffffff', '#b8b2a8'], 1.1, 9);
  grid(g, w, h, s, 'rgba(150,145,138,0.55)', 2);
}

/** Light oak planks (18 cm boards). */
function paintPlanks(g, w, h) {
  const r = rng(21), rows = 13, bh = h / rows;
  for (let j = 0; j < rows; j++) {
    let x = -r() * w * 0.5;
    while (x < w) {
      const len = w * (0.35 + r() * 0.5);
      const t = r();
      g.fillStyle = `rgb(${196 + t * 30},${158 + t * 26},${112 + t * 22})`;
      g.fillRect(x, j * bh, len, bh);
      g.strokeStyle = 'rgba(120,85,50,0.18)';
      g.lineWidth = 1;
      for (let k = 0; k < 6; k++) {
        const y = j * bh + r() * bh;
        g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 4, x + len * 0.7, y + (r() - 0.5) * 4, x + len, y); g.stroke();
      }
      g.fillStyle = 'rgba(90,60,35,0.5)';
      g.fillRect(x, j * bh, 1.5, bh);
      x += len;
    }
    g.fillStyle = 'rgba(90,60,35,0.45)';
    g.fillRect(0, j * bh, w, 1.5);
  }
}

/** Acoustic ceiling tiles in a light T-bar grid (60 cm). */
function paintCeiling(g, w, h) {
  g.fillStyle = '#e0dfdb'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 3000, ['#cbc9c4', '#ecebe7'], 0.8, 13);
  grid(g, w, h, w / 4, '#b8b6b1', 4);
}

function paintAsphalt(g, w, h) {
  g.fillStyle = '#55565b'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 9000, ['#3e3f43', '#6f7075', '#4a4b50', '#808188'], 1.3, 17);
  const r = rng(23);
  g.globalAlpha = 0.08;
  for (let i = 0; i < 40; i++) { g.fillStyle = r() < 0.5 ? '#2c2d30' : '#7a7b80'; g.beginPath(); g.arc(r() * w, r() * h, 10 + r() * 50, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
}

/** Concrete pavers, 60 × 60 cm, a few tones. */
function paintPaving(g, w, h) {
  const r = rng(29), n = 4, s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const k = 196 + r() * 22;
    g.fillStyle = `rgb(${k},${k - 4},${k - 10})`;
    g.fillRect(i * s, j * s, s, s);
  }
  speckle(g, w, h, 3000, ['#9d978c', '#e0dbd2', '#8a857c'], 1, 31);
  grid(g, w, h, s, 'rgba(95,90,82,0.6)', 3);
}

/** Facade panels: 1 m courses, 3 m panels, staggered. */
function paintCladding(g, w, h) {
  g.fillStyle = '#e7e2d9'; g.fillRect(0, 0, w, h);
  const course = h / 6, panel = w / 2;
  const r = rng(37);
  for (let j = 0; j < 6; j++) {
    for (let i = -1; i < 3; i++) {
      const x = i * panel + (j % 2) * panel / 2, t = r();
      g.fillStyle = `rgba(${215 + t * 20},${208 + t * 20},${196 + t * 20},0.6)`;
      g.fillRect(x, j * course, panel, course);
      g.fillStyle = 'rgba(110,100,90,0.55)';
      g.fillRect(x, j * course, 2, course);
    }
    g.fillStyle = 'rgba(110,100,90,0.6)';
    g.fillRect(0, j * course, w, 2);
  }
}

function paintGrass(g, w, h) {
  g.fillStyle = '#6f8f4e'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 12000, ['#5b7c3d', '#86a35d', '#4e6c34', '#9bb26c'], 1.5, 41);
}

/** Shelf-edge price strip: white rail with yellow tags. */
function paintPriceStrip(g, w, h) {
  g.fillStyle = '#f4f3ee'; g.fillRect(0, 0, w, h);
  const r = rng(43);
  for (let x = 6; x < w - 40; x += 64) {
    g.fillStyle = '#f6d24a'; g.fillRect(x, 10, 46, h - 20);
    g.fillStyle = '#222'; g.font = `700 ${h * 0.42}px sans-serif`; g.fillText(String(1 + Math.floor(r() * 9)), x + 6, h * 0.66);
    g.fillRect(x + 26, h * 0.35, 14, 2); g.fillRect(x + 26, h * 0.55, 10, 2);
  }
  g.fillStyle = '#c9c7c0'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
}
