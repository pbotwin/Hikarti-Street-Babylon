import { Vector3, DynamicTexture, MeshBuilder, Matrix } from '@babylonjs/core';
import { Particles } from './Particles.js';
import { basicMaterial } from './FxKit.js';
import { SURFACE, surfaceAt } from '../world/Surfaces.js';

/**
 * Foot-contact system. On every footfall (and on landings) it works out:
 *   1. which foot touched down (the lower of the two foot bones)
 *   2. the exact contact point (that foot's toe/heel midpoint on the ground)
 *   3. the ground surface there (Surfaces.surfaceAt — layout based)
 *   4. how hard (player speed / landing impact)
 * then triggers the matching response. Everything is subtle by design:
 *
 *   asphalt / concrete / wood / metal  sound only (no dust on clean or wet ground)
 *   stone    a barely visible pale puff on hard landings
 *   grass    a couple of grass flecks
 *   gravel   tiny pebbles hop + low dust
 *   dirt     soft low dust
 *   sand     sand puff, flying grains, and a footprint that fades out
 *
 * The surface is written onto the footstep event (e.surface) so the audio
 * system can pick a matching sound. All effects come from two pooled
 * particle systems and a small footprint pool: nothing is allocated in play.
 */
const FOOTPRINTS = 28;

export class Footsteps {
  constructor(scene, state, collision) {
    this.collision = collision;
    this.dust = new Particles(scene, 260, { additive: false });          // soft puffs
    this.bits = new Particles(scene, 320, { additive: false, hard: true }); // grains, flecks, pebbles
    this.player = null;
    this._a = new Vector3();
    this._b = new Vector3();
    this.surface = 'asphalt';

    // ---- Footprint decals (sand) ----
    const tex = new DynamicTexture('footprint', { width: 64, height: 128 }, scene, true);
    const g = tex.getContext();
    const grd = (cx, cy, rx, ry) => {
      const r = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.7, 'rgba(255,255,255,0.8)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.save(); g.translate(cx, cy); g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); g.translate(-cx, -cy);
      g.fillStyle = r; g.beginPath(); g.arc(cx, cy, Math.max(rx, ry), 0, Math.PI * 2); g.fill(); g.restore();
    };
    g.clearRect(0, 0, 64, 128);
    grd(32, 40, 20, 34);   // forefoot
    grd(32, 98, 15, 22);   // heel
    // Sneaker tread lines.
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let y = 14; y < 120; y += 9) g.fillRect(10, y, 44, 3);
    g.globalCompositeOperation = 'source-over';
    tex.hasAlpha = true;
    tex.update(false);
    // Toe toward local −z, as the original's plane laid flat.
    const base = MeshBuilder.CreateGround('footprint', { width: 0.11, height: 0.26 }, scene);
    base.bakeTransformIntoVertices(Matrix.RotationY(Math.PI));
    base.isPickable = false;
    base.alphaIndex = 1;
    this.prints = [];
    for (let i = 0; i < FOOTPRINTS; i++) {
      const m = i ? base.clone(`footprint-${i}`) : base;
      // Each print fades on its own clock: its own material (one shared texture).
      // Mirrored prints (scale x −1) flip the winding: draw both sides.
      m.material = basicMaterial(scene, `footprint-${i}`, { color: '#4f3b26', map: tex, opacity: 0, depthWrite: false, doubleSided: true });
      m.material.zOffset = -4;
      m.material.zOffsetUnits = -4;
      m.setEnabled(false);
      m.age = 0;
      this.prints.push(m);
    }
    this.printCursor = 0;

    state.on('player:footstep', (e) => this.step(e));
  }

  /** Foot bones of the character (raw rig), found lazily. */
  _feet() {
    if (this._feetBones !== undefined) return this._feetBones;
    const c = this.player?.character;
    this._feetBones = c ? [c.bone('leftFoot'), c.bone('rightFoot')] : null;
    this._toes = c ? [c.bone('leftToes'), c.bone('rightToes')] : null;
    return this._feetBones;
  }

  /** Contact point + side of the planted (lower) foot, on the ground. */
  _contact() {
    const p = this.player.position;
    const feet = this._feet();
    if (!feet || !feet[0] || !feet[1]) return { x: p.x, y: p.y, z: p.z, side: 0, yaw: this.player.yaw };
    this._a.copyFrom(feet[0].getAbsolutePosition());
    this._b.copyFrom(feet[1].getAbsolutePosition());
    const side = this._a.y <= this._b.y ? 0 : 1;
    const f = side === 0 ? this._a : this._b;
    // Midway between ankle and toes ≈ middle of the sole.
    const toe = this._toes?.[side];
    let x = f.x, z = f.z;
    if (toe) { const t = toe.getAbsolutePosition(); x = (f.x + t.x) / 2; z = (f.z + t.z) / 2; }
    return { x, y: p.y, z, side, yaw: this.player.yaw };
  }

  /** Surface under the player right now (also used by landing effects). */
  surfaceUnder(x, z, y) {
    const base = this.collision.groundHeight(x, z, 0.05, 0.3, 0);   // floor level (kerb/pavement)
    return surfaceAt(x, z, y > base + 0.25);
  }

  step(e) {
    if (!this.player) return;
    const c = this._contact();
    const kind = this.surfaceUnder(c.x, c.z, c.y);
    this.surface = e.surface = kind;
    const s = SURFACE[kind];
    const speed = e.speed || 0;
    const k = Math.min(1, Math.max(0, (speed - 0.6) / 4.8));          // 0 walk … 1 sprint
    if (s.dust > 0) this._dust(c, s, (0.35 + k * 0.9) * s.dust, k);
    if (s.grains) this._grains(c, s, 3 + Math.round(k * 7), 0.6 + k * 1.2);
    if (s.pebbles) this._pebbles(c, s, 1 + Math.round(k * 3));
    if (s.blades && Math.random() < 0.35 + k * 0.5) this._blades(c, 1 + Math.round(k * 2));
    if (s.prints) this._print(c);
  }

  /** Landing reaction scaled by impact (0 soft … 1 hard). */
  land(position, impact) {
    if (!this.player) return;
    const kind = this.surfaceUnder(position.x, position.z, position.y);
    const s = SURFACE[kind];
    const c = { x: position.x, y: position.y, z: position.z, yaw: this.player.yaw, side: 0 };
    const strength = 0.25 + impact * 0.9;
    if (impact < 0.12 && !s.grains) return;                         // small hop: nothing visible
    if (s.dust > 0 || (s.hard >= 1 && impact > 0.55 && !s.wet)) {
      this._dust(c, s, strength * Math.max(s.dust, 0.35), impact, 1.6);
    }
    if (s.grains) this._grains(c, s, 6 + Math.round(impact * 16), 0.9 + impact * 1.6);
    if (s.pebbles) this._pebbles(c, s, 2 + Math.round(impact * 5));
    if (s.blades) this._blades(c, 2 + Math.round(impact * 4));
    if (s.prints) {
      for (const side of [0, 1]) this._print({ ...c, side, x: c.x + Math.cos(c.yaw) * (side ? -0.09 : 0.09), z: c.z - Math.sin(c.yaw) * (side ? -0.09 : 0.09) });
    }
  }

  /** Jump take-off: a scuff on loose ground only. */
  takeoff(position, speed) {
    if (!this.player) return;
    const kind = this.surfaceUnder(position.x, position.z, position.y);
    const s = SURFACE[kind];
    if (s.dust > 0.3) this._dust({ x: position.x, y: position.y, z: position.z }, s, 0.4 * s.dust + speed * 0.04, 0.3);
    if (s.grains) this._grains(position, s, 5, 1.0);
  }

  // ---------------------------------------------------------------- emitters
  _dust(c, s, amount, k, spread = 1) {
    const n = Math.max(1, Math.round(amount * 6));
    const col = s.color.map((v) => v * 0.92);
    const yaw = c.yaw ?? this.player.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = (0.25 + Math.random() * 0.55) * spread;
      // Low and mostly sideways / backward from the foot: kicked, not exploded.
      this.dust.emit(c.x + Math.cos(a) * 0.05, c.y + 0.03, c.z + Math.sin(a) * 0.05,
        Math.cos(a) * r - fx * k * 0.6, 0.12 + Math.random() * 0.22 * spread, Math.sin(a) * r - fz * k * 0.6,
        { life: 0.45 + Math.random() * 0.4, size: (0.09 + Math.random() * 0.1) * (0.8 + spread * 0.25), color: col, drag: 4.5, gravity: 0.15 });
    }
  }

  _grains(c, s, n, power) {
    const yaw = c.yaw ?? this.player.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.5 * power;
      const shade = 0.85 + Math.random() * 0.25;
      this.bits.emit(c.x, c.y + 0.02, c.z,
        Math.cos(a) * r - fx * power * 0.35, (0.5 + Math.random() * 0.9) * power, Math.sin(a) * r - fz * power * 0.35,
        { life: 0.35 + Math.random() * 0.25, size: 0.012 + Math.random() * 0.012, color: s.color.map((v) => v * shade), drag: 1.2, gravity: -9 });
    }
  }

  _pebbles(c, s, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.bits.emit(c.x, c.y + 0.02, c.z, Math.cos(a) * 0.4, 0.6 + Math.random() * 0.6, Math.sin(a) * 0.4,
        { life: 0.3, size: 0.02 + Math.random() * 0.012, color: [0.62, 0.58, 0.54], drag: 0.8, gravity: -9.5 });
    }
  }

  _blades(c, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const g = 0.75 + Math.random() * 0.4;
      this.bits.emit(c.x + Math.cos(a) * 0.08, c.y + 0.06, c.z + Math.sin(a) * 0.08,
        Math.cos(a) * 0.35, 0.5 + Math.random() * 0.5, Math.sin(a) * 0.35,
        { life: 0.6 + Math.random() * 0.4, size: 0.022 + Math.random() * 0.015, color: [0.36 * g, 0.6 * g, 0.26 * g], drag: 3.5, gravity: -2.2 });
    }
  }

  _print(c) {
    const m = this.prints[this.printCursor];
    this.printCursor = (this.printCursor + 1) % this.prints.length;
    // Offset to the foot's own line (left / right of the body axis).
    m.position.set(c.x, c.y + 0.016, c.z);
    m.rotation.set(0, c.yaw + (Math.random() - 0.5) * 0.12, 0);
    m.scaling.set(c.side ? -1 : 1, 1, 1);
    m.age = 0;
    m.material.alpha = 0.55;
    m.setEnabled(true);
  }

  update(dt, player) {
    this.player = player;
    this.dust.update(dt);
    this.bits.update(dt);
    for (const m of this.prints) {
      if (!m.isEnabled(false)) continue;
      m.age += dt;
      // Hold ~6 s, then fade over ~4 s (sand slowly falls back in).
      const t = m.age;
      m.material.alpha = t < 6 ? 0.55 : 0.55 * Math.max(0, 1 - (t - 6) / 4);
      if (m.material.alpha <= 0.001) m.setEnabled(false);
    }
  }
}
