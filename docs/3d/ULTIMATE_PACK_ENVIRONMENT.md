# Ultimate Pack environment (local demo only)

Route: `/dev/restaurant-3d-fixture?layout=varied` uses the seven-table mixed-shape/capacity fixture; omit `layout=varied` for the original five-table demo. `?finish=raw` renders the unfinished baseline for before/after review. The operational route accepts `?environment=ultimate` only in Vite development and uses its supplied layout and operational state; production builds always resolve to KayKit.
**LICENSE_UNVERIFIED — local demo only, not approved for production** (see LOW_POLY_ASSET_SELECTION.md). Ultimate remains disabled in the distributable scene until acquisition and browser-delivery terms are verified.

## Converted pieces (M variant → GLB, `public/assets/restaurant-3d/models/ultimate-pack/`)
Source: `Low Poly Ultimate Pack v8.2` (`Assets/polyperfect/Low Poly Ultimate Pack/M/- Meshes_M/Buildings_M/Parts_M/*.fbx`).
The older pack holds byte-identical FBXs for all of these (SHA-256 equal), so v8.2 is the single source.

| GLB | Role | Notes |
|---|---|---|
| house-wall-3x3m | solid wall | 3 × 3 × 0.2 m, stretched ≤ 8 % per run |
| house-wall-window-large-3x3m | tall window wall | main windows |
| house-wall-window-two-3x3m | two-pane window wall | north rhythm |
| house-wall-window-3x3m | small window wall | east wall |
| house-wall-door-3x3m | door opening (south) | |
| house-wall-corner | corner post | FBX in cm, rebased to m |
| door-house-simple | door leaf | FBX in cm, rebased to m |

Conversion: FBXLoader → bake transforms, cm→m, centre footprint, base at y=0 → GLTFExporter (material slot names kept; the pack's materials/textures are not used, every surface is re-skinned in `ultimate-materials.ts`).

## Simple primitives (no suitable pack piece)
Striped floor (1 m cream/beige boards with grout), long counter (13 m), contact-shadow strips, sky plane behind windows.
KayKit tables/chairs/guests of the operational layer are untouched.

## Stage 2: furniture and tableware (same source: v8.2, M variant)
| GLB | Role | Version comparison | Scale / adjustment |
|---|---|---|---|
| table-dining-small | operational table (2 seats) | **v8.2 only** (older pack has no small/medium) | 0.80 × 0.75 × 0.71 m, stretched in Z to the 0.80 m footprint contract |
| chair-dining | chair (straight back) | identical in both packs | FBX in cm, ×0.01, then fitted to 0.50 × 0.88 × 0.50 m so the seat sits at ~0.45 m |
| plate-round | plate | identical | 0.59 m charger scaled to 0.24 m |
| glass-drink | glass | identical | ×0.01 (7 × 15 cm) |
| cup-small | cup on the counter | identical | ×0.01 |
| pot-medium-circle-plant | planter (x2) | identical | as is (0.56 × 1.35 m), pot re-skinned grey |

Not chosen: `table-dining-medium` (1.2 m, too long for a 2-seat), `table-dining` (cm, 1.6 m), `chair-dining-old` (356 tris, spindle back).
Layout/state/events for the demo: `src/data/restaurant-3d/ultimate-demo.ts` (5 tables, ids table-1..5). The `FLOOR` (20 x 16 m) is a persisted contract
(floor-layout.service validates it) and was not changed.
