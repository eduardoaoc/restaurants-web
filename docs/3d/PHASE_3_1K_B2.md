# Phase 3.1K-B2 — Operational Readability & Mobile UX

Scope: `restaurants-web` only, 3D restaurant scene. No backend, auth, dashboard, contract, dependency or asset changes. Operational table IDs, sessions, guest navigation, A*, collision, layout revisions and realtime wiring were not touched.

## Problems identified (audit of Phase 3.1K-A)

Measured on `/dev/restaurant-3d-fixture` with overlay rectangles read from the DOM (`.operational-badge`, `.operations-flag`, `.table-info-label`) against the canvas rectangle.

| Viewport | Clipped by canvas edge (before) | Overlapping overlay pairs (before) |
|---|---|---|
| 390×844 | "Llamó camarero" pill, 44 px | 2 |
| 375×667 | "Llamó camarero" pill, 18 px | 5 |
| 1280×900 | none | 2 |
| 1440×900 | none | 2 |

Other findings: 9–10 px label text on phones; label background at 45–62 % opacity over a bright floor (the "Disponible" line computes to ≈3.9:1, below AA); front (south/east) walls standing between the camera and the room; the layout editor's bottom dock covering up to 55 % of the canvas on a phone and hiding most tables; table hit areas of ~35 px for a 2-seat table on a phone; the dev statistics panel covering a third of a 477 px-high phone canvas.

## Root causes

1. **Framing ignored content.** `cameraFit(aspect)` only scaled distance by aspect ratio. It knew nothing about where tables are, nor that an operational pill is centred on an anchor and needs half its width (≈65 px on phones) on each side. The clipped pill hangs from a seat of the right-most table (a guest-targeted event in the fixture).
2. **No fallback when framing is not enough.** Orbit, zoom and resize can always push an anchor to the edge; nothing kept the DOM overlay inside the canvas.
3. **No stacking rule.** cientos derives an `Html` z-index from camera distance over a 0.1–1000 range, so with the old ranges every pill rounded to the top of its range; priority played no part in what covered what.
4. **Density.** At ~21–25 px per metre a full two-line label (≈85–105 px wide) is wider than the 3.5 m table pitch.
5. **Architecture.** Camera-facing walls were full height.
6. **Mobile editing.** The dock overlays the canvas, but framing used the full canvas.

## Changes

| Area | Change | Files |
|---|---|---|
| Content-based framing | Pure projection + bisection finds the nearest camera distance at which table footprints, label anchors and pill anchors (each with its own pixel padding) fit the canvas minus safe-area insets. The orbit target is the content centre. Used for the initial pose and for re-fits. | `camera-fit.ts`, `framing.ts`, `overlay-metrics.ts`, `RestaurantScene.vue`, `CameraRig.vue` |
| Badge dimensions | Per-breakpoint overlay sizes (pill half width, stacked pill + flag height, label size) mirror the CSS. Pills reserve 50 % of their half width in the framing; the edge clamp covers the rest (a full reserve pushes a 390 px phone's camera so far back that tables become specks). | `overlay-metrics.ts` |
| Safe areas | `env(safe-area-inset-*)` is read through a probe element and converted to insets relative to the canvas rectangle; applied to framing and clamp. | `overlay-metrics.ts`, `CameraRig.vue` |
| Edge clamp | `Html` `calculate-position` override: the default projection, nudged inwards by the overlay's measured size and the insets. Never hides an overlay; an overlay whose table is really off screen is left where it projects (not pinned to the edge). | `use-edge-clamp.ts`, the 3 overlay components |
| Manual camera | A re-fit (resize, orientation, editor entry/exit, dock height) runs only if the person has not moved the camera and no table is focused. "Moved" means a real camera change during a gesture (covers wheel/pinch); a tap on a table does not count, and the rig's own moves are excluded. Re-fits are eased (300 ms). | `CameraRig.vue` |
| Operational hierarchy | `eventTier` / `flagTier` rank existing data: 1 priority `critical`; 2 `urgent` (waiter request, long wait); 3 `attention` (order ready / needs attention); 4 `checkout` (bill); 5 normal activity and labels. Tiers map to disjoint z-index ranges and to rim thickness (4/3/2 px). No new statuses or metrics. | `operational-hierarchy.ts`, badge components |
| Label density | The occupancy line shows only while ≥34 px/m (hides below 30, hysteresis); otherwise the label reads "Mesa NN". Pinch zoom brings it back. Label backgrounds darker (0.78 / 0.70), detail text 0.88–0.92, phone text 11/10 px. | `overlay-viewport.ts`, `TableInfoLabel.vue`, `CameraRig.vue` |
| Wall cutaway | Outer walls whose outward side faces the camera ease down to a 0.28 knee wall (doors hide), recomputed only when the camera moves. Walls carry no ids or handlers. | `wall-cutaway.ts`, `RestaurantEnvironment.vue` |
| Touch | Coarse pointers get a 1.5 m hit padding (0.9 m otherwise), chosen at mount. Overlays stay `pointer-events: none`. | `RestaurantTable.vue` |
| Editor on phones | The dock's measured height becomes a bottom inset: the view is shifted up and the floor framed above it, and overlays avoid that strip. | `RestaurantScene.vue`, `CameraRig.vue` |
| Dev panel | `.dev-stats` hidden at ≤640 px (values stay in the DOM). | `RestaurantScene.vue` |

Not changed: table meshes, chairs, guests, A*/navigation, collision, floor-layout contracts, realtime handling, notifications, the detail drawer.

## Before / after

- **390×844:** pill clipped 44 px → fully visible; overlaps 2 → 1 (a 4 px graze of a label by a higher-tier pill). Labels show "Mesa NN" at default zoom.
- **375×667:** clipped 18 px → none; overlaps 5 → 3 (pill over label, each ≤19 px tall, higher tier on top).
- **1280×900 / 1440×900:** clipped none → none; overlaps 2 → 2. The camera is closer than before (framed to the layout, not the whole room); south/east walls are knee-high.
- **Edit mode:** the whole floor is framed (including the terrace reservation) on desktop; on a phone, tables sit above the dock.
- **After a table sheet closes:** the camera returns to the exact previous pose (same label spread, 295 px).

## Validation

Environment: Vite dev server, agent-browser (Chromium headless, software WebGL), `/dev/restaurant-3d-fixture`. CDP touch events for touch tests.

**Automated**
- `vue-tsc -b` clean; `npm run build` passes (3D route chunk ≈1.06 MB / 288 kB gzip — the same size warning as 3.1K-A).
- New `tests/frontend-operational-readability.mjs` — 15 checks: framing fits / is minimal, safe-area push-back, narrow vs wide, empty and editor layouts, degenerate sizes, edge clamp (edges, insets, off-screen, oversize), safe-area rectangle maths, tier order and disjoint z ranges, wall cutaway, label hysteresis.
- Regression: `frontend-navigation` (24 checks), `frontend-floor-layout`, `frontend-layout-revision`, `frontend-floor-editor`, `frontend-entrance`, `frontend-operational-contracts`, `frontend-table-mapping`, `frontend-realtime`, `frontend-render-performance` all pass. Two existing source-pattern assertions (`setTimeout(refit, 150)` and the `<section v-if=… class="editor-dock">` shape) constrained how the new code is written; the code was adapted and the tests were left unchanged.

**Browser** (clean session: 0 page errors; document width equal to viewport width at all four sizes)
- 390×844, 375×667, 1280×900, 1440×900: 0 clipped overlays.
- Touch (emulated, `pointer: coarse`): a tap selects Mesa 01 (smallest), 05, 06 and 07 (against the east wall) and opens the sheet; taps on the kitchen counter, bar block and front wall select nothing; focus eases in and Escape restores the previous pose; a two-finger pinch zooms (label spread 295 → 1096 px) and the occupancy line reappears; a one-finger drag orbits.
- Resize: an unmoved camera re-fits to the same framing as a direct load at that size; after a manual orbit, resize does **not** re-fit.
- Focused table: its pill stays fully inside the canvas.
- Layout editing: a desktop mouse drag moves a table (dirty flag set). On a 390 px phone a touch drag moves a selected table in grid steps without orbiting the camera, and a drag into Mesa 06's footprint is stopped by collision. Edit-mode overlays: 0 clipped.
- Guest simulator: arrivals 2 and departures 7, 0 navigation failures, 0 page errors.
- Mount/unmount ×5 (router away and back): geometries 39, textures 34, draw calls 115, triangles 162,246, canvases 1 and overlay nodes 11 on every mount. JS heap rose from 105 MB to ≈147 MB over the first two mounts, then stayed at 141–148 MB. No further growth, but five cycles is not a soak test.

## Performance

Idle fixture, 19 guests, headless software rendering, same scene as 3.1K-A:

| | 3.1K-A | Now |
|---|---|---|
| Draw calls (desktop) | 120 | 115 |
| Triangles (desktop) | 163,074 | 162,246 |
| GPU textures (desktop) | 35 | 34 |
| Draw calls / triangles / textures (390×844) | ~110–125 / ~160–175k / — | 117 / 162,440 / 34 |

The small drop comes from hidden doors. Per-frame additions: the wall cutaway (skipped unless the camera moved or a wall is easing) and one clamp per overlay on top of the projection `Html` already does; no DOM reads per frame (sizes are observed with `ResizeObserver`). Framing runs only on resize, mode or dock changes. FPS in this session was 2–5 because rendering is in software: **no FPS claim is made**. Frame time and GPU memory were not profiled.

## Known limitations

- **Authenticated realtime was not validated.** `/dev/restaurant-3d` (real data) was not exercised; the fixture supplies deterministic state. Realtime events, layout-revision conflicts and notifications are covered only by the existing automated suites. The Operations Live flag badge (`OperationsFlagBadge`) gets the same tier and clamp logic, but the fixture does not render flags, so it was not seen in a browser.
- **Safe areas are untested on a real notched device.** Headless `env(safe-area-inset-*)` is 0; the inset logic is covered by unit tests only.
- **No real touch hardware was used**; touch was emulated through CDP. OrbitControls keeps `touch-action: none` on the canvas, so a one-finger drag on a full-width phone canvas orbits rather than scrolls the page.
- **At 390×844 the framing reaches its 40 m cap** (a tall narrow canvas needs more horizontal room than the vertical FOV gives), so the edge clamp does the rest: a pill can sit up to its half width (~65 px) from its seat. In the fixture it stayed adjacent to its table.
- **Residual overlap at 375×667** (3 pairs): a pill covers part of the label of the table behind it. Higher tiers always win; there is no collision-aware label placement.
- **The occupancy line is hidden at default phone zoom** by design (LOD); occupants and time are one tap or one pinch away.
- The first desktop view is tighter than in 3.1K-A, and entering edit mode re-frames to the whole floor (only if the person has not moved the camera).
- The editor dock still covers part of the canvas on a phone. The camera now frames around it, except when the person has already moved the camera.
- The detail sheet (centred modal with blur) is unchanged and covers the focused scene while open.
- `cameraFit()` remains exported (and tested) but the scene no longer uses it.

## Remaining visual improvements

- Collision-aware label/pill placement (nudge labels out from under higher-tier pills).
- Stacked pills for tables with several events (the scene still shows one per target, by design).
- Lower or fade the dock instead of reserving space.
- Profile frame time and GPU memory on target phones and desktop GPUs; split the 1 MB 3D route chunk.
- Keyboard table selection and keyboard camera orbit (still absent).

## Readiness for Phase 3.1K-B1

No operational overlay is clipped at any validated viewport, and priority ordering is in place, so B1 can build on this. Before B1 reaches users: validate on the authenticated route with live data (including Operations Live flags), on a real notched phone, and profile on real GPUs.
