import { MeshBuilder, ShaderMaterial, Color3, Scene } from '@babylonjs/core';

/**
 * Painted anime sky and haze (port of the original's Sky.js and the fog in
 * Lighting.js): warm horizon → deep blue zenith, soft sun halo and stylised
 * fbm clouds lit orange from below on the sun side, with fog matching the
 * horizon so distance melts into the sky. Graphics owns it; it is also what
 * the environment probe captures, so windows and cars reflect the same sky.
 */
const VERTEX = /* glsl */ `
  precision highp float;
  attribute vec3 position;
  uniform mat4 worldViewProjection;
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = worldViewProjection * vec4(position, 1.0);
    gl_Position = p.xyww;   // on the far plane: behind everything, whatever the camera range
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uSunDir, uZenith, uMid, uHorizon, uSunColor, uCloudLit, uCloudShade;
  uniform float uTime;
  varying vec3 vDir;

  // sin()-based hashes break into visible blocks at mediump precision
  // (most phone GPUs). This arithmetic hash stays smooth everywhere.
  float hash(vec2 p) {
    p = mod(p, 289.0);
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    float sunAmt = max(dot(d, uSunDir), 0.0);

    // Base gradient, warmer toward the sun.
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.28, h));
    col = mix(col, uZenith, smoothstep(0.22, 0.9, h));
    vec3 warm = mix(uHorizon, vec3(1.0, 0.62, 0.38), 0.5);
    col = mix(col, warm, pow(sunAmt, 6.0) * (1.0 - smoothstep(0.0, 0.3, h)) * 0.7);
    // Below horizon: hazy ground colour.
    col = mix(col, uHorizon * 0.85, smoothstep(0.0, -0.08, h));

    // Sun disc + halo.
    col += uSunColor * pow(sunAmt, 900.0) * 3.0;
    col += uSunColor * pow(sunAmt, 48.0) * 0.4;
    col += uSunColor * pow(sunAmt, 8.0) * 0.06;

    // Clouds on a virtual plane: anime cumulus, big soft-edged puffs with
    // gold-lit tops and lavender bellies. The drift wraps to keep precision.
    if (h > 0.0) {
      vec2 uv = d.xz / (h + 0.22) * 0.8 + mod(vec2(uTime * 0.003, uTime * 0.001), 100.0);
      float base = fbm(uv * 0.9);
      float billow = 1.0 - abs(fbm(uv * 2.6 + 7.0) * 2.0 - 1.0);
      float n = base * 0.78 + billow * 0.3;
      float cov = smoothstep(0.56, 0.64, n);
      float core = smoothstep(0.56, 0.8, n);
      vec2 toSun = normalize(uSunDir.xz + 1e-4) * 0.06;
      float nS = fbm((uv + toSun) * 0.9) * 0.78 + billow * 0.3;
      float lit = clamp(0.55 + (n - nS) * 7.0, 0.0, 1.0);
      lit *= mix(1.0, 0.75, core);   // denser parts are darker underneath
      vec3 cc = mix(uCloudShade, uCloudLit, lit);
      cc += uSunColor * pow(sunAmt, 6.0) * 0.5 * (1.0 - core);
      // Bright rim on cloud edges facing the sun (silver lining).
      float rim = smoothstep(0.56, 0.6, n) * (1.0 - smoothstep(0.6, 0.66, n));
      cc += uSunColor * rim * (0.35 + 1.2 * pow(sunAmt, 6.0));
      float fade = smoothstep(0.0, 0.14, h) * (1.0 - smoothstep(0.75, 1.0, h) * 0.5);
      col = mix(col, cc, cov * fade * 0.95);
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Linear working-space colours, as three.js converted the original's hex values.
const COLORS = {
  uZenith: '#2c5bb8', uMid: '#78aee8', uHorizon: '#ffbf86',
  uSunColor: '#ffd7a0', uCloudLit: '#fff0d8', uCloudShade: '#a593c2',
};
const FOG = { color: '#e9c3a8', near: 90, far: 420 };

export class Sky {
  /** @param sunDir direction toward the sun */
  constructor(scene, { sunDir }) {
    this.time = 0;
    const mat = new ShaderMaterial('paintedSky', scene, { vertexSource: VERTEX, fragmentSource: FRAGMENT }, {
      attributes: ['position'],
      uniforms: ['worldViewProjection', 'uSunDir', 'uTime', ...Object.keys(COLORS)],
    });
    for (const [k, hex] of Object.entries(COLORS)) mat.setColor3(k, Color3.FromHexString(hex).toLinearSpace());
    mat.setVector3('uSunDir', sunDir.clone().normalize());
    mat.setFloat('uTime', 0);
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    const mesh = MeshBuilder.CreateSphere('sky', { diameter: 600, segments: 24 }, scene);
    mesh.material = mat;
    mesh.infiniteDistance = true;
    mesh.isPickable = false;
    mesh.applyFog = false;
    mesh.alwaysSelectAsActiveMesh = true;
    this.mesh = mesh;
    this.material = mat;

    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogColor = Color3.FromHexString(FOG.color).toLinearSpace();
    scene.fogStart = FOG.near;
    scene.fogEnd = FOG.far;
  }

  update(dt) {
    this.time += dt;
    this.material.setFloat('uTime', this.time);
  }

  dispose() {
    this.material.dispose();
    this.mesh.dispose();
  }
}
