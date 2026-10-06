import { Quaternion } from '@babylonjs/core';
import { L } from './Layout.js';
import { exclusive } from './CityParts.js';
import { quatXYZ } from './Instances.js';

/**
 * The street props that move in the original (the Props.js / CityExtension
 * updaters), driven on the exported parts tagged `anim`: pedestrian signals
 * cycling green → blink → red, the café's noren curtain swaying, alley
 * lanterns swinging on their strings, the park fountain's water shimmering
 * and the canal's colour breathing.
 */

/** three.js Color.setHSL (working-space values, as the original passed them). */
function hslToRef(h, s, l, c) {
  const q = l <= 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1; else if (t > 1) t -= 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * 6 * (2 / 3 - t) : p;
  };
  c.set(f(h + 1 / 3), f(h), f(h - 1 / 3));
  return c;
}

export class PropMotion {
  /** @param anim the city's animated parts by tag (City.js parts.anim) */
  constructor(scene, anim) {
    this.scene = scene;
    this.owned = [];   // materials made exclusive to one part
    this.updaters = [];
    this._signals(anim.signalRed || [], anim.signalGreen || []);
    if (anim.noren) this._noren(anim.noren[0]);
    if (anim.lantern) this._lanterns([...anim.lantern, ...(anim.lanternCap || [])]);
    if (anim.fountainWater) this._fountain(anim.fountainWater[0]);
    if (anim.canalWater) this._canal(anim.canalWater[0]);
  }

  update(dt) {
    for (let i = 0; i < this.updaters.length; i++) this.updaters[i](dt);
  }

  dispose() {
    for (const m of this.owned) m.dispose();
    this.owned.length = 0;
    this.updaters.length = 0;
  }

  /** The material of `meshes`, theirs alone. */
  _own(meshes) {
    return exclusive(this.scene, meshes[0].material, meshes, this.owned);
  }

  // ---- Pedestrian signals: green → blink → red, ~20 s cycle per crossing
  _signals(reds, greens) {
    const crossing = (m) => L.crosswalks.reduce((a, b) => (Math.abs(m.position.z - b) < Math.abs(m.position.z - a) ? b : a));
    for (const cz of L.crosswalks) {
      const red = reds.filter((m) => crossing(m) === cz), green = greens.filter((m) => crossing(m) === cz);
      if (!red.length || !green.length) continue;
      const redMat = this._own(red), greenMat = this._own(green);
      let t = cz * 0.37;
      this.updaters.push((dt) => {
        t = (t + dt) % 20;
        const on = t < 9 ? 1 : t < 12 ? (Math.floor(t * 4) % 2) : 0;
        greenMat.emissiveIntensity = on * 2.2;
        redMat.emissiveIntensity = on ? 0 : 2.4;
      });
    }
  }

  // ---- Café noren: gentle sway around its rail -------------------------
  _noren(noren) {
    // The export caught it mid-sway; the original sways about rotation (0, π/2, 0).
    const q = noren.rotationQuaternion || (noren.rotationQuaternion = new Quaternion());
    const amp = 0.05, speed = 1.3;
    let t = Math.random() * 10;
    this.updaters.push((dt) => {
      t += dt;
      quatXYZ(Math.sin(t * speed * 0.7) * amp, Math.PI / 2, Math.sin(t * speed) * amp * 0.3, q);
    });
  }

  // ---- Alley lanterns swinging on their strings ------------------------
  _lanterns(parts) {
    // Each lantern body and cap hangs from a string point (their parent node),
    // numbered like the original's loop so every lantern keeps its phase.
    const A = L.alley, points = [];
    for (let x = 11; x < A.x1 - 2; x += 3.2) for (let k = 0; k < 3; k++) points.push([x, A.z0 + 1.0 + k * ((A.z1 - A.z0 - 2) / 2)]);
    const dist = (n, [x, z]) => Math.hypot(n.position.x - x, n.position.z - z);
    const index = (n) => points.reduce((best, p, i) => (dist(n, p) < dist(n, points[best]) ? i : best), 0);
    const lanterns = [...new Set(parts.map((m) => m.parent))].map((node) => ({
      i: index(node), q: node.rotationQuaternion || (node.rotationQuaternion = new Quaternion()),
    }));
    let time = 0;
    this.updaters.push((dt) => {
      time += dt;
      for (let k = 0; k < lanterns.length; k++) {
        const { i, q } = lanterns[k];
        quatXYZ(Math.sin(time * 1.4 + i * 0.7) * 0.07, 0, Math.sin(time * 1.1 + i) * 0.05, q);
      }
    });
  }

  // ---- Park fountain: shimmering, faintly bobbing water ----------------
  _fountain(water) {
    const mat = this._own([water]);
    let t = 0;
    this.updaters.push((dt) => {
      t += dt;
      water.position.y = 0.5 + Math.sin(t * 2) * 0.005;
      hslToRef(0.55, 0.38, 0.45 + Math.sin(t * 1.3) * 0.02, mat.albedoColor);
    });
  }

  // ---- Mizuki Canal: the water's colour breathes slowly ----------------
  _canal(water) {
    const mat = this._own([water]);
    let time = 0;
    this.updaters.push((dt) => {
      time += dt;
      hslToRef(0.5, 0.22, 0.52 + Math.sin(time * 0.3) * 0.018, mat.albedoColor);
    });
  }
}
