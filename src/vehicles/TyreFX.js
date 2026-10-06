import { Mesh, VertexData, VertexBuffer, ShaderMaterial, Constants, Vector3 } from '@babylonjs/core';
import { Particles } from '../gameplay/Particles.js';
import { surfaceAt, SURFACE } from '../world/Surfaces.js';

/**
 * Tyre effects for every vehicle, read-only on the vehicle state (vF, vL, r,
 * yaw, wheels…):
 *  - skid marks: dark rubber ribbons where a wheel slides (drift, hard braking,
 *    wheelspin) on hard ground
 *  - tyre tracks: faint ruts on soft ground (grass, sand, gravel, dirt) for
 *    every rolling wheel, so tracks show wherever the car has been
 *  - tyre smoke on hard ground while sliding / burning out, dust on soft ground
 *  - crash bursts (sparks + debris) on sudden deceleration, with an event the
 *    audio and camera can react to
 * All marks share one ring-buffer mesh (one draw call, hidden until the first
 * mark); old marks fade out and are recycled, so there is no allocation while
 * driving.
 */
const SEGS = 3000;           // ring buffer of mark quads
const LIFE = 40;             // seconds a mark stays before fading out

const VERT = /* glsl */ `
  precision highp float;
  attribute vec3 position; attribute vec4 color;
  uniform mat4 viewProjection;
  varying vec4 vColor;
  void main() { vColor = color; gl_Position = viewProjection * vec4(position, 1.0); }`;
const FRAG = /* glsl */ `
  precision highp float;
  varying vec4 vColor;
  void main() { gl_FragColor = vColor; }`;

export class TyreFX {
  constructor(scene, state) {
    this.state = state;
    this.smoke = new Particles(scene, 420, { additive: false });
    this.sparks = new Particles(scene, 160, { additive: true });
    this.bits = new Particles(scene, 120, { additive: false, hard: true });

    this.pos = new Float32Array(SEGS * 4 * 3);
    this.col = new Float32Array(SEGS * 4 * 4);
    const idx = new Uint32Array(SEGS * 6);
    for (let i = 0; i < SEGS; i++) {
      const v = i * 4;
      idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6);
    }
    const mesh = new Mesh('tyreMarks', scene);
    const vd = new VertexData();
    vd.indices = idx;
    vd.applyToMesh(mesh);
    mesh.setVerticesData(VertexBuffer.PositionKind, this.pos, true, 3);
    mesh.setVerticesData(VertexBuffer.ColorKind, this.col, true, 4);
    mesh.alwaysSelectAsActiveMesh = true;   // marks spread over the whole city: never culled
    mesh.isPickable = false;
    mesh.hasVertexAlpha = true;
    const mat = new ShaderMaterial('tyreMarks', scene, { vertexSource: VERT, fragmentSource: FRAG }, {
      attributes: ['position', 'color'], uniforms: ['viewProjection'], needAlphaBlending: true,
    });
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    mat.alphaMode = Constants.ALPHA_COMBINE;
    // Drawn just above the road it lies on (three's polygon offset -4).
    mat.zOffset = -4;
    mat.zOffsetUnits = -4;
    mesh.material = mat;
    mat.forceCompilation(mesh);
    mesh.setEnabled(false);
    this.mesh = mesh;
    this.posBuffer = mesh.getVertexBuffer(VertexBuffer.PositionKind);
    this.colBuffer = mesh.getVertexBuffer(VertexBuffer.ColorKind);
    this.dirty0 = SEGS; this.dirty1 = -1;    // segments written this frame
    this.colDirty = false;
    this.born = new Float32Array(SEGS).fill(-1e9);
    this.alpha0 = new Float32Array(SEGS);
    this.cursor = 0;
    this.t = 0;
    this.fadeT = 0;
    this.track = new Map();   // vehicle -> per-wheel last point
    this.lastSpeed = new Map();
    this.out = { skid: 0 };
    // Emit options, reused (Particles reads them on the spot).
    this._smoke = { life: 0, size: 0, color: null, drag: 1.6, gravity: 0.25 };
    this._fx = { life: 0, size: 0, color: null, drag: 0, gravity: 0 };
  }

  /** Per frame: vehicles = VehicleSystem.vehicles. Returns { skid } for audio. */
  update(dt, vehicles) {
    this.t += dt;
    let skidMax = 0;
    for (const v of vehicles) {
      const sp = Math.hypot(v.vF, v.vL);
      const prev = this.lastSpeed.get(v) ?? sp;
      this.lastSpeed.set(v, sp);
      // Crash: a big, sudden loss of speed (wall, car, pole).
      const dv = (prev - sp) / Math.max(dt, 1e-3);
      if (prev > 4 && dv > 28) this._crash(v, Math.min(1, (prev - sp) / 9));
      if (sp < 0.4) { this.track.delete(v); continue; }
      const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
      let tr = this.track.get(v);
      if (!tr) { tr = v.wheels.map(() => ({ on: false, x: 0, y: 0, z: 0 })); this.track.set(v, tr); }
      for (let i = 0; i < v.wheels.length; i++) {
        const w = v.wheels[i];
        // Wheel contact point (local x = width, z = length) in world space.
        const lx = w.cx, lz = w.cz;
        const x = v.x + c * lx + s * lz, z = v.z - s * lx + c * lz;
        const y = v.y + 0.012;
        // Per-axle tyre slip (0…1) from the physics.
        const slip = (w.front ? v.slipF : v.slipR) * 1.4;
        const surface = surfaceAt(x, z);
        const soft = !SURFACE[surface]?.hard || SURFACE[surface].hard < 0.8;
        skidMax = Math.max(skidMax, soft ? 0 : Math.min(1, slip));
        const mark = soft ? 0.18 + Math.min(0.25, slip * 0.3) : slip > 0.12 ? Math.min(0.75, 0.25 + slip * 0.6) : 0;
        const last = tr[i];
        if (mark > 0 && last.on) {
          const dx = x - last.x, dz = z - last.z;
          if (dx * dx + dz * dz > 0.09) {      // a segment every 30 cm
            this._segment(last.x, last.y, last.z, x, y, z, v.isBike ? 0.08 : 0.16, mark, soft ? surface : null);
            last.x = x; last.y = y; last.z = z;
          }
        } else {
          last.on = mark > 0;
          last.x = x; last.y = y; last.z = z;
        }
        // Smoke (hard ground) or dust (soft ground) while sliding.
        if (slip > 0.3 && Math.random() < Math.min(1, slip) * dt * 40) {
          const o = this._smoke;
          o.life = 1.2 + Math.random() * 1.2;
          o.size = 0.7 + Math.random() * 0.7 * Math.min(1.5, slip);
          o.color = soft ? SURFACE[surface].color : SMOKE;
          this.smoke.emit(x, y + 0.15, z, (Math.random() - 0.5) * 0.8 - v.vL * 0.1 * c, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8, o);
        }
      }
    }
    // Fade old marks (every quarter second, cheap).
    this.fadeT += dt;
    if (this.fadeT > 0.25) { this.fadeT = 0; this._fade(); }
    this._upload();
    this.smoke.update(dt); this.sparks.update(dt); this.bits.update(dt);
    this.out.skid = skidMax;
    return this.out;
  }

  _segment(x0, y0, z0, x1, y1, z1, w, alpha, soft) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % SEGS;
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l * w / 2, nz = dx / l * w / 2;
    const p = this.pos, o = i * 12;
    p[o] = x0 + nx; p[o + 1] = y0; p[o + 2] = z0 + nz;
    p[o + 3] = x0 - nx; p[o + 4] = y0; p[o + 5] = z0 - nz;
    p[o + 6] = x1 + nx; p[o + 7] = y1; p[o + 8] = z1 + nz;
    p[o + 9] = x1 - nx; p[o + 10] = y1; p[o + 11] = z1 - nz;
    // Rubber is near-black; soft-ground ruts are a darker shade of the ground.
    const base = soft ? SURFACE[soft].color : RUBBER, k = soft ? 0.55 : 1;
    for (let q = 0; q < 4; q++) {
      const c = i * 16 + q * 4;
      this.col[c] = base[0] * k; this.col[c + 1] = base[1] * k; this.col[c + 2] = base[2] * k; this.col[c + 3] = alpha;
    }
    this.born[i] = this.t;
    this.alpha0[i] = alpha;
    this.dirty0 = Math.min(this.dirty0, i);
    this.dirty1 = Math.max(this.dirty1, i);
    if (!this.mesh.isEnabled(false)) this.mesh.setEnabled(true);
  }

  _fade() {
    const col = this.col;
    for (let i = 0; i < SEGS; i++) {
      const age = this.t - this.born[i];
      if (age < LIFE * 0.6 || this.alpha0[i] <= 0) continue;
      const a = this.alpha0[i] * Math.max(0, 1 - (age - LIFE * 0.6) / (LIFE * 0.4));
      for (let k = 0; k < 4; k++) col[i * 16 + k * 4 + 3] = a;
      if (a <= 0) this.alpha0[i] = 0;
      this.colDirty = true;
    }
  }

  /** Upload what changed this frame: the new segments, or all colours after a fade. */
  _upload() {
    if (this.dirty1 >= this.dirty0) {
      this.posBuffer.updateDirectly(this.pos.subarray(this.dirty0 * 12, (this.dirty1 + 1) * 12), this.dirty0 * 12);
      if (!this.colDirty) this.colBuffer.updateDirectly(this.col.subarray(this.dirty0 * 16, (this.dirty1 + 1) * 16), this.dirty0 * 16);
      this.dirty0 = SEGS; this.dirty1 = -1;
    }
    if (this.colDirty) { this.colBuffer.updateDirectly(this.col, 0); this.colDirty = false; }
  }

  _crash(v, strength) {
    const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
    const front = v.vF >= 0 ? 1 : -1;
    const len = v.dims.len / 2;
    const x = v.x + s * len * front, z = v.z + c * len * front, y = v.y + 0.6;
    const o = this._fx;
    o.color = SPARK; o.drag = 2; o.gravity = -9;
    for (let k = 0; k < 18 + strength * 30; k++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 1.2;
      o.life = 0.25 + Math.random() * 0.35; o.size = 0.05 + Math.random() * 0.05;
      this.sparks.emit(x, y, z, Math.cos(a) * (2 + u * 4), 1 + Math.random() * 3, Math.sin(a) * (2 + u * 4), o);
    }
    o.color = DEBRIS; o.drag = 0.8; o.gravity = -9.8; o.life = 0.8;
    for (let k = 0; k < 6 + strength * 12; k++) {
      const a = Math.random() * Math.PI * 2;
      o.size = 0.03 + Math.random() * 0.03;
      this.bits.emit(x, y, z, Math.cos(a) * 2.5, 1.5 + Math.random() * 2, Math.sin(a) * 2.5, o);
    }
    o.color = DUST; o.drag = 1.5; o.gravity = 0.2; o.life = 1.2; o.size = 1.0;
    for (let k = 0; k < 6; k++) this.smoke.emit(x, y, z, (Math.random() - 0.5), 0.6, (Math.random() - 0.5), o);
    this.state?.emit('vehicle:crash', { vehicle: v, strength, position: new Vector3(x, y, z) });
  }
}

const RUBBER = [0.02, 0.02, 0.025];
const SMOKE = [0.86, 0.86, 0.9];
const SPARK = [1, 0.75, 0.35];
const DEBRIS = [0.2, 0.2, 0.22];
const DUST = [0.75, 0.74, 0.72];
