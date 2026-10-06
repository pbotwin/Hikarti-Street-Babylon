import {
  TransformNode, MeshBuilder, Mesh, PBRMaterial, ShaderMaterial, DynamicTexture, Color3, Constants, Matrix,
} from '@babylonjs/core';
import { Particles } from './Particles.js';
import { glowTexture, basicMaterial, octahedron } from './FxKit.js';

const ENTER_RADIUS = 0.95;
const SPARK_CYAN = [0.5, 0.9, 1], SPARK_GOLD = [1, 0.85, 0.6], BURST = [0.7, 0.95, 1];

const VORTEX_VERT = /* glsl */ `
  precision highp float;
  attribute vec3 position; attribute vec2 uv;
  uniform mat4 worldViewProjection;
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = worldViewProjection * vec4(position, 1.0); }`;
const VORTEX_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv; uniform float uTime; uniform float uOpen;
  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float swirl = sin(a * 5.0 + r * 9.0 - uTime * 3.0) * 0.5 + 0.5;
    float swirl2 = sin(a * 3.0 - r * 14.0 + uTime * 2.0) * 0.5 + 0.5;
    vec3 c1 = vec3(0.35, 0.8, 1.0), c2 = vec3(0.85, 0.6, 1.0), c3 = vec3(1.0, 0.92, 0.75);
    vec3 col = mix(c1, c2, swirl);
    col = mix(col, c3, smoothstep(0.35, 0.0, r) * 0.6);
    col *= 0.55 + 0.45 * smoothstep(0.0, 0.9, r);
    float alpha = smoothstep(1.0, 0.82, r) * (0.35 + 0.4 * swirl2) * uOpen;
    gl_FragColor = vec4(col * 0.8, alpha);
  }`;

/** A ring in the XY plane (facing +z), like three's TorusGeometry. */
function torus(name, scene, radius, tube, tessellation) {
  const m = MeshBuilder.CreateTorus(name, { diameter: radius * 2, thickness: tube * 2, tessellation }, scene);
  m.bakeTransformIntoVertices(Matrix.RotationX(Math.PI / 2));
  return m;
}

/**
 * The portal: hidden until all fragments are collected, then it blooms open
 * (ring scales in with overshoot, swirling vortex shader, rising sparks and a
 * sky beam). Walking into it fades the screen and completes the run.
 */
export class PortalSystem {
  constructor(scene, state, spot) {
    this.scene = scene;
    this.state = state;
    this.spot = spot;
    this.particles = new Particles(scene, 600);
    this.time = 0;
    this.open = 0;          // 0..1 animated
    this.active = false;
    this.entered = false;
    this.fade = 0;

    const g = new TransformNode('portal', scene);
    g.position.copyFrom(spot.position);
    g.rotation.y = spot.yaw;
    this.group = g;
    const meshes = [];
    const own = (m, parent) => { m.parent = parent; m.isPickable = false; meshes.push(m); return m; };

    // Stone-and-light frame: a torus ring with emissive runes.
    const ringMat = new PBRMaterial('portal-ring', scene);
    ringMat.albedoColor = Color3.FromHexString('#e9f6ff').toLinearSpace();
    ringMat.emissiveColor = Color3.FromHexString('#56c9ff').toLinearSpace();
    ringMat.emissiveIntensity = 2.2;
    ringMat.roughness = 0.3;
    ringMat.metallic = 0.4;
    const inner = new TransformNode('portal-inner', scene);
    inner.parent = g;
    inner.position.y = 1.55;
    this.inner = inner;
    own(torus('portal-ring', scene, 1.25, 0.08, 72), inner).material = ringMat;
    const ring2 = own(torus('portal-ring2', scene, 1.42, 0.025, 72), inner);
    ring2.material = basicMaterial(scene, 'portal-ring2', { color: '#ffe6a8', opacity: 0.85, additive: true });
    this.ring2 = ring2;
    // Floating shards around the ring (instances of one crystal).
    this.shards = new TransformNode('portal-shards', scene);
    this.shards.parent = inner;
    const shardSrc = octahedron('portal-shard', scene, 0.09, 2);
    shardSrc.material = ringMat;
    this.shardList = [];
    for (let i = 0; i < 10; i++) {
      const s = own(i ? shardSrc.createInstance(`portal-shard-${i}`) : shardSrc, this.shards);
      const a = (i / 10) * Math.PI * 2;
      s.position.set(Math.cos(a) * 1.65, Math.sin(a) * 1.65, 0);
      s.rotation.z = a;
      this.shardList.push(s);
    }

    this.vortexMat = new ShaderMaterial('portal-vortex', scene, { vertexSource: VORTEX_VERT, fragmentSource: VORTEX_FRAG }, {
      attributes: ['position', 'uv'], uniforms: ['worldViewProjection', 'uTime', 'uOpen'], needAlphaBlending: true,
    });
    this.vortexMat.alphaMode = Constants.ALPHA_ADD;
    this.vortexMat.disableDepthWrite = true;
    this.vortexMat.backFaceCulling = false;
    this.vortexMat.setFloat('uTime', 0);
    this.vortexMat.setFloat('uOpen', 0);
    own(MeshBuilder.CreateDisc('portal-vortex', { radius: 1.24, tessellation: 64 }, scene), inner).material = this.vortexMat;

    const glow = own(MeshBuilder.CreatePlane('portal-glow', { size: 1 }, scene), inner);
    glow.material = basicMaterial(scene, 'portal-glow', { color: '#8fdcff', map: glowTexture(scene), opacity: 0.3, additive: true, depthWrite: false });
    glow.billboardMode = Mesh.BILLBOARDMODE_ALL;
    glow.scaling.setAll(4.2);

    // Base platform glyph on the ground.
    this.glyph = own(MeshBuilder.CreateGround('portal-glyph', { width: 4.4, height: 4.4 }, scene), g);
    this.glyph.material = basicMaterial(scene, 'portal-glyph', { map: this._glyphTexture(scene), opacity: 0, additive: true, depthWrite: false });
    this.glyph.position.y = 0.02;

    // Sky beam.
    this.beam = own(MeshBuilder.CreateCylinder('portal-beam', {
      diameterTop: 1, diameterBottom: 1.8, height: 80, tessellation: 16, cap: Mesh.NO_CAP,
    }, scene), g);
    this.beam.material = basicMaterial(scene, 'portal-beam', { color: '#9fe4ff', opacity: 0, additive: true, depthWrite: false, doubleSided: true });
    this.beam.position.y = 40;

    // Hidden until the fragments are in: compile now, never on first sight.
    for (const m of meshes) if (!m.isAnInstance) m.material.forceCompilation(m);
    g.setEnabled(false);
    state.on('portal:activated', () => this.activate());
  }

  _glyphTexture(scene) {
    const S = 512;
    const t = new DynamicTexture('portal-glyph', { width: S, height: S }, scene, true);
    const g = t.getContext();
    g.clearRect(0, 0, S, S);
    g.translate(S / 2, S / 2);
    g.strokeStyle = 'rgba(140,220,255,0.9)';
    g.lineWidth = 6;
    g.beginPath(); g.arc(0, 0, 230, 0, 7); g.stroke();
    g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, 200, 0, 7); g.stroke();
    for (let i = 0; i < 6; i++) {
      g.rotate(Math.PI / 3);
      g.beginPath(); g.moveTo(0, -200); g.lineTo(173, 100); g.stroke();
    }
    g.font = '28px serif'; g.fillStyle = 'rgba(200,240,255,0.9)'; g.textAlign = 'center';
    const runes = '光風空星夢道';
    for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.fillText(runes[i % runes.length], 0, -212); }
    t.hasAlpha = true;
    t.update(true);
    return t;
  }

  activate() {
    this.active = true;
    this.group.setEnabled(true);
    this.open = 0;
    this.state.emit('portal:open', { position: this.spot.position.clone() });
  }

  reset() {
    this.active = false;
    this.entered = false;
    this.done = false;
    this.open = 0;
    this.fade = 0;
    this.group.setEnabled(false);
  }

  update(dt, player, gfx) {
    this.time += dt;
    const t = this.time;
    this.particles.update(dt);
    if (!this.active) return;

    this.open = Math.min(1, this.open + dt * 0.7);
    // Elastic overshoot when opening.
    const o = this.open;
    const s = o < 1 ? 1 - Math.pow(2, -10 * o) * Math.cos(o * 12) : 1;
    this.inner.scaling.setAll(Math.max(0.001, s));
    this.vortexMat.setFloat('uTime', t);
    this.vortexMat.setFloat('uOpen', Math.min(1, o * 1.5));
    this.shards.rotation.z = t * 0.4;
    for (let i = 0; i < this.shardList.length; i++) this.shardList[i].position.z = Math.sin(t * 2 + i) * 0.1;
    this.ring2.rotation.z = -t * 0.6;
    this.glyph.material.alpha = Math.min(0.7, o) * (0.75 + Math.sin(t * 2) * 0.25);
    this.glyph.rotation.y = t * 0.15;
    this.beam.material.alpha = Math.min(0.18, o * 0.3) * (0.85 + Math.sin(t * 3) * 0.15);

    // Spiralling sparks.
    this.inner.computeWorldMatrix(true);
    const center = this.inner.getAbsolutePosition();
    const rx = Math.cos(this.spot.yaw), rz = -Math.sin(this.spot.yaw);   // the ring's right-hand side
    for (let k = 0; k < 3; k++) {
      const a = Math.random() * Math.PI * 2, r = 1.3 + Math.random() * 0.4;
      const px = center.x + rx * Math.cos(a) * r, py = center.y + Math.sin(a) * r, pz = center.z + rz * Math.cos(a) * r;
      this.particles.emit(px, py, pz, (center.x - px) * 0.6, 0.6 + (center.y - py) * 0.6, (center.z - pz) * 0.6, {
        life: 1.4, size: 0.09, color: Math.random() < 0.5 ? SPARK_CYAN : SPARK_GOLD, drag: 0.8,
      });
    }

    // Entering.
    const dx = player.position.x - this.spot.position.x;
    const dz = player.position.z - this.spot.position.z;
    if (!this.entered && o > 0.6 && Math.hypot(dx, dz) < ENTER_RADIUS && player.position.y < 2) {
      this.entered = true;
      this.state.emit('portal:enter');
      this.particles.burst(center, 120, { speed: 6, color: BURST, life: 1.4, size: 0.16, gravity: 0 });
    }
    if (this.entered) {
      if (!this.done) {
        this.fade = Math.min(1, this.fade + dt * 1.6);
        if (this.fade >= 1) { this.done = true; this.state.complete(); }
      } else {
        // Ease back in behind the completion card.
        this.fade = Math.max(0, this.fade - dt * 1.2);
      }
      gfx.setFade(this.fade * 0.85);
    }
  }
}
