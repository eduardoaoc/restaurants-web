# Lowpoly street props — lamp post and door planters (Ultimate fixture)

Scope: the isolated Ultimate scene (`/dev/restaurant-3d-fixture`, `?environment=ultimate`). `UrbanExterior.vue` is only mounted
by `RestaurantScene` when `environment === 'ultimate'`, so no other scene (KayKit, Dashboard stage) is affected. Dashboard,
`restaurants-api`, persisted layouts and other scenes untouched. Nothing committed or pushed. No bench added; the two trees and
the bench were left out by the audit.

> **Status update — production delivery (§9).** The vendor's authorization was confirmed by the project owner, so the two GLBs now ship as static
> build assets. §2 (dev-only serving), the licence "open question" in §3 and the isolation notes in §8.3 describe the earlier dev-only stage and are
> kept as history; where they conflict with §9, §9 applies.

## 1. What changed

| Item | Before | After |
|---|---|---|
| Street lamps (`plan.lamps`, `plan.farLamps`, 36 in total) | procedural `lamp-poles`, `lamp-arms`, `lamp-heads` | `street-kit/asset-props-lamp-post.glb`, uniform scale 0.9 (4.5 m), one instanced mesh `lamp-posts-lowpoly` |
| The two 1.1 m door planters (`plan.planters`, `w = DOOR_PLANTER_WIDTH`) | procedural concrete box + icosphere shrubs | `street-kit/asset-props-planter.glb`, uniform scale 0.91, rotation 0, same `(a, d)`, one instanced mesh `door-planters-lowpoly` |
| 1.8 m planters, terrace hedges, interior pots, trees, cover logic | — | unchanged |

Details (`UrbanExterior.vue`):
- **Lamp axis:** the pole axis is at z ≈ −0.49 in the model. The geometry is translated by `+0.49 × 0.9` in z **before** the instance
  yaw, so the pole lands exactly on the plan point whatever the rotation.
- **Arms toward the road:** the arm points +z of the model. Near-side lamps use yaw 0 (the road is at larger `d`), far-side lamps
  yaw π (the road is at smaller `d`). Verified on a render from the side (`after-lamps-side-view.png`): near arms point left (towards
  the road), far arms point right.
- **Lighting:** `lp_glass` → `materials.lampGlow` (the scene's warm emissive, 0.55); `lp_metal` → `materials.pole`. No light was
  added. Shadows: the lamp mesh does not cast (the procedural ones never did).
- **Planter colours:** `lp_trim` → `materials.planter` (`#9b9188`); `lp_foliage` → `materials.shrub` (scene green) so the palette
  stays coherent. The procedural box and shrubs of those two planters are not drawn (no overlap); `shrubs()` and the box list now
  only receive the other planters.
- **Navigation:** the planter rectangles and the lamp circles (r = 0.16) come from the plan untouched (`frontend-lowpoly-street`
  asserts one outdoor obstacle per planter).
- **No picking:** both meshes come from `instancePlacements` (`raycast = () => undefined`); `frustumCulled = false` like the other long
  street meshes.
- **Loading:** `loadKayKitModel` (existing cached GLTF loader) and `flattenModel` / `instancePlacements` (existing instancing
  utilities, now exported use in this component). A failed or missing load logs a warning and keeps the procedural props.
- **Dev-only switch:** `?lowpoly=off` keeps the procedural props, used for the before/after comparison below.

Other files: `urban-plan.ts` (exports `DOOR_PLANTER_WIDTH`, used by the planner and the renderer), `vite.config.ts`, the new test
`tests/frontend-lowpoly-street.mjs`.

## 2. (History) Dev-only serving, production exclusion and the CRLF note
- Files live in the ignored `assets-source/restaurant-3d/lowpoly-street/` (`asset-props-lamp-post.glb` 9 876 B,
  `asset-props-planter.glb` 8 428 B, the vendor `README.txt`), extracted from `assets-source/restaurant-3d/lowpoly-free-pack.zip`.
- `vite.config.ts`: the existing dev-only middleware now has two mounts (Ultimate pack and `/assets/restaurant-3d/models/lowpoly-street/`);
  it only serves `.glb`, inside the mount directory. `curl` on the running dev server: both GLBs `200` with the exact byte sizes;
  `README.txt` `404`; a `..` traversal `404`; the Ultimate route still `200`.
- **Not in the production build:** `configureServer` never runs in a build and nothing is under `public/`. After `npm run build`:
  `dist` has **0** references to `lowpoly-street` or `asset-props`, and the 12 `.glb` files in `dist` are the existing KayKit ones.
  The component also guards the request with `import.meta.env.DEV`.
- `vite.config.ts` had CRLF line endings; they were preserved (`git diff`: 19 insertions, 8 deletions).

## 3. Licence (README and vendor terms; open question closed in §9)
- **README.txt in the ZIP:** "Royalty-free for commercial use in games, apps, websites, renders and client work. You can edit,
  recolor and combine the models and ship them in free or paid projects. You can't resell or redistribute the models themselves,
  alone or as a pack. Full terms: https://lowpoly.download/pricing/#license".
- **Vendor page** (fetched during the audit): "Every model you download, free or paid, is royalty-free for commercial use", websites
  are listed among permitted uses, no attribution, no seat/project limit; prohibits reselling or redistributing the models themselves
  "alone or as a pack" and presenting them as your own asset library; full terms "published with accounts" (not accessible here).
- **Open question (blocker before any public exposure):** neither source says whether **serving the GLBs directly to a browser** counts
  as redistributing the models themselves. Until the vendor answers in writing, the files stay in `assets-source`, are served by the dev
  middleware only, and must not be copied to `public/` or any production artifact.
- Source: lowpoly.download free pack, 197 GLBs (README header "lowpoly. free pack · Everything"); SHA-256 of the ZIP identical to the copy in Downloads.

## 4. Visual comparison (1440×900, default framing; `docs/3d/evidence/phase-3-1k-lowpoly-street/`)
`before-*` = same page with `?lowpoly=off`, `after-*` = default. Same camera presets for both.

- `before-default-1440x900.png` / `after-default-1440x900.png`: lamps and door planters at the default view.
- `before-door-planters.png` / `after-door-planters.png`: the two door planters (cream concrete tone replaced by `#9b9188`, two-clump shrub).
- `before-lamps-near.png` / `after-lamps-near.png`, `before-lamp-near-arm.png` / `after-lamp-near-arm.png`: pole base and arm; the pole stays at the
  same position (axis correction works), the new lamp has a small base plinth and a head with the warm lens.
- `after-lamps-side-view.png`: both sides of the street from the east, arms towards the road.
- `after-table-selection.png` (Mesa 04 sheet), `after-recentered.png` (Centrar vista), `after-editor.png` (layout editor).
- Salon visibility: lamps and planters stay on the sidewalk; nothing new enters the dining area, the badges ("Nuevo pedido",
  "Pidió cuenta", table pills) and the tables are as before.

## 5. Performance (software GL, headless Chrome, 1440×900, default framing, 5 seated guests)

| | Draw calls | Triangles | Geometries | Textures |
|---|---|---|---|---|
| Audit reference | 382 | 76 714 | 114 | 10 |
| Before (`?lowpoly=off`, re-measured today) | **382** | **76 714** | 114 | 10 |
| After | **385** | **78 418** | 113 | 10 |
| Delta | +3 | +1 704 (+2.2 %) | −1 | 0 |

The before measurement reproduces the audit exactly (same page, viewport, framing and guest count), so the comparison is like for
like. The extra triangles are the 100-triangle lamp (vs ~56) × 36 lamps; draw calls rise because the multi-material model needs two
draw groups per mesh and the door planters add a mesh. Asset weight: 9 876 + 8 428 = **18 304 bytes** (≈ 5.5 kB gzip), dev only.
**Frame time was not measured**: software GL runs at 1–7 FPS and says nothing about GPU performance; no GPU claim is made.

## 6. Validation results
- `npx vue-tsc -b`: pass. `npm run build`: pass (`built in 6 s`; the existing chunk-size warning only). `dist` has no trace of the models (see §2).
- Regression (all pass): `static-cutaway` 11, `urban-exterior` 25, `tree-cover` 16, `camera-limits` 4, `navigation` 24,
  `environment-plan` 9, `entrance`, `customers` 14, `floor-editor`, `floor-layout`, `layout-revision`, `render-performance`,
  `operational-readability` 15, `operational-contracts`, `dashboard-stage` 6, `table-mapping`, `hardening-build`, `realtime` 38
  (the browser suites need `AGENT_BROWSER_SOCKET_DIR=$HOME/.ab` in this sandbox). New `frontend-lowpoly-street.mjs`: 4 checks
  (two door planters per entrance and obstacles intact, dev-only/DEV-guard/fallback/off switch, vite mounts restricted, GLB facts).
- Browser (agent-browser, real fixture, 1440×900): lamps and planters aligned (see §4); four entrances (south, west, east, north)
  guest cycle spawn behind a tree → entrance → seat → depart → hidden despawn: **0 navigation failures, 0 console errors, 4/4 guests gone,
  counters back to 0**; Centrar vista after an orbit (OK); table selection opens the Mesa 04 sheet; operational badges visible; layout editor
  opens ("Modo edición"); console clean in all runs.
- Pending at the time of §6, closed in §8: dynamic alerts, real-GPU frame time, fallback test. Still pending: the vendor's full terms and
  written answer on browser delivery; the live API (unreachable in this environment).

## 7. Files changed / created
Changed: `src/components/restaurant-3d/UrbanExterior.vue`, `src/components/restaurant-3d/urban-plan.ts` (`DOOR_PLANTER_WIDTH`),
`vite.config.ts`. Created: `tests/frontend-lowpoly-street.mjs`, this document, `docs/3d/evidence/phase-3-1k-lowpoly-street/`, and (ignored
by git) `assets-source/restaurant-3d/lowpoly-street/`. The other modified/untracked entries in `git status` (camera, walls, i18n,
E1/E2/D2C docs and evidence) are earlier phases and were preserved.

## 8. Final review (pending checks)

No source file changed in this review (only this document and new evidence), so build, typecheck and the suites were not re-run for code
reasons; the dist check below did rebuild (`npm run build`: pass).

### 8.1 Dynamic alerts — done, with a limitation
- **Limitation:** the fixture has **no control that creates or resolves an alert**. Its events are the constant `ultimateDemoEvents` (two
  events); the simulator buttons only add/remove guests (which changes ring status, not badges).
- **How it was tested instead (no code change):** at runtime, through the Vue instance of `Restaurant3DFixtureView`
  (`document.querySelector('#app').__vue_app__._instance`, then `setupState.fixtureEvents = [...]` + `$forceUpdate()`), the `operational-events`
  prop was replaced by a new array, which is what the scene reacts to.
- **Results** (badge text read from the DOM, plus screenshots `alerts-0 … alerts-5`):

| Step | Badges on screen |
|---|---|
| start (Mesa 03 new order, Mesa 04 bill) | Nuevo pedido, Pidió cuenta |
| + `order_ready` (attention) on `table-5` | + **Pedido listo** on Mesa 05 |
| + `waiter_requested` (critical) on `table-5` | Mesa 05 badge **updates** to **Llamó camarero** (higher priority wins), red ring |
| events removed (resolved) | Mesa 05 badge **disappears**; the other two stay |

- Selection with the alert present: clicking Mesa 05 opens the "Mesa 05" sheet; closing it keeps the badge. The layout editor opens ("Modo edición", 5
  table labels) and returning to Operación restores the badges. Console: 0 errors/warnings.
- Not covered: a real resolve flow (there is none in the fixture) and realtime-driven alerts from the API (unreachable); the selection rule itself
  (highest priority, newest wins) is covered by `operational-readability`.

### 8.2 Frame time on real hardware — done, with caveats
- Default headless Chrome renders in software (`ANGLE … SwiftShader`). Hardware acceleration was obtained by launching with
  `GALLIUM_DRIVER=d3d12 MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA LD_LIBRARY_PATH=/usr/lib/wsl/lib` and
  `--use-angle=gl-egl --ignore-gpu-blocklist --disable-gpu-sandbox` (WSL2 + Mesa d3d12). `WEBGL_debug_renderer_info`:
  **`ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3050 Laptop GPU), OpenGL ES 3.1)`**, HeadlessChrome 155.0.0.0, Linux (WSL2). Hardware
  acceleration confirmed; it is a laptop GPU behind a translation layer (D3D12 over WSL), not a native desktop pipeline, and not a phone GPU.
- Method: 1440×900, default camera, 5 seated guests, fresh page load, 9–10 s settle, then `requestAnimationFrame` intervals for 6–8 s;
  alternating `?lowpoly=off` / default, 3 runs each. Draw calls and triangles read from the stats panel match the earlier numbers (382 / 76 714 off,
  385 / 78 418 on).
- **Vsync on (default):** both variants run at a locked **60 FPS, 16.67 ms** for every frame (p50 = p95 = 16.7 ms): the GPU has headroom, so no
  difference is observable.
- **Vsync off** (`--disable-frame-rate-limit --disable-gpu-vsync`, wall-clock frame interval, includes JS and compositor, not pure GPU time):

| Run | `?lowpoly=off` mean / p95 | default (lowpoly) mean / p95 |
|---|---|---|
| 1 | 4.89 / 10.1 ms (204.5 FPS) | 5.23 / 8.0 ms (191.2 FPS) |
| 2 | 5.52 / 13.3 ms (181.1 FPS) | 5.28 / 8.0 ms (189.5 FPS) |
| 3 | 5.33 / 13.6 ms (187.8 FPS) | 5.35 / 13.5 ms (186.9 FPS) |
| Mean of means | **5.25 ms** | **5.29 ms** |

  The difference (0.04 ms) is far below the run-to-run spread (about 0.3 ms): **no measurable impact on this hardware**. Not measured: a GPU timer
  query, a mid-range phone, a native Windows/Linux desktop GPU. Mobile-GPU performance remains pending.

### 8.3 (History) Isolation of the GLBs while they were dev-only — done
- **Dev only:** the two GLBs are answered by the dev middleware (`200`, 9 876 / 8 428 bytes, `model/gltf-binary`); the component requests them only under
  `import.meta.env.DEV` and the route only exists in `configureServer`.
- **Not in the build:** after `npm run build`, `dist` contains **0** references to `lowpoly-street` or `asset-props` and no such file (12 `.glb` in
  `dist`, all pre-existing KayKit). A static server over `dist` returns **404** for `/assets/restaurant-3d/models/lowpoly-street/asset-props-lamp-post.glb`
  and 200 for a KayKit control file. (`vite preview` itself needs production env variables in this project, so a static server was used.)
- **Fallback:** with both URLs blocked (`agent-browser network route "**/lowpoly-street/**" --abort`, set before load), the scene loads with the
  procedural lamps and planters: stats **382 draw calls / 76 714 triangles / 5 customers** (identical to `?lowpoly=off`), a single
  `[restaurant-3d] lowpoly street props unavailable, keeping the procedural ones` warning, 0 errors (`fallback-models-blocked-default.png`,
  `fallback-models-blocked-lamps-near.png`).
- **Open licence question:** unchanged and documented in §3 (browser delivery vs "redistribute the models themselves"; full terms "published with accounts").

### 8.4 Draft question to the vendor (lowpoly.download)
> Subject: Written confirmation for serving free-pack GLBs in a published web app
>
> Hello,
> We use two models from the lowpoly free pack (`street-kit/asset-props-lamp-post.glb` and `street-kit/asset-props-planter.glb`) in a commercial SaaS web
> application. Your terms allow commercial use in websites and apps, and forbid reselling or redistributing the models themselves. In a published web
> app the browser downloads the `.glb` files directly from our server (as the app's static assets), unmodified apart from runtime recoloring.
> Could you confirm in writing that serving the unmodified GLB files to end users' browsers this way is permitted and is not "redistribution of the models
> themselves"? If it is not, could you tell us which licence or tier covers it (for example, embedding the geometry in our compiled bundle)?
> Thank you,

### 8.5 Files and diff
Changed in this review: `docs/3d/PHASE_3_1K_LOWPOLY_STREET.md` and new captures in `docs/3d/evidence/phase-3-1k-lowpoly-street/`
(`alerts-0…5`, `fallback-models-blocked-*`). No source, test, config or asset file changed; earlier-phase changes were preserved; nothing committed or pushed.

## 9. Production delivery

### 9.1 Authorization (recorded)
The project owner confirmed that lowpoly.download **authorized by e-mail** serving these two files directly to the browser in the Ritma OS web app.
The e-mail is not available in this environment, so the date, sender and any conditions are **not recorded here**; this is the owner's confirmation
only. It covers `asset-props-lamp-post.glb` and `asset-props-planter.glb`, unmodified apart from runtime recoloring. The vendor terms otherwise still
apply (no reselling or redistribution of models/packs). Do not add other files of the pack to `public/` without a new confirmation. A
`LICENSE-NOTE.txt` with this scope ships next to the files. **Recommendation:** archive the original e-mail with the project's licence records.

### 9.2 Delivery strategy
- **Assets:** copied (byte-identical, SHA-256 `fcd435cd22c92e50…` lamp, `41451b3b6ec8565a…` planter) to
  `public/assets/restaurant-3d/models/lowpoly-street/`, the project's convention (same tree as `kaykit-restaurant` / `kaykit-furniture`). Vite copies
  `public/` to `dist` as-is: the build contains exactly `asset-props-lamp-post.glb` (9 876 B), `asset-props-planter.glb` (8 428 B) and
  `LICENSE-NOTE.txt`. The pack's ZIP and the other 195 models are not in `public/` or `dist`; the originals stay in the ignored `assets-source/`.
- **URL / base path:** `UrbanExterior.vue` builds it from `import.meta.env.BASE_URL` (Vite's configured `base`; the project does not set one, so it is
  `/`). Verified with a build using `--base=/ritma/`: the bundle contains `/ritma/assets/restaurant-3d/models/lowpoly-street`. (Existing scene code uses
  hard-coded absolute paths; this component is base-safe.)
- **Scope of loading:** only `UrbanExterior`, which `RestaurantScene` mounts only for `environment === 'ultimate'`; the Dashboard stage and the KayKit
  scene never request the files (new test asserts no other scene file references the path).
- **Dev switch and fallback:** `?lowpoly=off` is honoured only when `import.meta.env.DEV` (stripped from production bundles: 0 matches in both
  production builds). The load has no DEV guard any more; a failed request logs one warning and keeps the procedural lamps and planters.
- **Vite middleware:** the lowpoly mount was **removed** (it is no longer needed: `public/` is served by Vite in dev and copied in builds).
  `vite.config.ts` is back to the original Ultimate-pack dev route only (diff vs HEAD: a 6-line comment; CRLF preserved).

### 9.3 Verifications
| Verification | Result |
|---|---|
| `npx vue-tsc -b` | pass |
| `npm run build` (`vue-tsc -b && vite build --mode development`, the repo's script) | pass; `dist/assets/restaurant-3d/models/lowpoly-street/` has the 2 GLBs + note, hashes identical to `public/` |
| Production-mode build (`vite build --mode production` with dummy valid `VITE_*` origins, scratch outDir) | pass; same 3 files; URL `/assets/restaurant-3d/models/lowpoly-street`; `?lowpoly=off` string absent |
| Production-mode build with `--base=/ritma/` | pass; URL `/ritma/assets/…` |
| `vite preview --mode production` over that build | lamp: `200`, `model/gltf-binary`, 9 876 B, hash = source; planter: `200`, 8 428 B, hash = source |
| Same preview: Ultimate dev route `/assets/…/ultimate-pack/house-wall-3x3m.glb` | returns the SPA HTML fallback (no GLB); `dev/restaurant-3d-fixture` string absent from the production bundle |
| GLBs from the **build output** loaded with `GLTFLoader` and rendered (`prod-build-assets-loaded.png`) | both `200`, 100 + 100 triangles |
| Real scene in the fixture (dev server, files from `public/`) | models requested `200` (9 876 / 8 428 B), scene renders, **385 draw calls / 78 418 triangles / 5 customers**, alignment identical to before (`public-assets-default-1440x900.png`), console clean |
| `?lowpoly=off` (dev) | 0 requests, **382 / 76 714** |
| Both requests blocked (`network route … --abort`) | procedural fallback, **382 / 76 714**, one "keeping the procedural ones" warning, 0 errors (`public-assets-fallback-blocked.png`) |
| Guest lifecycle, 4 entrances (south, west, east, north) | spawn behind a tree → entrance → seat → depart → hidden despawn, 4/4 gone, counters back to 0, 0 console errors |
| Table selection (Mesa 04 sheet), Centrar vista, layout editor | work; console clean. Alerts: the dynamic-alert result of §8.1 stands (no alert code changed) |
| `node tests/frontend-lowpoly-street.mjs` (updated) | 5 checks pass: two door planters per entrance, base-aware URL / dev-only off switch / fallback, only `UrbanExterior` references the path, `public/` contains exactly the two GLBs + note, middleware keeps only the Ultimate route, GLB facts |
| Regression suites (every `tests/frontend-*.mjs`, 40 files, run once each) | 36 pass (exit 0), including `static-cutaway`, `urban-exterior`, `tree-cover`, `camera-limits`, `navigation`, `customers`, `floor-editor`, `layout-revision`, `operational-*`, `realtime`, `dashboard*`, `hardening*`; 4 fail (next row) |
| Failing suites | `frontend-approvals`, `frontend-design-tokens`, `frontend-primitives.browser`, `frontend-ritma-redesign`: **identical failures on a clean `HEAD` worktree** (approvals: "item count sums quantities"; design-tokens: missing `docs/design/DESIGN_SYSTEM.md`; primitives.browser: "Snackbar does not cover bottom CTA"; ritma-redesign: "desktop kitchen board fits its four real states…"). Unrelated to the 3D scene; not touched. |

### 9.4 Not verifiable here
- The real component cannot be mounted from a production build: `/dev/restaurant-3d-fixture` exists only in development (`import.meta.env.DEV`
  route) and the Dashboard does not pass `environment="ultimate"`. That restriction was preserved. The build assets were verified through the
  preview server (URLs, bytes, hashes), an isolated `GLTFLoader` render of the build output, and the real scene loading the same files from `public/`.
- The e-mail itself (date, sender, conditions), a deploy, a public host's headers/CDN behavior, and real-GPU timing on mobile were not checked.

### 9.5 Files and diff
Changed: `src/components/restaurant-3d/UrbanExterior.vue` (URL from `BASE_URL`, DEV guard removed from the load, off-switch DEV-only),
`vite.config.ts` (comment only vs HEAD), `tests/frontend-lowpoly-street.mjs`, this document. New: `public/assets/restaurant-3d/models/lowpoly-street/`
(2 GLBs + `LICENSE-NOTE.txt`), `docs/3d/evidence/phase-3-1k-lowpoly-street/prod-build-assets-loaded.png`, `public-assets-default-1440x900.png`,
`public-assets-fallback-blocked.png`. Earlier-phase changes were preserved. No commit, push or deploy.

## 10. Homologation round 2 — current checkout

### 10.1 Starting point and scene loading
- Git was clean at the start of this round. No app, API, test, permission or build configuration source file was edited.
- The requested `docs/design/DESIGN_SYSTEM_SALOA.md` is absent in this checkout. `docs/design-system.md` and `docs/design/UI_AUDIT.md` were read instead; this round made no UI changes.
- The tested URL was `/dev/restaurant-3d-fixture?environment=ultimate`. The dev-only `Restaurant3DFixtureView` passes its local layout, operational state, events, entrance and guest simulator to the real `RestaurantScene`. `RestaurantScene` mounts `UrbanExterior` for the Ultimate environment. `UrbanExterior` draws its procedural exterior first, then fetches both files from `${BASE_URL}assets/restaurant-3d/models/lowpoly-street/` through the cached GLTF loader. Only after both requests succeed does it replace the two door planters and streetlights and rebuild. `Promise.all` failure leaves both procedural replacements active and emits one warning. The DEV-only `?lowpoly=off` switch skips both requests.
- `networkidle` alone fired before the whole scene had loaded. Final captures waited for the expected stats and then another 1.5 seconds; earlier interim captures made during this round were discarded or replaced.

### 10.2 Desktop visual and performance comparison
- Captures: `round-2-default-five-seated-1440x900.png` and `round-2-procedural-five-seated-1440x900.png`. Both are 1440 × 900, standard camera, default demo state, five seated guests, same headless Chrome/SwiftShader setup. This reproduces the previous comparison conditions.
- Current readings match the previous absolute values as well as the delta:

| Variant | Draw calls | Triangles | Geometries | Textures |
|---|---:|---:|---:|---:|
| Procedural (`?lowpoly=off`) | **382** | **76 714** | 114 | 10 |
| Standard (two GLBs) | **385** | **78 418** | 113 | 10 |
| Delta | **+3** | **+1 704 (+2.2%)** | −1 | 0 |

- Both screenshots show the same entrance, door-side planters, sidewalks, road, terrace, cutaway walls, tables, labels and badges. The GLB poles land on the same plan points, their arms face the road on both sides, and the lamp lens is warm. No missing or doubled street object was visible after the settled render.
- The earlier intermediate measurement of 386 / 78 930 was made with `?guests=5`, which selects generated `guestFixture` state rather than the default five seated demo state. It reproduced the same +3 / +1 704 delta, but not the historical absolute totals; it is not used in the final comparison above.

### 10.3 Browser interactions and local alert simulation
- All four entrance placements were accepted by the fixture as `Entrada válida`: south `(0, 7.5)`, north `(0, -7.5)`, west `(-9.25, 0)`, east `(9.25, 0)`. The guest-cycle run ended with zero route failures. Existing `entrance` and `navigation` suites also passed.
- **Guest cycle:** on Mesa 02, two locally simulated guests entered (the first interim capture shows one arrival active), reached the seats, then departed. Because this software-rendered browser ran at roughly 1–5 FPS, the fixture's manual `window.__floorLab.stepUntil` driver advanced the actor state deterministically; both arrived at `seated`, then both were removed after departure at `gone`. Customers and active arrival/departure/path counts returned to 5 / 0 / 0 / 0, with zero navigation failures. This verifies the fixture's simulation state machine; it is not a real-time performance measurement. Captures: `round-2-arrival-table2.png`, `round-2-arrivals-in-progress.png`, `round-2-departures-hidden.png`.
- `Centrar vista`, the Operación ↔ editor transition, and selection of Mesa 05 with an alert active were exercised in the browser. The selected table opened its detail sheet. Camera-boundary evidence this round is the passing 4-check `frontend-camera-limits` suite; the orbit-clamp screenshots from E1 remain the visual reference.
- **Alerts were simulated locally:** the fixture's Vue `operational-events` state was replaced in the browser for Mesa 05 with `order_ready`, then updated to critical `waiter_requested`, then cleared. The badge changed from “Pedido listo” to “Llamó camarero” on Mesa 05 and disappeared when cleared; selection worked while the alert was active. Captures: `round-2-alert-table5.png`, `round-2-alert-priority-update.png`, `round-2-alert-resolved.png`. No request was sent to the API. Realtime delivery, acknowledgement/resolution through a real API flow, and production authorization remain untested because no backend session/credentials were available.

### 10.4 Failure, cache and HTTP checks
- Blocking the lamp GLB alone, the planter GLB alone, and both together each produced the same fully loaded procedural result: **386 draw calls / 78 930 triangles** for this `?guests=5` generated fixture state. Each page logged exactly one `[restaurant-3d] lowpoly street props unavailable, keeping the procedural ones` warning, with no console error. Furniture and labels remained present; the screenshot with both blocked has no gaps or duplicate street props. `Centrar vista` and the editor remained usable after failure. Captures: `round-2-fallback-lamp-blocked.png`, `round-2-fallback-planter-blocked.png`, `round-2-fallback-both-blocked.png`.
- The normal dev page and the GLBs were loaded, then the page was reloaded. A `cache: 'reload'` fetch in the local production preview returned both complete objects (200 and expected bytes). `vite preview` returned `Cache-Control: no-cache`, weak ETags, and `model/gltf-binary`; re-requesting with `If-None-Match` returned **304** for each. This checks reload/revalidation behavior. A real cold browser profile was not available because this browser's cache is shared with other tests.
- Interaction after a request failure is confirmed above. Interaction while either GLB request is still pending was not verified: normal requests completed too quickly for a repeatable mid-load action, the browser CLI exposes request blocking/offline mode but no network-throttling control, and a temporary delayed proxy did not provide a usable Vite page. Controlled slow-network and mid-load interaction checks remain pending; no proxy or app change remains running.

### 10.5 Mobile emulation
- No physical phone was attached. Chromium's iPhone 15 device emulation produced a 393 × 852 CSS viewport and 1179 × 2556 screenshot (device scale 3), with no horizontal overflow. It reported `navigator.maxTouchPoints = 0` and `(pointer: coarse) = false`: this is responsive viewport/device-scale evidence, not native touch input.
- Paired captures use the same `?guests=5` generated guest state and standard framing: `round-2-mobile-default.png` and `round-2-mobile-procedural.png`; overall scene framing is also saved as `round-2-mobile-overview-default.png` and `round-2-mobile-overview-procedural.png`. The 3D canvas, labels, alerts, `Centrar vista` and editor fit the viewport. The badge text is legible, though the two alert badges overlap nearby table labels in this narrow view. Mobile editor capture: `round-2-mobile-editor.png`.
- Browser clicks exercised `Centrar vista`, the editor and table selection under the emulated viewport. Real touch gestures, drag/orbit, and mobile-GPU performance require a physical device. For that run, use the short on-device script in §11.

### 10.6 Production artifact and delivery
- Current commands/configuration: `npm run build` runs `vue-tsc -b && vite build --mode development`; `vite.config.ts` has no explicit `base`, so the default is `/`. `npm run build:production` is the repository production script. This round ran `npx vue-tsc -b`, `npm run build`, and an explicit local `vite build --mode production` into `/tmp/restaurants-web-phase-3-1k-production`. Dummy non-secret HTTPS origins (`https://api.example.invalid`, `https://app.example.invalid`) satisfied production validation; realtime values were empty. No credential value was printed.
- A second production build used `--base=/ritma/` into `/tmp/restaurants-web-phase-3-1k-base`. Its scene bundle references `/ritma/assets/restaurant-3d/models/lowpoly-street`; its preview mounted at `/ritma/` returned both models at 200, `model/gltf-binary`, with the same byte sizes and SHA-256 as the default-base preview. The default-base preview returned:
  - lamp: 200, `model/gltf-binary`, 9 876 bytes, ETag `W/"9876-1794873527558"`, SHA-256 `fcd435cd22c92e50224398ea129242958b467d2a7ebf0adaf253dd5dec439083`;
  - planter: 200, `model/gltf-binary`, 8 428 bytes, ETag `W/"8428-1794873527558"`, SHA-256 `41451b3b6ec8565ae2072e5116fbd2f071854c03b153afa63616eff1ce24f9d1`.
- `public/assets/restaurant-3d/models/lowpoly-street/` and both build outputs contain exactly the authorized lamp and planter plus `LICENSE-NOTE.txt` (662 bytes); each model's build hash matches `public/`. No other vendor pack model was added. The production preview's `/dev/restaurant-3d-fixture` returned generic SPA HTML, and the fixture route was absent from built JavaScript. The restriction remains intact.
- Evidence provenance: the two round-2 desktop/mobile comparisons, interactions and fallback captures above are the **complete scene in development**; the 200/header/hash and base-path checks are the **production preview**; `prod-build-assets-loaded.png` from §9 is the **isolated GLTFLoader render** of the production build assets. A complete Ultimate scene from a production build was not rendered because there is no production preview route that mounts `environment="ultimate"`.
- Smallest next-round change for that missing evidence: add one isolated, opt-in production preview view and route, gated by a build flag such as `VITE_ENABLE_ULTIMATE_FIXTURE_PREVIEW`. The view can mount `RestaurantScene` with `ultimateDemoLayout`, `ultimateDemoState` and `ultimateDemoEvents` without the dev simulator or API. Files: new `src/views/experiments/Restaurant3DUltimatePreviewView.vue` and a guarded route entry in `src/router/index.ts`. Keep the existing `/dev/restaurant-3d-fixture` route DEV-only.
- Authorization remains as recorded in §9.1: the project owner confirmed the vendor's e-mail authorization for these two GLBs only. The e-mail itself is not present here, so date, sender and conditions remain unavailable; no identifying details were inferred. Archive the original e-mail before public release.

### 10.7 Build and regression results
- `npx vue-tsc -b`: pass. `npm run build`: pass (Vite development mode, existing >500 kB chunk warning). `vite build --mode production`: pass; alternate-base production build: pass. No application source changed after typecheck/build.
- Fixture-related and neighboring suites passed: `frontend-lowpoly-street` 5, `static-cutaway` 11, `urban-exterior` 25, `tree-cover` 16, `camera-limits` 4, `navigation` 24, `environment-plan` 9, `entrance`, `customers` 14, `floor-editor`, `floor-layout`, `layout-revision`, `render-performance`, `operational-readability` 15, `operational-contracts`, `table-mapping`, `dashboard-stage` 6, `hardening` 115, `hardening-build` (18 fail-fast builds + 2 valid builds), and `realtime` 38.
- The requested clean-HEAD comparison suites started from a clean tree and no source file changed during this round, so these outcomes are the HEAD reference: `approvals` fails its existing “item count sums quantities” assertion; `design-tokens` cannot open its expected `docs/design/DESIGN_SYSTEM.md` (the available source is `docs/design-system.md`); `ritma-redesign` fails the kitchen board grid assertion. These are outside the 3D fixture. `primitives.browser` reported all **94 checks passed** but its runner hung during shutdown and was interrupted (exit 130); no check failure was printed. None indicates a new fixture regression.
- Nothing was committed, pushed or deployed. The only working-tree changes from this round are this report and the `round-2-*` evidence files.

## 11. On-device homologation script

Use the same physical phone, browser version, portrait orientation and opt-in production preview host for both variants. Use `?guests=5` for both passes (the deterministic `guestFixture` state: 2 + 2 + 1 guests at tables 1–3); do not compare it with the default `ultimateDemoState` merely because both contain five seated guests. Clear cache before the first pass, then reload once for the warm-cache pass. For this production route, `lowpoly=off` is intentionally ignored because that switch is development-only; compare the procedural variant by blocking the two GLB URLs in browser network tools.

1. Open `/qa/restaurant-3d-ultimate-preview?guests=5` on the opt-in production build, wait for both street GLBs and the final scene, record phone model/browser/OS, viewport, network profile, load duration, FPS and console/network errors. The scene uses Ultimate Pack models from a controlled local QA asset source; those models are not included in the production artifact while their licence is unverified.
2. Compare the same camera framing and `Vista general`: post bases align with their plan points; arms face the street; lenses are warm; both door planters are present; the room and operational badges remain visible through the cutaway.
3. Test one-finger orbit, pinch zoom, pan limits and `Centrar vista`; select an alerted table; open and leave the editor; read the alert text at normal device scale. Record any badge/table-label overlap.
4. Block the lamp URL, reload and verify one warning plus procedural streetlights; repeat for the planter; then block both. Check that no prop is missing or duplicated and that selection, centering and editor entry still work. Restore network, reload cold and warm, and record GET status, content type, length, `Cache-Control`, ETag/304 behavior and hashes. The `/ritma/` QA build URL is `/ritma/qa/restaurant-3d-ultimate-preview?guests=5`.
5. Approve only if both standard and fallback scenes remain complete, the requested controls work, no route failures or console errors appear, and the badges stay readable at the target device size. Capture both variants and the blocked-both state.

**Action that releases the next homologation round:** repeat §11's post-fix visual and interaction checks on the agreed physical device set and archive the owner-confirmation e-mail with its date, sender and conditions. Before hosting the full scene, also confirm an owner-approved source/licence for the Ultimate Pack models. The opt-in route remains local and enabled only by its explicit build flag.

## 12. Opt-in production preview and load-failure verification

### 12.1 Changes and route gating
- Added `src/views/experiments/Restaurant3DUltimatePreviewView.vue`, a thin wrapper around the existing `Restaurant3DFixtureView`. It reuses the Ultimate scene, fixture events, deterministic guest data, guest simulator, entrance controls and editor; it makes no API requests.
- Added `/qa/restaurant-3d-ultimate-preview` to `src/router/index.ts` only when `VITE_ENABLE_ULTIMATE_FIXTURE_PREVIEW=true` at build time. The route uses `import.meta.env.BASE_URL` so it matches both `/` and `/ritma/`. The existing `/dev/restaurant-3d-fixture` condition remains `import.meta.env.DEV`.
- A production build without the flag contains neither the preview route nor its component chunk. Opening the route with `?VITE_ENABLE_ULTIMATE_FIXTURE_PREVIEW=true` alone redirected to `/app/dashboard`; query parameters cannot change the compiled router. The route's chunk appears only in opt-in production builds.
- The first `/ritma/` browser pass exposed that `createWebHistory()` has no base configured in this repository. The route initially redirected away under `/ritma/`; changing only the opt-in route path to `${import.meta.env.BASE_URL}qa/...` fixed the preview without changing the global router base or existing routes.
- The preview artifact does **not** contain Ultimate Pack models. For local scene validation only, a loopback proxy served the eight existing license-pending GLBs from ignored `assets-source/restaurant-3d/converted-unused/ultimate-pack/`; it also allowed controlled delay of the two authorized lowpoly files. No Ultimate Pack asset was copied into `public/`, `dist/` or the production build output. The proxy was temporary and is not a deployable asset host.

### 12.2 Reproduction commands and URLs
- Repository defaults: `npm run build` runs `vue-tsc -b && vite build --mode development`; `vite.config.ts` has no explicit `base`, so its default is `/`. `npm run build:production` runs `vue-tsc -b && vite build --mode production`.
- Typecheck and standard build: `npx vue-tsc -b`; `npm run build`.
- Standard production build, no opt-in route: `VITE_API_URL=https://api.example.invalid VITE_PUBLIC_APP_URL=https://qa.example.invalid VITE_REVERB_APP_KEY=qa-dummy VITE_REVERB_HOST=qa.example.invalid VITE_REVERB_PORT=443 VITE_REVERB_SCHEME=https npx vite build --mode production --outDir /tmp/restaurants-web-phase3k-prod-default`.
- Opt-in production build: use the same dummy environment values plus `VITE_ENABLE_ULTIMATE_FIXTURE_PREVIEW=true` with `npx vite build --mode production --outDir /tmp/restaurants-web-phase3k-optin`. The repository script was also verified with `VITE_ENABLE_ULTIMATE_FIXTURE_PREVIEW=true npm run build:production` and the same dummy values.
- Alternate base: add `--base=/ritma/ --outDir /tmp/restaurants-web-phase3k-ritma` to the opt-in production build command.
- Local QA URLs used: `http://127.0.0.1:5383/qa/restaurant-3d-ultimate-preview?guests=5` and `http://127.0.0.1:5384/ritma/qa/restaurant-3d-ultimate-preview?guests=5`. Entrance variants use `&entrance=-5.5%2C7.6`, `&entrance=-9.4%2C3.1`, `&entrance=4.2%2C-7.4` or `&entrance=9.4%2C-2.3`.
- The local QA overlay was `/tmp/phase3k-preview-proxy.mjs`, with `UPSTREAM`, `PORT`, `BASE_PREFIX` and `DELAY_MS` set per server. A 0 delay serves assets; `DELAY_MS=8000` holds each authorized street GLB response for eight seconds. Production previews were served from the separate `/tmp/...` build directories and bound to loopback only.

### 12.3 Full-scene results
- The opt-in production chunk rendered the full Ultimate scene in Chromium. In the 1280 × 720 desktop capture, the street posts and road, both door-side planters, terrace, cutaway room walls, interior, simulated event badges and `Centrar vista` control were present. The warm lamp lens and road-facing arms matched the prior development comparison. No prop was visibly missing or duplicated after load.
- Both lowpoly GLBs were requested by the full scene at the default base and at `/ritma/`, returning 200. Resource URLs under `/ritma/` correctly begin `/ritma/assets/...`. Captures: `round-3-production-preview-desktop.png` and `round-3-production-preview-ritma.png`.
- The mock `Nuevo pedido` and `Pidió cuenta` badges were visible on their fixture tables. Mesa 04, which had the active bill-request badge, opened its details when selected. Alerts here came from local `ultimateDemoEvents`; no API, authorization flow or realtime delivery was exercised.
- The browser selected the default entrance `(−5.5, 7.6)`, west `(−9.4, 3.1)`, north `(4.2, −7.4)` and east `(9.4, −2.3)` from the URL and mounted one canvas at each. For each entry, the same `?guests=5` generated state began with 5 guests; two locally simulated arrivals at Mesa 04 raised it to 7, and departures returned it to 5 with 0 route failures. This is fixture simulation, not production operations data.
- After load, clicking the Mesa 04 table opened its detail sheet. `Centrar vista`, the Operación → editor transition and editor controls worked. The same camera/selection/editor interactions remained available after the two street files were blocked.
- **Guest-state distinction:** `?guests=5` uses `guestFixture` with seats assigned to tables 1, 2 and 3. The report's historical default five-seated measurements use `ultimateDemoState` (tables 1, 3 and 4). They are distinct fixtures. Prior comparable development measurements remain 382 draw calls / 76,714 triangles procedural and 385 / 78,418 with GLBs for `ultimateDemoState`; prior `?guests=5` fallback measurement was 386 / 78,930. The production build's `RestaurantCustomers` diagnostics are DEV-only, so this production browser run displayed dashes for draw calls/triangles; I do not claim new production render counts. The normal and both-blocked production screenshots use the same generated state and camera framing: `round-3-production-preview-desktop.png` and `round-3-production-both-blocked.png`.

### 12.4 Delayed requests, failures, HTTP and artifact contents
- With a fresh browser session, the proxy delayed each lowpoly GLB response by **8,000 ms**. Both GETs were observed as pending. During that window, `Centrar vista` and opening the editor worked; after the responses completed, the scene remained interactive. The transient screenshot is `round-3-production-slow-pending.png`. At this point the scene can still be visually incomplete while other Ultimate models are decoding; after the full asset set settles, the cutaway walls and room are present.
- Blocking the lamp alone, the planter alone, then both files caused the expected `[restaurant-3d] lowpoly street props unavailable, keeping the procedural ones` warning in each failed page load. The loader uses one `Promise.all` catch, so blocking both together still produced one warning. No page errors were reported. The other request returned 200 in each single-file case; both were aborted in the combined case. The screenshots show the same `?guests=5` state and framing, with no street-prop gap or duplicate visible: `round-3-production-lamp-blocked.png`, `round-3-production-planter-blocked.png`, `round-3-production-both-blocked.png`. The selected mesa, centering and editor still worked after the combined failure.
- Default-base and `/ritma/` previews returned the two authorized files with the same byte lengths and content hashes as `public/`. Responses had `Content-Type: model/gltf-binary`, `Cache-Control: no-cache`, and weak ETags. Conditional requests with `If-None-Match` returned 304 for both default-base assets.

| File | HTTP length | SHA-256 |
|---|---:|---|
| `asset-props-lamp-post.glb` | 9,876 bytes | `fcd435cd22c92e50224398ea129242958b467d2a7ebf0adaf253dd5dec439083` |
| `asset-props-planter.glb` | 8,428 bytes | `41451b3b6ec8565ae2072e5116fbd2f071854c03b153afa63616eff1ce24f9d1` |

- `public/`, opt-in default-base output and alternate-base output each contain exactly `asset-props-lamp-post.glb`, `asset-props-planter.glb` and `LICENSE-NOTE.txt` (662 bytes). No Ultimate Pack GLB is in these directories. The owner-confirmed authorization for the two lowpoly files remains recorded in §9.1; the original e-mail is still unavailable and pending archive.

### 12.5 Mobile emulation and remaining homologation
- No physical phone or iOS simulator was available. `agent-browser` 0.36.0 running Chromium headless with its iPhone 12 preset produced a 390 × 844 CSS viewport at DPR 3, `scrollWidth=390`, and one canvas; the emulated network reported `4g` / 1.5 Mbps. Its spoofed user agent identifies iPhone OS 14 / Safari 14. `screen.orientation.type` reported `landscape-primary` despite 390 × 844 viewport and screen dimensions, so orientation metadata from this emulation is inconsistent. The browser reported `navigator.maxTouchPoints=0` and `(pointer: coarse)=false`: this is viewport emulation only. Mouse clicks checked `Centrar vista` and editor entry; native tap, one-finger orbit, pinch, pan and mobile GPU/FPS were not verified. Capture: `round-3-production-mobile-emulation.png`.
- On the emulated narrow viewport, event badges visibly overlapped nearby table labels before the follow-up fix; see §13 for the cause, correction and pending post-fix browser capture. This is not an approval for mobile readability on a physical device. The fixture test does not represent API-fed alert lifecycle; the static sample badges and table selection were checked locally.
- Authorization status: the responsible owner confirmed the two GLBs by e-mail, but the e-mail itself remains unavailable for archiving. Date, sender and terms are not inferred.

### 12.6 Build and test outcomes
- Passed: `npx vue-tsc -b`; `npm run build` (development mode); opt-in `npm run build:production`; explicit production builds with no flag, opt-in default base and opt-in `--base=/ritma/`. Vite reports its existing >500 kB chunk warning for the 1.1 MB `RestaurantScene` bundle.
- Passed scene suites: `frontend-lowpoly-street` (6), `frontend-camera-limits` (4; sampled 69,984 poses), `frontend-customers` (14), `frontend-entrance`, `frontend-floor-editor`, `frontend-navigation` (24), `frontend-operational-contracts`, `frontend-operational-readability` (15), `frontend-render-performance`, `frontend-static-cutaway` (11), `frontend-tree-cover` (16), `frontend-urban-exterior` (25), `frontend-environment-plan` (9), `frontend-floor-layout`, `frontend-layout-revision`, `frontend-table-mapping`.
- `frontend-primitives.browser.mjs`: `runPrimitiveChecks()` returned **94 checks**; afterward the broader responsive loop failed at `Snackbar does not cover bottom CTA`, process exit 1. This is the same existing failure recorded against clean HEAD in §10.7; the snackbar components and browser test are unchanged in this round. The 94 checks and the later assertion are separate results; this run did not exit 143.
- Clean-HEAD reference failures reproduced: `frontend-approvals` (“item count sums quantities”), `frontend-design-tokens` (expects missing `docs/design/DESIGN_SYSTEM.md`), and `frontend-ritma-redesign` (kitchen board four-state grid assertion). The fixture change does not touch those components or tests.
- To interpret a preview process exit of 143, I started `vite preview` and sent it `SIGTERM`; `wait` returned **143**, confirming that this code denotes process termination by that signal. It is distinct from test assertions. The temporary previews and proxies were QA-only; no deployment was made. Production builds used only reserved `.example.invalid` dummy origins, not real API credentials.
- No physical-device approval, external QA host, API session, Ultimate Pack licensing decision or e-mail archive was available in the round-3 pass. Follow-up status and the revised action are in §13.

No commit, push or deployment was made.

## 13. Alert and table-label collision follow-up

### 13.1 Reproduction and cause
- Preserved the existing round-3 evidence and captured before images from the opt-in production preview at `?guests=5`: `round-4-before-mobile-390x844.png` (390 × 844 CSS px, DPR 3), `round-4-before-narrow.png` (360 × 800, DPR 3), `round-4-before-landscape.png` (844 × 390, DPR 3) and `round-4-before-desktop.png` (1440 × 900, DPR 1). This is the generated `guestFixture` state selected by `?guests=5`; it is not the default five-seated `ultimateDemoState` used for the historical 382/76,714 and 385/78,418 render comparison. Events are the fixture's static local `ultimateDemoEvents` (`Nuevo pedido` and `Pidió cuenta`), not API events.
- DOM bounds at 390 × 844 showed `Pidió cuenta` crossing the labels for Mesa 01 and Mesa 03; `Nuevo pedido` also sat immediately above Mesa 03. At 360 × 800, those conflicts remained and Mesa 01/Mesa 03 plus Mesa 02/Mesa 04 labels intersected. At 844 × 390, both alert pills overlapped each other and the Mesa 01 label. At 1440 × 900 the Mesa 01 and Mesa 03 labels were crossed by `Pidió cuenta`.
- Cause: `TableInfoLabel` and event pills used separate world anchors and the shared edge clamp only kept each item inside the canvas. Independent projected DOM overlays had no collision layout. Alert z-order intentionally exceeds label z-order, so an intersecting pill obscured the table identifier. The portrait and landscape aspect ratios project the nearby table anchors close together.

### 13.2 Correction
- Added `src/components/restaurant-3d/overlay-collision.ts` and connected it through `use-edge-clamp.ts`. Each frame, the current projected overlay bounds are sorted with badges first (existing tier rank breaks ties), then labels; a colliding lower-priority overlay takes the nearest free screen-space offset, with a 5 px clearance, canvas-edge guard and 96 px maximum shift. The alert pill retains its priority/color and event text, and the table label remains attached to its table anchor while moving only in screen space. The layout is recalculated as the camera changes and its registrations are removed when overlays unmount.
- `OperationalBadge.vue`, `OperationsFlagBadge.vue` and `TableInfoLabel.vue` now identify their overlay kind/rank to the shared layout. No event contract, fixture data, API, Dashboard or editor behavior was changed.
- Extended `tests/frontend-operational-readability.mjs`: a single active event leaves its badge in the priority position and moves the table label; nearby badges and their label no longer overlap; creating an event, elevating its rank and removing it recomputes the layout without leaving a stale badge. Result: **18 checks passed**.

### 13.3 Validation and limitations
- Passed: `npx vue-tsc -b`; `npm run build` (the existing development-mode build); and the opt-in `npm run build:production` with dummy `.example.invalid` origins and `VITE_ENABLE_ULTIMATE_FIXTURE_PREVIEW=true`. Production build retains the known Vite warning for the 1.1 MB `RestaurantScene` chunk.
- Passed directly affected suites: `node tests/frontend-operational-readability.mjs` (18), `node tests/frontend-lowpoly-street.mjs` (6), `node tests/frontend-urban-exterior.mjs` (25), `node tests/frontend-static-cutaway.mjs` (11), and `node tests/frontend-camera-limits.mjs` (4 checks sampling 69,984 poses). These suites emitted a Vite WebSocket `EPERM` warning on port 24678 while creating the in-memory server; each completed with exit 0 and the listed assertions passed.
- The before captures above are real preview screenshots; there are **no after screenshots from the full production scene in this round**. After rebuilding, `agent-browser` could not start its local daemon (`Daemon process exited during startup with no error output`); the shared desktop browser tool is not available in this session. Therefore camera rotation/zoom, `Centrar vista`, selection with live alerts, event injection in the production page, editor return, and visual verification of the solver at the four sizes were not rerun. The solver's bounded positioning, priority and create/update/remove behavior are verified by the directly affected tests, not by a browser capture. Do not treat geometry/test output as a visual before/after approval.
- No physical phone was available. The preserved 390 × 844 / DPR 3 captures are viewport emulation, not a touch-device run; physical iOS/Android gestures and GPU metrics remain pending. The original authorization e-mail for the two lowpoly GLBs remains pending archive, and the Ultimate Pack still needs an owner-approved source/licence before any hosted preview can include those models.
- Reproduce after the browser is available: `npm run build:production` with the opt-in flag and dummy environment above; serve local `dist` and the preserved `/tmp/phase3k-preview-proxy.mjs`; open `http://127.0.0.1:5393/qa/restaurant-3d-ultimate-preview?guests=5`; capture 390 × 844 at DPR 3, 360 × 800, 844 × 390 and 1440 × 900; then verify one event, two nearby events, event creation/priority/removal, camera rotate/zoom/center, alert selection and editor return. Compare with the four `round-4-before-*` captures. Keep the two licensing/archive gates above explicit.

Files changed by this follow-up: `src/components/restaurant-3d/overlay-collision.ts` (new), `src/components/restaurant-3d/use-edge-clamp.ts`, `src/components/restaurant-3d/OperationalBadge.vue`, `src/components/restaurant-3d/OperationsFlagBadge.vue`, `src/components/restaurant-3d/TableInfoLabel.vue`, `tests/frontend-operational-readability.mjs`, and this report. Existing report edits, preview route, proxy and evidence remain local and preserved. No commit, push or deployment was made.

## 14. Local closure round — browser validation of the overlay layer

Run date 2026-11-17, local only. Browser: `agent-browser` 0.36.0 (Chromium headless). The daemon that failed in §13 started normally this time (`AGENT_BROWSER_SOCKET_DIR=$HOME/.ab`); no alternative automation was needed. Every capture below is the opt-in production build (`VITE_ENABLE_ULTIMATE_FIXTURE_PREVIEW=true`, `--mode production`, dummy `.example.invalid` origins) at `?guests=5`, i.e. the generated `guestFixture` state (tables 1–3), with the fixture's static `ultimateDemoEvents` (`Nuevo pedido`, `Pidió cuenta`). No API, session or realtime channel was involved.

### 14.1 Defects found in the browser and fixes

| # | Finding (reproduced in the opt-in production build) | Fix | Re-test |
|---|---|---|---|
| 1 | The solver in §13.2 had no memory: it re-picked the first free offset every frame, so a label hopped between slots on small camera moves. Measured with a 1 px/step drag, 60 steps out and 60 back (`Mesa 03`: **4 jumps of 113–122 px**, `Mesa 04` 2, `Mesa 01` 2). After the camera stopped, `Mesa 03` moved from (42, 498) to (88, 388) in one settle step. | `overlay-collision.ts`: optional `previous` offsets + `stickiness` (32 px). A still-free previous slot is kept unless the best slot is more than 32 px closer. `use-edge-clamp.ts` remembers each overlay's last offset (released on unmount). | Same sweep: `Mesa 03` **1 jump** (4 → 1), `Mesa 05` 1, `Mesa 04` 2 and `Mesa 01` 2 (forced swaps, the old slot became blocked). Nothing stays in a stale position after the camera stops (two samples 1.5 s apart agree). |
| 2 | Ambiguous association after rotation: `Mesa 01`'s label sat directly under the yellow-ring table (Mesa 03) and ~55 CSS px from its own chairs. Displacement alone does not say which table a label belongs to. | `use-edge-clamp.ts` publishes the label→anchor vector as CSS variables and a `data-leader` flag; `TableInfoLabel.vue` draws a 2 px tail (behind the pill) and an 8 px dot on the table anchor, only when the shift is ≥ 24 px (`LEADER_MIN_PX`). Priority colour, pill, selection and desktop behaviour are unchanged; nothing is drawn for unshifted labels (desktop default). | Rotated capture `round-5-after-mobile-rotated-leader.png`: Mesa 01 → green pair, Mesa 03 → yellow table, Mesa 04 → blue table. |

Added test: `tests/frontend-operational-readability.mjs` « a still-free slot is kept across small moves… » → **19 checks passed** (was 18).

### 14.2 Per-framing comparison (`docs/3d/evidence/phase-3-1k-lowpoly-street/`)

Overlap = intersecting DOM rectangles among all 7 overlays (`getBoundingClientRect`); "before" figures are from §13.1.

| Framing | Before capture | After capture | Overlaps before → after | Reading |
|---|---|---|---|---|
| 390 × 844, DPR 3 | `round-4-before-mobile-390x844.png` | `round-5-after-mobile-390x844.png` | `Pidió cuenta` over Mesa 01/03 → **0** | All 5 identifiers fully legible; Mesa 03/04 labels shifted left with a leader. |
| 360 × 800, DPR 3 | `round-4-before-narrow.png` | `round-5-after-narrow.png` | Mesa 01/03 and 02/04 labels intersecting → **0** | Legible; Mesa 01/Mesa 02 stacked with ≥5 px gap. |
| 844 × 390, DPR 3 (landscape) | `round-4-before-landscape.png` | `round-5-after-landscape.png` | both pills + Mesa 01 label → **0** | The fixture page's canvas is 400 px tall inside a 390 px viewport (canvas bottom y=481), so `Mesa 05` sits below the page fold and needs a scroll. This is fixture page layout, not a clipped overlay. |
| 1440 × 900, DPR 1 | `round-4-before-desktop.png` | `round-5-after-desktop.png` | Mesa 01/03 crossed by `Pidió cuenta` → **0** | Labels adjacent to their tables, no leaders needed. |

### 14.3 Interactions executed (390 × 844 emulation unless noted)

| Interaction | Result | Evidence |
|---|---|---|
| Create an alert (Mesa 5) | Badge appears, 0 overlaps | `round-5-after-event-created.png` |
| Three simultaneous alerts on neighbouring tables 5, 2, 1 (`attention`, `critical`, `attention`) | 10 overlays (5 badges + 5 labels), 0 overlaps | `round-5-after-event-simultaneous.png` |
| Change priority of existing ids | `data-priority`/`data-tier` update in place (`info` tier 3, rim 3 px → `critical` tier 1, rim 4 px); dot colour stays tied to the event type by design (see `OperationalBadge.vue` doc comment) | `round-5-after-event-priority.png` |
| Remove all events | Back to the fixture's 2 badges + 5 labels, no stale badge | `round-5-after-event-removed.png` |
| Select an alerted table, open details, close | Tap on the table opens `Mesa 04`; closed cleanly; 0 overlaps | `round-5-after-mobile-selected-mesa04.png` |
| `Centrar vista` after details | 7 overlays, 0 overlaps, none outside the canvas | `round-5-after-mobile-centered-after-details.png` |
| Orbit (mouse drag) | Camera rotates ~90°, 0 overlaps, labels follow with leaders | `round-5-after-mobile-rotated-leader.png` |
| Wheel zoom in / out | 0 overlaps, none outside canvas (the zoom-in capture was visually near-identical to the default framing; not archived) | — |
| Editar salón → Operación | Editor shows 5 identity labels, 0 badges; back in Operación both badges return, 0 overlaps; tapping a table again opens `Mesa 04` | `round-5-after-mobile-editor.png` |
| Both street GLBs blocked | One procedural-fallback warning, scene complete, 7 overlays, 0 overlaps | `round-5-after-mobile-both-glb-blocked.png` |
| Console | No page errors in any run (only the expected fallback warning above) | — |

**How the alerts were injected.** The fixture has no UI to add or edit events (`ultimateDemoEvents` is a constant). Events 1–4 above were driven by assigning `operationalEvents` on the mounted `RestaurantScene` instance through the Vue instance from the page console in the browser; this is a test technique, no source or fixture was altered. The unit test also covers create → priority update → removal of the solver.

**Not executed:** native touch (tap, one-finger orbit, pinch) — headless Chromium produced mouse events only; this is viewport emulation. Pinch zoom, pan limits and real GPU/FPS need the physical device. Hitting the 96 px shift cap in a deliberately crowded layout (`?layout=varied` stress) was not captured.

### 14.4 Commands run

```bash
export AGENT_BROWSER_SOCKET_DIR=$HOME/.ab
# opt-in production build (same dummy env as §12.2 + flag), default build, and artifact checks
VITE_ENABLE_ULTIMATE_FIXTURE_PREVIEW=true npx vite build --mode production --outDir <scratch>/optin
npx vite build --mode production --outDir <scratch>/default
# serve: vite preview of the opt-in dir on 127.0.0.1:5394, behind /tmp/phase3k-preview-proxy.mjs on :5393
UPSTREAM=http://127.0.0.1:5394 PORT=5393 node /tmp/phase3k-preview-proxy.mjs
# repeat the inspection
agent-browser set viewport 390 844 3   # also 360 800 3, 844 390 3, 1440 900 1
agent-browser open "http://127.0.0.1:5393/qa/restaurant-3d-ultimate-preview?guests=5"
```

| Check | Result |
|---|---|
| `npx vue-tsc -b` | pass |
| `npm run build` (development mode) | pass (known >500 kB `RestaurantScene` chunk warning) |
| Opt-in production build | pass; route string present in 1 file, preview chunk emitted |
| Default production build (no flag) | pass; **0** references to `qa/restaurant-3d-ultimate-preview`, **no** preview chunk |
| Ultimate Pack GLBs in either artifact | **0** (only the two authorized lowpoly GLBs + character models ship) |
| `node tests/frontend-operational-readability.mjs` | 19 passed (new) |
| `frontend-lowpoly-street` / `urban-exterior` / `static-cutaway` / `camera-limits` | 6 / 25 / 11 / 4 passed |
| `git diff --check` | clean |
| Regression failures | none surfaced; the clean-HEAD failures of §12.6 (`frontend-approvals`, `frontend-design-tokens`, `frontend-ritma-redesign`, primitives snackbar) were not re-run and are untouched by this round |

### 14.5 Files changed in this round

`src/components/restaurant-3d/overlay-collision.ts` (hysteresis), `src/components/restaurant-3d/use-edge-clamp.ts` (offset memory, leader vector), `src/components/restaurant-3d/TableInfoLabel.vue` (leader tail/dot), `tests/frontend-operational-readability.mjs` (+1 check), this report, and new `round-5-*.png` evidence. Model loading, router, fixture data, Dashboard, `restaurants-api` untouched. No commit, push or deploy.

### 14.6 Pending outside this repository (kept separate)

1. **Physical phone**: the §11 script (native tap/orbit/pinch/pan, FPS, readable text at device scale) has not been run on hardware.
2. **Lowpoly authorization e-mail**: still to be archived with date, sender and conditions.
3. **Ultimate Pack source**: an owner-approved source/licence must be confirmed before any hosted QA preview may include those models; until then the preview stays local with the loopback proxy.

### 14.7 Verdict

- **Local closure of Phase 3.1K: approved.** The overlay defect (labels covered by alerts, ambiguous association, hopping/stuck labels) was reproduced in the real production-mode scene, fixed in the overlay layer only, and re-verified by browser inspection at four sizes, by interaction runs, and by the build/test set above. The visual fix is approved on the basis of that browser inspection (emulated viewports).
- **Not yet ready for QA homologation** until items 1–3 in §14.6 are closed. Items 1 and 3 are blockers for hosted QA; item 2 is a paperwork gate for the two authorized GLBs.

## 15. QA homologation preparation (2026-11-17, local)

### 15.1 Physical-device run (§11): not executed
No physical phone is reachable from this environment (no `adb`, no device on the network; WSL2 session). **Status: pending.** What was done instead is labelled as emulation:
- The overlay interactions of §14.3 (tap selection, drag orbit, wheel, `Centrar vista`, editor round trip) ran as mouse events in headless Chromium. Native touch, pinch and pan were not exercised, and `navigator.maxTouchPoints` is 0 there.
- **Landscape below-the-fold (independent check, 844 × 390 emulation, preview route).** The canvas is 400 px tall and starts at y=81, ending at y=481 in a 390 px viewport (`RestaurantScene` non-stage rule `min-height: 400px`, `RestaurantScene.vue:1081`); the page scrolls (`scrollHeight` 1607). Scrolling the page by 200 px brings `Mesa 05` fully into view with no overlaps (`round-6-landscape-scrolled-below-fold.png`) and a mouse wheel over the canvas scrolls the page rather than zooming. **But the canvas has `touch-action: none`**, so a finger on it orbits/pans and never scrolls the page: on a phone the part of the canvas below the fold can be reached only by touching the 81 px header strip or the 25 px side gutters. Expect landscape tables below the fold to be hard to reach by touch on the preview route. This is the preview/lab layout (non-stage); the Dashboard uses `stage` mode with `height: 100%` (`RestaurantScene.vue:1087`) and is not affected. Suggested fix if the preview is used for phone QA: in landscape, `height: calc(100dvh - <header>)` and `min-height: 0` for the non-stage scene. Not applied (shared scene stylesheet, outside this round).
- When a device is available, run §11 as written with `?guests=5` and record: model, OS/browser version, network profile, load time, FPS, and per step the result of one-finger orbit, pinch, two-finger pan, `Centrar vista`, selecting an alerted table, simultaneous alerts (390 and 844 × 390) and editor → Operación. Add the landscape reachability result above.

### 15.2 Assets the preview really requests
Observed with `agent-browser network requests` on a default load of `/qa/restaurant-3d-ultimate-preview?guests=5` (opt-in production build, 1440 × 900) — all HTTP 200:

| Group | Files requested | Served from | Provenance / authorization | QA-hostable? |
|---|---|---|---|---|
| **Ultimate Pack** (9) | `house-wall-3x3m`, `house-wall-door-3x3m`, `door-house-simple`, `table-dining-small`, `chair-dining`, `plate-round`, `glass-drink`, `cup-small`, `pot-medium-circle-plant` (`.glb`, under `/assets/restaurant-3d/models/ultimate-pack/`) | **Not in `public/` or `dist`.** Local-only: `assets-source/restaurant-3d/converted-unused/ultimate-pack/` (git-ignored), served by `/tmp/phase3k-preview-proxy.mjs` | `LICENSE_UNVERIFIED` (`LOW_POLY_ASSET_SELECTION.md` §License: no receipt, entitlement or authorized download record; local copies came from mirror wrapper pages; publisher terms restrict redistribution; Unity Asset Store terms govern) | **No** until an owner-approved source and written terms exist |
| Ultimate Pack, converted but not requested on load | `house-wall-corner`, `house-wall-window-3x3m`, `house-wall-window-large-3x3m`, `house-wall-window-two-3x3m` (same folder: 13 files on disk, 4 not requested in this load; `ultimate-furniture.ts` / environment builders reference them for other walls/framings) | same | same | **No** |
| lowpoly.download street kit (2) | `asset-props-lamp-post.glb`, `asset-props-planter.glb` | `public/assets/restaurant-3d/models/lowpoly-street/` (ships in `dist`) | Owner reports vendor e-mail authorization (§9.1); vendor terms otherwise apply; `LICENSE-NOTE.txt` ships beside them | Yes for these two files, **conditional on archiving the e-mail** |
| Customers (3 of the pool in this load: `men/suit`, `women/suit`, `women/formal`) | `public/assets/restaurant-3d/characters/customers/{men,women}/*.glb` | `public/` (ships in `dist`) | `characters/customers/LICENSE.txt`: Quaternius Ultimate Modular Men/Women, CC0 1.0 | Yes |
| Brand / other | `aforo-symbol-*.png`, `icon-logo.png` | `src/assets/brand`, `public/` | AFORO's own | Yes |

**What is missing for the Ultimate Pack** (the 13 files above): (1) proof of authorized acquisition (receipt/entitlement) of Low Poly Ultimate Pack v8.2 by the project owner; (2) a written confirmation from the publisher (or the Asset Store terms read against the deployment) that serving the converted GLBs to browsers of a SaaS is allowed — modification, conversion and the "no standalone redistribution" limit included; (3) a decision where they are hosted (the ignored `assets-source/` copy must not be committed or exposed as the original package). Until then the hosted QA build must not contain them.

**What happens without them (verified, `round-6-ultimate-pack-blocked.png`).** With all `ultimate-pack/*` requests aborted the scene still loads and works: the console shows `ultimate environment failed to load` and `ultimate table failed to load`, the walls/room shell and pack tables are missing (plain floor, simplified tables), and the street, terrace, planters, guests, labels, alerts, selection and `Centrar vista` keep working (7 overlays, no errors beyond those logs). It is a degraded view, not a crash, but it is not what QA should evaluate visually.

**Separate pending item — lowpoly e-mail archive.** The authorization for the two lowpoly GLBs is recorded only as the owner's statement. Still to archive with the licence records: the original e-mail, with its date, sender, the exact files covered and any conditions. Nothing in the repository was changed for this item.

### 15.3 Dashboard mapping and first-delivery plan
See `docs/3d/DASHBOARD_3D_FIRST_DELIVERY_PLAN.md` (read-only audit of `DashboardView`, `OperationView`, `restaurants-api` routes and `docs/realtime.md`; no Dashboard or API file was modified).

### 15.4 Verification run in this round
Baseline suites, all exit 0: `frontend-operational-contracts`, `frontend-table-mapping`, `frontend-floor-layout`, `frontend-floor-editor`, `frontend-dashboard-stage` (6), `frontend-realtime` (browser, 38 checks), `frontend-dashboard`. The real API is **not** running (`curl localhost:8080/up` → no response; `docker ps` lists no containers). Starting Sail or seeding would write to `restaurants-api`'s environment/data, which this round keeps read-only, so no real-API check was made.

Files changed in this round: this report, the new plan document, and evidence `round-6-*.png`. No source, test, Dashboard or API file was modified. No commit, push or deployment.
