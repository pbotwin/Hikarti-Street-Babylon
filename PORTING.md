# Porting contract (three.js original → Babylon.js)

The original game is `C:\Users\vmikava\Desktop\t1` (three.js r170). This repo is the
same game on Babylon.js 9. **Goal: identical gameplay, content, look and feel; only
the framework changes.** Read the original module, then port it line-for-line in
spirit: same class names, constructor options, public methods/fields, events,
constants, tuning numbers, timings, DOM/UI and CSS class names.

## Ground rules
- `src/main.js` is wired exactly like `t1/src/main.js`. Systems are constructed with
  the same option objects (plus Babylon extras such as `graphics`). Files under `src/`
  that start with `// PLACEHOLDER` are stubs waiting for your port — replace them.
- Don't edit files owned by another area. If you need something from the core (player,
  animation, character, camera, graphics, world, main.js), note it in your final report;
  small additive edits to `main.js` lines for *your own* systems are fine (use Edit).
- Scene is **right-handed** (`scene.useRightHandedSystem = true`): world coordinates,
  yaw conventions and `rotation.y` behave exactly like three.js. **Euler order differs**:
  Babylon `node.rotation` is applied YXZ; three's default is XYZ. When the original
  sets x/z rotation together with y, use `node.rotationQuaternion = Quaternion.FromEulerAngles…`
  built in XYZ order (`Qx·Qy·Qz`), or nest nodes.
- Math: Babylon `Vector3/Quaternion/Matrix/Color3`. Pure-logic code (state machines,
  timers, AI, collision) should keep the original's structure and numbers.
- Colours: three r170 treats hex colours as sRGB and lights in linear. In Babylon use
  `Color3.FromHexString(hex).toLinearSpace()` for PBR albedo/emissive so colours match.
- Materials: `PBRMaterial` (metallic/roughness like MeshStandardMaterial) for lit things;
  `StandardMaterial` with `disableLighting = true` + emissiveColor (or PBR `unlit = true`)
  for MeshBasicMaterial. Share/cache materials. Freeze materials/world matrices of static things.
- Instancing: three `InstancedMesh` → Babylon thin instances (`mesh.thinInstanceSetBuffer('matrix', …)`).
- Shadows: `graphics.addCasters(meshes)`; receivers `mesh.receiveShadows = true`.
- Characters (VRM): `loadVrm(scene, url)` from `src/player/Vrm.js` → `{ root, rig, bones, meshes, json, setExpression, height }`.
  `rig.setEuler(bone, x, y, z)` sets a *normalized* humanoid bone rotation (XYZ order,
  same values the original applied to `vrm.humanoid.getNormalizedBoneNode(bone).rotation`),
  `rig.setHips(x,y,z)` the hips offset. Root faces +Z.
- Static content already exported from the original (do not rebuild it):
  - `public/world/city.opt.glb` – the whole city *without* animated pieces (train, LED screen,
    butterflies, birds, petals, aviation light points are left out — they must be live objects).
  - `public/world/interior-<kind>.opt.glb` – each shop interior room (no goods, no staff);
    doors are nodes `door-<i>`, `turntable`, `name-sign`, the street view panel material `street-view`.
  - `public/world/train.opt.glb` – the overpass train (at its own origin).
  - `public/world/city.json` – collision boxes, spawn, fragments, portal, shops, shopSpots, places
    (resident places), rooms (slots/seats/counter/entry/exit/origin/w/d/doors…), vehicle specs
    (type/x/z/ry/model/paint/showroom — `build` functions were not exported: map `model`/`type`
    to the glTF models in `public/models/vehicles|props` like the original's builders do),
    districts, sun direction, train {y,z}.
  - Models: `public/models/{heroine.vrm, npc/*.vrm, props/*.glb, vehicles/*.glb}`.
  - Load glb: `SceneLoader.ImportMeshAsync('', './models/vehicles/', 'car_sedan.glb', scene)` or
    `LoadAssetContainerAsync` + `instantiateModelsToScene` for copies. Meshopt is configured in City.js.
- Testing: run your own Vite dev server on your assigned port
  (`npx vite --port <port> --strictPort` in this folder) and drive Chrome with playwright-core:
  `import { chromium } from 'file:///C:/Users/vmikava/Desktop/t1/node_modules/playwright-core/index.mjs'`,
  `chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false })`.
  `?autostart&gfx=high` skips the title. `window.__game` exposes every system (see main.js).
  The original runs on http://localhost:5173 (`?autostart`) for side-by-side screenshots
  (its `window.__game` has the same names). Put scratch files in your scratchpad, not in the repo.
- Keep code style like the surrounding code (ES modules, 2-space indent, terse comments).
- Do not commit; the integrator commits.
