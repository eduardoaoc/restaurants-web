# Phase 3.1K-E2 — Architectural refinement, mobile framing & integration readiness

Scope: the isolated Ultimate environment (`/dev/restaurant-3d-fixture`). Dashboard, `restaurants-api`, persisted layouts and
realtime contracts untouched; no asset, pack or dependency added; nothing committed or pushed. The Ultimate pack stays
demo-only (licence unverified).

## 1. Limitations inherited from E1
1. Low walls were the 3 m pack module squashed to 0.4 m (compressed baseboard bands, 2 draw-call-heavy models per piece).
2. Dark full-height corner posts (pack model) stood abruptly where full walls meet low walls.
3. Phone default framing was tables-only and cropped the right-hand low wall and the terrace.

## 2. Low walls (dedicated geometry)
- `lowWallRuns(entrance)` (pure, `urban-plan.ts`) merges the low pieces into **continuous runs**; the gaps between runs are
  exactly the 0.9 m openings (entrance and terrace passage), so there are no seams and nothing floats.
- `UltimateEnvironment` draws every low wall as a painted box (`materials.paint`, same terracotta as the full walls, 0.2 m
  thick, at the previous wall positions) under a 0.045 m cream coping (`materials.cream`, 0.04 m overhang). Bodies and
  copings are **two InstancedMesh** objects sharing one unit box. Total height 0.40 m (no deviation).
- Material/UV: the finish is flat-colour (no textures), and the boxes are unit-scaled axis-aligned, so there are no UVs to
  stretch and no compressed baseboard. No wall-module model is scaled vertically any more (a test greps for it).
- Full walls (north, west) are unchanged: pack modules, tall windows, entrance doorway, terrace leaf.

## 3. Corner terminations
`wallPiers()` replaces the pack's dark corner model (no longer loaded) with four painted piers, 0.45 × 0.45 m, filling the
square between the wall ends and the outer corner exactly (tested flush on both sides): **NW, NE, SW full height (3 m)**, **SE
low (0.4 m)**, each with the same cream coping. The tall walls now end in a clean painted pier instead of a graphite post,
and the low walls meet the NE/SW piers without gaps (`corner-ne-transition.png`, `corner-sw-transition.png`,
`corner-se-low-pier.png`). Fixed configuration unchanged: north/west full, south/east low.

## 4. Mobile framing
- New `ultimateDirection(viewportWidth)` (`framing.ts`): desktop/tablet keep the isometric 45° view (unchanged); phone
  portrait (≤ 640 px) uses **85° azimuth, 44° elevation** — the camera looks west across the terrace, so the room + terrace
  long axis (28 m) runs up the tall screen and the short one (16 m) across it. Inside the camera azimuth limits (−10°…100°).
- The phone default now includes the floor, walls and terrace (`terraceContextPoints`, the street needs Centrar vista) instead
  of tables only: fit distance ≈ 54 m at 390 px and ≈ 45 m at 375 px, **≈ 17–19 px/m, versus 11 px/m for the old overview
  (70 m)** — not a zoom-out: it is a better composition. `CameraRig` re-fits with this direction/context while the person has
  not moved the camera (so a phone turned portrait gets the portrait view) and never after a manual move.
- Centrar vista uses the same direction and context (desktop recenter now matches the isometric initial view; before it used
  a slightly different 32° direction).
- Verified: 390×844 and 375×667 show the full room, both wall kinds, the whole terrace, all five tables and their badges; labels
  are legible, though on the shortest canvas (375×667, ~477 px tall) the badges of neighbouring tables overlap a little (existing
  overlay logic, not changed). Desktop 1440 and 1280 framing unchanged.

## 5. Camera stability (re-verified)
Orbit/zoom/pan limits and the azimuth limit are unchanged. Browser: Centrar vista from an orbited, zoomed, panned pose at all
four viewports; **three rapid clicks are safe**; table focus works on desktop and phone (sheet opens, close returns the camera);
resizing 1440→390 re-fits an untouched camera to the phone view, while a manually moved camera is **not** reset by a resize
(`resize-user-moved-after.png`); with `prefers-reduced-motion` the recenter lands within 250 ms (same `moveTo` path, which
applies the pose at once). No wall depends on the camera.

## 6. Navigation
No navigation code changed. `frontend-static-cutaway.mjs` still proves every wall line is non-walkable in the outdoor grid, and
the existing door-passage checks cover the openings. Browser lifecycle on all four entrances (spawn behind a tree → entrance →
seat → depart → hidden despawn): **0 navigation failures, 0 console errors, counters back to 0** (actors 5, leaving 0, paths 0,
pending 0, queued 0, chairs 0).

## 7. Tests
- `frontend-static-cutaway.mjs` now 11 checks (new: continuous runs + exact 0.9 m openings; four flush piers, one low; phone
  framing ≥ 14 px/m inside the azimuth limits and desktop direction unchanged; no squashed modules / corner model in the source).
- Passing, unmodified: urban-exterior 25, tree-cover 16, camera-limits 4, navigation 24, environment-plan 9, entrance, customers
  14, floor-editor, floor-layout, layout-revision, render-performance, operational-readability 15, operational-contracts,
  dashboard-stage 6, table-mapping, realtime 38 (browser). `vue-tsc -b` and `npm run build` green. Live API unreachable: not
  validated against it.

## 8. Performance (software GL, 5 seated guests; not a GPU benchmark)

| Viewport | E1 draw / triangles / geometries / textures | E2 |
|---|---|---|
| 1440×900 | 496 / 77 038 / 122 / 10 | **382 / 76 714 / 114 / 10** |
| 1280×900 | 496 / 77 038 / 122 / 10 | 382 / 76 714 / 114 / 10 |
| 390×844 | 441 / 76 244 / 120 / 10 | 382 / 76 714 / 114 / 10 (now the whole room is in view) |
| 375×667 | 443 / 76 254 / 120 / 10 | 382 / 76 714 / 114 / 10 |

Draw calls −114 (−23 %): the pack's wall/corner models carry several primitives each; the low walls and piers are now 2
instanced draws. Triangles −0.4 %. No texture, material or per-frame work added. Real-GPU timings were not taken.

## 9. Files
Modified: `urban-plan.ts` (`lowWallRuns`, `wallPiers`, `terraceContextPoints`), `UltimateEnvironment.vue`, `framing.ts`
(`ultimateDirection`), `CameraRig.vue` (compact context/direction in refit and recenter), `RestaurantScene.vue` (initial frame,
props). Tests: `tests/frontend-static-cutaway.mjs`. Evidence: `docs/3d/evidence/phase-3-1k-e2/`.

## 10. Remaining limitations
- Phone badges overlap slightly on the shortest canvas; the phone view looks across the terrace, so the street is only at the
  left edge until Centrar vista/orbit.
- Low-wall paint has no baseboard/skirting detail (deliberately plain).
- Reduced motion verified by timing only, not by a recorded transition.
- Pack licence unverified; real-GPU performance and live-API behaviour unmeasured.

---

# Dashboard integration readiness audit (read-only)

No Dashboard file was modified. **F** = confirmed in code, **A** = assumption / needs a decision.

## A. Confirmed facts
- **F — Dashboard already hosts the 3D scene.** `src/views/DashboardView.vue` renders `OperationView`
  (`src/views/operation/OperationView.vue`, 736 lines), which lazily loads `RestaurantScene` (`defineAsyncComponent`, chunk
  failure surfaced as state) and mounts it in "stage" mode: `<RestaurantScene :layout :entrance :restaurant-id
  :operations-snapshot :selected-layout-table-id :diagnostics="false" stage @table-selected>` keyed by `layoutRevision`.
- **F — Scene props that matter:** `stage` (light maquette, own camera direction `STAGE_DIRECTION`, insets, 110 m cap, never
  zooms into a table), `environment: 'kaykit' | 'ultimate'` (default kaykit), `selectedLayoutTableId` (host owns selection),
  `operationsSnapshot`. The Ultimate environment is reachable **only** through `environment` and is gated to DEV on the lab route
  (`Restaurant3DView.vue`: `import.meta.env.DEV && ?environment=ultimate`); the Dashboard does not pass it.
- **F — Urban/Ultimate features are tied to `environment === 'ultimate'`:** `planUrban`, fog, camera limits, Centrar vista context
  (`urban`, `urbanContext`, `urbanCompactContext`). **Centrar vista renders only when `!stage`.**
- **F — Data sources:** tables/guests come from the `OperationsLiveSnapshot` prop (floors → zones → tables, unassigned tables,
  alerts, daily operation); the layout comes from `useRestaurantFloorLayout(layoutRestaurantId)` (`state`, `layout`, `revision`,
  `reload`). The scene maps layout tables ↔ operational tables through `operations-floor-mapper` (`floorMapping`).
- **F — Realtime:** `OperationView` receives `lastRealtimeEvent` and reloads the layout on `floor_plan.updated`
  (`src/types/realtime.ts` lists the event names); the snapshot itself is pushed in by the parent. The scene does not subscribe.
- **F — Permissions:** `usePermissions().can('manage_floor_plan')` gates the floor editor (`openFloorEditor` + hidden CTAs);
  other gates `manage_users`, `view_activity`, `open/close_daily_operation`. Backend remains the authority (CLAUDE.md §9).
- **F — Responsive layout:** the board reacts to its own width (`ResizeObserver`, 672/896 px thresholds); the stage reserves
  insets (`STAGE_INSETS`: top stats row, bottom legend/queue) that `CameraRig.frameInsets` honours; the table sheet on the stage
  is a card on wide boards and the standard drawer otherwise (`stageCardVisible`).
- **F — Ultimate assets:** the pack pieces are `LICENSE_UNVERIFIED` (docs: `ULTIMATE_PACK_ENVIRONMENT.md`); the exterior,
  low walls, piers and trees are procedural.

## B. Required interfaces / changes (proposal)
| # | Change | Files |
|---|---|---|
| 1 | Decide how the Dashboard picks the environment (feature flag / restaurant setting), pass `environment="ultimate"` only when licensed | `OperationView.vue` (prop), a flag source (**A**: none exists) |
| 2 | Light-stage theming of the urban scene: fog colour = `LIGHT_STAGE.background`, ground/apron/road colours, sky; today `#151515` and a dark ground are hard-coded | `RestaurantScene.vue` (fog args), `urban-materials.ts`, `camera-limits.ts` |
| 3 | Stage × Ultimate camera: `stage` uses `STAGE_DIRECTION`/`STAGE_INSETS`/110 m cap, Ultimate uses its own direction and azimuth limits — reconcile (use `ultimateDirection`, keep insets, keep the −10°…100° limit) and re-run the D2B exposure sampling with the stage canvas sizes | `RestaurantScene.vue`, `CameraRig.vue`, `framing.ts`, `tests/frontend-camera-limits.mjs` |
| 4 | Centrar vista in stage mode: currently `v-if="!stage"`; place it where the stage chrome has room (top-right collides with the stat/top bar), honour `frameInsets` | `RestaurantScene.vue` (+ `stage.css`) |
| 5 | Stage label density: the stage overlays (StageTableCard etc.) and the 3D badges must not overlap on phones | `StageTopbar/Legend`, overlay metrics |
| 6 | Ultimate in `operations-floor-mapper`/`table-detail-adapter` paths: verify `UltimateTableVisual` + `RestaurantTable` use the same operational state mapping as KayKit (tests cover visuals, not the Dashboard host) | `RestaurantTable.vue`, tests |
| 7 | Replace/clear the Ultimate pack assets before any production exposure | asset folders, `ultimate-furniture.ts` |
| 8 | Dev-only hooks (`__sceneCam` in `CameraRig`, `__floorLab` in `RestaurantCustomers`) sit behind `import.meta.env.DEV`; confirm they are stripped in the production bundle and check the chunk size (the build already warns about chunks > 500 kB) | `vite.config.ts` / chunking |

## C. Dependencies
Backend contracts unchanged: `OperationsLiveSnapshot`, floor layout API (`entrance`, revision), `floor_plan.updated` realtime
event. No new endpoint is needed **(F)**; a per-restaurant "3D environment" selector would need a backend/setting that does not exist
today **(A — not assumed; a frontend flag is the only option without backend work)**. `/auth/me` still exposes no
capabilities (CLAUDE.md §9): the editor gate must keep attempting + handling 403.

## D. Risks
1. Licence: shipping the Ultimate pack without verification. 2. Light-stage legibility (dark-tuned fog/ground, brand orange vs
terracotta walls). 3. Camera limits tuned on the fixture canvas, not the stage canvas (insets, 110 m cap). 4. Bundle/chunk size
and first-load time (heavy GLBs + characters) on phones. 5. Realtime churn: `:key="layoutRevision"` remounts the whole scene on
a revision change (existing behaviour; guests/actors reset). 6. Frame time on real mobile GPUs is unmeasured (~77 k triangles,
382 draw calls under software GL).

## E. Validation requirements
Per CLAUDE.md §20: agent-browser against the real Dashboard with a real dev user (backend currently unreachable from this
sandbox, so a Sail/real-API session is a prerequisite); light/dark; es-ES/ca-ES-valencia/en-GB (Centrar vista strings exist in
all three); 1440/1280/390/375; table selection → sheet → close; layout revision remount; realtime event (`floor_plan.updated`
and a table-state change); 403 for users without `manage_floor_plan`; the existing suites plus the camera exposure sampling on
stage canvases; GPU profiling on a mid-range phone.

## F. Recommended sequence
1. Licence decision for the Ultimate pack (blocker for anything user-facing). 2. Light-stage theme for fog/ground/road
(change 2). 3. Stage camera reconciliation + exposure test (3). 4. Centrar vista in stage chrome (4–5). 5. Feature-flagged
`environment="ultimate"` pass-through in `OperationView` (1), off by default. 6. Real-API + real-device validation (E). 7. Flip
the flag per environment.
