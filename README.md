# Hikari Street · Babylon.js

A rebuild of Hikari Street on Babylon.js 9, next to the original three.js
game (`../t1`).

    npm install
    npm run dev        # http://localhost:5180  (?autostart, ?gfx=low|medium|high|ultra)

Press **I** in game for the Babylon Inspector.

## What is here (milestone 1)
- The whole city, exported once from the original game's builders
  (`public/world/city.opt.glb`, meshopt + WebP, ~9 MB) with the same
  collision boxes and layout data (`public/world/city.json`).
- Rendering: SkyMaterial golden-hour sky, image-based lighting from the sky,
  cascaded shadow maps, HDR pipeline (MSAA, bloom, ACES, colour curves,
  vignette, sharpen), SSAO2, SSR on Ultra; quality presets per device.
- The heroine (VRM 1.0) loaded with Babylon's glTF loader: own VRM support
  (humanoid normalized rig, expressions, node constraints), anime cel bands
  via a PBR material plugin, outlines.
- Movement, camera and procedural animation ported from the original.

## Still to port
Residents and their daily life, vehicles, shops and walk-in interiors,
side missions, fragments and portal, saving, minimap and menus, audio,
hair physics (spring bones), Android app.

## Re-exporting the city
Run the original game's dev server (`../t1`, port 5173) and the export
script; then compress:

    npx gltf-transform optimize raw/city.glb public/world/city.opt.glb --compress meshopt --texture-compress webp --texture-size 1024 --simplify false
