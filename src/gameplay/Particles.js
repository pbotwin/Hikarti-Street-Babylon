import { Mesh, ShaderMaterial, Constants, VertexBuffer } from '@babylonjs/core';

/**
 * Pooled GPU particles (a single point-list draw call). Used for fragment
 * sparkles, the collection burst, the portal, footsteps and tyre smoke.
 * Particles are recycled from a fixed ring buffer, so nothing is allocated
 * during play; an idle system is hidden (no draw call, no upload).
 */
const VERT = /* glsl */ `
  precision highp float;
  attribute vec3 position; attribute float size; attribute float alpha; attribute vec3 pcolor;
  uniform mat4 worldView; uniform mat4 projection; uniform float uScale;
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vColor = pcolor; vAlpha = alpha;
    vec4 mv = worldView * vec4(position, 1.0);
    gl_PointSize = size * uScale / -mv.z;
    gl_Position = projection * mv;
  }`;
// SOFT: hazy puffs (dust, sand clouds); HARD: small solid bits (grains, grass).
const FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    float a = smoothstep(0.5, 0.0, r);
    float core = smoothstep(0.18, 0.0, r);
    #if defined(SOFT)
      gl_FragColor = vec4(vColor, a * a * vAlpha * 0.4);
    #elif defined(HARD)
      gl_FragColor = vec4(vColor, smoothstep(0.5, 0.3, r) * vAlpha);
    #else
      gl_FragColor = vec4(vColor * (a + core * 1.5), a * vAlpha);
    #endif
  }`;

// One material per look, shared by every particle system of the scene.
const materials = new WeakMap();
function particleMaterial(scene, kind) {
  let byKind = materials.get(scene);
  if (!byKind) {
    byKind = {};
    materials.set(scene, byKind);
    // Sizes are in pixels of a CSS-height screen, as in the original.
    addEventListener('resize', () => { for (const m of Object.values(byKind)) m.setFloat('uScale', innerHeight * 0.5); });
  }
  if (!byKind[kind]) {
    const m = new ShaderMaterial(`particles-${kind}`, scene, { vertexSource: VERT, fragmentSource: FRAG }, {
      attributes: ['position', 'pcolor', 'size', 'alpha'],
      uniforms: ['worldView', 'projection', 'uScale'],
      defines: kind === 'additive' ? [] : [kind === 'hard' ? '#define HARD' : '#define SOFT'],
      needAlphaBlending: true,
    });
    m.pointsCloud = true;
    m.disableDepthWrite = true;
    m.backFaceCulling = false;
    m.alphaMode = kind === 'additive' ? Constants.ALPHA_ADD : Constants.ALPHA_COMBINE;
    m.setFloat('uScale', innerHeight * 0.5);
    byKind[kind] = m;
  }
  return byKind[kind];
}

export class Particles {
  constructor(scene, max = 1200, { additive = true, hard = false } = {}) {
    this.max = max;
    this.cursor = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.life = new Float32Array(max);     // remaining
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.alpha = new Float32Array(max);

    const mesh = new Mesh('particles', scene);
    mesh.setVerticesData(VertexBuffer.PositionKind, this.pos, true, 3);
    mesh.setVerticesData('pcolor', this.col, true, 3);
    mesh.setVerticesData('size', this.size, true, 1);
    mesh.setVerticesData('alpha', this.alpha, true, 1);
    mesh.isUnIndexed = true;
    mesh.alwaysSelectAsActiveMesh = true;   // spread over the whole city: never culled
    mesh.isPickable = false;
    mesh.alphaIndex = 10;
    mesh.material = particleMaterial(scene, additive ? 'additive' : hard ? 'hard' : 'soft');
    mesh.material.forceCompilation(mesh);
    this.buffers = ['position', 'pcolor', 'size', 'alpha'].map((k) => [mesh.getVertexBuffer(k), { position: this.pos, pcolor: this.col, size: this.size, alpha: this.alpha }[k]]);
    this.mesh = mesh;
    this.idle = true;
    this.idleCursor = 0;
    mesh.setEnabled(false);
  }

  emit(x, y, z, vx, vy, vz, { life = 1, size = 0.1, color = [1, 1, 1], drag = 1, gravity = 0 } = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.idle = false;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color[0]; this.col[i * 3 + 1] = color[1]; this.col[i * 3 + 2] = color[2];
    this.life[i] = this.maxLife[i] = life;
    this.size[i] = size;
    this.drag[i] = drag;
    this.grav[i] = gravity;
  }

  /** Spherical burst. */
  burst(center, count, { speed = 3, color = [1, 1, 1], life = 0.9, size = 0.12, gravity = -1.5 } = {}) {
    for (let k = 0; k < count; k++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const s = speed * (0.4 + Math.random() * 0.6);
      this.emit(center.x, center.y, center.z, r * Math.cos(th) * s, u * s, r * Math.sin(th) * s, {
        life: life * (0.6 + Math.random() * 0.6), size: size * (0.6 + Math.random() * 0.8), color, drag: 2.2, gravity,
      });
    }
  }

  update(dt) {
    // Idle systems cost nothing: skip the loop, the upload and the draw.
    if (this.idle && this.cursor === this.idleCursor) return;
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      // Never let alpha go NaN (pow of a negative): one NaN pixel would be
      // smeared across the whole screen by the bloom pass.
      if (this.life[i] <= 0) { this.life[i] = 0; this.alpha[i] = 0; continue; }
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k + this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      // Fade in fast, out slow.
      this.alpha[i] = Math.min(1, (1 - t) * 8) * Math.pow(t, 0.7);
      alive++;
    }
    // Sleep (hidden) once the last particle has died, until something new is emitted.
    this.idle = alive === 0;
    this.idleCursor = this.cursor;
    this.mesh.setEnabled(!this.idle);
    if (!this.idle) for (const [buffer, data] of this.buffers) buffer.update(data);
  }
}
