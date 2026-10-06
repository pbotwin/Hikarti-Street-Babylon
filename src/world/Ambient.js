import {
  Mesh, VertexData, PBRMaterial, Color3, Color4, Matrix, Quaternion, DynamicTexture, SpriteManager, Sprite, Constants,
  CreatePlaneVertexData,
} from '@babylonjs/core';
import { L } from './Layout.js';
import { mulberry32 } from './rng.js';
import { animatedInstances, quatXYZ, writeTRS } from './Instances.js';

/**
 * Ambient life over the town (port of the original's Ambient.js). The petal
 * carpets and wildflowers are part of the exported city; what moves is here:
 *  - butterflies fluttering over the flower patches
 *  - bird flocks circling high over the streets
 *  - red aviation lights blinking on the skyscraper roofs
 *  - an animated LED screen on the east tower (city-pop station ident)
 * Butterflies and birds come from the same seeded random sequence as the
 * original (it first planted the petals and flowers), so they fly the same
 * routes over the same patches.
 */
const _q = new Quaternion();
const srgb = (hex) => Color3.FromHexString(hex).toLinearSpace();
const FLOOR_H = 3, GROUND_H = 3.6;   // Buildings.js storey heights

/** Skyscrapers (≥ 12 floors) of the original's backdrop, distant ones moved 260 m out. */
const TALL = [
  { x0: -6, x1: 6, z0: -74, z1: -60, floors: 12 },
  { x0: -78, x1: -66, z0: -6, z1: 8, floors: 14 },
  { x0: 44, x1: 56, z0: -50, z1: -38, floors: 14 },
  { x0: 52, x1: 64, z0: 10, z1: 24, floors: 16 },
  { x0: -64, x1: -52, z0: -62, z1: -50, floors: 15 },
  { x0: -48, x1: -30, z0: 150, z1: 168, floors: 22 },
  { x0: -26, x1: -12, z0: 175, z1: 190, floors: 30 },
  { x0: 10, x1: 26, z0: 160, z1: 176, floors: 26 },
  { x0: 30, x1: 48, z0: 145, z1: 160, floors: 18 },
  { x0: -8, x1: 6, z0: 205, z1: 220, floors: 36 },
  { x0: 52, x1: 66, z0: 185, z1: 200, floors: 32 },
  { x0: -70, x1: -54, z0: 190, z1: 206, floors: 28 },
].map((b) => ({ ...b, ...(b.z0 >= 145 ? { z0: b.z0 + 260, z1: b.z1 + 260 } : {}), top: GROUND_H + b.floors * FLOOR_H }));

/** Lawn areas for flowers and butterflies (y = ground height). */
export function defaultLawns(parkCenter) {
  const P = L.park, W = L.walkOuter, H = L.curbH;
  const pc = parkCenter;
  const lawns = [{
    x0: P.x0 + 1.5, x1: -W - 1.0, z0: P.z0 + 1.5, z1: P.z1 - 1.5, y: H, n: 240,
    avoid: (x, z) => { const d = Math.hypot(x - pc.x, z - pc.z); return d < 6.6 || (x > -W - 2.6 && Math.abs(z - pc.z) < 3.4); },
  }];
  for (const side of [-1, 1]) {
    lawns.push({
      x0: side < 0 ? -37 : 9.5, x1: side < 0 ? -9.5 : 37, z0: 109, z1: 137, y: H, n: 300,
      avoid: (x, z) => [111, 120, 132].some((c) => Math.abs(z - c) < 1.9) || [14, 32].some((c) => Math.abs(Math.abs(x) - c) < 1.7)
        || (side < 0 && x > -30 && x < -20 && z > 122 && z < 130),
    });
  }
  return lawns;
}

export class Ambient {
  /**
   * @param fallenPetalTrees cherry trees the original carpeted with petals
   *   (the exported city has them; their draws come first in the sequence)
   */
  constructor(scene, camera, { parkCenter, fallenPetalTrees }) {
    this.scene = scene;
    this.t = 0;
    this.rnd = mulberry32(31);
    for (let i = 0; i < fallenPetalTrees * 70 * 6; i++) this.rnd();   // 6 draws per fallen petal
    this.disposables = [];
    this._flowerSpots(defaultLawns(parkCenter));
    this._butterflies();
    this._birds();
    this._aviation(camera);
    this._screen();
  }

  // ------------------------------------------------------------ flower patches
  /** Where the original's wildflower drifts grew (draws exactly as its _flowers). */
  _flowerSpots(lawns) {
    const rnd = this.rnd;
    this.flowerSpots = [];
    for (const lawn of lawns) {
      let cx = 0, cz = 0;
      for (let k = 0; k < lawn.n; k++) {
        if (k % 12 === 0) {
          let tries = 0;
          do { cx = lawn.x0 + rnd() * (lawn.x1 - lawn.x0); cz = lawn.z0 + rnd() * (lawn.z1 - lawn.z0); }
          while (lawn.avoid?.(cx, cz) && tries++ < 20);
          this.flowerSpots.push([cx, lawn.y, cz]);
        }
        rnd(); rnd(); rnd(); rnd();   // position in the drift, turn, size
      }
    }
  }

  _unlit(name, color, alpha = 1) {
    const mat = new PBRMaterial(name, this.scene);
    mat.unlit = true;
    mat.albedoColor = srgb(color);
    mat.alpha = alpha;
    mat.backFaceCulling = false;
    mat.freeze();
    this.disposables.push(mat);
    return mat;
  }

  _mesh(name, vertexData, material) {
    const mesh = new Mesh(name, this.scene);
    vertexData.applyToMesh(mesh);
    mesh.material = material;
    this.disposables.push(mesh);
    return mesh;
  }

  // ------------------------------------------------------------ butterflies
  _butterflies() {
    const spots = this.flowerSpots;
    const n = Math.min(26, spots.length);
    // Two wings hinged on the body axis (X), flapping by instance rotation.
    const wing = CreatePlaneVertexData({ width: 0.06, height: 0.05 });
    wing.transform(Matrix.RotationX(-Math.PI / 2).multiply(Matrix.Translation(0.03, 0, 0)));
    const mirror = CreatePlaneVertexData({ width: 0.06, height: 0.05 });
    mirror.transform(Matrix.RotationX(-Math.PI / 2).multiply(Matrix.Translation(-0.03, 0, 0)));
    const mat = this._unlit('butterfly', '#ffffff', 0.95);
    this.bfL = this._mesh('butterflyL', wing, mat);
    this.bfR = this._mesh('butterflyR', mirror, mat);
    const cols = ['#ffffff', '#ffe066', '#ffb3c7', '#9fd8ff', '#ffd08a'];
    const colors = new Float32Array(n * 4);
    this.bf = [];
    for (let i = 0; i < n; i++) {
      const s = spots[(i * 7) % spots.length];
      this.bf.push({ hx: s[0], hy: s[1], hz: s[2], ph: this.rnd() * 10, sp: 0.5 + this.rnd() * 0.5, r: 0.8 + this.rnd() * 1.4 });
      const c = srgb(cols[i % cols.length]);
      colors.set([c.r, c.g, c.b, 1], i * 4);
    }
    this.bfMatL = animatedInstances(this.bfL, n, colors);
    this.bfMatR = animatedInstances(this.bfR, n, colors.slice());
  }

  // ------------------------------------------------------------ birds
  _birds() {
    // A bird: two thin wing triangles; flocks circle wide over the town.
    const g = new VertexData();
    g.positions = [0, 0, 0.1, 0.32, 0, -0.05, 0, 0, -0.08, 0, 0, 0.1, -0.32, 0, -0.05, 0, 0, -0.08];
    g.indices = [0, 1, 2, 3, 4, 5];
    this.birdMesh = this._mesh('birds', g, this._unlit('bird', '#2d2a33'));
    this.flocks = [];
    for (let f = 0; f < 3; f++) {
      const members = [];
      for (let k = 0; k < 7; k++) members.push({ dx: (k - 3) * 0.9, dz: -Math.abs(k - 3) * 0.8, dy: this.rnd() * 0.6, ph: this.rnd() * 6 });
      this.flocks.push({ cx: [0, -10, 12][f], cz: [-10, 40, 110][f], r: 35 + f * 12, h: 26 + f * 6, w: 0.08 + f * 0.02, a: f * 2, members });
    }
    this.birdMatrices = animatedInstances(this.birdMesh, 3 * 7);
  }

  // ------------------------------------------------------------ aviation lights
  _aviation(camera) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.15, 'rgba(255,60,50,1)'); r.addColorStop(1, 'rgba(255,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    this.av = new SpriteManager('aviationLights', c.toDataURL(), TALL.length * 4, 64, this.scene);
    this.av.blendMode = Constants.ALPHA_ADD;
    this.av.fogEnabled = false;
    this.av.isPickable = false;
    // The original's points were 2.2 "size units": that many pixels per
    // (half screen height / distance), i.e. 2.2·tan(fov/2) metres across.
    const size = 2.2 * Math.tan(camera.fov / 2);
    const red = srgb('#ff3a30');
    this.avSprites = [];
    for (const b of TALL) {
      const y = b.top + 0.7;
      for (const [x, z] of [[b.x0 + 0.4, b.z0 + 0.4], [b.x1 - 0.4, b.z0 + 0.4], [b.x0 + 0.4, b.z1 - 0.4], [b.x1 - 0.4, b.z1 - 0.4]]) {
        const s = new Sprite('aviation', this.av);
        s.position.set(x, y, z);
        s.size = size;
        s.color = new Color4(red.r, red.g, red.b, 1);
        this.avSprites.push(s);
      }
    }
    this.avOn = true;
  }

  // ------------------------------------------------------------ LED screen
  _screen() {
    // High on the east tower (x0 52, z 10..24), facing the street.
    const b = TALL.find((t) => t.x0 === 52 && t.z0 === 10);
    const tex = new DynamicTexture('ledScreen', { width: 256, height: 160 }, this.scene, true);
    // BACKSIDE: a plane facing +Z with u along +X, like three's PlaneGeometry
    // (Babylon's front side faces -Z, which mirrored the picture here).
    const mesh = this._mesh('ledScreen', CreatePlaneVertexData({ width: 10, height: 6.25, sideOrientation: Mesh.BACKSIDE }), null);
    const mat = new PBRMaterial('ledScreen', this.scene);
    mat.unlit = true;
    mat.albedoTexture = tex;
    mesh.material = mat;
    mesh.applyFog = false;
    mesh.isPickable = false;
    mesh.position.set(b.x0 - 0.35, b.top - 9, (b.z0 + b.z1) / 2);
    mesh.rotation.y = -Math.PI / 2;
    mesh.freezeWorldMatrix();
    mat.freeze();
    this.disposables.push(tex, mat);
    this.scr = { tex, g: tex.getContext(), w: 256, h: 160, t: 0 };
    this._drawScreen(0);
  }

  _drawScreen(t) {
    const { g, w: W, h: H } = this.scr;
    const scene = Math.floor(t / 6) % 3;
    const k = (t % 6) / 6;
    const grd = g.createLinearGradient(0, 0, W, H);
    const pals = [['#ff7eb3', '#7a5cff'], ['#43c6ff', '#ffd36e'], ['#ffb26b', '#ff5f8a']];
    grd.addColorStop(0, pals[scene][0]); grd.addColorStop(1, pals[scene][1]);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // Drifting sakura / sparkle motif.
    for (let i = 0; i < 14; i++) {
      const px = (i * 53 + t * 18 * (1 + (i % 3))) % (W + 20) - 10;
      const py = (i * 37 + t * 9) % (H + 20) - 10;
      g.fillStyle = PETAL_FILLS[i % 4];
      g.beginPath(); g.ellipse(px, py, 4, 2.5, t + i, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '800 30px "M PLUS Rounded 1c", sans-serif';
    const lines = SCREEN_LINES[scene];
    const slide = Math.min(1, k * 4) * (1 - Math.max(0, (k - 0.85) * 6.6));
    g.globalAlpha = slide;
    g.fillText(lines[0], W / 2, H * 0.42 + (1 - slide) * 20);
    g.font = '600 15px "M PLUS Rounded 1c", sans-serif';
    g.fillText(lines[1], W / 2, H * 0.68);
    g.globalAlpha = 1;
    // LED scanlines.
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let yy = 0; yy < H; yy += 3) g.fillRect(0, yy, W, 1);
    this.scr.tex.update();
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    // Butterflies: lazy figure-of-eight around their flower patch, wing flap.
    const left = this.bfMatL, right = this.bfMatR;
    for (let i = 0; i < this.bf.length; i++) {
      const b = this.bf[i];
      const u = t * b.sp + b.ph;
      const x = b.hx + Math.sin(u) * b.r, y = b.hy + 0.35 + Math.sin(u * 2.3) * 0.18 + 0.1, z = b.hz + Math.sin(u * 2) * b.r * 0.5;
      const yaw = Math.atan2(Math.cos(u) * b.r, Math.cos(u * 2) * b.r);
      const flap = Math.sin(t * 22 + b.ph * 5) * 1.1;
      writeTRS(left, i * 16, x, y, z, quatXYZ(0, yaw, flap, _q));
      writeTRS(right, i * 16, x, y, z, quatXYZ(0, yaw, -flap, _q));
    }
    this.bfL.thinInstanceBufferUpdated('matrix');
    this.bfR.thinInstanceBufferUpdated('matrix');
    // Birds: each flock circles; members keep a loose V and flap out of sync.
    let i = 0;
    for (let fi = 0; fi < this.flocks.length; fi++) {
      const f = this.flocks[fi];
      f.a += dt * f.w;
      const cx = f.cx + Math.cos(f.a) * f.r, cz = f.cz + Math.sin(f.a) * f.r;
      const yaw = Math.atan2(-Math.sin(f.a), Math.cos(f.a)) + Math.PI / 2;
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      quatXYZ(0, yaw, 0, _q);
      for (let k = 0; k < f.members.length; k++) {
        const b = f.members[k];
        const flap = Math.sin(t * 9 + b.ph) * 0.5;
        writeTRS(this.birdMatrices, i++ * 16, cx + b.dx * c + b.dz * sn, f.h + b.dy + Math.sin(t * 0.8 + b.ph) * 0.4, cz - b.dx * sn + b.dz * c, _q, 1, 1 + flap, 1);
      }
    }
    this.birdMesh.thinInstanceBufferUpdated('matrix');
    // Aviation lights: slow, synchronised blink (on 0.6 s every 1.5 s).
    const on = (t % 1.5) < 0.6;
    if (on !== this.avOn) {
      this.avOn = on;
      for (let k = 0; k < this.avSprites.length; k++) this.avSprites[k].color.a = on ? 1 : 0.08;
    }
    // LED screen at ~12 fps.
    this.scr.t += dt;
    if (this.scr.t > 0.08) { this.scr.t = 0; this._drawScreen(t); }
  }

  dispose() {
    this.av.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}

const PETAL_FILLS = [0, 1, 2, 3].map((k) => `rgba(255,255,255,${0.25 + k * 0.12})`);
const SCREEN_LINES = [['HIKARI FM 81.3', 'city pop all night'], ['ひかり 夏祭り', 'SUMMER FESTIVAL · SAT'], ['KOMOREBI MARKET', 'fresh · local · tasty']];
