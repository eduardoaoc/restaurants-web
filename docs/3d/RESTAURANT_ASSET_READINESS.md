# Restaurant 3D Asset Readiness

Status: static asset audit; no scene or application code was changed. File inventory and glTF metadata were inspected. Nothing was rendered or measured on a GPU.

See [`ASSET_CATALOG.md`](./ASSET_CATALOG.md) and [`asset-catalog.json`](./asset-catalog.json) for the full four-pack catalog.

## Coverage matrix

“Available” means a named asset exists in a bundled pack. “Composition” means available pieces need to be assembled or repurposed; it does not imply that a scene has been rendered or fit-tested.

| Area | Available and suitable | Available but requires composition | Missing / limitation |
|---|---|---|---|
| Dining room | KayKit Restaurant Bits: `table_round_A.gltf`, `table_round_A_small.gltf`, `table_round_B.gltf`, `chair_A.gltf`, `chair_B.gltf`; Furniture Bits: `chair_A.gltf`, `chair_B.gltf`, `chair_C.gltf`, `table_small.gltf`, `table_medium.gltf`, `table_medium_long.gltf`. | Lounge/booth-like corner from `armchair.gltf` or `couch.gltf`, plus `cabinet_medium.gltf` and `shelf_B_large_decorated.gltf`. Rugs (`rug_rectangle_A.gltf`) can define a zone. | No actual booth in either KayKit pack. KayKit Restaurant Bits has kitchen tile (`floor_kitchen.gltf`, `floor_kitchen_small.gltf`), not a general dining floor. No KayKit wall/window modules in Furniture Bits; use Restaurant Bits `wall.gltf`, `wall_half.gltf`, `wall_window_open.gltf`, `wall_window_closed.gltf`. |
| Bar | A simple service counter can use Restaurant Bits `kitchencounter_straight_A.gltf` and `kitchencounter_straight_B.gltf`; Furniture Bits `shelf_B_large.gltf` and `shelf_B_large_decorated.gltf` can furnish a back wall. | Compose counter frontage and back shelving from those modules. Diner alternatives are `Counter/Diner_Counter_Straight_2m.glb` and `Counter/Diner_Counter_Corner_Curved.glb`, paired with `Counter/Stool_Chrome_Swivel_Diner.glb`, but they visibly introduce a separate retro diner style. | Neither KayKit pack supplies a bar-specific counter or a bar-height stool. Furniture `chair_stool.gltf` is 0.5 model units tall from static bounds, so it is not a matched bar stool. No taps or bar glassware set. |
| Kitchen | Restaurant Bits: `kitchencounter_straight_A.gltf`, `kitchencounter_straight_B.gltf`, `kitchencounter_sink.gltf`, `kitchentable_A_large.gltf`, `stove_multi.gltf`, `stove_single.gltf`, `oven.gltf`, `fridge_A.gltf`, `extractorhood.gltf`, `kitchencabinet.gltf`. Furniture Bits can add `cabinet_medium.gltf` and shelves. | Service pass can be suggested by Restaurant Bits `wall_orderwindow.gltf` with `kitchencounter_straight_A.gltf`; storage and prep zones use the counter/cabinet modules. | No gap for a basic low-poly kitchen. Detailed appliance contents are decorative and should not carry live kitchen state. |
| Entrance | Restaurant Bits `door_A.gltf`, `door_B.gltf`, `wall_doorway.gltf`, `wall_window_open.gltf`; Diner `Building/Diner_Wall_Door_4m.glb`; Sushi `Environment/Wall_Door.gltf`. | Furniture Bits `cabinet_small.gltf` or `cabinet_medium.gltf` can be repurposed as a host stand; `pictureframe_standing_A.gltf` can suggest a tabletop notice. | No dedicated reception/host stand, awning, or neutral storefront sign. Diner and Sushi signage are themed. |
| Outdoor terrace | Reusable Restaurant Bits `table_round_A.gltf`, `chair_A.gltf` and Furniture Bits `table_small.gltf`, `chair_A.gltf`; Sushi has `Decoration/Decoration_SakuraTree.gltf` and `Decoration/Decoration_Bamboo.gltf` if a Japanese theme is accepted. | Diner `Building/Pier_Striped_Gold_Teal_Diner.glb` is a pier module, and Sushi plants are themed; neither is a neutral patio kit. Furniture `cactus_medium_A.gltf` and `cactus_small_A.gltf` are indoor potted cactus props, not planters for a patio. | No suitable umbrellas, outdoor dining set, planters, fence/railing, or terrace flooring. Outdoor furniture has not been validated for weather/scene use. This is the largest coverage gap. |
| Decoration | Furniture Bits: `lamp_standing.gltf`, `lamp_table.gltf`, `pictureframe_large_A.gltf`, `pictureframe_medium.gltf`, `pictureframe_small_A.gltf`, `shelf_B_large_decorated.gltf`, `cactus_medium_A.gltf`, `book_set.gltf`, `rug_rectangle_A.gltf`, `couch_pillows.gltf`. Restaurant Bits adds `menu.gltf`, jars, plates and food/tabletop props. | Diner `Decor/Hubcap_Wall_Set_Diner.glb`, `Neon/Diner_Sign_Neon_Word_6m.glb`; Sushi `Decoration/Decoration_Plant1.gltf`, `Decoration/Decoration_Painting.gltf`, `Decoration/Decoration_WallLight.gltf`, `Decoration/Decoration_Sign.gltf` require a deliberate style choice. | KayKit Furniture Bits has no outdoor landscaping beyond cactus props and no standalone ceiling/pendant lighting. No neutral restaurant sign. |

## Visual and technical compatibility

- KayKit Restaurant Bits and Furniture Bits are by Kay Lousberg and share a stylized low-poly treatment. Their textures have separate palettes (both 1024×1024); the furniture atlas is more muted and wood/grey-heavy. Static inspection supports using them together, but no assembled render establishes an exact visual match.
- Furniture Bits contains 53 glTF models; 49 are restaurant-suitable under this audit (the 4 bed models are not). It has 53 external `.bin` buffers, one shared 1024×1024 texture, one material name, and 15,344 triangles total (median 216, maximum 1,018 per model). No byte-identical glTF or buffer duplicates were found. Three chair files (`chair_A_wood`, `chair_B_wood`, `chair_stool_wood`) are material/palette variants; decorated shelf/cabinet and pillow variants contain geometry differences.
- Runtime files total 865,610 bytes (845 KiB); the moved original ZIP is 3,780,559 bytes (3.60 MiB), and the full extracted source tree is 6,653,489 bytes (6.34 MiB). Runtime files preserve model names and include only glTF, buffers, shared texture and license. FBX/OBJ/MTL are retained in `assets-source/restaurant-3d/full/furniture/`.
- The pack uses standard glTF with external buffers and texture and no observed decoder extension requirements; it is compatible in format with Three.js `GLTFLoader`/TresJS `useGLTF`. Local POSITION accessor bounds were recorded in JSON. They exclude node transforms, so origins and final scene bounds still need checking during implementation. Representative bounds: `table_small` 1×1×1, `table_medium` 2×2×1, `table_medium_long` 3×2×1, `chair_A` 0.75×1.2583×0.8451 model units, `chair_stool` 0.75×0.5×0.75. Treat these as static geometry extents, not a rendered scale validation.
- Tables, chairs, shelves, cabinets, lamps and plants are likely instancing candidates where geometry and material are identical. Wood variants and decorated variants need separate batches/materials. No draw-call, memory, frame-rate or GPU measurements were made.

## Operations-focused usage guidance

- Keep the business table ID/status and guest/order state in application data; visual model choice is presentation only. Pick one clickable table proxy per operational table, associate its instance ID with the business table ID, and keep labels/status overlays in a separate UI/overlay layer.
- Give click targets an invisible/simple collider sized to each table footprint, rather than relying on detailed chairs, props or wall meshes. This keeps table selection predictable even when furniture changes.
- Keep floor-level table labels visible from the default camera. Prefer labels above tabletops and avoid placing tall cabinets, lamps or plants in the sightline behind active tables. Use selective wall hiding/cutaway during focus so perimeter walls do not conceal tables.
- Group navigation obstacles and customer paths separately from render meshes. Chair/table clearances, counter edges and decorative props should not block guest routes by default. Keep decorative clutter sparse around tables and operational alerts.
- Preserve open camera sightlines to the dining room, service counter and kitchen. Use focus framing and UI labels for operational state instead of decorating each table with extra objects.

## Recommended first-scene shortlist

Start visually with KayKit Restaurant Bits for the core interior and use Furniture Bits for complementary dressing:

- Dining/table selection: `table_round_A.gltf`, `table_round_A_small.gltf`, `table_round_B.gltf`, `chair_A.gltf`, `chair_B.gltf` (Restaurant Bits).
- Optional lounge variety: `armchair.gltf`, `couch.gltf` (Furniture Bits); do not present these as booths.
- Shelves and restrained decor: `shelf_B_large_decorated.gltf`, `cabinet_medium.gltf`, `pictureframe_medium.gltf`, `lamp_standing.gltf`, `cactus_small_A.gltf` (Furniture Bits).
- Room envelope: `wall.gltf`, `wall_half.gltf`, `wall_window_open.gltf`, `wall_doorway.gltf`, `door_A.gltf`, `pillar_A.gltf` (Restaurant Bits). Use a deliberately sparse or cutaway wall layout for table visibility.
- Kitchen/service visibility: `kitchencounter_straight_A.gltf`, `kitchencounter_sink.gltf`, `stove_multi.gltf`, `oven.gltf`, `fridge_A.gltf`, `extractorhood.gltf`, `wall_orderwindow.gltf` (Restaurant Bits).
- Basic dressing only: `menu.gltf`, `plate.gltf`, `bowl.gltf` (Restaurant Bits). Avoid loading the catalog as a whole; select per scene need.

## Readiness decision

The library is ready for visual architecture decisions and a scoped first indoor operations scene. KayKit Restaurant + Furniture is the strongest coherent base, with enough tables, chairs, kitchen modules and restrained decor to represent operations. The catalog is not a complete all-areas restaurant kit: a neutral bar-height stool/counter pairing and the terrace set are missing. If Phase 3.1K requires an outdoor terrace in its first deliverable, acquire/approve a matching patio pack first; if it can be staged, defer terrace assets and proceed with interior architecture later. No Phase 3.1K scene implementation was started in this audit.
