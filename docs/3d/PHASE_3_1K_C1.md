# Phase 3.1K-C1 — Structural & Visual Corrections

Scope: `restaurants-web`, 3D restaurant scene, **KayKit environment** (`RestaurantEnvironment.vue`, the production scene). No backend, dashboard, contract, dependency or asset changes; no assets deleted; nothing committed. Operational table IDs, persisted positions, sessions, A*, collision rules, layout revisions and realtime wiring are untouched.

## Scene architecture (as found)

- `RestaurantScene.vue` owns tables, guests, overlays, editor and camera. The environment is a visual child with no ids or handlers.
- `environment: 'kaykit' | 'ultimate'`. `/dev/restaurant-3d` always resolves to KayKit in production builds; `/dev/restaurant-3d-fixture` defaults to **Ultimate** (LICENSE_UNVERIFIED, local demo) and `?environment=kaykit` selects KayKit. The kitchen, bar, east terrace doorway and entrance reservation described in 3.1K-A/B2 exist only in KayKit, so this phase corrects KayKit. Ultimate was inspected and is unchanged (see limitations).
- Walls use the cutaway contract (`wall-cutaway.ts`): a wall whose outward side faces the camera eases to a 0.28 knee wall.
- Navigation/editor use `SERVICE_AREA_OBSTACLES` (fixed footprints) plus table/chair footprints.

## Problems identified (confirmed from model bounding boxes and renders)

Model bounds were measured from the glTFs (`Box3`): wall 4 × 4 × 0.5 m; counter/sink/stove/fridge are **2 × 2 m** footprints (z −1 … +1.04, 1.0–2.5 m tall) facing +z; doorway opening 1.6 m wide.

| # | Problem | Evidence |
|---|---|---|
| 1 | Stove at (−7, −7.1) covered z −8.13 … −5.84: **overlapped the counter** (z −6.5 … −4.5) by 0.66 m and **passed through the north wall** (z −7.5 … −7.0) | bbox + render |
| 2 | Fridge (−8.1, −5.15) rotated 90° overlapped the counter and stood in front of the west wall run | bbox + render |
| 3 | Bar counter (7.25, −6.1) was 4 m of wall-less run intersecting the east wall (x 9.0 … 9.5) and the shelf (7.35 … 9.05, z −5.55) was **buried inside the counter** (shelf y −0.1 … 0.72, counter top at 1.0) | bbox + render |
| 4 | Walls stood 0.75 m **inside** the persisted 20 × 16 m floor (centres ±9.25 / ±7.25). The editor allows tables up to 0.5 m from the floor edge, so a table could be placed **inside a wall**; 0.75 m of floor stuck out past the walls on the north and east | render + `FLOOR_EDGE_MARGIN` |
| 5 | The saved entrance (−9.4, 3.1) lies on the **west wall**, which had no opening there: guests appeared inside a solid wall. The doorways that did exist (north x = 0, south x = 0) led nowhere | render |
| 6 | Corners were open or butt-jointed (modules stopped at the pivot, no overlap) | render |
| 7 | Navigation footprints (kitchen 1.6 × 0.9 m, bar 1.5 × 0.9 m) did not match what was drawn (kitchen 4+ m × 2 m, bar 4 × 2 m), so guests/editor treated the real furniture as free floor | constants vs bbox |
| 8 | Open window frames showed the page background as black holes | render |
| 9 | The cutaway loop re-evaluated every frame because its “settling” test compared `scale.y` with the eased scale (the wall scale was always different once a base height existed) | code |

Intentional wall cutaways were not treated as defects. No chair/table intersections, floating tables, or scale mismatches were found in the KayKit dining layer (tables/chairs are positioned by the unchanged layout code).

## Root causes

Hand-placed constants in the component: positions were typed in metres without regard to the 2 × 2 m footprint or the model origin, the wall ring was inset from the floor, doorways were fixed instead of following the entrance, and the nav footprints were separate magic numbers.

## Corrections

New pure module **`environment-plan.ts`** is the single source for wall pieces, kitchen/bar runs and their footprints; the component renders it and navigation consumes the same footprints.

- **Walls:** inner face now flush with the floor edge (centres ±10.25 / ±8.25); north/south runs pass through the corners, east/west stop at the floor edge, so every corner is a clean overlapped joint. The run is split into whole modules stretched to fit (windows only on near-natural modules). Wall height 0.9 → 3.6 m (doorway 1.9 m) to sit in proportion with 1 m counters. Same KayKit models and atlas material.
- **Entrance:** the doorway is cut into the wall nearest the saved entrance, centred on it, and rebuilt when the entrance changes (`entrance` prop from `RestaurantScene`). The orphan north/south doorways and door leaves were removed. The east terrace doorway (z = 0.75) is kept; the terrace reservation is unchanged and still empty.
- **Kitchen:** fridge, counter, sink, stove in one row (x −10 … −2), backs on the north wall, fronts facing the room; no overlaps.
- **Bar:** two counters (x 6 … 10) in the north-east corner with the shelf standing **on** the counter top (y 1.1). 4 m passage between kitchen and bar.
- **Navigation / editor:** `SERVICE_AREA_OBSTACLES` now derive from the drawn footprints.
- **Windows:** a shared daylight pane (one geometry, one `MeshBasicMaterial`) behind each window.
- **Cutaway:** unchanged behaviour (still eased, no visibility toggles); only the settle test was fixed and the base height scale is applied on top of the eased scale.

## Files modified

- `src/components/restaurant-3d/environment-plan.ts` (new)
- `src/components/restaurant-3d/RestaurantEnvironment.vue` (rewritten; untracked file in the working tree)
- `src/components/restaurant-3d/navigation/floor-nav.ts` (service obstacles derive from the plan)
- `src/components/restaurant-3d/RestaurantScene.vue` (one line: pass `:entrance`)
- `tests/frontend-environment-plan.mjs` (new, 9 checks)
- `docs/3d/PHASE_3_1K_C1.md`, `docs/3d/evidence/phase-3-1k-c1/*`

## Screenshots (`docs/3d/evidence/phase-3-1k-c1/`)

- Before: `before-edit-overview.png`, `before-operation-desktop.png`
- After: `after-edit-overview-a.png`, `after-rotated-1.png`, `after-rotated-3.png` (three camera angles, wall lowering on the camera side), `after-mobile-390x844.png`, `after-mobile-375x667.png`, `after-arrival-desktop.png` (guest entering through the west doorway)

## Performance (fixture, headless software WebGL, 5 guests, KayKit, 1440×900)

| | Before | After |
|---|---|---|
| Draw calls | 88 | 93 |
| Triangles | 55,430 | 55,890 |
| Geometries | 31 | 31 |
| Textures | 19 | 18 |
| Asset load errors | 0 | 0 |

At 390×844 / 375×667 / 1280×900 after: 87 / 88 / 85 draw calls, ≈55k triangles. The before/after difference (+5 draw calls, +460 triangles) is within the variation between samples (guests are still loading) and is about the 2 extra wall pieces and window panes; it is **not** a measured improvement or regression in GPU cost. FPS in this session was 2–5 (software rendering), so no FPS claim is made. The cutaway loop no longer runs every frame while the camera is still.

## Regression results

- `vue-tsc -b` + `npm run build`: pass (same >500 kB 3D chunk warning as before).
- New `frontend-environment-plan` 9/9: side coverage with no gaps, walls on the floor edge, entrance doorway centred, terrace doorway, no kitchen windows, no service-module overlap, footprints = drawn, mock tables clear of the service footprints, entrance start valid and routable to every table.
- Pass: `frontend-navigation` (24), `floor-layout`, `layout-revision`, `floor-editor`, `entrance`, `operational-contracts`, `table-mapping`, `realtime` (38 checks), `render-performance`, `operational-readability` (15).
- Browser (agent-browser, **fixture route only — not authenticated**): 1440×900, 1280×900, 390×844, 375×667 render with no horizontal overflow; fresh load has no console errors; camera rotation lowers the camera-facing walls smoothly; guest arrival walked in through the west doorway and departures ran with 0 navigation failures; edit mode and the saved-entrance validation (“Entrada válida”) still work.

## Remaining limitations / issues needing a decision

- **Persisted data risk:** the kitchen (x −10…−2, z −8…−6) and bar (x 6…10, z −8…−6) footprints are now their real size. A real restaurant whose saved tables sit in those corners would now be flagged by editor validation / blocked by navigation. Not changed: no persisted position was touched. The mock layouts are clear. Checking real data needs the backend (not available here).
- Ultimate (fixture default, license unverified) was left as is. Its counter (z −5.2) is not part of the nav obstacles (the KayKit footprints are used for both), so guests may route through it in that demo; it needs an environment-aware obstacle set. A pre-existing Vue “unhandled error during unmounted hook” appears in the console when leaving the Ultimate fixture page (`OperationalBadge`/`Html`); not introduced here.
- Windows show a flat daylight pane, not a view; no exterior. Only the windows on far walls are visible from the default camera.
- Authenticated `/dev/restaurant-3d` (live data, realtime) was not exercised; reception and new terrace furniture are intentionally not added.
- Wall piece stretch up to ~35 % on plain modules when the entrance sits close to a corner; a doorway within 2 m of a corner leaves a short stub.
