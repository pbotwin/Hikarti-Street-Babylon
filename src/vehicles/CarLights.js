import { Color3 } from '@babylonjs/core';

/**
 * Working lamps for every car, driven by its state (read-only on vehicles):
 *  - parked cars are switched off: dark lenses, no glow
 *  - engine on (being driven): headlamps + DRL lit, tail lamps on
 *  - braking: tail lamps (and high-mount stop lamp) flare bright
 *  - reversing: white reverse lamps on
 *  - turning: the indicators on that side blink (1.5 Hz); after a crash the
 *    hazards flash for a few seconds
 *  - no fake beams: the town is in daylight / golden hour, where real
 *    headlamps don't throw visible cones; fog lamps stay off
 * Lamp materials are cloned per car on first sight (so cars don't share
 * state); the rest of the car is untouched. Levels scale the emissive and
 * albedo colours in place: assigning a material property marks it dirty and
 * re-checks its shader, every frame.
 */
const ROLE = {
  headLamp: 'head', drl: 'drl', fogLamp: 'fog',
  tailLight: 'tail', reverseLamp: 'reverse', amber: 'amber',
  // Outer lenses glow too, so the light reads through the cover.
  tailLens: 'tailLens', lensGlass: 'headLens',
};

function set(lamps, level, offColor) {
  for (const c of lamps) {
    c.m.emissiveColor.copyFrom(c.emissive).scaleInPlace(level);
    // Lenses look darker when the lamp is off.
    c.m.albedoColor.copyFrom(c.albedo).scaleInPlace(offColor + (1 - offColor) * Math.min(1, level));
  }
}

export class CarLights {
  constructor(scene, state) {
    this.scene = scene;
    this.cars = new Map();
    this.t = 0;
    state?.on('vehicle:crash', ({ vehicle }) => { const c = this.cars.get(vehicle); if (c) c.hazard = 4; });
    state?.on('vehicle:removed', ({ vehicle }) => this._forget(vehicle));
  }

  /** A vehicle went away (VehicleSystem.remove): its lamp clones go too. */
  _forget(v) {
    const car = this.cars.get(v);
    if (!car) return;
    for (const lamps of Object.values(car.parts)) for (const l of lamps) l.m.dispose();
    this.cars.delete(v);
  }

  _setup(v) {
    const parts = { head: [], drl: [], fog: [], tail: [], reverse: [], amberL: [], amberR: [], tailLens: [], headLens: [] };
    const clones = new Map();
    for (const m of v.root.getChildMeshes(false)) {
      const role = ROLE[(m.material?.name || '').replace(/\.\d+$/, '')];
      if (!role) continue;
      // Indicators get one material per side so each side blinks on its own.
      let key = role;
      const bb = m.getBoundingInfo().boundingBox;
      // The clear lens material also covers the fog lamps (low on the
      // bumper): those stay unlit.
      if (role === 'headLens' && bb.maximum.y < 0.62) continue;
      if (role === 'amber') key = (bb.minimum.x + bb.maximum.x) / 2 >= 0 ? 'amberL' : 'amberR';
      const ck = m.material.uniqueId + key;
      if (!clones.has(ck)) {
        const cm = m.material.clone(m.material.name);
        if (key === 'tailLens') { cm.emissiveColor = Color3.FromHexString('#ff1420').toLinearSpace(); cm.emissiveIntensity = 1; }
        if (key === 'headLens') { cm.emissiveColor = Color3.FromHexString('#fff2dc').toLinearSpace(); cm.emissiveIntensity = 1; }
        const lamp = { m: cm, emissive: cm.emissiveColor.clone(), albedo: cm.albedoColor.clone() };
        clones.set(ck, lamp);
        parts[key].push(lamp);
      }
      m.material = clones.get(ck).m;
    }
    const car = { parts, hazard: 0, brakeK: 0, revK: 0, onK: 0 };
    this.cars.set(v, car);
    return car;
  }

  update(dt, vehicles) {
    this.t += dt;
    const blink = (this.t % 0.66) < 0.36 ? 1 : 0;
    for (const v of vehicles) {
      if (v.isBike) continue;
      const car = this.cars.get(v) || this._setup(v);
      const on = v.driven ? 1 : 0;
      const k = 1 - Math.exp(-dt * 12);
      car.onK += (on - car.onK) * (1 - Math.exp(-dt * 5));
      const braking = on && (v.brake > 0.08 || (v.handbrake && Math.abs(v.vF) > 0.5)) ? 1 : 0;
      car.brakeK += (braking - car.brakeK) * k;
      const reversing = on && (v.vF < -0.3 || (v.throttle < -0.05 && Math.abs(v.vF) < 2)) ? 1 : 0;
      car.revK += (reversing - car.revK) * k;
      car.hazard = Math.max(0, car.hazard - dt);
      const steer = v.steer, sp = Math.abs(v.vF);
      const turnL = on && steer > 0.18 && sp < 12, turnR = on && steer < -0.18 && sp < 12;
      const haz = car.hazard > 0;
      const p = car.parts;
      // Dipped headlamps and DRL: a soft glow, not a flashlight.
      set(p.head, car.onK * 1.0, 0.85);
      set(p.drl, car.onK * 0.9, 0.85);
      set(p.fog, 0, 0.3);           // unlit: a grey glass lens, not a white disc
      set(p.headLens, car.onK * 0.35, 1);
      set(p.tailLens, car.onK * 0.3 + car.brakeK * 2.2, 1);
      // Tail lamps: gentle position glow, brighter (not blinding) on the brake.
      set(p.tail, car.onK * 0.6 + car.brakeK * 2.6, 0.45);
      set(p.reverse, car.revK * 2.5, 0.85);
      set(p.amberL, (turnL || haz) && blink ? 1.6 : 0, 0.5);
      set(p.amberR, (turnR || haz) && blink ? 1.6 : 0, 0.5);
    }
  }
}
