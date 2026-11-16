# Phase 3.1K-D2B — Terrace expansion, urban scene boundaries & discreet guest spawning

Scope: the isolated Ultimate demo room (`/dev/restaurant-3d-fixture`, and `?environment=ultimate` on the operational
route in dev). The main Dashboard, `restaurants-api`, persisted layouts, wall animations and the KayKit production scene
are untouched. Nothing was committed or pushed, no dependency was added, no asset pack was deleted.

## Problems identified and root causes

| Problem | Root cause |
|---|---|
| The small world was visible as an island when zooming out | `CameraRig` allowed 72 m of zoom-out and a polar angle up to 85.7° (almost horizontal) for the Ultimate scene, on every screen size; the road was only ±44 m long and the ground a 95 m disc ending in a hard edge |
| Neighbouring buildings looked like empty volumes | D2A added two plain volumes beside the restaurant as street context |
| Terrace too small | D2A deck was 8 m (along the wall) × 5 m with 4 tables |
| Guests appeared suddenly in the open | spawn points were 8 fixed lane points on the open sidewalk (6–10.5 m either side of the door); a departing guest shrank away on the sidewalk |
| Trees could not hide anybody | a trunk 0.3 m wide with the crown 1.6 m above the ground covers neither the body nor the feet from an elevated camera |

## Neighbours removed

`plan.neighbours`, their nav obstacles and their instanced volumes/glazing are gone. Replaced by nothing architectural:
a far-side pavement, a low clipped hedge line behind it and loose rows of trees around the lot (all instanced scenery).

## Dimensions (before → after)

| | D2A | D2B |
|---|---|---|
| Terrace deck | 8 × 5 m (40 m²) | 16.4 × 8 m (131 m²): the whole lateral wall, 8 m out |
| Terrace furniture | 4 tables, 8 chairs, 2 plants | 15 tables (3 rows × 5 columns), 30 chairs, 4 plants, 7 hedge runs |
| Sidewalk (restaurant side) | 3.2 m, ±(wall + 14 m) | 4.4 m, ±150 m |
| Road | 7 m, ±44 m, centre dashes | 8.4 m, ±150 m, centre dashes + two solid edge lines |
| Far sidewalk / curb | none | 3.4 m + curb, ±150 m, with a hedge behind it |
| Paved margin (non-street, non-terrace sides) | 2.6 m | 5 m |
| Ground | 95 m disc | 240 m disc, dissolved by fog |
| Street trees | 6, regular 6 m spacing | 39 on the sidewalk (5.5–9 m irregular spacing, ±0.25 m jitter, 3 sizes) + 49 far-side + 26 around the lot |
| Streetlights | 3 | 20 (restaurant side, 13–17 m apart, nudged out of tree crowns) + 16 far-side |

Terrace: one coherent timber deck (same plank material as D2A, now running the full wall). Tables sit either side of a
1.5 m-half-width aisle in front of the terrace door; chairs stay inside the hedge ring; planters flank the door and the
corners; the outer hedge has a 2.4 m gate opposite the door. Tested: nothing overlaps, everything is inside the deck, the
aisle is clear (`frontend-tree-cover.mjs`).

**Operational behaviour kept:** the terrace is always drawn (deck, hedges, furniture, plants). It has no table record, no
state, no badge and no orders; nothing was added to the layout contract, no persisted table position or backend data was
read or changed. When no terrace configuration exists (today) nothing else changes.

## Camera constraints (`camera-limits.ts`, `CameraRig.vue`)

Only applied when the scene has an urban context (the Ultimate demo); every other scene keeps its previous range.

- **Zoom-out limit follows the screen:** `max = overview-fit distance of the actual canvas × 1.12`, capped at 80 m. The
  "overview fit" is the existing `frameRestaurant` fit of floor + street/terrace context + wall height for that viewport:

  | Viewport | Fit | Min | Max |
  |---|---|---|---|
  | 1440×900 | 39.1 | 6 | 44 |
  | 1280×900 | 43.0 | 6 | 48 |
  | 844×390 (phone landscape) | 39.8 | 6 | 45 |
  | 390×844 / 375×667 (phone portrait) | 70 (framing cap) | 6 | 78 |
  | 768×1024 (tablet portrait) | 70 (framing cap) | 6 | 78 |

  The fitted default view is always inside the range (tested for all viewports and all four entrance walls).
- **Min distance 6 m** (a table / guest close-up, as before).
- **Polar range 0.12 rad … 72°** (camera never below 18° elevation; D2A allowed 85.7°). Near top-down is allowed.
- **Pan:** `screenSpacePanning` off (pan slides along the ground) and the orbit target is clamped to x ∈ ±14, z ∈ ±12, y ∈
  0…1.6 m on every OrbitControls `change`; the camera is shifted by the same amount, so the view just stops sliding.
- **Fog** (`WORLD_FOG` 88 → 128 m, colour = the canvas clear colour `#151515`) dissolves the far part of the finite
  world; the road, both pavements and the hedge run ±150 m, so no end is within the fog-free range.
- Zoom-in/out never fights the existing table-focus camera or the layout editor (focus distance 9.5 m is inside the range).

**Proof:** `tests/frontend-camera-limits.mjs` samples **69 984 camera poses** (3 distances × 36 azimuths × 3 polar angles ×
9 pan targets × 6 viewports × 4 street walls) and projects both ends of the road, both pavements, the curbs and the far
hedge through a real perspective camera, discounting the fog. Worst visibility of any world end anywhere in the permitted
range: **0.0 %**.

## Discreet spawn / despawn (`tree-cover.ts`, `outdoor-nav.ts`, `guest-actor.ts`)

- **Real occlusion, not proximity.** `hiddenFraction(eye, point, occluders)` casts 15 rays (5 heights from toes to head × 3
  across the shoulders, perpendicular to the view) from the camera to a standing guest and tests them against the *same*
  shapes the renderer draws (`TREE_SHAPE`: trunk cylinder, crown and lobe ellipsoids, shrub bed; shapes shrunk 6 % because
  the drawn icospheres sit inside the ideal sphere). A spot is a cover only if the fraction is exactly 1.
- **Trees were redesigned to actually hide someone:** a lower, wider crown and a shrub bed at the foot (D2A's trunk +
  high crown covered nothing from the elevated camera). They stand mid-sidewalk (2.7 m from the building) so a spot behind
  a tree is still on the sidewalk whichever side the camera is on.
- **Cover spots** (`findCoverPoints`): for each street tree, the nearest sidewalk point (rings 0.95–1.85 m around it, every
  15°) that is free in the outdoor grid, ≥ 4.5 m from the door line, and fully hidden from the reference (default) camera.
  Recomputed with the plan, i.e. whenever the entrance moves.
- **Arrival:** the guest picks (deterministically per guest) one of the 4 nearest cover spots, is placed there, and walks
  out from behind the tree → sidewalk A* → front of the door → through the unchanged doorway → the unchanged indoor
  `planArrival` to the chair.
- **Departure:** the reverse; the route ends *at* a cover spot and the guest is removed there, never beside the door.
- **Live-camera re-check:** when a guest starts or ends its walk the actor asks whether that point is hidden from the
  *current* camera (the person may have orbited). Hidden → no effect at all. Not hidden → a 0.6 s ease (scale from/to the
  feet), not a pop. With no known camera or no tree giving cover, the old lane points are used with the same ease.
- Guest actors for scenes without an urban plan (`edge = null`) behave exactly as before.

## Navigation changes

- Outdoor obstacles: tree bed radius 0.42 → 0.62 m (the drawn bed), lot trees added, the road obstacle now spans the road
  and the far pavement, scenery beyond the walkable 64 × 56 m grid is not added. Terrace deck, planters, lamps and the
  building are as in D2A.
- Door passage validation, `door_blocked` / `no_sidewalk_route` failures, `planRetreat`, `planSidewalkExit` and the
  "guest left while still arriving" paths are unchanged apart from sharing the new spot ordering.
- Entrances on all four walls: the street, its trees, planters, lamps, cover spots and exit points are derived from the
  configured entrance; no coordinate is tied to the south wall.

## Performance (software GL in headless Chrome, default 1440×900 view, 5 seated guests)

| | D2A (recorded) | D2B |
|---|---|---|
| Draw calls | 481 | 488 |
| Triangles | 57 278 | 98 758 |
| Geometries | 146 | 151 |
| Textures | 10 | 10 |
| Asset loading errors | 0 | 0 |

The extra triangles are the 15-table terrace (45 furniture pieces vs 12), the shadow-casting trees within 17 m of the room (three low-poly
icospheres each, drawn again in the shadow pass) and the far-side trees/pavement. Everything repeated is one
`InstancedMesh`: trees are split into a shadow-casting "near" set (within 17 m of the room, the shadow frustum) and a plain
"far" set, trees beyond 50 m are trunk + crown only, pavement slabs are 2.4 m. Only +7 draw calls. No texture, no
post-processing, no animation loop was added (fog is a built-in material feature).
GPU frame time was **not** measured: headless software rendering (FPS 2–6) says nothing about real GPUs, so no GPU
improvement or regression is claimed. Scene-object count was not instrumented.
Leaving the route: the existing disposal paths were extended (every new geometry goes through `disposables`, materials are
disposed on unmount); after a full arrival → seat → departure cycle `counts()` returns to `paths 0, leaving 0, pending 0,
queued 0, chairs 0` on all four entrance walls. A GPU-level leak check was not possible headlessly.

## Tests

New:
- `node tests/frontend-tree-cover.mjs` — 15 checks: no neighbours; street/terrace dimensions; deck covers the wall; terrace
  has no overlaps and keeps the door aisle; trees irregular, off the door line, apart from lamps, on the sidewalk; occlusion
  maths (behind / in front / far / no occluders); cover spots hidden, on the sidewalk, reachable and free for 4 walls × 2
  views; arrival born hidden and ending on the entrance (4 walls × 2 views × 12 guests); the guest leaves cover within 12 m;
  departure ends hidden and starts exposed at the door; spawn spots vary and stay within 28 m of the door; no-camera
  fallback is flagged for the fade; live-camera claims are honest; blocked door / walled-off sidewalk still refuse;
  varied layout fixture.
- `node tests/frontend-camera-limits.mjs` — 4 checks incl. the 69 984-pose exposure sampling above.

Existing, all passing unchanged: urban-exterior (25), navigation (24), environment-plan (9), entrance, customers (14),
floor-editor, floor-layout, layout-revision, render-performance, operational-readability (15), operational-contracts,
dashboard-stage (6), table-mapping, hardening-build. `vue-tsc -b` and `npm run build` green. No test was changed to make
it pass (the only edits to existing test files: none).

Browser (agent-browser, fixture, software GL, not the live API): arrival → seat → departure on south, west, east and north
entrances with 0 console errors; stepped frames show the guest hidden at the tree, emerging, and vanishing behind one;
camera: default, max zoom-out (incl. the lowest elevation), max zoom-in, side, opposite, elevated and pan-clamped at
1440×900, plus max zoom-out at 1280×900, 390×844, 375×667, 844×390 and 768×1024; edit mode and the KayKit scene
(`?environment=kaykit`) unchanged; no horizontal overflow at 1440, 390 and 375.

## Screenshots (`docs/3d/evidence/phase-3-1k-d2b/`)

Before: `before-desktop-1440-d2a.png`. After: `after-desktop-1440-default.png`, `after-desktop-1280-default.png`,
`after-mobile-390-default.png`, `after-mobile-390-overview.png`, `after-mobile-375-default.png`,
`after-mobile-375-overview.png`. Camera range: `camera-desktop-max-zoom-out.png`, `…-max-zoom-out-low.png`,
`…-max-zoom-in.png`, `…-side.png`, `…-opposite.png`, `…-elevated.png`, `…-pan-clamped.png`,
`camera-mobile-390-max-zoom-out-low.png`, `camera-mobile-375-max-zoom-out-low.png`, `camera-844x390-max-zoom-out.png`,
`camera-768x1024-max-zoom-out.png`. Guests: `guest-arrival-1-hidden-at-tree.png` … `guest-arrival-4.png`,
`guest-departure-1-on-sidewalk.png`, `guest-departure-2-reaching-tree.png`, `guest-departure-3-gone.png`. Entrances:
`entrance-west.png`, `entrance-east.png`, `entrance-north.png`.

## Wall cutaway — observations for a later phase (not changed)

The wall cutaway system was not touched. Observed while validating:
- Cutaway state is recomputed only when the camera's x/z changes (`UltimateEnvironment` keys on `cam.x,cam.z`) and walls
  ease with the frame delta. Headless software GL (2–6 FPS) cannot show whether this feels right in motion, so the
  reported camera-dependent wall movement could not be reproduced or diagnosed here; it needs a real-GPU session.
- With the entrance on the far wall (north, west) the tall wall stands between the default camera and the doorway; the
  street is seen over it (`entrance-north.png`) and arrivals can only be followed once the person orbits.
- The wall decision is per wall from the camera's horizontal position only; a very low elevation or the new top-down limit
  does not influence it.

## Known limitations / requirements that conflict with usability

- **Occlusion is exact for the camera it is evaluated from.** Spots are chosen for the default camera and re-checked with
  the live one; where nothing hides the guest (person orbited to the front of the trees) the 0.6 s ease is used. It is a
  scale ease, not an opacity fade: the shared skinned materials cannot take a per-actor opacity cheaply.
- **Far-wall entrances:** from the default view a guest walking along a street hidden behind the tall wall cannot be
  followed; the cover logic still works (spots are on the camera-facing side of each tree) but is mostly off-screen.
- A guest may walk up to ~25 m along the sidewalk to its tree (the 4 nearest spots by distance to the door); most of that
  is outside the default viewport.
- On phones and portrait tablets the full overview needs the framing cap (70 m), so zoom-out there is 78 m and the
  restaurant is small; this is the price of seeing street + terrace on a 375 px screen. The default phone view still frames
  the tables only ("Vista general" shows the street).
- Only the default and live camera are considered: there is no per-frame occlusion tracking for characters in motion.
- The terrace deck is an obstacle in the outdoor grid and decorative only; there is no terrace operational model, door
  use or permission yet (no backend contract exists).
- Lot/far-side scenery is flat-colour low-poly; the ground and fog colours were tuned by eye in the dark scene only.
- Triangle count rose ~72 % (see Performance); if a real-GPU measurement shows a problem, lowering lobe/bed icosphere detail
  to 0 is the cheapest cut (~7 k triangles).
- Not validated against the live API (backend unreachable here; fixture only).
