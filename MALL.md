# Shopping mode: Hikari Mall

A trip to a big mall, started from the title screen ("Shopping mode"). She
arrives by car in the parking lot, takes a shopping cart at the supermarket,
fills it from the shelves, tries clothes on in the fitting rooms, pays, loads
everything into her car's boot and drives away. Residents (the same people as
in the city) shop around her. Read `CLAUDE.md` first: phone performance, no
leaks, clean code, same style as the rest of the game.

## Modules and owners

| File | What | Owner |
|---|---|---|
| `src/mall/MallMode.js` | start / finish a trip, pausing the city, prompts, wallet, HUD, receipt | integrator |
| `src/mall/MallCatalog.js` | products and clothes (data) | integrator |
| `src/mall/MallWorld.js` (+ helpers) | the site: building, lot, shops' fixtures, lighting, doors, collisions, `layout` | world |
| `src/mall/MallShopping.js` (+ `Cart.js`, `Checkout.js`, `Boot.js`…) | carts, taking products, checkout, bags, loading the car, driving away | shopping |
| `src/mall/MallFashion.js` (+ `FittingRoom.js`…) | racks, carrying clothes, fitting rooms, the clothing till | fashion |
| `src/mall/MallShoppers.js` | resident shoppers with carts / baskets | shoppers |

Each module is constructed by MallMode with the shared **context** (below) and
implements:

```js
class X {
  constructor(ctx)          // no heavy work
  async init()              // build meshes / load models (behind the loading veil)
  update(dt)                // per frame while the trip runs
  prompt()                  // → { label, icon?, priority, distance, run() } | null : the action she can do now
  get busy()                // true while an animation owns her (controls off)
  dispose()                 // frees everything it made
}
```
MallMode shows the best prompt (highest priority, then nearest) on one action
button (**F** on desktop, tap on touch) and calls its `run()`.

## Shared context (`ctx`)

`scene, engine, camera, graphics, collision, state, ui, input, player,
character, animation, cameraRig, vehicles, shops, audio, world (MallWorld),
layout (= world.layout), wallet, hud, effects`

- `wallet`: `{ coins, spend(n) → bool, receipt: [{ id, name, price, qty }], add(item) }`
  (money for this trip, `TRIP_BUDGET` from the catalog).
- `hud`: `{ toast(title, sub), panel(name, html|null) }` small DOM helpers;
  modules add their own DOM under `#ui` and remove it in `dispose()`.
- Heroine hooks: `animation.act.hands = { wl, wr, l:[x,y,z], r:[x,y,z] }` puts
  both hands on world points (cart handle, hangers); `act.reach / holdR / bag /
  crouch / carry` as in the walk-in shops; `player.restrict = { maxSpeed, jump }`
  limits her while pushing a cart; `player.hold = true` freezes her for an
  animation; `player.autoWalk = { x, z, done }` walks her to a point.
- Residents: `createResident(look)` / `animateResident` / `disposeResident` from
  `src/npcs/NPCModels.js`; looks from `NPC_SPECS` (`src/npcs/NPCDefinitions.js`).
- Vehicles: `vehicles` (VehicleSystem) — her car is a normal drivable vehicle
  created for the trip (shopping owns it).
- Products: `productMesh(scene, id)` / `lookFor` / `SHAPE_W` in
  `src/interiors/Products.js` (extend with the catalog's new shapes).

## Layout (`world.layout`, all world coordinates, metres; y up, yaw like the player: forward = (sin yaw, cos yaw))

```js
{
  origin: { x, z },                    // the site's centre
  bounds: { x0, z0, x1, z1 },          // whole site: she stays inside
  building: { x0, z0, x1, z1, floorY, ceilingY },
  spawn: { x, z, yaw },                // next to her car, on arrival
  car: { x, z, yaw, model: 'car_kei_pink' },  // her parking bay
  exit: { x0, z0, x1, z1 },            // driving into this ends the trip
  entrances: [{ x, z, yaw, w }],       // automatic doors (lot ↔ hall)
  cartCorrals: [{ x, z, yaw, count, slots: [{ x, z, yaw }] }],
  grocery: {
    zone: { x0, z0, x1, z1 },
    shelves: [{ id, aisle, x, z, yaw, w, depth, levels: [y, …], face: { x, z } }],
    bins: [{ id, aisle, x, z, yaw, w, depth, y }],      // produce tables, freezer chests
  },
  checkouts: [{ id, stop: { x, z, yaw }, belt: { from: [x,y,z], to: [x,y,z] }, register: [x,y,z],
                cashier: { x, z, yaw }, bagging: [x,y,z], exit: { x, z } }],
  fashion: {
    zone: { x0, z0, x1, z1 },
    racks: [{ id, rack, x, z, yaw, w, hooks: [[x,y,z], …] }],    // rack = CLOTHES[].rack
    fittingRooms: [{ id, door: { x, z, yaw }, inside: { x, z, yaw }, mirror: { x, y, z, yaw }, hook: [x,y,z], curtain: 'nodeName' }],
    till: { stand: { x, z, yaw }, register: [x,y,z], cashier: { x, z, yaw } },
  },
  nav: { nodes: [[x, z], …], links: [[a, b], …] },   // walkable graph (shoppers, carts)
  lot: { bays: [{ x, z, yaw }], walkways: [{ x0, z0, x1, z1 }] },
}
```

## Rules

- Same coordinates convention, materials and look as the city (PBR +
  `CelLighting` is automatic; casters via `graphics.addCasters`; static meshes
  frozen; thin instances for repeats; shared materials; no per-frame
  allocations).
- Everything a module creates is disposed in its `dispose()`.
- Test with `?autostart` replaced by `?mall` (MallMode starts a trip directly).
- Don't edit another module's files; ask the integrator (in your report) for
  changes elsewhere.
