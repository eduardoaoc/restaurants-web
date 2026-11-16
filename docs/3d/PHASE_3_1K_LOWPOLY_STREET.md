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
