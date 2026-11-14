# Phase 3.1K-A — Indoor Restaurant Scene

Status: first functional indoor visual environment implemented. Operational state, persisted layout shape, IDs and API contracts are unchanged.

## Architecture

- `RestaurantScene.vue` remains the owner of operational tables, selection, status/event layers, editing, saved entrance, guest actors and camera. Environment meshes are visual children and carry no table IDs or operational state.
- `KayKitTableVisual.vue` renders the existing table group with a KayKit table model selected by layout shape. The component scales the model to the current layout dimensions and refreshes when shape or capacity changes. Existing hit geometry, table status rings, labels, event badges and guest anchors stay on the original table group.
- `ChairInstances.vue` now uses one KayKit Furniture Bits chair model through an `InstancedMesh`. Layout changes update instance matrices; chairs used by guest arrival/departure animation are hidden from the static batch and handed to the existing animated chair prop.
- `RestaurantEnvironment.vue` loads a selected set of room, kitchen and service models. `kaykit-asset-cache.ts` shares parsed model templates and atlas texture objects across these components. Models are cloned for placement; cached source geometry/materials live for the scene lifetime. Scene-local floor resources and chair instance geometry are disposed on unmount.
- `ModularFloor.vue` renders 320 one-metre floor modules in one instanced draw call. It is a lightweight generated floor because the Restaurant Bits pack has kitchen tile modules, not a general dining-room floor.
- Navigation uses the same A* grid and now includes fixed kitchen-prep and bar-counter obstacles. The layout editor also refuses table placements that overlap these reserved service footprints. These are visual scene constants, not persisted layout fields.

## Environments implemented

### Dining room

The indoor room has a warm modular floor, sparse low-poly perimeter walls, window segments and a cutaway/open front for visibility. Layout-driven operational tables use the round KayKit Restaurant table or Furniture Bits square/long table model. Chair count and positions still come from each existing table's capacity and geometry helpers.

### Bar

A short service counter with shelving is placed along the north-east edge. It is architectural/decorative only: there is no bar workflow and no bar-height stool is presented as available.

### Kitchen

The north-west service corner has preparation counter, sink, multi-stove and refrigerator models. Fixed navigation and editor footprints protect the counter area. Kitchen equipment has no cooking state or backend behavior.

### Entrance and future outdoor zone

The south doorway is visual only. Guests continue to spawn and depart at the existing saved entrance coordinate, and the existing animation code is unchanged. An east doorway connects visually to an empty 8×8 m floor reservation, centered at (14, 0.75) outside the 20×16 m indoor floor. The reservation is a component constant; it adds no floor-layout fields, operational tables, furniture, or customer navigation state. Its entrance connection is for future terrace work.

## Assets used

Thirteen selected glTFs are loaded on the fixture scene: Restaurant Bits `wall.gltf`, `wall_window_open.gltf`, `wall_doorway.gltf`, `door_A.gltf`, `kitchencounter_straight_A.gltf`, `kitchencounter_sink.gltf`, `stove_multi.gltf`, `fridge_A.gltf`, and `table_round_A.gltf`; Furniture Bits `shelf_B_large_decorated.gltf`, `table_medium.gltf`, `table_medium_long.gltf`, and `chair_A.gltf`. The table and chair models remain presentation assets; business table records remain the only operational entities.

## Operational compatibility

- Table selection and the existing table details drawer were exercised in the development fixture.
- Table identity, occupancy, status rings, order/request indicators and guest count remained visible in the fixture after model replacement.
- A simulated guest arrival incremented the arrival counter; navigation failures remained zero. The navigation suite also passed all 24 route checks.
- Existing layout persistence and revision checks passed. Static service footprints are included in placement validation; table movement, rotation, duplication and deletion continue to operate on the original table groups.
- Realtime event delivery, server-backed layout revision conflicts and production notification state were not end-to-end tested because `/dev/restaurant-3d` returned the app's service-unavailable state in this environment. The fixture route supplied deterministic operational data instead.

## Validation

### Automated

- `npm run build` — passed (`vue-tsc -b` and Vite development build). Vite reports the existing 3D route chunk above 500 kB (about 1.05 MB minified, 285 kB gzip); splitting/loading it more selectively remains an optimization.
- `node tests/frontend-navigation.mjs` — passed, 24 checks. The sandboxed test harness also printed a Vite WebSocket `EPERM` warning while starting its helper server; assertions completed successfully.
- `node tests/frontend-floor-layout.mjs` — passed.
- `node tests/frontend-layout-revision.mjs` — passed, with the same helper-server warning.

### Browser fixture

Validated `/dev/restaurant-3d-fixture` in Chromium at 1280×900 and 390×844. The 1280×900 canvas measured 918×680 px. The 390×844 canvas measured 388×654 px; document width was 388 px, so it had no horizontal overflow. A table selection opened the existing detail sheet on desktop. A fixture arrival completed without a navigation failure. A clean reload logged no page errors, and all requested glTF resources returned HTTP 200.

At the desktop fixture measurement, the renderer reported 120 draw calls, 163,074 triangles, 35 GPU textures, and 5 FPS. At the mobile fixture measurement it reported roughly 110–125 draw calls, 160–175k triangles and 4–7 FPS across samples. Counts vary as customer models load and move. These are actual readings from the managed headless Chromium/WebGL session, not a representative physical-device benchmark; no GPU memory or sustained frame-time profile was available. They are reported as a performance warning, not a performance claim.

## Known limitations

- At 390 px, some outer operational badges remain close to or partially clipped by the viewport during the default scene framing. The full-width mobile canvas helps, but this needs a dedicated mobile operational summary/label-placement pass.
- The managed browser reported low FPS (4–7) with 19 fixture guests. Profile on target desktop and mobile GPUs before release; the browser result may be software-rendered.
- The development fixture validated the scene and gestures, but it does not prove production realtime events or revision-conflict behavior.
- Keyboard table selection and keyboard camera orbit are not provided by the existing scene interaction model. Orbit/zoom controls remain enabled, but manual orbit, wheel zoom and touch gestures were not exhaustively automated in this pass.
- Fixed service footprints are an initial spatial approximation. They do not yet model every wall segment or dynamically reposition around arbitrary persisted table layouts. Collision checks conservatively approximate table clearance around those footprints.
- The required `docs/design/DESIGN_SYSTEM_SALOA.md` was not present in this checkout; `docs/design/UI_AUDIT.md` was reviewed before editing.

## Next steps / Phase 3.1K-B

The indoor scene is ready for Phase 3.1K-B development, with release readiness conditional on profiling on real devices, improving mobile edge-label visibility, and exercising the authenticated production route against live operations/realtime data. Phase 3.1K-B can build on the reserved east-side outdoor connection without changing the persisted floor-layout contract.
