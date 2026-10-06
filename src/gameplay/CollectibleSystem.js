import { TransformNode, MeshBuilder, PBRMaterial, ShaderMaterial, Color3, Constants, Mesh, Vector3, Quaternion } from '@babylonjs/core';
import '@babylonjs/core/Shaders/ShadersInclude/instancesDeclaration.js';
import '@babylonjs/core/Shaders/ShadersInclude/instancesVertex.js';
import { Particles } from './Particles.js';
import { glowTexture, basicMaterial, octahedron } from './FxKit.js';

const COLLECT_RADIUS = 1.05;
const CYAN = [0.45, 0.95, 1.0];
const GOLD = [1.0, 0.85, 0.5];

// Every fragment's beam is an instance: the world matrix comes per instance.
const BEAM_VERT = /* glsl */ `
  precision highp float;
  attribute vec3 position; attribute vec2 uv;
  #include<instancesDeclaration>
  uniform mat4 viewProjection;
  varying vec2 vUv;
  void main(){
    #include<instancesVertex>
    vUv = uv;
    gl_Position = viewProjection * finalWorld * vec4(position, 1.0);
  }`;
const BEAM_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv; uniform float uTime; uniform float uOpacity;
  void main(){
    float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float fade = smoothstep(0.0, 0.08, vUv.y) * (1.0 - vUv.y);
    float flow = 0.75 + 0.25 * sin(vUv.y * 40.0 - uTime * 3.0);
    gl_FragColor = vec4(vec3(0.45, 0.9, 1.0) * flow, pow(edge, 2.0) * fade * 0.32 * uOpacity);
  }`;

/**
 * Energy fragments: floating faceted crystals with a soft core glow, a faint
 * sky beam (so they can be found without a minimap), orbiting sparkles and a
 * ground halo. Collecting one bursts into particles and notifies GameState.
 * Each part is an instance of one shared mesh: one draw call per kind.
 */
export class CollectibleSystem {
  constructor(scene, state, spots, groundAt = () => 0) {
    this.scene = scene;
    this.state = state;
    this.particles = new Particles(scene);
    this.time = 0;

    const crystalMat = new PBRMaterial('fragment-crystal', scene);
    crystalMat.albedoColor = Color3.FromHexString('#bff6ff').toLinearSpace();
    crystalMat.emissiveColor = Color3.FromHexString('#4fd8ff').toLinearSpace();
    crystalMat.emissiveIntensity = 2.4;
    crystalMat.roughness = 0.15;
    crystalMat.metallic = 0.1;
    crystalMat.alpha = 0.95;
    const shellMat = basicMaterial(scene, 'fragment-shell', { color: '#9feaff', opacity: 0.35, additive: true, depthWrite: false, wireframe: true });
    const glowMat = basicMaterial(scene, 'fragment-glow', { color: '#7fe6ff', map: glowTexture(scene), opacity: 0.85, additive: true, depthWrite: false });
    const beamMat = new ShaderMaterial('fragment-beam', scene, { vertexSource: BEAM_VERT, fragmentSource: BEAM_FRAG }, {
      attributes: ['position', 'uv'], uniforms: ['world', 'viewProjection', 'uTime', 'uOpacity'], needAlphaBlending: true,
    });
    beamMat.alphaMode = Constants.ALPHA_ADD;
    beamMat.disableDepthWrite = true;
    beamMat.backFaceCulling = false;
    beamMat.setFloat('uTime', 0);
    beamMat.setFloat('uOpacity', 1);
    this.beamMat = beamMat;
    const haloMat = basicMaterial(scene, 'fragment-halo', { color: '#5fdcff', map: glowTexture(scene), opacity: 0.5, additive: true, depthWrite: false });
    this.haloMat = haloMat;

    // Shared shapes (hidden sources; every fragment shows instances of them).
    const source = (mesh, mat) => {
      mesh.material = mat;
      mesh.isPickable = false;
      mesh.isVisible = false;
      return mesh;
    };
    const crystalSrc = source(octahedron('fragment-crystal', scene, 0.22, 1.7), crystalMat);
    const shellSrc = source(MeshBuilder.CreateIcoSphere('fragment-shell', { radius: 0.42, subdivisions: 1, flat: true }, scene), shellMat);
    const glowSrc = source(MeshBuilder.CreatePlane('fragment-glow', { size: 1 }, scene), glowMat);
    const beamSrc = source(MeshBuilder.CreatePlane('fragment-beam', { width: 0.5, height: 40 }, scene), beamMat);
    const haloSrc = source(MeshBuilder.CreateGround('fragment-halo', { width: 2.2, height: 2.2 }, scene), haloMat);
    this._sources = [crystalSrc, shellSrc, glowSrc, beamSrc, haloSrc];
    for (const m of this._sources) m.material.forceCompilation(m);

    this.items = spots.map((p, i) => {
      const g = new TransformNode(`fragment-${i}`, scene);
      g.position.copyFrom(p);
      const crystal = crystalSrc.createInstance(`fragment-crystal-${i}`);
      const shell = shellSrc.createInstance(`fragment-shell-${i}`);
      shell.rotationQuaternion = new Quaternion();   // tumbles in three's XYZ order
      const glow = glowSrc.createInstance(`fragment-glow-${i}`);
      glow.billboardMode = Mesh.BILLBOARDMODE_ALL;
      glow.scaling.setAll(1.3);
      for (const m of [crystal, shell, glow]) m.parent = g;
      // Beam to the sky (two crossed planes).
      const beam = new TransformNode(`fragment-beam-${i}`, scene);
      for (const r of [0, Math.PI / 2]) {
        const b = beamSrc.createInstance(`fragment-beam-${i}-${r}`);
        b.position.y = 20;
        b.rotation.y = r;
        b.parent = beam;
      }
      beam.position.set(p.x, 0, p.z);
      // Ground halo on whatever surface is below (street, pedestal, gate, van roof…).
      const halo = haloSrc.createInstance(`fragment-halo-${i}`);
      const groundY = groundAt(p.x, p.z, p.y) + 0.03;
      halo.position.set(p.x, groundY, p.z);
      return { group: g, crystal, shell, glow, beam, halo, base: p.clone(), collected: false, phase: i * 1.3, scale: 1, haloOpacity: 0.5 };
    });
    this._tmp = new Vector3();
  }

  _show(it, on) {
    it.group.setEnabled(on);
    it.beam.setEnabled(on);
    it.halo.setEnabled(on);
  }

  /** A fragment already found (loading a save): gone without the shrink-out. */
  markCollected(it) {
    it.collected = true;
    it.scale = 0;
    this._show(it, false);
  }

  reset() {
    for (const it of this.items) {
      it.collected = false;
      this._show(it, true);
      it.scale = 1;
      it.group.scaling.setAll(1);
      it.beam.scaling.x = 1;
      it.halo.scaling.setAll(1);
    }
  }

  update(dt, player) {
    this.time += dt;
    const t = this.time;
    this.beamMat.setFloat('uTime', t);
    const chest = this._tmp.set(player.position.x, player.visualY + 1.0, player.position.z);

    for (const it of this.items) {
      if (it.collected) {
        // Shrink-out after collection.
        if (it.group.isEnabled(false)) {
          it.scale = Math.max(0, it.scale - dt * 5);
          it.group.scaling.setAll(it.scale);
          it.beam.scaling.x = it.scale;
          // The halo is an instance (shared material): it fades by shrinking.
          it.halo.scaling.setAll(it.scale);
          if (it.scale <= 0) this._show(it, false);
        }
        continue;
      }
      const p = it.base;
      const bob = Math.sin(t * 1.8 + it.phase) * 0.12;
      it.group.position.set(p.x, p.y + bob, p.z);
      it.crystal.rotation.y = t * 1.4 + it.phase;
      setEulerXYZ(it.shell.rotationQuaternion, t * 0.5, -t * 0.8, t * 0.3);
      const d = Vector3.Distance(chest, it.group.position);
      const near = Math.min(1, Math.max(0, 1 - (d - 1) / 7));
      const pulse = 1 + Math.sin(t * 3 + it.phase) * 0.08;
      it.glow.scaling.setAll((1.2 + near * 0.6) * pulse);
      // Beam fades as you get close so it doesn't wash out the view.
      it.beam.setEnabled(d > 3);

      // Orbiting sparkles (more when near).
      const rate = 6 + near * 30;
      if (Math.random() < rate * dt) {
        const a = Math.random() * Math.PI * 2, r = 0.35 + Math.random() * 0.4;
        const gp = it.group.position;
        this.particles.emit(gp.x + Math.cos(a) * r, gp.y - 0.3 + Math.random() * 0.5, gp.z + Math.sin(a) * r,
          -Math.sin(a) * 0.4, 0.4 + Math.random() * 0.4, Math.cos(a) * 0.4,
          { life: 1.2, size: 0.07 + Math.random() * 0.05, color: Math.random() < 0.3 ? GOLD : CYAN, drag: 0.6 });
      }

      if (d < COLLECT_RADIUS) this._collect(it);
    }
    this.particles.update(dt);
  }

  _collect(it) {
    it.collected = true;
    const p = it.group.position.clone();
    this.particles.burst(p, 70, { speed: 4.5, color: CYAN, life: 1.0, size: 0.14, gravity: -2 });
    this.particles.burst(p, 30, { speed: 2.5, color: GOLD, life: 1.3, size: 0.1, gravity: 0.5 });
    this.state.collectFragment(p);
  }
}

/** three's Euler 'XYZ' (x applied last) into a quaternion, without allocating. */
function setEulerXYZ(q, x, y, z) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  q.set(
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  );
}
