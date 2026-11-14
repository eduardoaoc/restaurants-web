# Ritma OS: 3D Asset Catalog

Status: evaluation only. Nothing in this catalog is imported or loaded by the application.
Machine-readable companion: [`asset-catalog.json`](./asset-catalog.json) (344 model entries across four packs; KayKit Furniture Bits was statically inspected and its runtime URLs are checked).

## 1. Locations

| Pack | Runtime path (under `public/`) | Full original contents (git-ignored) |
|---|---|---|
| KayKit Restaurant Bits 1.0 FREE | `assets/restaurant-3d/models/kaykit-restaurant/` | `assets-source/restaurant-3d/full/kaykit/` |
| KayKit Furniture Bits 1.0 FREE | `assets/restaurant-3d/models/kaykit-furniture/` | `assets-source/restaurant-3d/full/furniture/` |
| Low Poly Diner Kit Standard v1.0.3 | `assets/restaurant-3d/models/low-poly-diner/` | `assets-source/restaurant-3d/full/diner/` |
| Sushi Restaurant Kit, May 2023 | `assets/restaurant-3d/models/quaternius-sushi/` | `assets-source/restaurant-3d/full/sushi/` |

Original ZIPs: `assets-source/restaurant-3d/archives/` (git-ignored via `/assets-source/`, outside `public/`).

Only runtime formats (glTF/GLB), required buffers/textures and license/docs were placed in `public/`.
FBX, OBJ, MTL, `.blend` and duplicate texture copies stay in `assets-source/` so they are not copied into `dist/`.
Model filenames are unchanged. Existing `characters/` and `dining-room-40-cover.glb` were not touched.

## 2. Pack summary

| | KayKit Restaurant Bits | KayKit Furniture Bits | Low Poly Diner (Standard) | Sushi Restaurant Kit |
|---|---|---|---|
| License | CC0 1.0 (`License.txt` preserved) | CC0 1.0 (`License.txt` preserved; commercial use explicit) | Custom (`LICENSE.txt` preserved), see §3 | **No license file in archive** |
| Runtime format | `.gltf` + external `.bin` | `.gltf` + external `.bin` | `.glb` | `.gltf` with embedded base64 buffers |
| Other formats in archive | FBX (+ Unity variant), OBJ/MTL | FBX (+ Unity variant), OBJ/MTL | FBX, OBJ/MTL | FBX, OBJ/MTL, `.blend` |
| Models | 144 | 53 (49 restaurant-suitable) | 30 | 117 (incl. 16 characters) |
| Runtime size | 3.4 MB (3.9 MB on disk) | 0.83 MiB | 1.8 MB | 39.9 MB (of which ~32.9 MB are the 16 characters) |
| Triangles, all models | 75,346 | 15,344 | 26,060 | 179,823 |
| Triangles, median / max | 272 / 4,422 | 216 / 1,018 | 768 / 3,352 | 668 / 14,628 (truck) |
| Texture | one shared 1024×1024 PNG | one shared 1024×1024 PNG | 256×256 palette + 256×256 emission, embedded in each GLB; 3 alternate palettes in `Textures/` | 512×512 atlas, embedded in each file |
| Materials | 1 (`restaurant`) | 1 (`furniture_texture`) | `PropsPalette` (+ `PropsGlass` on 9 files) | `Atlas` (+ `Light`, `Glass`, `Lights` on a few) |
| Animations | none | none | none | 16 rigged characters, 30 clips on 14 of them |
| Duplicate files (byte-identical) | 0 | 0; 3 wood chair palette variants | 0 | 0 |

Triangle counts are summed over meshes in the files (no instancing or scene-graph reuse considered).

## 3. License and commercial-use findings

- **KayKit: CC0.** Free for commercial use. Credit to Kay Lousberg is optional.
- **KayKit Furniture Bits: CC0 1.0.** The bundled `License.txt` explicitly permits personal, educational and commercial projects; attribution to Kay Lousberg is optional. The extracted source archive is retained outside `public/`.
- **Low Poly Diner (Standard): custom license by Amano007.** Commercial use and modification are allowed, attribution not required. It **forbids**: reselling or redistributing the assets on their own or inside another pack/library/template; claiming them as your own; and using them to train machine-learning models.
  - Open question for legal/product: serving the GLB files from a public web app, and committing them to a repository, could count as redistribution. This should be confirmed before committing or deploying these files.
- **Sushi Restaurant Kit: license not verifiable.** The archive contains no license file. The pack is credited to Quaternius, whose packs are normally CC0, but that is **not confirmed by anything in these files**. Confirm against the original download page and add a license file before committing or deploying.
- Nothing was committed. These checks are a reading of the shipped text, not legal advice.

## 4. Contents by category

Counts come from the JSON catalog (`category` field, assigned by filename rules).

| Category | Restaurant Bits | Furniture Bits | Diner | Sushi |
|---|---|---|---|---|
| Furniture | 8 chairs/stools and round tables | 11 seating pieces and 4 tables; beds excluded from restaurant-suitable count | 5 incl. booths | 6 incl. sofa/bench |
| Counters / kitchen furniture | 25 | 10 storage/shelves (no counter modules) | 3 counters | 12 |
| Kitchen equipment | 26 | none | 3 | 15 |
| Tableware / food | 71 | none | 2 food props | 36 food + tableware |
| Walls / doors / windows / floors | 12 | none | 7 | 12 |
| Lighting / plants / decoration | none | 22 decor, lights, plants and soft furnishings | 6 | 15 |
| Bar / terrace set | none | none | none / no complete set | none / no complete set |

### Characters (Sushi only)

- 8 in `Characters/Normal`, 8 in `Characters/With Knife and Pan`. Identical filenames in both folders, so the subfolder must stay part of the path.
- 14 of 16 carry 30 clips (e.g. `Idle`, `Walk`, `Run`, `Sitting_Idle`, `Sitting_Start`, `Sitting_End`, `Sitting_Eating`, `Wave`, `Chop_*`, `Pan_*`).
- Two (`With Knife and Pan` Green and Pink) carry a single clip (`Idle`).
- They are animal characters, a different style from the existing human customer characters in `characters/`. Not evaluated for rig compatibility with the existing animations in `characters/animations/`.

## 5. Technical compatibility

Earlier packs were checked from file headers. Furniture Bits was additionally parsed statically; no loader was run and no scene was rendered.

| Concern | Finding |
|---|---|
| Format | All four ship glTF 2.0 (`.gltf`/`.glb`). Three's `GLTFLoader` (and TresJS `useGLTF`/Cientos) handle them natively. No conversion is required. |
| Extensions | Only `KHR_materials_emissive_strength` (30 Diner files) and `KHR_mesh_quantization` (1 file). Both supported by Three. No Draco/meshopt/KTX2, so no decoder setup is needed. |
| Vite | Static files under `public/` are served as-is by URL. Nothing imports them, so the application bundle is unaffected. They are copied into `dist/` on build (~46 MiB for the four packs based on catalog totals). |
| Textures | All referenced textures resolve (KayKit's shared PNG next to the `.gltf` files; Diner and Sushi embed theirs). 0 missing references. |
| Diner glass | `PropsGlass` is alpha 0.2. Transparent sorting needs checking in the scene. |
| Sushi load path | Embedded base64 buffers make `.gltf` files ~33% larger than the equivalent binary and cannot share a texture. Converting to GLB would be an optimization (see §7), not a requirement. |
| Scale / origin | Furniture Bits local POSITION bounds were measured; most floor-standing props have Y near 0 and plausible meter-scale dimensions. Bounds do not include node transforms. Diner publishes 1 unit = 1 m with a 4 m / 2 m grid. No composed scene measurements. |
| Cross-pack mixing | KayKit Restaurant and Furniture share creator, low-poly construction and broadly compatible scale; their separate atlas palettes differ. This supports a coherent neutral room, but exact assembled appearance is unverified without a render. Diner and Sushi have distinct creator palettes/styles. |

Conversion needed: **none required today.** Optional later: Sushi `.gltf` → `.glb`, and deduplicating textures. `@gltf-transform` is already in `node_modules`, so no new dependency would be needed, but no conversion was run.

## 6. Performance considerations

Estimates from file contents only. **No GPU or runtime measurements were taken, and no performance gain is claimed.**

| Aspect | KayKit Restaurant | KayKit Furniture | Diner | Sushi |
|---|---|---|---|
| Load size for the whole pack | 3.4 MB | 1.8 MB | 39.9 MB (~32.9 MB characters) |
| Load size without characters | 3.4 MB | 1.8 MB | ~7.0 MB |
| Textures | 1 shared 1024² file, 1 HTTP fetch, reusable across all models | 2 small embedded 256² images per GLB, so each model decodes its own copy | 1 small 512² embedded image per file, each decoded separately |
| Material sharing | Single material, easy to share across all models | Palette material shared by design; glass is a second material | Single `Atlas` material, minus a few light/glass |
| Instancing potential | High: repeated chairs/tables/cabinets, low triangle counts (chair 428) | High for chairs/stools/booths | High for chairs/tables/counters |
| Heaviest models | `table_round_A_decorated` 4,422; `wall_decorated` 3,880 | railcar building 3,352; neon word sign 2,448 | truck 14,628; chukaman steamer 6,610; sakura tree 6,242; ramen 5,586 |
| Loading concern | Low | Low | Characters dominate the download; load on demand, not up front |

General notes:
- All four packs use low-poly models and compact texture/atlas strategies, a good fit for evaluating a web scene. Whether they yield acceptable frame rates on target devices is **NOT MEASURED**.
- Furniture Bits adds 15,344 triangles total (median 216, maximum 1,018 per model), one shared 1024² texture, and one material name. Repeated tables/chairs/plants/shelves are candidates for instancing after material sharing is arranged; no runtime performance has been measured.
- Each embedded-texture file (Diner, Sushi) creates its own texture/material when loaded unless the loader code deduplicates them. That would need to be handled when the assets are first used.
- Per the previous phases, `ChairInstances` already instances chairs. Any new chair model would need its own instancing work.

## 7. Cleanup candidates

Nothing was deleted. Original archives and the full extracted trees are kept in `assets-source/` (git-ignored).

- `public/`: only runtime formats were copied, so there is no FBX/OBJ/blend duplication there.
- Candidates in `public/`:
  - `quaternius-sushi/Preview.jpg` (306 KB) and `Sushi_Atlas_Help.png`: reference images, not needed at runtime.
  - `low-poly-diner/Docs/Palette_Chart.png`: reference only.
  - `low-poly-diner/Textures/*` (alternate palettes, ~8 files): needed only if palette switching is wanted. The GLBs embed the default palette.
  - `kaykit-restaurant/*_dirty`, `*_decorated`, `*_small` variants: keep or drop depending on scene needs.
  - Sushi characters: 16 variants at ~2.3 MB each. Likely only 1–2 are needed.
- `assets-source/` holds ~563 MB, including the ZIPs (~74 MB) and the `.blend` files. It can be removed later once the packs are no longer needed locally.
- Whether the new `public/` directories should be committed at all depends on the licensing questions in §3.

## 8. Recommended first-scene models

This is a shortlist for evaluation, not an implementation. It assumes a single pack per scene.

**KayKit Restaurant Bits** (recommended pack for a consistent first scene; see below):
- Seating: `chair_A`, `chair_B`, `chair_stool`, `table_round_A`, `table_round_A_small`, `table_round_B`
- Structure: `wall`, `wall_half`, `wall_window_open`, `wall_window_closed`, `wall_doorway`, `door_A`, `floor_kitchen`, `pillar_A`
- Kitchen: `kitchencounter_straight_A`, `kitchencounter_sink`, `stove_multi`, `oven`, `fridge_A`, `extractorhood`
- Service: `plate`, `bowl`, `menu`, `food_burger`, `food_dinner`, `food_stew`

**Low Poly Diner**: booths, counter, stool, jukebox, neon pieces. It is too small (30 models) to build a full interior alone and has the license caveat in §3.

**Sushi Restaurant Kit**: coherent Japanese-restaurant set including characters, but a themed look (torii gate, shoji, sakura) and unconfirmed license.

**KayKit Furniture Bits** complements the Restaurant Bits visually and technically by the same creator, with coordinated low-poly shapes, plausible prop scale, CC0 terms and a compact shared-texture glTF set. It adds dining furniture and decoration, not architecture, kitchen counters, doors, windows or outdoor furniture. The palettes use separate textures, and their exact in-scene match remains unrendered.

## 9. Missing elements (all packs combined)

| Area | Gap |
|---|---|
| Interior | No dining-room floor in KayKit (only kitchen tile); no ceiling in KayKit/Sushi; no generic dining-room decorations in KayKit; no wall lamps/pendants in KayKit |
| Kitchen | Covered well by KayKit and Sushi |
| Bar | No bar counter, stools set, taps, glassware or bottle shelf in any pack (Diner has counter + stool, Sushi has bottles) |
| Entrance | No dedicated storefront/entrance module, host stand, awning or reception desk. Only wall-with-door pieces (KayKit `wall_doorway`/`door_A`, Diner `Diner_Wall_Door_4m`, Sushi `Wall_Door`) |
| Terrace | No outdoor tables, umbrellas, planters, fences or terrace flooring in any pack |
| Plants / lighting | Plants only in Sushi (themed), lighting only in Diner (neons) and Sushi (2 lamps); KayKit has neither |
| Human characters | None in the new packs; Sushi provides animal characters only |

The Diner kit's full edition (170 assets; not purchased) advertises storefront, patio and entrance pieces. That would need evaluation separately.

## 10. Best pack for a consistent visual style

**KayKit Restaurant Bits.**
- Largest and broadest set (144 models) covering dining seating, walls, doors, windows, floor and a complete kitchen.
- CC0 license with no restrictions.
- One shared texture makes it the easiest to keep consistent and to share materials across.
- Smallest memory footprint per model (median 272 triangles).
- Neutral, general-restaurant look suited to an operations tool, where clarity matters more than theme.

Its gaps are bar, entrance, terrace, plants and lighting; those must be solved separately and without mixing styles until a decision is made.

## 11. Validation performed

- Furniture ZIP integrity verified (`unzip -t`, 0 errors); 335 entries, 3,780,559 bytes compressed, 6,653,489 bytes extracted. Safe path validation ran before extraction. The original ZIP now resides at `assets-source/restaurant-3d/archives/KayKit_Furniture_Bits_1.0_FREE.zip`.
- Furniture pack: 53 glTF models, 53 external buffers, one 1024×1024 texture and bundled CC0 license; 15,344 triangles total. Runtime directory is 108 files / 865,610 bytes, with no FBX/OBJ/MTL or ZIP under `public/`.
- Every catalog URL and every new glTF external buffer/texture reference was checked. Existing character directories were left untouched. No application code or operational logic changed.
- Existing validation totals in prior phases cover 291 models in the original three packs; with this pack the JSON contains 344 model entries. No application tests/build were run because the work is static asset and documentation only.
- The original three-pack catalog contained 291 model entries before this addition; current JSON contains 344 entries. Every current catalog model URL exists, and all 53 new glTF files parse with no missing referenced buffers or textures.
- Git: no tracked files changed. Status lists `docs/3d/` and all four model directories as untracked; the three original pack directories and catalog were already untracked at audit start. This work added the Furniture Bits directory and updated the catalog documents. No character assets were touched and no commits were made.
- The existing test suites and build were not run: no application code changed and nothing imports these assets.
