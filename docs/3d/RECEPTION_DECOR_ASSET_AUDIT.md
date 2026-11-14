# Reception, Plants & Decoration — Asset Audit

Status: **evaluation only.** No scene, operational logic, Dashboard or backend file was changed; nothing was downloaded, moved or deleted.
Previews: `docs/3d/evidence/reception-decor/{reception,plants,decor,waiting}.png` (isolated, native size, one pole = 1.75 m person, tick = 0.75 m table height).
Ultimate pieces in those previews are drawn in a neutral tone on purpose: the FBX files carry only slot names, their colours live in Unity `.mat` files that are not used here.

## 1. Where the assets actually are

The repository was reorganised (commit `adfad91`, "keep only runtime 3D assets in public"). Today:

| Collection | Location | Format |
|---|---|---|
| KayKit Restaurant Bits 1.0 FREE (144 models) | full: `assets-source/restaurant-3d/full/kaykit/KayKit_Restaurant_Bits_1.0_FREE/Assets/gltf/` · runtime subset (10 models): `public/assets/restaurant-3d/models/kaykit-restaurant/` | glTF + .bin, one 1024² atlas |
| KayKit Furniture Bits 1.0 FREE (53 models) | full: `assets-source/restaurant-3d/full/furniture/KayKit_Furniture_Bits_1.0_FREE/Assets/gltf/` · runtime subset (4): `public/assets/restaurant-3d/models/kaykit-furniture/` | glTF + .bin, one 1024² atlas |
| Low Poly Diner Kit v1.0.3 (30) | `assets-source/restaurant-3d/full/diner/LowPoly_Diner_Kit/Models/GLB` | GLB |
| Sushi Restaurant Kit, May 2023 (117) | `assets-source/restaurant-3d/full/sushi/Sushi Restaurant Kit - May 2023/{Decoration,Environment}/glTF` | glTF, embedded buffers, 512² atlas |
| Low Poly Ultimate Pack (older) | `assets-source/restaurant-3d/full/ultimate-originals/Low Poly Ultimate Pack/.../Low Poly Ultimate Pack.unitypackage` | Unity package (FBX + prefabs) |
| Low Poly Ultimate Pack v8.2 | `assets-source/restaurant-3d/full/ultimate-originals/Low Poly Ultimate Pack v8.2/.../Low Poly Ultimate Pack v8.2.unitypackage` | Unity package (FBX + prefabs) |
| Pieces I converted earlier for the Ultimate demo | `assets-source/restaurant-3d/converted-unused/ultimate-pack/*.glb` | GLB |

**Warning found during discovery:** the Ultimate demo (`/dev/restaurant-3d-fixture`) loads its GLBs from `/assets/restaurant-3d/models/ultimate-pack/`, but those files now live only in `assets-source/.../converted-unused/ultimate-pack/` (the folder no longer exists in `public/`). The running dev server still answers because of its cache; a fresh start will not find them. Not touched here.

Existing audits read: `ASSET_CATALOG.md`, `RESTAURANT_ASSET_READINESS.md`, `LOW_POLY_ASSET_SELECTION.md`, `asset-catalog.json`, `low-poly-asset-shortlist.json`, `ULTIMATE_PACK_ENVIRONMENT.md`.

## 2. Keyword search result (filenames, directories, model structure)

Searched all collections for reception/host/hostess/stand/counter/podium/desk/welcome/lobby/front, plant/planter/pot/flower/bush/shrub/tree/foliage, decor/lamp/vase/shelf/painting/sign, bench/sofa/chair/stool/side-table.

- **No dedicated reception, host stand, podium, lectern or front desk exists in any collection.** Every `stand-*` hit in the Ultimate Pack is a fairground/market stand (`stand-cotton-*`, `stand-popcorn-*`, `stand-ice-cream`, `hot-dog-stand`) or an easel/mic stand; `*-front` hits are buildings.
- Counters: KayKit kitchen counters (CC0), Sushi counters (Japanese), Diner counters (1950s diner). Only the KayKit ones match the current scene.
- Plants: KayKit has **only cacti** (`cactus_small/medium_A/B`). Leafy plants exist in the Ultimate Pack, the Sushi kit and the Diner kit (no).
- Decoration/waiting: KayKit Furniture is the richest coherent source (lamps, frames, shelves, rugs, books, couch, armchair, low table).

## 3. Candidates (max 3 / 5 / 5 / 3)

Sizes are native model bounds (m), triangles summed over meshes, "file" is gltf+bin (KayKit) or FBX bytes (Ultimate). KayKit materials: one shared atlas (`restaurant` / `furniture_texture`, 1024², no extra textures). Ultimate M variant: flat Unity materials, no textures (T variant: 1024² shared atlas).

### 3.1 Reception (host stand / compact counter)

| # | Model | Exact path | Pack · version | Size m | Tris | File | Conversion | Licence |
|---|---|---|---|---|---|---|---|---|
| R1 | `cabinet_small` (+ `book_set`, `menu` as props) | `.../full/furniture/KayKit_Furniture_Bits_1.0_FREE/Assets/gltf/cabinet_small.gltf` | KayKit Furniture Bits 1.0 | 1.0×1.0×1.0 | 322 | 22 KB | none (glTF); scale to ~0.9×1.05×0.5 | **CC0, verified** |
| R2 | `kitchencounter_straight_A` (cut/scale to ~1.2 m) | `.../full/kaykit/KayKit_Restaurant_Bits_1.0_FREE/Assets/gltf/kitchencounter_straight_A.gltf` | KayKit Restaurant Bits 1.0 (already used for the service counter) | 2.0×1.0×2.04 | 168 | 11 KB | none; non-uniform scale | **CC0, verified** |
| R3 | `table-bar-square` | Ultimate v8.2 `.../M/- Meshes_M/Furniture_M/table-bar-square.fbx` | Ultimate **v8.2 only** | 0.83×1.05×0.82 | 128 | 18 KB | FBX→GLB, re-skin | **Unverified** |

Verdict: **no suitable dedicated host stand.** R1 (small cabinet with two drawers) is the best adaptable piece: wooden, 1 m high, same atlas as the rest of the scene. R3 reads as a lectern-height wooden table (1.05 m) but needs conversion and licence clearance. A true host stand (angled top, reservation book holder) would have to be composed: cabinet + `menu` (0.5×0.8×0.3, 108 tris, KayKit Restaurant) as menu/reservation stand + `book_set`.

### 3.2 Indoor plants

| # | Model | Exact path | Pack | Size m | Tris | Materials | Conversion | Licence |
|---|---|---|---|---|---|---|---|---|
| P1 | `cactus_medium_A` (and `_B`, `cactus_small_A/B`) | `.../furniture/.../gltf/cactus_medium_A.gltf` | KayKit Furniture | 0.88×0.83×0.84 | 448 | atlas | none | **CC0** |
| P2 | `pot-medium-circle-plant` (already in the demo) | Ultimate `.../Furniture_M/pot-medium-circle-plant.fbx` | Ultimate (identical in both versions) | 0.56×1.35×0.67 | 398 | 5 flat slots | converted already (`converted-unused/ultimate-pack/`) | Unverified |
| P3 | `plant-dracaena-marginata` | Ultimate `.../Furniture_M/plant-dracaena-marginata.fbx` | Ultimate (identical) | 0.56×1.18×0.67 | 326 | 3 slots | FBX→GLB | Unverified |
| P4 | `plant-strelitzia` | Ultimate `.../Furniture_M/plant-strelitzia.fbx` | Ultimate (identical) | 0.52×1.31×0.57 | 482 | 1 slot | FBX→GLB | Unverified |
| P5 | `pot-medium-rectangle-plant` | Ultimate `.../Furniture_M/pot-medium-rectangle-plant.fbx` | Ultimate (identical) | 0.52×1.53×0.57 | 490 | 3 slots | FBX→GLB | Unverified |

Also looked at: `tree-pot` (74 tris, 1.27 m, very simple; a "lollipop" tree), `Decoration_Plant1/2` and `Decoration_Bamboo` (Sushi kit, 735–994 tris, Quaternius, licence file missing, Japanese styling).

### 3.3 Decorative objects

| # | Model | Exact path | Pack | Size m | Tris | Licence |
|---|---|---|---|---|---|---|
| D1 | `lamp_table` | `.../furniture/.../gltf/lamp_table.gltf` | KayKit Furniture | 1.0×1.02×1.0 (scale ~0.4) | 392 | CC0 |
| D2 | `pictureframe_large_A` | `.../furniture/.../gltf/pictureframe_large_A.gltf` | KayKit Furniture | 1.01×1.2×0.2 | 60 | CC0 |
| D3 | `shelf_B_small_decorated` | `.../furniture/.../gltf/shelf_B_small_decorated.gltf` | KayKit Furniture | 1.0×1.01×0.57 | 532 | CC0 |
| D4 | `menu` (menu stand; use as reservation-book stand) | `.../kaykit/.../gltf/menu.gltf` | KayKit Restaurant | 0.5×0.8×0.3 | 108 | CC0 |
| D5 | `clock-home` (alt: `lamp-floor-tall-a`, 1.73 m, 124 tris) | Ultimate `.../Furniture_M/clock-home.fbx` | Ultimate (identical) | 0.33×0.33×0.03 | 220 | Unverified |

Not chosen: `mirror-circle-big` (0.89 m disc, plain), `picture-city-night` (498 tris, busy), Sushi paintings/signs/bell (Japanese motifs; the "bell" is 2,528 tris), Diner neon signs (retro diner).

### 3.4 Waiting area

| # | Model | Exact path | Pack | Size m | Tris | Notes | Licence |
|---|---|---|---|---|---|---|---|
| W1 | `couch` | `.../furniture/.../gltf/couch.gltf` | KayKit Furniture | 3.0×1.22×1.6 → scale ~0.55 for a 1.65 m bench | 636 | blue atlas colour, see §4 | CC0 |
| W2 | `armchair` (+ `table_low` 2.4×0.5×1.5 as side/coffee table, 276 tris) | `.../furniture/.../gltf/armchair.gltf` | KayKit Furniture | 1.8×1.22×1.6 → scale ~0.5 | 528 | same blue | CC0 |
| W3 | `bench-modern` | Ultimate `.../Furniture_M/bench-modern.fbx` | Ultimate (identical) | 1.5×0.45×0.44 | 68 | simple wooden bench, low | Unverified |

Alt: `bench-storage-wood` (v8.2 only, 64 tris), `sofa-modern-medium` (441 tris, grey, modern, off-style), Sushi `Environment_Bench/Sofa` (licence missing).

## 4. Visual compatibility with the current KayKit scene

- **KayKit ↔ KayKit:** same author, same low-poly bevelled style, same atlas logic: best match. Caveat: the *Furniture* atlas is more muted and the sofa/armchair are baked **blue/teal**; the scene palette is warm orange/brown. The atlas cannot be re-tinted by material colour (the hue is in the texture); fixing needs a UV remap to a warm swatch or a recoloured copy of the atlas (non-destructive: new texture file). The cactus, lamp, frame and cabinet already sit in the warm range.
- **Scale:** KayKit Furniture models are authored large (e.g. `couch` 3 m, `table_low` 2.4 m); the scene already normalises KayKit tables and chairs to real size (0.8 m table, 0.88 m chair). Expect ×0.4–0.6 on couch/armchair/lamp. Restaurant Bits pieces are close to 1:1 (counter 2 m × 1 m).
- **Ultimate ↔ KayKit:** the Ultimate Pack is internally coherent but is a different language (flatter faces, thinner legs, Unity flat materials). The earlier audit classed it "C: significant harmonisation needed". The demo already re-skins it (`ultimate-materials.ts`); plants mix acceptably, furniture less so.
- **Sushi / Diner:** theme clash (Japanese / 1950s). Not recommended for a Valencia restaurant.

## 5. Technical notes

- Instancing: plants, frames, lamps and benches are repeatable → `InstancedMesh` per model (all share one material/atlas). A single reception is not worth instancing.
- Draw-call impact: KayKit pieces share one atlas texture → one material; Ultimate M pieces use several flat materials (re-skin to a shared palette to keep batches small).
- Triangle budget of the full proposed composition: ≈ 322 + 108 + 196 + 448×2 + 392 + 60 + 636 ≈ 2.6 k triangles, negligible next to the ~46 k already drawn.
- No GPU/FPS measurement was made.

## 6. Operational compatibility checklist (for implementation)

- **Entrance spawn / A\*:** guests walk from `entrance` through `buildNavGrid(props.tables)` (`RestaurantCustomers.vue:128`): the grid is built **only from tables**. Decoration is therefore *not* an obstacle today. Either keep every prop outside the walkable corridor (≥ 1.2 m clear around the door and along the path) or extend the grid with a static-obstacle list in a separate, tested change.
- **Persistence/editor:** decoration must not enter the persisted layout document (`FLOOR`, tables, entrance); it is scene dressing only, outside the editor's selectable set.
- **Table selection / alerts:** props stay at ≥ 1 m from any table footprint and never taller than ~1.35 m near labels (table anchors sit at 1.9 m); no prop may use a raycast target (`raycast = () => undefined`).
- **Camera / cutaway:** wall-mounted items (frames, lamps) must be children of the wall piece that lowers (`wall-cutaway.ts`, hidden progressively like the tall windows). Floor items stay visible in every orbit angle but must be low or thin where a wall is lowered.
- **Wall hiding:** the walls that lower are the ones facing the camera; place tall plants against the *far* walls (north/west in the default view) or accept they stand in front of the lowered ones.

## 7. Recommended reception composition (small, elegant)

Next to the entrance door, inside, leaving the door-to-room axis free:

1. **Host stand:** `cabinet_small` (scaled ≈ 0.9 × 1.05 × 0.5 m) against the wall on the hinge side of the door, with `menu` (reservation stand) and `book_set` on top; optional `lamp_table` scaled ≈ 0.4.
2. **Plants:** one `cactus_medium_A` (KayKit) on the far side of the door; optionally the demo's `pot-medium-circle-plant` at the opposite end of the open side (already present).
3. **Waiting:** one scaled `couch` or `armchair` + `table_low` on the opposite wall, ≥ 1.5 m from the stand, outside the door-to-tables corridor; optional `pictureframe_large_A` above it (child of the wall).
4. **Clear space:** keep ≥ 1.2 m x 1.2 m free in front of the door and a 1.2 m wide path to the dining area; no prop within 1 m of the entrance marker.

## 8. Missing models

- Dedicated host stand / lectern / reservation desk, a tablet or reservation book, a wall menu board, coat rack, welcome mat, planter with leafy plant in the KayKit style, bench in the KayKit style (only low `chair_stool`, couch, armchair).
- A warm-coloured sofa/armchair (the KayKit ones are blue).

## 9. Licence status

| Source | Status |
|---|---|
| KayKit Restaurant Bits / Furniture Bits | **CC0 1.0, `License.txt` present in `public/` and `assets-source/`: verified for commercial use.** |
| Low Poly Ultimate Pack (both) | **Not verified.** No licence file in the packages; publisher terms restrict resale/redistribution and require protected inclusion in the product; no purchase receipt in the repo; downloaded via third-party mirror wrapper pages. Keep local-demo only. |
| Low Poly Diner Kit | Custom licence (commercial use allowed, **redistribution forbidden**; serving GLBs from a public web app is an open question). |
| Sushi Restaurant Kit | No licence file (Quaternius packs are usually CC0, unconfirmed). |

## 10. Recommendation

**A, with B limited to plants.**

- **A (now):** build the reception from KayKit only — `cabinet_small` + `menu` + `book_set` (+ `lamp_table`), `cactus_medium_A`, scaled `couch`/`armchair` + `table_low`, `pictureframe_large_A`. All CC0, one atlas, ~2.6 k triangles. Only visual gap: single plant species and blue seating (recolour the atlas copy).
- **B (only after licence approval):** add Ultimate `plant-dracaena-marginata`, `plant-strelitzia` or `pot-medium-rectangle-plant` for leafy plants. The demo already depends on Ultimate pieces, so this decision is the same licence decision.
- **C (if the Ultimate licence is refused or leafy plants/host stand matter):** obtain a CC0/commercial pack with a reception desk and plants (the demo's chairs/tables/architecture would also need a replacement).

## 11. Next steps (after approval)

1. Confirm the Ultimate licence path (purchase proof + publisher answer) or decide A-only.
2. Restore/choose the runtime location for any GLB the demo needs (see the warning in §1).
3. Prototype the reception in the dev fixture only: new component, no layout-document changes; shared material from one atlas; wall items as children of the cutaway wall.
4. Add a static-obstacle list to the nav grid (separate change with tests) or keep props outside the corridor.
5. Validate with agent-browser: entrance walk, table selection, labels, orbit/cutaway, mobile.
