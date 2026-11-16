# Phase 3.1K-D2A — Urban exterior & outdoor guest navigation

Scope: the isolated Ultimate demo room (`/dev/restaurant-3d-fixture`, and `?environment=ultimate` on the operational
route in dev). The main Dashboard, `restaurants-api`, persisted layouts and the KayKit production scene are untouched.
Guests now arrive from a sidewalk, enter through the configured entrance, and leave the same way.

## Assets

**Reused (all already in the demo, LICENSE_UNVERIFIED, local only — see `ULTIMATE_PACK_ENVIRONMENT.md`):**
`house-wall-3x3m`, `house-wall-door-3x3m`, `house-wall-corner`, `door-house-simple` (terrace door leaf),
`table-dining-small`, `chair-dining`, `pot-medium-circle-plant` (decorative terrace furniture).

**Missing (essential for the brief, none available):** trees, shrubs/hedges, streetlights, curb/road/pavement pieces and
neighbouring buildings. The pack source in `assets-source/…/Low Poly Ultimate Pack v8.2` holds only the `.unitypackage`
(no loose FBX), and nothing in `converted-unused/` covers them. **Decision:** all of them are procedural geometry, so the
whole exterior is production-eligible and adds no licence-bound asset. Nothing was installed or downloaded.

## Geometry changes

New, pure plan: `urban-plan.ts` (no three.js). Everything is described in a wall-local frame (`a` along the wall, `d` out
from its outer face) and converted to world, so the street lies on **whichever wall holds the configured entrance**.

- `UrbanExterior.vue` (procedural, ~21 instanced/mesh objects, no texture): dark ground, paved apron, sidewalk (2 rows of
  slabs with per-instance tone), curb, road with a low-contrast dashed centre line, street trees (trunk + 2 lobes, 3
  greens), tree pits, planters with shrubs, streetlights (pole, arm, warm head), two low neighbouring volumes with a
  glazing band, entrance mat, and the terrace deck (planks) with hedges.
- Neighbours sit only on the street end that points away from the default camera and never on the terrace side.
- `UltimateEnvironment.vue`: wall runs now come from `planWallModules(entrance)`; the entrance door module is **centred
  on the configured entrance** (any wall), the rest of each run is filled with stretched modules (tested to tile exactly).
  The entrance is an open doorway (no sliding door yet); the terrace door keeps its closed leaf. It rebuilds when the
  entrance changes. A pre-existing interior planter within 3 m of the entrance is skipped.
- Terrace: always drawn. Deck + hedges (`UrbanExterior`) and decorative tables, chairs and plants (`UltimateEnvironment`,
  one instanced mesh each) regardless of operations. They have **no table record, no state, no badge**: they cannot take an
  order or look occupied. The terrace is on the east wall, or the west when the entrance is on the east. No terrace
  configuration or permission exists in the layout contract today, so none was changed or invented.
- Reserved space (plan only, not built): a 1.4 m entrance corridor and a 2 × 1.2 m reception footprint beside the
  doorway, both hugging the wall on the roomier side (`reception`, `corridor`; tested clear of the fixture tables).
- Camera: `frameRestaurant` accepts optional `context` ground points (street ends, terrace corners) so the default
  desktop view includes the street. No other camera behaviour changed.

## Navigation changes

- `navigation/outdoor-nav.ts`: a second `NavGrid` (same A*, same string pulling) over the **outdoor** obstacles: building,
  road, trees, planters, lamps, neighbours, terrace deck. Pedestrians therefore cannot cross the road or a wall.
- Arrival: spawn on a sidewalk lane point (6–10.5 m either side of the door, chosen per guest by hash) → A* to the point in
  front of the door, arriving head-on → straight through the opening → the configured entrance → the **unchanged**
  `planArrival` to the chair. Departure is the reverse, ending on a sidewalk exit point; the guest fades and despawns only there.
- `RoutePath.withHead` / `withTail` join the legs; `pullAt` is shifted by the sidewalk length, `returnAt` is untouched, so
  chair interaction behaves as before.
- Door passage is validated: every sample inside the wall thickness must be within the doorway (0.9 m opening minus body radius).
- Safe failures: door blocked / no sidewalk route → the guest falls back to the previous behaviour (appears at the
  entrance), the failure is counted in `Nav failures` and logged; there is never a walk through a wall. A guest that
  leaves while still arriving turns around on the sidewalk (`planSidewalkExit`) or backs out of the doorway (`planRetreat`).
- Table IDs, guest/session IDs, operational state, layout editing, revisions and realtime wiring are unchanged.
  KayKit scenes get no `urban` plan and behave exactly as before.
- Fixture: default entrance moved from the west to the **south** wall (-5.5, 7.6) so the street faces the default
  camera; `?entrance=x,z` puts it anywhere. With the entrance on the far wall (e.g. west) the full-height wall hides the
  sidewalk from the default camera until it is orbited (the cutaway lowers it).

## Screenshots (`docs/3d/evidence/phase-3-1k-d2a/`)

Before: `before-desktop-1440.png`. After: `after-desktop-1440.png`, `after-mobile-390-overview.png`,
`arrival-at-door.png` (guest on the sidewalk with the route through the door), `orbit-entrance-doorway.png`,
`entrance-west.png`, `entrance-east-terrace-west.png` (the last two were taken before the neighbours were lowered/pushed back).

## Tests

- `node tests/frontend-urban-exterior.mjs` — 25 checks: doorway centred on the entrance for all 4 walls; modules tile each
  run; terrace always planned and never on the entrance wall; lane/trees/planters keep the door corridor clear; for the
  Ultimate and the varied layouts × 4 entrance walls, every guest's sidewalk leg ends exactly on the entrance, stays off
  the road, crosses the wall only through the doorway; full arrival/departure (with indoor planners) continuous, `pullAt`
  shifted, `returnAt` unchanged, despawn point on the sidewalk; reserved rectangles free; blocked door and walled-off
  sidewalk refuse; retreat/sidewalk-exit.
- Regression (all pass): navigation (24), environment-plan (9), entrance, customers (14), floor-editor, floor-layout,
  layout-revision, render-performance, operational-readability (15), operational-contracts, dashboard-stage (6).
- `vue-tsc -b` and `npm run build` green.
- agent-browser (fixture, real scene, not the live API): arrival from the sidewalk to the seat and departure back to the
  sidewalk with a clean unmount of actors/paths/chairs (`counts()` all 0, console clean); entrance edited live (X/Z) →
  street, door and spawn move to that wall; entrance on all four walls; orbit with wall cutaway; edit mode; KayKit scene
  unchanged (guest still appears at the entrance); viewports 1440, 1280, 390 and 375 (no horizontal overflow).

## Performance (software GL, 5 seated guests)

| | Before | After |
|---|---|---|
| Draw calls | 467 | 481 |
| Triangles | 45 446 | 57 278 |
| Geometries | 134 | 146 |
| Textures | 10 | 10 |
| Loading errors | 0 | 0 |

The exterior adds 14 draw calls and no texture. Instancing is used for slabs, planks, dashes, trunks, crowns, shrubs,
planters, poles/arms/heads, neighbours, and the terrace furniture (parts sharing a finish are merged into one group). Only
tree crowns/trunks, planters and shrubs cast shadows; the shadow frustum was not changed. FPS in headless software GL is not representative.

## Remaining limitations

- Shadow frustum still covers the room (±12 m): characters/props beyond it on the sidewalk cast no shadow.
- Entrance on the far wall: the sidewalk is hidden by the tall wall in the default view (orbit reveals it).
- Neighbours are plain volumes and can fill a corner of the view when orbiting close to them.
- Pavement/road/vegetation are flat-colour; no texture, kerb ramps or road crossings by design.
- Terrace door is closed and decorative; no guest uses it, and there is no terrace operational model yet.
- Mobile default framing shows the tables only; the street needs "Vista general".
- Outdoor failure fallback still makes the guest appear at the entrance (pre-existing behaviour), reported as a nav failure.
- Not validated against the live API (backend unreachable in this environment; fixture only).
