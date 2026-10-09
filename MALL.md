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
| `src/mall/MallWorld.js` (+ helpers) | the site: building, lot, shops' fixtures, lighting, doors, escalators and lift (`Escalators.js`, `GlassLift.js`, `Ride.js`), collisions, `layout` | world |
| `src/mall/MallShopping.js` (+ `Cart.js`, `Checkout.js`, `Boot.js`…) | carts, taking products, checkout, bags, loading the car, driving away | shopping |
| `src/mall/MallFashion.js` (+ `FittingRoom.js`…) | racks, carrying clothes, fitting rooms, the clothing till | fashion |
| `src/mall/MallShops.js` (+ `ShopTill.js`) | the small shops' goods, clerks and tills: taking, ordering, paying, paper bags | world |
| `src/mall/MallShoppers.js` | resident shoppers with carts / baskets, strolling round the small shops | shoppers |

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
layout (= world.layout), fashion (MallFashion), wallet, hud, effects`

- `wallet`: `{ coins, spend(n) → bool, receipt: [{ id, name, price, qty }], add(item) }`
  (money for this trip, `TRIP_BUDGET` from the catalog).
- `hud`: `{ toast(title, sub), panel(name, html|null) }` small DOM helpers;
  modules add their own DOM under `#ui` and remove it in `dispose()`.
- `corrals` (MallShopping): the corrals' nested carts, shared by her and the
  shoppers: `end(corral, full)` the open end's last full / first free slot,
  `lend(corral)` takes that cart out, `nestBack(corral, cart)` puts one back.
- `fashion.addBag(mesh, items)`: a paid bag from another shop into her hand
  (it goes to the cart and the boot with the clothing store's bags).
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
  cartCorrals: [{ x, z, yaw, count, slots: [{ x, z, yaw }] }],   // slots from the closed end to the open one (carts face the closed end); the first `count` hold carts
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
  nav: { nodes: [[x, z, y], …], links: [[a, b], …], rides: [[from, to, ride], …] },
  //   walkable graph (shoppers, carts): lot, courts, concourse, the anchors, every small shop, the upper
  //   floor (nodes with y = upper.y); `rides` are the escalators, one way (an index into `rides` below).
  //   MallWorld builds one MallNav on it (`world.nav`), shared by the shoppers and her scripted walks:
  //   path(x0, z0, x1, z1, out, y0, y1) finds routes on and between the floors (a point reached by a
  //   ride has its index in `ride`; `world.escalators.rider()/carry()` move a shopper along it)
  lot: { bays: [{ x, z, yaw }], walkways: [{ x0, z0, x1, z1 }] },
  concourse: {
    zone: { x0, z0, x1, z1 },                          // the ground floor's walk between the shop row and the anchors
    atrium: { x0, z0, x1, z1 },                        // its middle, open to the skylight (fountain, escalators, lift, trees)
    storefronts: [{ kind, x, z, yaw, w }],             // a spot before each small shop's window, facing it (window shopping)
  },
  upper: { y, ceilingY, zone: { x0, z0, x1, z1 }, void: { x0, z0, x1, z1 } },   // the upper floor: galleries round the atrium (void)
  shops: [{                                            // every walk-in shop but the anchors: the shop row's nine, the upper floor's rooms
    kind, name, y,                                     // y: its floor (0 or upper.y)
    zone: { x0, z0, x1, z1 }, door: { x, z, yaw, w },  // the room; its doorway (yaw facing out to the concourse / gallery)
    tills: [{ name, top, counter: { x0, z0, x1, z1 }, face: { x, z },   // face: from the clerk toward the customer
              clerk: { x, z, yaw }, lay: [x,y,z], bag: [x,y,z], register: [x,y,z],
              goods: [{ id, x, y, z, yaw, pick: { x, z, yaw } }] }],    // sold from behind the counter (MallCatalog SHOP_GOODS)
    goods: [{ id, x, y, z, yaw }], table: { x0, z0, x1, z1, top } | null, // on its display table, taken by her
    browse: [{ x, z, yaw }], buy: { x, z, yaw },       // where shoppers look round / pay
  }],
  rides: [{ id, up, from: { x, z, y }, to: { x, z, y }, yaw }],   // the escalators' ends (where riders get on / off)
  lift: { shaft: { x, z, r }, floors: [{ x, z, y, yaw }] },       // the glass lift; where she calls it on each floor
}
```

## The site (MallPlan, world)

A two-storey mall (AEON / LaLaport style) on a parking lot. From the lot,
two glazed entrance portals (automatic doors, canopies) lead through
entrance courts in the **shop row** — nine small shops whose fronts face the
concourse: a bookshop, electronics, a drugstore, a 100-yen shop, a bakery
café (glazed to the lot too), toys, shoes, a ramen bar, a game centre —
into the **concourse**: a terrazzo walk with the upper floor's galleries
round an **atrium** under a glazed lantern (escalators to a bridge, a glass
lift, a fountain under a ring light, trees, the information desk, a crêpe
stand, capsule toys, photo booths, vending machines, the season's
banners). The **anchors** open onto it from the far side: Hikari Fresh
Market and Sakura Style, the service front (restrooms) between them. Every
small shop is walked into (an open doorway in its glass front): a
furnished room, a clerk at its till, goods to buy (MallShops: "Take" from
a display table and "Pay" at the till, or "Order" across the counter;
the clerk bags it, she taps her card and takes the paper bag). The
**upper floor** is walked too: she rides the escalators (walking onto a
band's landing plate; the stick walks her up the steps) or the glass
lift ("Lift"); its galleries and the bridge have balustrades, and four
rooms open off them (`UPPER_ROOMS`: the food court with two stalls, the
cinema's lobby, a tea house, a bag shop); the other upper fronts are
windows onto a picture of the shop. Shoppers stroll round the small
shops too, upstairs by escalator. Everything standing on the
concourse floor is listed by `concourseObstacles()` (collisions; the walk
graph keeps 0.45 m clear of it, tested in `scripts/mall-plan.test.mjs`).

## Rules

- Same coordinates convention, materials and look as the city (PBR +
  `CelLighting` is automatic; casters via `graphics.addCasters`; static meshes
  frozen; thin instances for repeats; shared materials; no per-frame
  allocations).
- Everything a module creates is disposed in its `dispose()`.
- Test with `?autostart` replaced by `?mall` (MallMode starts a trip directly).
- Don't edit another module's files; ask the integrator (in your report) for
  changes elsewhere.
