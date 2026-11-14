# Low Poly Asset Selection Audit

**Decision: evaluation only. No newly inspected asset is approved for production until acquisition and licensing are verified.** This is a static collection audit; no scene, application logic, Dashboard, or production asset catalog was changed.

## Scope and evidence

The inspected collections were already extracted under `public/assets/restaurant-3d/`. The three relevant package containers are Unity `.unitypackage` files, not directly usable runtime models:

| Collection | Actual package path | Container size | Internal inventory |
|---|---|---:|---|
| Low Poly Ultimate Pack (older) | `Low Poly Ultimate Pack/Low Poly Ultimate Pack/Low Poly Ultimate Pack.unitypackage` | 134,711,785 B | 9,386 paths; 4,506 FBX, 4,478 prefab, 68 material, 15 animation, 23 controller, 12 scene, 9 PNG, 2 C# scripts, 1 PDF |
| Low Poly Ultimate Pack v8.2 | `Low Poly Ultimate Pack v8.2/Low Poly Ultimate Pack v8.2/Low Poly Ultimate Pack v8.2/Low Poly Ultimate Pack v8.2.unitypackage` | 189,365,671 B | 10,590 paths; 5,101 FBX, 5,065 prefab, 70 material, 16 animation, 24 controller, 12 scene, 9 PNG, 2 C# scripts, 1 nested Unity package, 1 PDF |
| Low Poly Characters 2 01 v1.0 | `Low_poly_characters_2_01_v1.0/Low poly characters 2 01 v1.0/Low poly characters 2 01 v1.0/Low poly characters 2 01 v1.0.unitypackage` | 51,194,169 B | 2,667 paths; 57 FBX, 2,577 prefab, 5 animation, 1 controller, 2 scenes, 8 PNG, 2 material |

The three container files total **375,271,625 B (357.84 MiB)**. Their inspected uncompressed Unity asset payloads total **676,404,478 B (645.07 MiB)**; this excludes package metadata and filesystem wrappers. The complete `public/assets/restaurant-3d/` tree had 617 files and approximately 451 MB at inventory time, including other pre-existing assets and the unrelated utility-pole collection. No symlinks were observed in the extracted collection trees.

Inspection used archive manifests and content hashes, plus direct extraction of a small representative FBX shortlist into temporary space for static parsing. No scripts, binaries, Unity scenes, or prefabs were executed. No bulk extraction/conversion or rendered visual/GPU test was performed. All model inventory counts below refer to source FBX entries, not “usable runtime models”: Unity prefabs and FBXs are source assets, not drop-in app assets.

## Version comparison

Path-and-payload SHA-256 comparison of the two Ultimate Pack `.unitypackage` manifests:

| Manifest comparison | Result |
|---|---:|
| Paths in older version / v8.2 | 9,386 / 10,590 |
| Common paths | 9,288 |
| Common paths with identical payload hashes | 8,539 |
| Common paths with changed payload hashes | 749 |
| Older-only / v8.2-only paths | 98 / 1,302 |

v8.2 is a **newer replacement candidate for curation, not an exact duplicate and not a strict superset**. It includes most of the older content, adds many entries, and changes hundreds of shared payloads. The older collection has unique content, but those files do not justify carrying two full packs into runtime. Select v8.2 assets by need; retain the older source unchanged for audit/provenance only. The `M` and `T` trees are material and texture-atlas variants respectively; do not count them as independent scene needs. The T shortlist is used here to favor shared atlas materials.

Duplicate detection used hashes on same relative internal paths and exact payload hashes. The audit found no cross-path byte-identical duplicate FBX groups in either Ultimate pack. Some model names intentionally occur in both M and T variants, with distinct material/texture setup. Do not confuse these variants with version duplicates.

## License, provenance, and security

- The Ultimate Pack packages contain a README PDF but no usable bundled license file. The older README PDF had no extractable page text; the v8.2 README is image-rich and did not yield usable license text in this static pass. The character pack has no license documentation in its package manifest.
- The pack publisher’s [Low Poly Ultimate Pack page](https://www.polyperfect.com/low-poly-ultimate-pack) describes the pack and says assets can be used with a different engine, while also restricting resale/redistribution and requiring assets to be safely included within the user’s product. The [Unity Asset Store listing](https://assetstore.unity.com/packages/3d/props/low-poly-ultimate-pack-54733) is the authoritative purchase channel and identifies the pack’s store license. Neither establishes that these local copies were acquired through an authorized channel.
- No purchase receipt, account entitlement, or authorized download record is present in the repository. Local pack directories include third-party mirror wrapper pages. **All candidates are therefore `LICENSE_UNVERIFIED — NOT APPROVED FOR PRODUCTION`.** Public SaaS delivery of model files is a particular concern: the publisher terms must be checked against the deployment model, and the original Unity package must not be exposed as a downloadable standalone asset.
- Unity’s [Asset Store Terms](https://unity.com/legal/as-terms) govern licensed use and redistribution. Reconfirm current terms and obtain publisher clarification for publicly delivered WebGL assets before approval.
- Archive members were inspected as data only. No script, executable, installer, or binary was launched. Ultimate packages contain two C# source scripts each; they were not executed. Package pathnames were checked and no traversal/symlink member was reported. The character wrapper includes macOS metadata files.

## Existing library and comparison matrix

The existing library’s preferred core remains KayKit Restaurant Bits + KayKit Furniture Bits. The current environment and Phase 3.1K notes use these as the coordinated low-poly restaurant interior; current human guests come from Quaternius optimized GLBs. KayKit packs are documented in the existing catalog as CC0, while the current character rig and seating animation set are Quaternius-specific. No candidate from this audit has been added to that catalog.

| Category | Existing model / coverage | New candidate | Visual improvement | Performance impact | Conversion effort | Recommendation |
|---|---|---|---|---|---|---|
| Dining room | KayKit Restaurant tables/chairs and Furniture Bits tables/chairs, cabinets and shelves; enough for the present indoor operations layout | `table-dining.fbx`, `chair-dining.fbx` | Possible alternate silhouettes; no evidence of a clear improvement over the existing coherent KayKit set | Small meshes (52 / 84 tris), but many separately loaded FBXs/materials would add requests and draw calls | FBX to GLB, scale/origin normalization, atlas material review | Keep KayKit; evaluate only if a specific gap remains |
| Architecture | KayKit Restaurant walls, windows, doorways and kitchen floor; existing composition is open/cutaway | `house-wall-3x3m.fbx`, `house-wall-window-3x3m.fbx`, `house-wall-door-3x3m.fbx`, `house-wall-corner.fbx`, `door-house-simple.fbx`, `house-floor-parquet-3x3m.fbx` | Modular pieces could fill a measured architectural gap, but may introduce a different palette/proportion | Geometry is low; wall visibility/culling and increased atlas memory matter more than triangles | Convert; normalize mixed apparent units and pivot/origin; test cutaway | Keep KayKit envelope; consider isolated modules after rendered style review |
| Bar | KayKit Restaurant kitchen counters and Furniture shelves form a simple service counter; dedicated bar stool is missing | `table-bar-square.fbx`, `stool-bar.fbx`, `shelf-modern.fbx` | A more recognizable bar-height grouping is a functional improvement if dimensions and materials fit | 128 / 142 / 100 tris; negligible geometry, but material/texture and click-zone integration still matter | Convert and unit-normalize; fit counter height against current floor/table dimensions | Strongest functional gap candidate; license gate first |
| Kitchen | KayKit Restaurant Bits already covers prep counters, sink, stoves, oven, fridge, extractor and cabinets | `cabinet-kitchen-large.fbx`, `fridge-modern-open.fbx`, `rail-kitchen.fbx` | Limited improvement; open fridge may add clutter and imply non-operational details | 118 / 670 / 236 tris; modest but avoid decorative duplicates | Convert; verify material behavior and align size | Prefer current KayKit; evaluate only replacement if it improves legibility |
| Entrance | KayKit includes doors, windows and doorway elements; reception stand is not dedicated | `door-house-simple.fbx` plus modular wall pieces | Alternate door form only; no verified host/reception improvement | Low | Convert and normalize units/pivots | No priority over current assets |
| Terrace | Existing catalog identifies umbrella, planters, fencing, and outdoor floor as gaps | `table-outside-big.fbx`, `table-outside-small.fbx`, `chair-outside-modern.fbx`, `parasol-modern.fbx`, `bench-garden.fbx`, `fence-classic.fbx`, `garden-floor-concrete-3x3m.fbx`, `tree-pot.fbx` | This is the clearest coverage improvement: a coordinated table/chair/umbrella/fence/floor set | Models are mostly <500 tris; concrete floor is 2,428 tris. Repeated furniture is instancing-friendly after conversion | Convert, atlas/material optimize, normalize dimensions, fit movement/collision zones | Best collection-level use if license is cleared; visuals still need an assembled review |
| Decoration / lighting | KayKit Furniture provides lamps, pictures, shelves, rugs, and plants; Restaurant Bits provides table props | `plant-pilea.fbx`, `pot-medium-circle-plant.fbx`, `tree-pot.fbx`, `lamp-ceiling.fbx`, `light-wall-circle.fbx`, `picture-nature-small.fbx`, `lights-string.fbx` | Some restrained extra variety; no need to replace existing decor | 64–456 tris for these props, but excess lights/material variants increase calls and can obscure labels | Convert; preserve atlas maps; do not create many unique light sources | Pick only a few, prioritize plants and wall decor, avoid clutter |
| Characters | Existing Quaternius GLBs use 62-joint rigs and have seated/standing clips used by current guest flow | Character pack `Assets/Low poly characters 2 01 v1.0/FBX/m_1.fbx` (plus 54 other human model FBXs) | More chibi proportions and a different character treatment; does not match current guest proportions closely | Example `m_1.fbx`: 3,700 triangles, 81 Bone nodes from Three FBXLoader; 55 human FBX variants total | High: FBX conversion, skeleton/weight audit, animation retargeting, no seated clips | Do not replace Quaternius guests; unsuitable as a direct rig-compatible upgrade |

### Visual consistency assessment

The Ultimate Pack is internally coherent as a Polyperfect stylized low-poly collection, but it is **not a verified plug-and-play KayKit match**. KayKit uses a similarly low-poly presentation, yet palette, geometry language, proportions, and atlas organization are different. The chair/dining and architectural candidates have not been rendered next to the current environment. Static inspection suggests selective pieces could complement KayKit after scale and palette harmonization, but the set should be classified **C: significant visual harmonization may be required for broad mixing**. Individual T furniture pieces may prove easier to blend once converted and rendered. The character pack is a clearer style/proportion mismatch against current Quaternius guests. Do not replace KayKit.

## Technical and performance assessment

- **Formats:** Ultimate packages contain FBX, Unity prefab/material/scene/controller/animation files, and PNG maps; there are no direct GLB/glTF runtime models in the inspected manifest. The character pack is also Unity/FBX. Unity prefabs/materials are not directly consumed by the existing Vue/TresJS asset pipeline.
- **Loader fit:** Existing asset cache uses Three.js `GLTFLoader`; no current app FBX loading path is documented. Three.js provides `FBXLoader`, but this would add a separate pipeline and retain Unity FBX import/material quirks. Recommended route is per-asset FBX-to-GLB conversion after license clearance, not bulk conversion.
- **Measured candidate geometry:** 28 v8.2 T-variant models were parsed with the repository’s Three.js `FBXLoader`, with triangles and geometry bounds recorded in [`low-poly-asset-shortlist.json`](./low-poly-asset-shortlist.json). They total **7,705 triangles** as one copy of each. Typical furniture is 52–456 triangles; `fridge-modern-open.fbx` is 670, and `garden-floor-concrete-3x3m.fbx` is 2,428. Instancing repeated tables, chairs, stools, plants, and fence segments should keep geometry modest, but no runtime benchmark was measured.
- **Materials/textures:** The v8.2 T variant supplies nine PNG texture maps: five 1024×1024 atlases/maps (albedo, emission, night emission, gradient, specular), two 256×256 grass maps, and two 128×128 maps. Nominal RGBA8 decoded upper bound is about 20.5 MiB if all are resident, before mipmaps/GPU overhead. Shared atlas use can limit material changes; retain only maps required by selected converted assets. FBXLoader warns that `SpecularFactor` maps are unsupported and skips them, so conversion/material simplification needs review.
- **Scale/origins:** Geometry bounds expose mixed scale conventions. Examples: `table-dining.fbx` is 160×79.8×80 source units and `chair-dining.fbx` about 46×101×55, while outdoor furniture is around 0.5–1.7 units; these are consistent with centimeter-like units on some files but must be verified from exporter metadata. Wall corner, door, and light bounds likewise suggest mixed units. Normalize units, pivots, floor contact, orientation, and bounding boxes per asset before placement.
- **Load and scene impact:** The shortlist adds little triangle cost at ordinary restaurant scale. The larger risks are conversion/texture memory, duplicate materials, per-object draw calls, loading many files, walls blocking table labels, decorative clutter, and furniture intersecting guest navigation. Batch or instance identical atlas-backed props; keep operational hit targets separate from detailed furniture meshes.
- **Compatibility status:** Every JSON candidate is `CONVERSION_REQUIRED`; no new asset is approved for runtime. The character sample needs `OPTIMIZATION_REQUIRED`/retarget work in addition to conversion and is marked unsuitable as a direct replacement.

### Characters and animation compatibility

The character Unity model import metadata declares animation type `2` (Generic), with no explicit Humanoid avatar mapping. `m_1.fbx` parsed as 3,700 triangles and 81 bone nodes in Three.js FBXLoader; the loader reports skinning with more than four influences and drops extra influences. The existing Quaternius GLB inspected in the prior audit has 62 joints with differently named bones. The character pack’s five clips are `Run`, `Defeat`, `Idle`, `Victory`, and `Walk`; they are Unity `.anim` assets, not standalone glTF clips and include no seated clips. Direct use with the current seating/guest animation setup is not supported. Retargeting and a verified GLB export could be tested later, but the expected style mismatch and integration effort make it low priority.

## Curated candidate shortlist

The JSON records **28** exact v8.2 T-variant source paths, package container path, internal path, content SHA-256, source file size, measured triangle count, FBXLoader bounds, status, and license gate. Paths are inside the Unity package; they are not runtime URLs. See [`low-poly-asset-shortlist.json`](./low-poly-asset-shortlist.json) for the machine-readable list.

Best functional candidates, in order:

1. **Bar:** `table-bar-square.fbx`, `stool-bar.fbx`, `shelf-modern.fbx` — a simple counter-height grouping, subject to dimension review.
2. **Terrace:** `table-outside-small.fbx`, `chair-outside-modern.fbx`, `parasol-modern.fbx`, `garden-floor-concrete-3x3m.fbx`, `fence-classic.fbx`, `tree-pot.fbx`. Add `table-outside-big.fbx` and `bench-garden.fbx` only if the layout needs them.
3. **Architecture gaps:** `house-wall-window-3x3m.fbx`, `house-wall-door-3x3m.fbx`, `house-wall-3x3m.fbx`, `door-house-simple.fbx`; use only after matching wall thickness, cutaway behavior, and unit normalization.
4. **Sparse dressing:** `plant-pilea.fbx`, `light-wall-circle.fbx`, `picture-nature-small.fbx`, `cabinet-kitchen-large.fbx`. Existing KayKit assets already cover much of this.

The shortlist is intentionally below a “use everything” approach. The JSON includes the remaining measured candidates such as flooring, lamp, rail, potted plants, and optional lights.

## Exclusions and missing coverage

| Classification | Assets / reason |
|---|---|
| `EXCLUDE_FROM_RUNTIME` | Unity `.prefab`, `.mat`, `.unity`, `.controller`, and `.anim` files: editor/source resources, not runtime assets for the current GLTFLoader pipeline. Keep only if required by a later licensed conversion workflow. |
| `EXCLUDE_FROM_RUNTIME` | Two C# helper scripts in each Ultimate pack and any unrelated scripts/binaries: not needed to render selected props; never execute as part of this audit. |
| `DUPLICATE_CANDIDATE` | Older Ultimate Pack overlapping entries. Keep source untouched, but avoid carrying both versions into production. v8.2 is not a strict superset, so recheck a uniquely needed older model by hash before any later use. |
| `KEEP_FOR_LATER` | Remaining non-restaurant Ultimate Pack categories (vehicles, weapons, fantasy/scifi, unrelated building sets, excess character variants): outside operations-focused scene scope. No exhaustive semantic visual review of every one of 5,101 v8.2 FBXs was done. |
| `LICENSE_BLOCKED` | All Low Poly Ultimate v8.2 and character candidates until a verifiable authorized acquisition and applicable SaaS terms are established. |
| `EXCLUDE_FROM_RUNTIME` | Utility pole collection in `public/assets/restaurant-3d/30_Low_Poly_Utility_Poles/`: unrelated to restaurant needs; it has OBJ/MTL/FBX/Blend and no bundled license documentation. It was inventoried but not selected. |

**Terrace gap after this evaluation:** the v8.2 source has candidates for tables/chairs, umbrella, potted tree, fence, and concrete tiles, but no verified neutral modular railing/planter set was selected. KayKit alone remains short of a complete terrace set. Also missing from the inspected candidate set are validated collision/navigation clearances, attractive but restrained outdoor vegetation variety, and a rendered test for umbrella/table sightlines. These are requirements to resolve, not justification to import unrelated assets.

## Operational architecture guidance

- Keep business table identity, status, reservations, orders, guest state, alerts, and kitchen activity in existing application data. Models are presentation only.
- Keep one simple operational collider/hit area per table and use a separate table ID mapping; do not use detailed chair/table triangles as the sole selector. Prevent decorative collision meshes from intercepting selection.
- Render status labels and alerts in a separate overlay layer, maintain camera focus and open sightlines, and use current cutaway behavior for walls. Avoid tall props behind active-table labels and keep the kitchen/bar visible at operational camera angles.
- Define navigation/collision footprints separately from render geometry. Check chair pullback, stool/counter clearance, doors, aisle widths, and guest paths before placement. Umbrella poles, fences, cabinets, and open fridge doors are potential blockers.
- Instance repeated geometry only after confirming identical geometry/material/transform conventions. Use shared atlas materials and avoid one light object per decorative lamp; decorative light meshes need not create dynamic Three.js lights.

## Recommendation and next steps

1. Keep KayKit Restaurant + Furniture as the current visual base; do not replace the coherent in-scene collection with this pack.
2. Before integration, establish authorized purchase/download evidence for each new pack and get a clear answer that embedding the selected models in a browser-delivered SaaS is permitted under the applicable license.
3. If cleared, convert only the few bar/terrace/architecture candidates above to GLB, preserve/trim their shared atlas dependencies, normalize units/origins, and compare them in an isolated review render next to KayKit and Quaternius. Do not change the production scene in that review.
4. Measure GLB bytes, decoded texture memory, draw calls and mobile frame time after conversion. This audit’s low triangle totals are encouraging but do not establish runtime performance.
5. Keep the character pack out of the first integration. Revisit only if a properly licensed sample can be converted with all skin weights preserved, a retarget map is validated, and seated animations are available.

**Phase 3.1K-B1 decision: not ready to integrate these new packs.** The existing KayKit base can continue to support operational scene work, but newly inspected assets are blocked by unverified provenance/license and require conversion plus visual review. The shortlist is for selecting what to evaluate after those gates, not production approval.
