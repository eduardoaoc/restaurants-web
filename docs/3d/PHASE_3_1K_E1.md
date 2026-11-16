# Phase 3.1K-E1 — Static architectural cutaway

Scope: the isolated Ultimate environment (`/dev/restaurant-3d-fixture`, `?environment=ultimate`). Dashboard, `restaurants-api`,
persisted layouts, the KayKit scene, terrace/exterior geometry and the operational contracts are untouched. No asset,
pack or dependency added; nothing committed or pushed.

## 1. Previous architecture
`UltimateEnvironment` registered every wall module, door leaf and corner post in a `walls` list and ran an
`onBeforeRender` hook: each frame the camera's x/z decided, per wall, between full height and a 0.28 knee wall
(`wall-cutaway.ts`: `cutawayTarget` / `easeCutaway`), eased the Y scale, and shrank/hid frames, glass, tall windows and the
terrace door leaf as a function of that scale. Which walls were low therefore depended on the camera.

## 2. New architecture (static, no per-frame work)
- `urban-plan.ts`: `FULL_WALL_SIDES`, `LOW_WALL_SIDES`, `LOW_WALL_HEIGHT = 0.4`, `WALL_HEIGHT = 3`, `isLowWall`, and the pure
  `planWallPieces(entrance)` that turns the existing `planWallModules` into what is built.
- `UltimateEnvironment.vue`: builds walls once (and on entrance change, as before). No `useLoop`, no `useTres`, no
  `wall-cutaway` import, no wall state or watcher. `wall-cutaway.ts` is kept only for the KayKit scene
  (`RestaurantEnvironment`) and its existing tests.

## 3. Wall-to-coordinate mapping (verified on a render)
The default camera is south-east of the room looking north-west; screen-right is +x/−z.

| Role in the reference | Wall | Coordinate | Type |
|---|---|---|---|
| Back wall | **north** | z = −8.2 (outer face), runs along x | full height (3 m) |
| Left-side wall | **west** | x = −10.2, runs along z | full height (3 m) |
| Front wall (street / camera) | **south** | z = +8.2 | low, 0.4 m |
| Right-side wall (terrace side) | **east** | x = +10.2 | low, 0.4 m |

The user's screenshot was not accessible in this environment; the mapping was derived from the documented camera
direction and confirmed on the rendered default view (`default-overview-1440x900.png`): the two tall walls are the back and
the left-hand ones, the two low ones face the street and the terrace. Variable names were not trusted; the geometry was. If the
reference disagrees, only `FULL_WALL_SIDES` / `LOW_WALL_SIDES` change.

## 4. Full-height walls (north, west)
Unchanged: same modules, height, thickness, materials, tall windows, door modules and the terrace door leaf (when the terrace is
on the west). They never lower, fade or change with orbit, zoom, pan, focus, reset, editing or guests. Corner posts: only the
south-east post (both walls low) is low; the NW, NE and SW posts finish a full wall and stay tall.

## 5. Low walls (south, east)
- The converted wall module squashed to 0.4 m (same material and thickness) with a thin cream coping (0.045 m, 0.08 m wider
  than the wall), all copings in ONE instanced mesh. Windows are not built; the pack's frame/glass parts are hidden.
- Deviation from the 0.4 m target: none.
- A door module on a low wall becomes two low flanks with a real **0.9 m opening** centred on the door: the configured
  entrance on the south/east walls, or the terrace passage on the east wall. No door leaf is drawn there, so nothing floats.

## 6. Entrance behaviour
Entrance and cutaway are independent: changing the entrance never swaps the walls. South/east entrance → opening in the low
wall; north/west entrance → the unchanged doorway in the full wall (`entrance-north.png`, `entrance-west.png`). If the entrance
is on the east wall the terrace moves to the west (full) wall and keeps its closed leaf. Persisted layouts are not touched.

## 7. Camera
OrbitControls, zoom/pan limits, table focus, easing, responsive framing, **Centrar vista** and reduced motion are unchanged
(Centrar vista re-verified at all four viewports after orbiting to ~95°). One new limit, because the tall back/left walls would
otherwise stand between the camera and the room: **azimuth −10° … 100°** (`camera-limits.ts`, Ultimate scene only), i.e. the
camera stays on the open south/east side. The default view (≈33°) is inside it; polar, distance and pan limits are as in D2B/D2C.
Orbit beyond it simply stops (`orbit-limit-*.png`); no wall animation compensates.

## 8. Navigation and collision
Purely visual change. The outdoor grid still blocks the whole building rectangle, the indoor grid still ends at the floor edge,
door-passage validation is unchanged. New test: the wall line of all four walls, every 0.5 m, is non-walkable in the outdoor
grid for each of the four entrances (including along the low walls and the openings, which are entered only through the
validated door passage). Browser lifecycle for all four entrances (south, west, east, north): spawn behind a tree → entrance →
seat → depart → hidden despawn, **0 navigation failures, 0 console errors, counters back to 0** (actors 5, leaving 0, paths 0,
pending 0, queued 0, chairs 0).

## 9. Files
Modified: `urban-plan.ts`, `UltimateEnvironment.vue`, `camera-limits.ts`, `CameraRig.vue` (all under `src/components/restaurant-3d/`).
New: `tests/frontend-static-cutaway.mjs`, this document, `docs/3d/evidence/phase-3-1k-e1/`.

## 10. Tests
- New `frontend-static-cutaway.mjs` (7 checks): fixed mapping for 6 entrance configurations; full walls keep every module and low
  walls carry no window or door module; low runs tile exactly leaving one centred 0.9 m opening per door; entrance doorway on
  every wall; source has no camera-dependent wall logic; walls stay physical boundaries; azimuth limits contain every default view.
- Passing, unmodified: urban-exterior 25, tree-cover 16, camera-limits 4, navigation 24, environment-plan 9, entrance, customers
  14, floor-editor, floor-layout, layout-revision, render-performance, operational-readability 15, operational-contracts,
  dashboard-stage 6, table-mapping, realtime (38 checks, browser).
- `vue-tsc -b` and `npm run build` green.
- Browser (agent-browser, fixture): 1440×900, 1280×900, 390×844, 375×667 (no horizontal overflow); orbit, side view, azimuth
  clamp, Centrar vista, table focus (Mesa 04 sheet), edit mode; 0 console errors. The live API was unreachable: not validated
  against it. Reduced motion is unchanged code (`moveTo`) and was not re-run in the browser this phase.

## 11. Performance (software GL, 5 seated guests; not a GPU benchmark)

| Viewport | D2C draw / triangles / geometries / textures | E1 |
|---|---|---|
| 1440×900 | 491 / 76 826 / 153 / 10 | 496 / 77 038 / 122 / 10 |
| 1280×900 | 491 / 76 826 / 153 / 10 | 496 / 77 038 / 122 / 10 |
| 390×844 | 437 / 76 034 / 151 / 10 | 441 / 76 244 / 120 / 10 |
| 375×667 | 442 / 76 050 / 151 / 10 | 443 / 76 254 / 120 / 10 |

+1…+5 draw calls (coping mesh, split door flanks) and +0.3 % triangles. The reported "Geometries" fell by about 30; I did not
investigate that counter further. The per-frame cutaway hook is gone (CPU work per frame removed; not measured on a GPU). No
transparency, material or texture was added.

## 12. Limitations
- The screenshot was not available to the agent: the mapping is inferred from the camera direction and confirmed on a render.
- Low walls are the squashed 3 m module, so its painted face and skirting are compressed; the coping hides the top edge. A
  procedural 0.4 m wall would be cleaner if more polish is wanted.
- The standalone tall corner posts (dark pack frame) at the NE and SW ends of the full walls look abrupt next to the low walls.
- The azimuth limit prevents looking at the room from behind or from the far west; that is the cost of fixed tall walls.
- The phone default framing (tables only) still crops the right-hand low wall and the terrace; Vista general / Centrar vista show them.
- The Ultimate pack licence is still unverified for commercial use. The KayKit scene keeps its own dynamic cutaway.

## 13. Remaining blockers before Dashboard integration
Light-stage theming of fog/ground and a stage-mode Centrar vista (see D2C), licence verification or replacement of the Ultimate
pack pieces, a live-API pass, real-GPU measurements, the table sheet being a modal over the scene, and a decision on the phone
default framing.
