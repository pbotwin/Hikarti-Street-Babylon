/**
 * Per-model driving data. Vehicle space: faces +Z, +X is the vehicle's left,
 * origin on the ground at the body centre. Japan drives on the left, so cars
 * are right-hand drive: the driver sits at -X and gets in from that side.
 *
 * model     the Blender GLB (public/models/vehicles) when the spec names
 *           none; seats, grips, pedals, doors and handles are its markers
 * physics   mass kg, power W, maxForce N (traction-limited launch), top m/s,
 *           grip μ, cgH centre-of-gravity height, drive axle
 * cam       chase camera zoom (× normal distance) and pivot lift
 */
export const VEHICLE_TYPES = {
  sedan: {
    kind: 'car', model: 'car_sedan', name: 'Saloon',
    physics: { mass: 1650, power: 150e3, maxForce: 7200, top: 33, grip: 1.05, cgH: 0.5, drive: 'rear', brake: 0.95 },
    cam: { zoom: 1.45, lift: 0.0 }, engine: { idle: 32, max: 150, gears: 5 },
  },
  minivan: {
    kind: 'car', name: 'Minivan',
    physics: { mass: 1950, power: 110e3, maxForce: 7000, top: 27, grip: 0.95, cgH: 0.78, drive: 'rear', brake: 0.85 },
    cam: { zoom: 1.6, lift: 0.35 }, engine: { idle: 28, max: 120, gears: 4 },
  },
  keiVan: {
    kind: 'car', name: 'Kei van',
    physics: { mass: 950, power: 47e3, maxForce: 4200, top: 23, grip: 0.9, cgH: 0.72, drive: 'rear', brake: 0.85 },
    cam: { zoom: 1.4, lift: 0.25 }, engine: { idle: 40, max: 190, gears: 4 },
  },
  keiCar: {
    kind: 'car', name: 'Kei car',
    physics: { mass: 880, power: 47e3, maxForce: 4000, top: 24, grip: 0.95, cgH: 0.62, drive: 'front', brake: 0.9 },
    cam: { zoom: 1.35, lift: 0.15 }, engine: { idle: 40, max: 190, gears: 4 },
  },
  van: {
    kind: 'car', name: 'Delivery van',
    physics: { mass: 2300, power: 105e3, maxForce: 7600, top: 26, grip: 0.9, cgH: 0.85, drive: 'rear', brake: 0.8 },
    cam: { zoom: 1.75, lift: 0.45 }, engine: { idle: 26, max: 110, gears: 4 },
  },
  scooter: {
    kind: 'bike', style: 'scooter', name: 'Scooter', model: 'bike_scooter',
    physics: { mass: 105, power: 3.4e3, maxForce: 900, top: 15, grip: 0.95, cgH: 0.55, brake: 0.8 },
    cam: { zoom: 1.05, lift: -0.05 }, engine: { idle: 55, max: 210, gears: 1 },
  },
  motorcycle: {
    kind: 'bike', style: 'moto', name: 'Motorcycle', model: 'bike_moto',
    physics: { mass: 190, power: 35e3, maxForce: 2600, top: 34, grip: 1.05, cgH: 0.6, brake: 1.0 },
    cam: { zoom: 1.1, lift: 0.0 }, engine: { idle: 50, max: 260, gears: 5 },
  },
  bicycle: {
    kind: 'bike', style: 'bicycle', name: 'Bicycle', model: 'bike_bicycle',
    physics: { mass: 20, power: 260, maxForce: 230, top: 8, grip: 0.85, cgH: 0.9, brake: 0.7 },
    cam: { zoom: 1.0, lift: -0.05 }, engine: null,
  },
};
