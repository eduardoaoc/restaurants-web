# Phase 3.1K-D2C — MVP visual cleanup & camera stabilization

Scope: the isolated Ultimate demo room (`/dev/restaurant-3d-fixture`, `?environment=ultimate` on the operational route in
dev). The main Dashboard, `restaurants-api`, persisted layouts, wall animation and the KayKit scene are untouched. No
new asset pack, no dependency, no lighting/day-night work, no commit or push.

## Changes

### 1. Vegetation clean-up
- **Street trees: 39 → 6–10** (7 on the default street), only within 21 m of the door line, irregular spacing (5.5–7.5 m),
  never within 3.4 m of the door. **Far-side trees 49 → ~5**. **Trees behind/around the restaurant: 26 → 0** (`lotTrees`
  removed from the plan, renderer and nav obstacles). Terrace plants, hedges and planters are unchanged.
- **Tree proportions** (`TREE_SHAPE`, procedural, no asset): the round ball is gone. The crown is an oval, taller than wide
  (0.82 × 1.2 m radii), widened/slimmed per tree (`w` 0.85–1.2), with a lower side lobe that leans left or right per tree
  (`flip`) and a small top tuft; the trunk is 2.0 m. Still one instanced mesh per part, still tinted from three greens.
- **Spawn trees preserved:** the occlusion maths (`tree-cover.ts`) uses the very same shape constants, so cover is still
  computed from what is drawn. With fewer trees, every one of the four entrance walls still has ≥ 3 fully hidden spots on
  desktop and phone views (tested).

### 2. "Centrar vista"
- A visible, keyboard-focusable pill (44 px high, crosshair SVG, i18n `floorLayout.recenterView` in es-ES "Centrar vista",
  ca-ES-valencia "Centrar la vista", en-GB "Centre view") in the top-right of the 3D scene, for every non-stage scene.
- `CameraRig.recenter()` eases to the fitted three-quarter overview of the floor, terrace and street context for the
  *current* canvas (same fit as the initial/"Vista general" framing), with the distance and target clamped to the camera
  limits from D2B. It works after orbit, zoom, pan and table focus (it releases the focus and the pre-focus "home" pose so the
  camera is not pulled back afterwards; the table sheet closes).
- It runs only on the click: nothing resets the view after a user interaction. After it, the view counts as "fitted"
  again, so only then may a window resize re-fit it (same rule as at load).
- Reduced motion: it reuses the rig's `moveTo`, which applies the pose instantly when `prefers-reduced-motion` is set; the
  button's own hover transition is disabled too.
- Desktop and mobile verified (1440, 1280, 390, 375): from a pose orbited ~140°, zoomed out and panned, one tap returns to the
  default framing (`orbited-*.png` → `recentered-*.png`).
- While a table sheet is open (a modal) the button is behind it by design; close the sheet first (the camera returns to
  its pre-focus pose) or just use the button afterwards.

## Guest navigation validation
Full simulated arrival → seat → departure, stepped deterministically, for the entrances south `(-5.5, 7.6)`, west
`(-9.4, 3.1)`, east `(9.4, -2.3)` and north `(4.2, -7.4)`:

| Entrance | Spawn (behind a tree) | Departure end (hidden spot) | Nav failures | Console errors | After resume |
|---|---|---|---|---|---|
| south | (-21.5, 10.3) | (-0.5, 10.2) | 0 | 0 | paths 0, leaving 0, pending 0, queued 0, chairs 0 |
| west | (-13.6, -12.9) | (-13.7, 8.2) | 0 | 0 | same |
| east | (12.1, 12.5) | (12.4, -8.7) | 0 | 0 | same |
| north | (19.0, -11.8) | (-2.1, -11.6) | 0 | 0 | same |

Unit level (`tests/frontend-tree-cover.mjs`): for all four walls × desktop and phone views × 12 guests, the spawn is fully
hidden from the reference camera, the route stays on the sidewalk, never crosses a tree bed, enters through the doorway and
ends on the entrance; departure mirrors it and ends hidden; blocked door / walled-off sidewalk still fail safely (no
teleport); no-camera fallback uses the soft ease. Indoor/outdoor A* code was not changed.

## Operational features preserved
No change to table IDs/mapping, selection, alerts, guest sessions, the layout editor, entrance configuration, layout
revisions or realtime wiring. Evidence: `floor-editor`, `floor-layout`, `layout-revision`, `table-mapping`, `entrance`,
`customers`, `operational-contracts`, `operational-readability`, `realtime` (38 checks, browser) all pass; edit mode and
table selection (Mesa 04 sheet) exercised in the browser; the KayKit scene still renders unchanged.

## Performance (software GL in headless Chrome, 5 seated guests)

| Viewport | Draw calls | Triangles | Geometries | Textures |
|---|---|---|---|---|
| D2A (reference) | 481 | 57 278 | 146 | 10 |
| D2B 1440×900 | 488 | 98 758 | 151 | 10 |
| **D2C 1440×900** | 491 | **76 826** | 153 | 10 |
| **D2C 1280×900** | 491 | 76 826 | 153 | 10 |
| **D2C 390×844** | 437 | 76 034 | 151 | 10 |
| **D2C 375×667** | 442 | 76 050 | 151 | 10 |

Triangles −22 % vs D2B (fewer trees); draw calls +3 (the new top-tuft instanced sets). Mobile draws fewer calls because the
default phone framing culls part of the room. No new texture, light or post-processing.
Resource cleanup: the stepped cycles above return the actor counters to zero on all four walls, and leaving the route
(→ `/login`) removes the canvas and both dev hooks with 0 console errors; no GPU-memory inspection was possible headlessly.
GPU frame time was **not** measured (software GL, 2–7 FPS says nothing about real GPUs): no GPU claim is made.

## Tests
- `vue-tsc -b` and `npm run build` green.
- New/extended: `frontend-tree-cover.mjs` 16 checks (new: 6–10 street trees around the door, ≤ 6 far trees, none behind,
  varied crowns, cover survives), `frontend-camera-limits.mjs` 4 checks (unchanged, still 0.0 % world-end visibility).
- Regression, all passing: urban-exterior 25, navigation 24, environment-plan 9, entrance, customers 14, floor-editor,
  floor-layout, layout-revision, render-performance, operational-readability 15, operational-contracts, dashboard-stage 6,
  table-mapping, realtime 38 (the browser suites need `AGENT_BROWSER_SOCKET_DIR=$HOME/.ab` in this sandbox).
- No existing test was modified.

## Screenshots (`docs/3d/evidence/phase-3-1k-d2c/`)
`after-desktop-1440-default.png`, `default-1440x900.png`, `default-1280x900.png`, `default-390x844.png`,
`default-375x667.png`; recenter: `orbited-*.png` → `recentered-*.png` for the four viewports, `recenter-before-orbited-zoomed.png`,
`recenter-after-desktop.png`, `recenter-table-focused.png` (sheet open), `recenter-after-focus.png`.

## Remaining blockers / requirements for Dashboard integration
1. **Stage mode has no "Centrar vista"** (`v-if="!stage"` keeps the Dashboard untouched today). Integration must decide where
   the control lives in the Dashboard layout and pass the stage insets (the rig already honours `frameInsets`).
2. **Dark-only urban look:** fog and ground colours are tuned for the dark canvas (`#151515`). The Dashboard's light stage
   (`LIGHT_STAGE.background`) needs theme-aware fog colour/ground, or the horizon will look like a dark band.
3. **Licence:** the Ultimate pack models (walls, door, tables, chairs, plants) are `LICENSE_UNVERIFIED` and demo-only; the
   procedural exterior is production-eligible, the room architecture is not until the licence is verified or the pieces are
   replaced.
4. **Real-API validation:** everything was validated on the fixture; the live Operations Live / layout endpoints were
   unreachable here. Guests, alerts and revisions need one pass against the real backend.
5. **Wall cutaway** (not touched, as instructed): the reported camera-dependent movement could not be diagnosed at software-GL
   frame rates; with the entrance on a far wall the tall wall still hides the doorway from the default view.
6. **Table sheet is a modal** on this host: it covers the camera controls while open; the Dashboard may want the side-panel
   layout so the scene stays operable.
7. **Terrace** is decorative only (no operational model, door use or permission in the contract).
8. **Phones/portrait tablets:** the overview needs the 70 m framing cap, so the restaurant is small there; the default phone
   view still frames tables only. Needs a product decision (and real-device check).
9. **Real-GPU measurement** (frame time, memory) is still outstanding; triangle count is ~76 k with 5 guests.
10. Entrance on a far wall: guests are mostly seen only after orbiting; consider a facing-aware default direction.
