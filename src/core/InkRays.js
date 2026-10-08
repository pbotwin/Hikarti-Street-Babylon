import {
  Constants, Effect, EffectRenderer, EffectWrapper, PostProcess, ThinTexture, Vector3,
} from '@babylonjs/core';

/**
 * The original's two screen effects on the scene image, in one pass right
 * after the scene (first in the camera's chain, so it receives the rendered
 * scene and its depth):
 *  - ink outlines (AnimeShading OutlineShader): the depth Laplacian marks
 *    silhouettes and creases of nearby shapes, darkened toward a plum ink
 *  - golden-hour light rays (GodRaysShader): a radial blur toward the sun of
 *    the open-sky pixels, at half resolution, added in warm light
 * The scene keeps its MSAA: the depth texture is resolved with the colour.
 */
const RAYS_COLOR = [1.0, 0.7, 0.42];   // warm light added by the rays (linear)
const RAYS_STRENGTH = 0.07;
const INK = [0.32, 0.24, 0.34];
const RAYS_MAX = 20;     // the most ray samples any preset takes

Effect.ShadersStore.inkRaysFragmentShader = `
  precision highp float;
  varying vec2 vUV;
  uniform sampler2D textureSampler, depthSampler, raysSampler;
  uniform vec2 uResolution;
  uniform float uNear, uFar, uStrength, uThreshold;
  uniform vec3 uInk, uRays;

  float linearDepth(vec2 uv) {
    float z = texture2D(depthSampler, uv).x * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
  }

  void main() {
    vec4 col = texture2D(textureSampler, vUV);
    // Sample ~1.6 px apart: lines a little thicker and softer, stable (no
    // shimmering) on high-DPI phone screens.
    vec2 px = 1.6 / uResolution;
    float c = linearDepth(vUV);
    float l = linearDepth(vUV - vec2(px.x, 0.0)), r = linearDepth(vUV + vec2(px.x, 0.0));
    float u = linearDepth(vUV + vec2(0.0, px.y)), d = linearDepth(vUV - vec2(0.0, px.y));
    // 1/z is affine across planes in screen space: its Laplacian is ~0 on
    // flat surfaces and large at silhouettes and creases.
    float ic = 1.0 / c;
    float lap = abs((1.0 / l + 1.0 / r + 1.0 / u + 1.0 / d) - 4.0 * ic) / ic;
    float edge = smoothstep(uThreshold, uThreshold * 4.0, lap);
    // Only nearby shapes get lines; distant small edges would flicker.
    edge *= 1.0 - smoothstep(14.0, 45.0, min(c, min(min(l, r), min(u, d))));
    col.rgb = mix(col.rgb, col.rgb * uInk, edge * uStrength);
    col.rgb += uRays * texture2D(raysSampler, vUV).r;
    gl_FragColor = col;
  }
`;

const RAYS_FRAGMENT = `
  precision highp float;
  varying vec2 vUV;
  uniform sampler2D sceneSampler, depthSampler;
  uniform vec2 uSun;
  uniform float uSteps;
  float h(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  void main() {
    vec2 delta = (uSun - vUV) / uSteps * 0.9;
    vec2 p = vUV + delta * h(gl_FragCoord.xy);   // jitter hides banding
    float acc = 0.0, w = 1.0;
    for (int i = 0; i < RAYS_MAX; i++) {
      if (float(i) >= uSteps) break;
      float sky = step(0.9999, texture2D(depthSampler, p).x);
      float lum = dot(min(texture2D(sceneSampler, p).rgb, vec3(4.0)), vec3(0.33));
      acc += sky * lum * w;
      w *= 0.93;
      p += delta;
    }
    acc /= uSteps;
    // Stronger near the sun, fading with distance from it.
    float fall = 1.0 - smoothstep(0.0, 0.9, length((vUV - uSun) * vec2(1.0, 1.6)));
    gl_FragColor = vec4(acc * fall, 0.0, 0.0, 1.0);
  }
`;

export class InkRays {
  /**
   * @param {{ samples: number, rays: number }} options MSAA samples of the
   *   scene image; ray samples (0 = no rays, as the original's Low preset)
   */
  constructor(scene, camera, sunDir, { samples, rays }) {
    const engine = scene.getEngine();
    Object.assign(this, { scene, camera, engine, sunDir, raysSamples: rays });
    this.strength = 0.6;     // ink; 0 inside the shops
    this.raysAllowed = true;
    this._raysMix = 1;
    this._sun = { x: 0.5, y: 0.8 };
    this._rays = [0, 0, 0];
    this._p = new Vector3();
    // Samples the shader takes: the last non-zero count, so rays switched off
    // fade out as they were.
    this._raysSteps = rays || RAYS_MAX;

    this.post = new PostProcess('inkRays', 'inkRays',
      ['uResolution', 'uNear', 'uFar', 'uStrength', 'uThreshold', 'uInk', 'uRays'], ['depthSampler', 'raysSampler'],
      1, camera, Constants.TEXTURE_BILINEAR_SAMPLINGMODE, engine, false, null, Constants.TEXTURETYPE_HALF_FLOAT);
    this.post.samples = samples;
    // The scene's depth, resolved from MSAA with the colour; and the rays at
    // half the size, re-made with the image.
    this.post.onSizeChangedObservable.add(() => this._targets());
    // One rays shader for every preset (the sample count is a uniform): a
    // count compiled in as a define was a new program at each preset switch.
    this._renderer = new EffectRenderer(engine);
    this._raysFx = new EffectWrapper({
      engine, name: 'rays', fragmentShader: RAYS_FRAGMENT, uniformNames: ['uSun', 'uSteps'], samplerNames: ['sceneSampler', 'depthSampler'],
      defines: [`#define RAYS_MAX ${RAYS_MAX}`],
    });
    this._raysFx.onApplyObservable.add(() => {
      const fx = this._raysFx.effect;
      fx.setFloat2('uSun', this._sun.x, this._sun.y);
      fx.setFloat('uSteps', this._raysSteps);
      fx.setTexture('sceneSampler', this._scene);
      fx.setTexture('depthSampler', this._depth);
    });
    // Rays drawn once the scene is done (this fires after the pass has bound
    // its own output, which is bound again afterwards).
    this.post.onActivateObservable.add(() => this._drawRays());
    this.post.onApply = (fx) => {
      fx.setFloat2('uResolution', this.post.width, this.post.height);
      fx.setFloat('uNear', camera.minZ);
      fx.setFloat('uFar', camera.maxZ);
      fx.setFloat('uStrength', this.strength);
      fx.setFloat('uThreshold', 0.035);
      fx.setFloat3('uInk', INK[0], INK[1], INK[2]);
      fx.setFloat3('uRays', this._rays[0], this._rays[1], this._rays[2]);
      fx.setTexture('depthSampler', this._depth);
      fx.setTexture('raysSampler', this._raysTex);
    };
  }

  _targets() {
    const input = this.post.inputTexture;
    // Single-sample depth + stencil: the resolve target of the MSAA buffer's
    // own depth-stencil (a blit needs matching formats).
    input.createDepthStencilTexture(0, false, true, 1, Constants.TEXTUREFORMAT_DEPTH24_STENCIL8);
    input.resolveMSAADepth = true;
    this._raysRT?.dispose();
    this._raysRT = this.engine.createRenderTargetTexture({ width: Math.max(1, input.width >> 1), height: Math.max(1, input.height >> 1) }, {
      type: Constants.TEXTURETYPE_HALF_FLOAT, generateDepthBuffer: false, generateMipMaps: false, samplingMode: Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
    });
    this._scene = new ThinTexture(input.texture);
    this._depth = new ThinTexture(input.depthStencilTexture);
    this._raysTex = new ThinTexture(this._raysRT.texture);
  }

  /**
   * Per frame, before the pass: where the sun is on screen, how visible the
   * rays are (faded over about a second when switched by the preset or the
   * governor, out when the sun is behind or far off screen), and the rays.
   */
  _drawRays() {
    const p = this._p.copyFrom(this.sunDir).scaleInPlace(300).addInPlace(this.camera.position);
    Vector3.TransformCoordinatesToRef(p, this.camera.getTransformationMatrix(), p);
    const now = performance.now(), dt = Math.min(0.1, (now - (this._raysAt ?? now)) / 1000);
    this._raysAt = now;
    const want = this.raysSamples > 0 && this.raysAllowed ? 1 : 0;
    this._raysMix += (want - this._raysMix) * (1 - Math.exp(-4 * dt));
    const facing = p.z < 1 ? 1 : 0;
    const off = Math.max(Math.abs(p.x), Math.abs(p.y));
    const t = Math.min(1, Math.max(0, (off - 1.2) / 1.0)), fade = 1 - t * t * (3 - 2 * t);
    const visible = this._raysMix * facing * fade;
    const k = RAYS_STRENGTH * visible;
    this._rays[0] = RAYS_COLOR[0] * k; this._rays[1] = RAYS_COLOR[1] * k; this._rays[2] = RAYS_COLOR[2] * k;
    if (visible <= 0.001 || !this._raysFx.effect.isReady()) return;
    this._sun.x = p.x * 0.5 + 0.5; this._sun.y = p.y * 0.5 + 0.5;
    const target = this.engine._currentRenderTarget;
    this._renderer.render(this._raysFx, this._raysRT);
    if (target) this.engine.bindFramebuffer(target, 0, undefined, undefined, this.post.forceFullscreenViewport);
  }

  /**
   * A preset change, in place: rebuilding the pass instead put it after the
   * post pipeline in the camera's chain and recompiled its shaders.
   */
  configure({ samples, rays }) {
    this.raysSamples = rays;
    if (rays > 0) this._raysSteps = rays;
    if (this.post.samples === samples) return;
    this.post.samples = samples;
    // The resolved depth target belongs to the MSAA buffer it was made with.
    if (this.post.inputTexture) this._targets();
  }

  dispose() {
    this.post.dispose(this.camera);
    this._raysRT?.dispose();
    this._raysFx.dispose();
    this._renderer.dispose();
  }
}
