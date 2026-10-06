# Working on Hikari Street (Babylon.js)

Read this before changing anything. This is the Babylon.js version of the
three.js game in `../t1` — the same game, only the framework differs (see
`PORTING.md`). It must play smoothly on phones in a mobile browser: a locked
frame rate on flagship phones (Galaxy S25/S26 class, 120 Hz screens: an
8.3 ms frame) and never a stutter or a drop to 30 fps on mid-range ones.
Every change is judged by that.

## Code quality rules

- **Optimized, clean code only.** No quick hacks, dead code, debug leftovers,
  duplicated logic or "temporary" workarounds. If a change can't be done
  cleanly, stop and say so instead of piling on.
- **Read before you write.** Follow the style of the surrounding code (and of
  the original module in `../t1` you are porting): naming, comment density,
  module layout. Reuse existing helpers instead of writing new ones.
- **Small, focused modules.** One responsibility per file, a short doc comment
  saying what it is for and why, no hidden coupling through globals.
- **Comments explain why**, not what: the constraint, the bug it avoids, the
  measurement behind a number.
- **No new dependencies** without a clear need. Prefer what Babylon.js
  (`@babylonjs/core`, `loaders`, `materials`) already provides. Import from
  deep paths where it keeps the bundle small.
- **Never leave the game broken.** Run the checks below before every commit.

## Performance rules

Carried over from the original, where each was a real, measured slowdown,
translated to Babylon.

- **Skinned characters share one skeleton.** VRoid models have ~20 meshes;
  one `Skeleton` per character, shared by all its meshes (and by instantiated
  copies where the pose is shared). Per-mesh skeletons cost ~45% of a frame.
- **Keep the scene graph small.** Every node costs a world-matrix update per
  frame. Remove nodes nothing draws or poses; `freezeWorldMatrix()` static
  meshes, freeze static materials (`material.freeze()`), and skip whole
  subtrees that are hidden, far away or parked (`setEnabled(false)` /
  don't update them).
- **Triangles heat the phone.** Keep a frame (scene + shadows) well under
  ~2.5 million triangles on High. Dense assets get a simplified copy; distant
  repeats use LOD (`addLODLevel`) or impostors. Compare screenshots before and
  after every simplification.
- **Draw calls are the phone budget.** Aim for under ~500 on screen. Merge
  static props per material, use thin instances for repeated objects, share
  materials and textures (cache by design, not by instance).
- **Shadows are a second draw of everything.** Only meaningful casters go into
  the shadow generator (`graphics.addCasters`); tiny parts, face details and
  outlines don't. Heavy decoration is tied to the graphics preset. Shadow maps
  refresh on a budget, not freely every frame.
- **No first-use stutters.** Shaders compile and geometry uploads on first
  draw. Everything in the scene at load is made ready behind the loading
  screen (`scene.whenReadyAsync`, `forceCompilationAsync`); anything created
  later must share materials with something already compiled, or be compiled
  during loading too.
- **Full-screen passes cost fill rate on phones.** Use the one
  `DefaultRenderingPipeline`; don't add post-processes when an existing pass
  can do the job. Expensive ones (SSAO, SSR) belong to high presets only.
- **No per-frame allocations** in update or render paths: reuse vectors,
  quaternions and matrices (`…ToRef`, `…InPlace`, module-level scratch
  objects — watch for scratch objects being overwritten by a call in between).
- **No leaks.** Every mesh, material, texture, render target and observer has
  an owner that disposes / removes it when it goes away. Never create GPU
  objects in an update loop; create once and reuse. GPU object counts and the
  JS heap must stay flat on an identical lap.
- **Level of detail for distance**: animation rate, outlines, cabin detail and
  vehicle models all drop off with distance. New systems should do the same.
- **Mind memory on iOS.** Safari kills tabs that use too much GPU memory.
  Don't add large textures without need.
- **Graphics presets** (`src/core/Graphics.js`, `GraphicsSettings.js`) are the
  place for quality trade-offs. Don't hard-code a cost that weak phones can't
  turn off.
- **Adaptive performance** (`src/core/AdaptivePerformance.js`) owns the frame
  rate and keeps the phone cool (frame-rate mode, governor lowering render
  scale / shadows / resident distance). New costly effects get a switch the
  governor can turn off, and nothing may bypass the frame cap (render only
  from the main loop). Quality drops last for the session only.

## Measure, don't guess

- The FPS readout is in the top-left corner. Check it on every preset, not only
  on a fast PC.
- Draw calls / triangles: `SceneInstrumentation` / `EngineInstrumentation`,
  or the Inspector (Shift+I).
- Profile with Chrome DevTools (CPU 4×, 390×844). Find the cause before fixing.
- Compare with the original (`../t1`, `npm run dev` there on :5173) from the
  same camera positions.

## Definition of done (every change, every assistant)

1. **Root cause first.** Measure, then fix the cause, not the symptom.
2. **No leaks.** GPU objects and the JS heap stay flat on a repeated lap.
3. **No stutters.** Nothing compiles or uploads during play.
4. **No regressions.** Frame time, draw calls and triangles measured before
   and after on the same machine.
5. **No visual regressions**, and matching the original: screenshots from
   fixed cameras compared side by side.
6. **No dead code or experiments left behind.**
7. **All checks below pass.** Only then commit.

## Checks before every commit

```bash
npm run dev      # play it: ?autostart skips the title, ?gfx=low|medium|high|ultra
npm run build
```
