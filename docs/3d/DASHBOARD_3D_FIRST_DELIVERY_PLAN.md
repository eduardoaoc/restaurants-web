# Dashboard × 3D room — mapping and first-delivery plan

Read-only audit, 2026-11-17. Nothing in `DashboardView`, `OperationView`, the scene or `restaurants-api` was changed. **F** = confirmed in code/docs, **A** = assumption or decision still open. Builds on the E2 audit in `PHASE_3_1K_E2.md` and the closure in `PHASE_3_1K_LOWPOLY_STREET.md` §14–15.

## 0. Correction to the starting premise
The 3D room is **already** the Dashboard's default operation view (commit `434698d`): `OperationView.vue:70` starts with `floorView = '3d'`, loads the scene lazily and falls back to Plan when the saved layout is empty (`:99-101`). What the Dashboard does **not** do is use the Ultimate environment: `RestaurantScene` defaults to `environment: 'kaykit'` and `OperationView` never passes `environment` (**F**). The first delivery is therefore *"let a QA build choose the Ultimate environment (and switch 3D off) in the Dashboard, and prove a real event reaches the right table"*, not "build the integration".

## 1. How a scene table is tied to operational data (all **F**)

| Need | Where | Rule |
|---|---|---|
| Table identity | `RestaurantTableConfig.backendTableId` in the saved layout (`restaurant-layout` type; layout loaded by `useRestaurantFloorLayout` ← `floor-layout.service.ts` ← `GET /restaurants/{id}/floor-layout`, `routes/api.php:324`) | The **only** join key between a 3D table (UUID) and an Operations Live table (numeric id) |
| State of a table | `operations-floor-mapper.ts` `mapOperationsFloor(layout, snapshot, restaurantId)` | Status map `free→available, occupied, waiting_approval→order_pending, preparing→ordering, ready→order_ready, waiter_requested, bill_requested`; guests from `session.guest_count` (≤ layout seats and ≤ backend capacity); fails **closed** per table (invalid id, duplicate `backendTableId`, missing backend table, free-with-session, bad `opened_at`, unknown status, snapshot of another restaurant) → table listed in `invalidLayoutIds`, no operational layer drawn |
| Badges | `RestaurantScene.vue:160` `topEvents` = `operationalEvents ?? (operationsSnapshot ? [] : mockEvents)`; `flagsByLayoutId` → `OperationsFlagBadge` | In Dashboard mode the scene gets **no synthetic events**: the pill is the literal backend `table.flags`, and the ring colour is the mapped status. `OperationsAlert`s (`table_id`) feed the attention queue, not 3D events |
| Real time | `useRestaurantRealtime` (`DashboardView.vue:63`) | An event only **invalidates**: payload must have this restaurant's `restaurant_id` and `schema_version 1`, unique `event_id` (`useRestaurantRealtime.ts:175`); it then debounces a REST refetch of `/operations/live` (+ catalog). State is never patched from the event. `floor_plan.updated` additionally reloads the layout (`OperationView.vue:102`). A slow safety poll runs while connected and a 15 s fallback poll while not |
| Selection → same detail | `OperationView.vue:551-561` `@table-selected="selectSceneTable"` (`:157`) maps layout id → `backendTableId` → the `OperationsTable` in the snapshot → the same `selectTable(table)` used by Plan/list. That drives `TableDetailsDrawer` (narrow) or the stage card then drawer (wide, `stageCardVisible`). Selection back to the scene uses `selectedSceneTableId` (`:144`). The host owns selection (`hostOwnsSelection`), so 3D and Plan always agree |

### Edge cases

| Case | Current behaviour | Gap |
|---|---|---|
| **3D table with no match** (no `backendTableId`, stale id, duplicate) | `hasOperationalMapping` is false → operational layer hidden for it; `selectSceneTable` finds no table → **tap does nothing** | Silent. Acceptable for QA; consider a toast or label "not linked" later |
| **Operational table the layout does not place** | `tablesOutsideScene` (`:153`) → count + the table overview list in the stage's bottom panel (`outsideSceneCount`); still reachable and selectable | None |
| **Restaurant switch** | `useRestaurantOperations` nulls the snapshot on switch (`:45-50`); `layoutRestaurantId` becomes `null` while the snapshot is null (`:94`), so the old layout is dropped; the layout composable keeps only the latest request (generation guard); the mapper returns nothing if `snapshot.restaurant.id !== restaurantId`; the scene is keyed by `layoutRevision` so it remounts. `pendingTableId` waits for the new snapshot (`:330`) | None found in code; **not browser-verified** (needs API) |
| **Realtime event for another restaurant** | Dropped by the `restaurant_id` check | None |
| **Event naming a table the layout/snapshot does not contain** | Refetch happens; the table appears under `tablesOutsideScene`/the queue; 3D shows nothing for it; no error | None; add a test (see §3) |
| **Duplicate / replayed event** | `seen` set by `event_id` | None |
| **Scene fails: chunk download** | `sceneChunkFailed` → panel with message + **Plan** button (`:83-93`, `:563-572`) | None |
| **Scene fails: layout request** | `sceneUnavailable` (`layoutState === 'error'`) → same panel with Retry + Plan | None |
| **Scene fails: runtime (no WebGL, context lost, exception during render)** | Nothing in `restaurant-3d`/`OperationView` handles it (no `onErrorCaptured`, no WebGL probe, no `webglcontextlost` listener — grep of `src`) | **Real gap**: blank canvas with no way to Plan. Must be closed in the first delivery |
| **Ultimate pack not served** | Scene degrades (no walls, simplified tables), logs errors, stays interactive (`PHASE_3_1K_LOWPOLY_STREET.md` §15.2) | Hosted QA without the pack is a functional-only check; no automatic fallback to KayKit exists |

## 2. Reusable files and tests

| Reuse | For |
|---|---|
| `src/components/restaurant-3d/operations-floor-mapper.ts`, `RestaurantScene.vue` (`environment`, `stage`, `operationsSnapshot`, `selectedLayoutTableId`) | No change to the data path |
| `src/views/operation/OperationView.vue` (`selectSceneTable`, `tablesOutsideScene`, `sceneUnavailable`, `showPlan`) | Mount point and existing Plan fallback |
| `src/composables/useRestaurantFloorLayout.ts`, `useRestaurantRealtime.ts`, `useRestaurantOperations.ts` | Unchanged |
| `src/config/env.ts` (`validateEnv`, already runs in `vite.config.ts:49` and `config/runtime.ts`) | Home of the new flag (`shellV2` is the pattern) |
| `src/router/index.ts:86` | Pattern for a compile-time opt-in (`VITE_ENABLE_ULTIMATE_FIXTURE_PREVIEW`) |
| `tests/frontend-operational-contracts.mjs` (stale, duplicate, other-restaurant mapping cases), `frontend-table-mapping.mjs`, `frontend-floor-layout.mjs`, `frontend-floor-editor.mjs`, `frontend-dashboard-stage.mjs` (6), `frontend-realtime.mjs` + `.browser.ts` (38, fixture HTTP), `frontend-dashboard.mjs` | Baseline — all green on 2026-11-17 |
| `/tmp/phase3k-preview-proxy.mjs` | Serving the Ultimate GLBs from the ignored local folder for a local QA run |
| Fixture-HTTP Vite harness (memory `browser-validation-without-backend`) | Browser tests of `OperationView` without the API |

## 3. First delivery — smallest viable step

**Goal.** A QA build can show the real Dashboard room with the **Ultimate** environment, loaded when the operation view opens, and a **real** table event updates the correct table. Default builds do not change.

### Changes (planned files)
1. **`src/config/env.ts`** — one build-time variable `VITE_DASHBOARD_3D` ∈ `off | kaykit | ultimate`; unset or anything else → `kaykit` (today's behaviour); expose `dashboard3d` next to `shellV2`; in `secure` modes, `ultimate` is accepted only together with an explicit `VITE_ENABLE_ULTIMATE_DASHBOARD_QA=true` (mirrors the opt-in route) so a normal production build can never ship it by typo. **A**: two flags vs one — decide at implementation.
2. **`src/views/operation/OperationView.vue`** (only file in Dashboard scope):
   - `floorView` initial value `'plan'` and no layout fetch when `dashboard3d === 'off'` (this is the "turn 3D off" switch; Plan is the existing fallback).
   - pass `:environment="appConfig.dashboard3d === 'ultimate' ? 'ultimate' : 'kaykit'"` to `RestaurantScene`.
   - **runtime-failure fallback:** a small WebGL support probe before mounting the scene plus `onErrorCaptured` around `RestaurantScene` (and a `webglcontextlost` listener on its canvas) that sets a `sceneRuntimeFailed` ref; fold it into the existing `sceneUnavailable` panel so the Plan button appears.
3. **`tests/`** (new `frontend-dashboard-3d-environment.mjs` + additions): env parsing (`off|kaykit|ultimate|garbage`, secure-mode guard); `mapOperationsFloor` cases not yet covered — a layout table whose backend id is absent from the snapshot while another snapshot table has no layout table, and a restaurant switch with a stale snapshot; an `OperationView` harness case (fixture HTTP) for runtime failure → Plan button and for `off` → no `/floor-layout` request.
4. **Docs:** a QA runbook paragraph (how to build, serve with the local asset source, and turn off).

Not in scope: editor/save of the layout (own round), Light-stage theming (E2 #2), stage × Ultimate camera (#3), stage `Centrar vista` (#4), label density on the stage (#5). **Decision point:** the Ultimate environment on the *light stage* has dark fog/ground hard-coded (E2 #2) and was never rendered inside the Dashboard stage; its look is unverified. Judge it in the first browser pass: if it is unreadable, pull E2 #2 into this delivery; if it is only unattractive, record it and let QA evaluate function only.

### Acceptance criteria
- A. Default build (`VITE_DASHBOARD_3D` unset): Dashboard identical to today — KayKit stage, same requests, all baseline suites green.
- B. `VITE_DASHBOARD_3D=ultimate` (QA build, assets from the local proxy): opening the operation view loads the scene chunk on demand and shows the Ultimate room with the restaurant's saved tables; no console errors; 0 requests to `ultimate-pack` in a default build artifact.
- C. `VITE_DASHBOARD_3D=off`: no `/floor-layout` request, Plan view shown, no 3D chunk requested.
- D. Selecting a 3D table opens the same drawer/card, with the same table id, as selecting it in Plan (compare title and `table.id`); selecting in Plan highlights the same 3D table.
- E. **Real event:** with a real dev user and the real API, a public QR "call waiter" request on table X (`POST …/tables/{publicToken}/requests/call-waiter`, `restaurants-api/routes/api.php:130`; broadcasts `table_request.created` with `table_id`, `restaurants-api/docs/realtime.md:216`) makes table X, and only X, show the waiter-requested state/flag in 3D within the refetch debounce; `agent-browser network requests` shows one `/operations/live` refetch per burst and no other table's status changed; the attention queue shows the same table.
- F. Unknown table: an event/alert for a table with no layout match leaves the scene unchanged, lists the table under "outside the scene", no console error.
- G. Restaurant switch (user with ≥2 restaurants): scene shows no tables of the previous restaurant at any time, then the new layout; selection is cleared.
- H. Scene failure: blocking the scene chunk, forcing a layout 500, and disabling WebGL each end at the panel with a working Plan button.
- I. Without the Ultimate pack served: degraded but interactive scene, no crash (already verified on the fixture).
- J. `npx vue-tsc -b`, `npm run build`, production build with and without the flag, new tests, `git diff --check`; Light/Dark and `es-ES`/`ca-ES-valencia`/`en-GB` strings for any new message; 1440 and 390 captures (CLAUDE.md §20).

### How to disable
Rebuild without the flag (or with `off`) — no runtime query or backend change can enable Ultimate, matching the opt-in route. In a running session the existing **Plan** toggle (`setFloorView('plan')`) leaves 3D immediately.

### Prerequisites and blockers
1. **Real API + Reverb** are needed for E, G and H(layout 500). A disposable isolated local database was used for this run; the API and Reverb are stopped now. Remaining real-flow checks can resume by starting that isolated setup and using the synthetic A/B restaurants and QA user.
2. **Ultimate Pack source/licence** (`PHASE_3_1K_LOWPOLY_STREET.md` §15.2) before any *hosted* QA build; a local build served through the loopback proxy is allowed now.
3. lowpoly authorization e-mail archived (paperwork, not a code blocker).
4. Physical-device pass (§11 + the landscape note in §15.1).

### Order of work
(1) env flag + tests → (2) `OperationView` pass-through and `off` → (3) runtime-failure fallback + test → (4) fixture-HTTP browser pass of A–D, F, H → (5) light-stage visual decision → (6) real-API pass of E and G on the isolated QA DB → (7) report and hand over for QA.

## 4. Homologation run (2026-11-17, local)

This run used a fresh, isolated Compose project and Postgres volume. Before seeding, the configured destination was checked (`APP_ENV=local`, PostgreSQL database `laravel`); the regular Sail volume was persistent and left untouched. The isolated database was confirmed empty, migrated, and seeded with the existing QA/demo seeder plus two synthetic restaurants/layouts. Restaurant A (AFORO Malvarrosa) and B (QA Ultimate B) were accessible to the same QA owner. A had mapped tables and additional operational tables outside the scene; B also had mapped and outside-scene tables. All data was synthetic and local. No backend source was changed. Credentials, public tokens and QR URLs are deliberately omitted.

| Criterion | Result | Evidence / limit |
|---|---|---|
| A — default KayKit | **Pass** | Default and production builds passed; browser capture [default KayKit](evidence/dashboard-3d/r1-A-kaykit-default-desktop-light.png). |
| B — Ultimate Dashboard | **Pass, local** | QA opt-in build displayed the Ultimate room and loaded local pack assets. Captures [Ultimate light](evidence/dashboard-3d/r1-B-ultimate-desktop-light.png) and [Ultimate dark](evidence/dashboard-3d/r1-after-ultimate-desktop-dark.png). Loopback/local asset delivery only. |
| C — 3D off | **Pass** | Off build showed Plan; capture [off](evidence/dashboard-3d/r1-C-off-desktop-light.png). Environment contract suite passed. |
| D — selected table/detail parity | **Pass** | Mesa 03 (`table.id=3`) selected in 3D and Plan with the same title/detail and shared selection. Captures [3D selection](evidence/dashboard-3d/r3-dashboard-table03-selected.png), [Plan selection](evidence/dashboard-3d/r3-plan-table03-selected.png). |
| E — real QR waiter call | **Partial — backend real** | On A, opened the synthetic business day and submitted the separate-session public QR `call waiter` request (HTTP 201); the waiter alert appeared for Mesa 03 ([alert](evidence/dashboard-3d/r3-dashboard-waiter-alert.png)). The request preceded the Reverb-origin fix, so no received Reverb envelope or one-per-burst `/operations/live` count was captured. A duplicate correctly returned 409 while the request remained open. Dashboard acknowledge cleared the alert ([cleared](evidence/dashboard-3d/r3-dashboard-alert-cleared.png)); Operations `Completar` resolved the request. Reverb later connected with its private channels subscribed, but a post-fix successful call with event and refetch counts was not conclusively recorded. No QR URL/token is included. |
| F — table outside the scene | **Partial** | Synthetic layouts included operational tables outside the scene. A real outside-scene event and verification that the scene stayed unchanged were not completed. |
| G — restaurant switch / cross-restaurant event | **Partial — switch observed** | Switched A→B; B's layout replaced A's. Captures [transition](evidence/dashboard-3d/r1-G-switch-no-layout.png), [B layout](evidence/dashboard-3d/r1-G-switch-terraza.png). A real event for A while B was active was not completed. |
| H — controlled scene failures | **Pass for local controls** | Controlled layout HTTP 500, chunk block, unavailable WebGL, context loss/creation failure and render error reached Plan recovery; valid scene recovered afterward. Captures [layout 500](evidence/dashboard-3d/r1-H1-layout-500.png), [chunk](evidence/dashboard-3d/r1-H2-chunk-blocked.png), [no WebGL](evidence/dashboard-3d/r1-H3-no-webgl.png), [context lost](evidence/dashboard-3d/r1-H4-context-lost.png), [context creation](evidence/dashboard-3d/r1-H5-context-creation.png), [render error](evidence/dashboard-3d/r1-H5-render-error.png). These were controlled local failures, not backend incidents. |
| I — Ultimate pack unavailable | **Pass, controlled local** | Blocking local pack assets left the Dashboard degraded but interactive; capture [pack blocked](evidence/dashboard-3d/r1-I-pack-blocked-dashboard.png). |
| J — build/tests/artifact checks | **Pass with notes** | `npm run build` (includes `vue-tsc -b`) and production builds (default, Ultimate opt-in, off) passed. Passed `frontend-operational-contracts`, `frontend-table-mapping`, `frontend-floor-layout`, `frontend-floor-editor`, `frontend-dashboard-stage` (6), `frontend-realtime` (38), `frontend-dashboard`, and `frontend-dashboard-3d` (14). Existing large `RestaurantScene` chunk warning remains. The default production artifact retains the `ultimate-pack` path literal in a lazy shared chunk, but the default env gate does not request it at runtime. `git diff --check` reports trailing whitespace on already modified CRLF files. |

### Local infrastructure and seed decision

The default API target and database were checked before any seed. Since the usual named volume is persistent, an isolated project `dashboard3d-qa-20261117` and fresh volume were used; the database was empty before migration. `DatabaseSeeder`, `DemoRestaurantSeeder` and an idempotent temporary QA script created the synthetic records. API ran on loopback 8082, Vite on 5176, Reverb on 8084. Reverb initially rejected `127.0.0.1` because `.env` allowed only `localhost`; it was restarted with a process-only loopback allowlist override. No `.env` or backend source was edited. At report finalization, the API process was stopped; the isolated Postgres and Redis containers remained healthy, and the local Vite server remained available.

### QA hosting and device gates

- The Ultimate Pack remains `LICENSE_UNVERIFIED`: confirm authorized acquisition/entitlement and written terms for converted browser-served assets, then decide the approved hosted asset origin. The loopback proxy is local-only.
- No physical phone was available. Section 11's device/browser/OS, network, duration, FPS, touch and error capture remains pending; viewport emulation is not a substitute.
- Before hosted QA, confirm Ultimate Pack acquisition/entitlement and written terms for converted browser-served assets, then approve an asset origin. Archive the lowpoly authorization email.
- No commit, push or deploy was made.

## 5. Implementation report — frontend, local, against a fixture API (2026-11-17)

§4 above is a separate run on an isolated real Laravel stack. This section is the frontend implementation and its browser validation against `tests/qa/dashboard-fake-api.mjs` (a stand-in for the API on :8080 and a minimal Pusher/Reverb WebSocket on :8081 that serves the same contracts the Dashboard reads: `auth/context`, `restaurants`, `operations/live`, `floor-layout`, `activity`, `broadcasting/auth`). **Everything in the table that says "fixture" proves the frontend, not the real backend.** The app under test was the real Dashboard (router, stores, `useRestaurantRealtime`, `OperationView`) built or served with each setting.

### 5.1 What was implemented
- **`VITE_DASHBOARD_3D=off|kaykit|ultimate`** (`src/config/env.ts`, resolver `resolveDashboard3D`, exposed as `appConfig.dashboard3d` / `dashboard3dFallback`). Unset → `kaykit`. Value is trimmed and case-insensitive. An unknown value → `kaykit` (reason `invalid-value`). `ultimate` is allowed in local builds; in staging/production it also needs the exact `VITE_ENABLE_ULTIMATE_DASHBOARD_QA=true`, otherwise it resolves to `kaykit` (reason `ultimate-requires-qa-flag`). It never fails a build; `vite.config.ts` prints `[aforo] VITE_DASHBOARD_3D resolved to "kaykit" (…)` instead. The QA flag alone enables nothing. The isolated preview switch `VITE_ENABLE_ULTIMATE_FIXTURE_PREVIEW` is neither read nor required here (tested in both directions) and the preview route in `router/index.ts` does not read the Dashboard setting.
- **`OperationView.vue`**: `scene3d` prop (defaults to `appConfig.dashboard3d`, so each mode can be exercised without a rebuild), `off` starts in Plan, never requests the layout, never loads the scene chunk and hides the 3D/Plan selector (`StageTopbar` `threeDEnabled`); `environment` is passed to `RestaurantScene`; `mapOperationsFloor`, `backendTableId`, `selectTable`, the "outside the scene" list, chunk/layout failure panels and the realtime wiring are reused unchanged (no new subscription).
- **Run-time fallback**: `SceneRuntimeGuard.vue` + `scene-runtime-guard.ts` wrap the scene. They catch an error thrown by the scene's own setup/render, the canvas `error` event (renderer cannot create its context; the scene reports it through `SCENE_FAILURE_KEY`), a lost WebGL context not restored within 2.5 s, and a WebGL probe done before mounting (no chunk is requested when the device has no WebGL). All end at the existing panel (message + Retry where it can help + **Ver plano**). A view change or a restaurant switch clears the failure; Retry remounts.
- **Restaurant switch**: the automatic Plan fallback for a restaurant without a layout is undone when switching to another restaurant (the person's explicit choice is kept). Before this fix, 2 (no layout) → 1 stayed on Plan and never asked for restaurant 1's layout.
- **Ultimate on the light stage** (visual conflict reproduced, see §6): `URBAN_STAGE_PALETTE` (pale ground and asphalt) and a light fog colour, both only when `stage`; the fixture and the editor keep `URBAN_PALETTE` and `#151515`.

### 5.2 Criteria A–J

| | Evidence (command / interaction) | Result | Depends on real backend? |
|---|---|---|---|
| **A** default unchanged | Dev server and bundled build with the setting unset. Dashboard loads, KayKit assets only (`kaykit-furniture/*`, `kaykit-restaurant/*`, customers), **0** `ultimate-pack` requests, 8 overlays, 0 console errors; API calls `floor-layout` + `operations/live` as before. Suites below all green. | **Pass** | No |
| **B** Ultimate, lazy | `VITE_DASHBOARD_3D=ultimate` (local). Scene chunk requested on open; 9 pack GLBs (local source) + 2 lowpoly + customers; canvas 1, 8 overlays, 0 errors. Production builds: `ultimate` **without** the QA flag → warning + KayKit; with the flag → builds; **0** pack GLBs in every artifact (default, no-QA, QA, invalid). | **Pass (local)** | No. Hosted QA still needs the pack source/licence |
| **C** off | `VITE_DASHBOARD_3D=off`: **0** `floor-layout` requests, **no** scene chunk, no canvas, no selector, Plan shown, 0 errors. | **Pass** | No |
| **D** selection parity | Tap on Mesa 4 in the Ultimate scene (desktop): card "Mesa 4 · Cuenta solicitada" with "Gestionar mesa"; portrait: the same modal as Plan ("Mesa 4", same fields; with operation permissions: assign waiter, new order, call, transfer, bill, receipt, close table), focus moves into the dialog, Esc closes; the list row "Ver mesa — Mesa 4" opens the same card and the ring follows. | **Pass** | No (permissions come from `auth/context`) |
| **E** real event updates the right table | Fake Reverb: `table_request.created` for table 105 → **1** `operations/live` refetch after 823 ms; badge "Llamó camarero" appears at Mesa 5; the other badges did not move. A frame on this restaurant's channel whose payload says `restaurant_id=3` → **0** refetches in 4 s (frontend filter, `useRestaurantRealtime.ts:175`). One event after 20 view toggles → still **1** refetch, 1 socket. | **Pass (fixture)** | **Yes.** §4 records the real QR call and alert, but not a post-fix event+refetch count; repeat on the real stack |
| **F** unknown table | Events for table 106 (operational, not in the layout) and 99999 (nonexistent): overlays unchanged (8 → 8); "Barra 6" stays reachable from "Mesas · 6" (`Ver mesa — Barra 6`). | **Pass (fixture)** | Yes for the real event path (§4 partial) |
| **G** switch | 1 → 3 (2 tables, selection and card cleared) → 2 (no layout → Plan) → 1 (3D again; Plan kept if the person chose it); layout requested per restaurant (1, 3, 2); no tables of the previous restaurant at any point. | **Pass (fixture)** | Yes for a real cross-restaurant event (§4 partial) |
| **H** failures | Layout 500 → panel + *Reintentar* + *Ver plano*, Retry recovers; chunk blocked → panel + *Ver plano* only; no WebGL → own message, **no chunk requested**, Plan works; context lost → panel after 2.5 s, Retry recovers; lost then restored in 600 ms → scene kept; renderer creation failure → panel (`r1-H5-context-creation.png`). In every case stats and attention queue stayed usable; Plan→3D (or switching restaurant) cleared the failure. **Not covered** and documented in the guard: an exception thrown inside the 3D subtree after mount (TresJS renders it outside Vue's parent chain) or in the animation-frame callback. `r1-H5-render-error.png` shows an injection that produced no failure; it is **not** evidence. | **Pass for the listed cases** | No |
| **I** pack unavailable | All `ultimate-pack/*` aborted inside the Dashboard: scene still loads, 8 overlays, selection works, 14 `failed to load` logs. | **Pass** | No |
| **J** gates | `npx vue-tsc -b`, `npm run build`, production builds (default, `ultimate` no-QA, `ultimate`+QA, invalid value) pass. `frontend-dashboard-3d` **19**, `frontend-operational-readability` 19, `frontend-lowpoly-street` 6, `frontend-urban-exterior` 25, `frontend-static-cutaway` 11, `frontend-camera-limits` 4, `frontend-dashboard-stage` 6, `frontend-dashboard`, `frontend-realtime` (38), `frontend-floor-layout`, `frontend-floor-editor`, `frontend-table-mapping`, `frontend-operational-contracts`, `frontend-navigation` 24, `frontend-shell`, `frontend-service`, `frontend-hardening`, `frontend-hardening-build` and the rest of `tests/frontend-*.mjs` pass. **Fail (4), all pre-existing at clean HEAD, none touches changed files:** `frontend-approvals`, `frontend-design-tokens` (missing `docs/design/DESIGN_SYSTEM.md`), `frontend-ritma-redesign` (KDS four-state grid), `frontend-primitives.browser` (snackbar over CTA). `git -c core.whitespace=cr-at-eol diff --check` is clean; plain `git diff --check` flags `env.ts` and `vite.config.ts`, which are CRLF files (kept CRLF; see §2 of the phase report). Light and dark and 1440 / 390 were captured; `ca-ES-valencia` and `en-GB` strings for the new messages exist but were not looked at on screen. | **Pass with the notes above** | No |

### 5.3 Files changed
Source: `src/config/env.ts`, `vite.config.ts` (CRLF kept), `src/views/operation/OperationView.vue`, `src/components/dashboard/operation/stage/StageTopbar.vue`, `src/components/dashboard/operation/stage/stage.css`, `src/components/restaurant-3d/RestaurantScene.vue`, `CameraRig.vue`, `UrbanExterior.vue`, `urban-materials.ts`, `src/i18n/locales/{es-ES,en-GB,ca-ES-valencia}.ts` (`sceneRuntimeError`, `sceneNoWebgl`). New: `SceneRuntimeGuard.vue`, `scene-runtime-guard.ts`, `scene-commands.ts`, `tests/frontend-dashboard-3d.mjs` (19 checks: resolver in every build target, preview independence, mapping with missing/invalid links, WebGL probe, wiring), `tests/qa/dashboard-fake-api.mjs`. Preserved: editor and layout save, realtime contract, `restaurants-api`, the fixture's dark palette. Earlier rounds' files (overlay layout, preview route) are untouched by this section.

### 5.4 How to turn Ultimate off
Rebuild without `VITE_DASHBOARD_3D` (or with `kaykit`) to return to the KayKit room, or with `off` to remove 3D from the Dashboard (Plan only, no 3D requests). A staging/production build can never enable Ultimate without `VITE_ENABLE_ULTIMATE_DASHBOARD_QA=true`, so removing that flag is also enough. In a running session, the **Plano** toggle leaves 3D immediately. Nothing in the URL, local storage or the backend can switch the environment.

### 5.5 Repeating the local inspection
`node tests/qa/dashboard-fake-api.mjs` (ports 8080/8081, loopback), then a dev server per setting, e.g. `VITE_DASHBOARD_3D=ultimate ./node_modules/.bin/vite --port 5395 --host 127.0.0.1` (the dev server serves the pack from `assets-source/restaurant-3d/converted-unused/ultimate-pack/`, `vite.config.ts`), and open `/app/dashboard`. QA controls: `POST /__qa/state` (table status/flags), `/__qa/emit` (realtime event), `/__qa/control` (force a layout failure or delay), `/__qa/reset`, `GET /__qa/log`. Bundled builds use `vite build --mode development` with the same variable.

## 6. Visual and operational refinement round

Captures in `docs/3d/evidence/dashboard-3d/` (same data: 6 tables, 4 alerts on neighbouring tables, 1 table without a link, 1 outside the layout). "Before" = first delivery with only the light-stage fix; first-delivery "before" for the conflict itself: `r1-before-ultimate-desktop-light.png` → `r1-after-ultimate-desktop-light.png` (and `-dark`).

| Viewport | Before | After | Result |
|---|---|---|---|
| Desktop 1440 × 900 | `r2-before-3d-desktop.png`, `r2-before-plan-desktop.png` | `r2-after-3d-desktop.png`, `r2-after-plan-desktop.png` | 3D: **Centrar vista** added top-right (it did not exist on the stage); room, stat cards, queue and legend unchanged; detail card opens under the button (`r1-D-…`). |
| Portrait 390 × 844 | `r2-before-3d-portrait.png`, `…-plan-portrait.png` | `r2-after-3d-portrait.png`, `…-plan-portrait.png`, `…-labels.png`, `…-detail.png`, `…-detail-actions.png` | Four simultaneous alerts on neighbouring tables are readable; labels that had to move carry a leader to their table; detail is the shared modal; **Centrar vista** is the third control in the bottom toggle row. |
| Landscape 844 × 390 | `r2-before-3d-landscape.png`, `…-plan-landscape.png` | `r2-after-3d-landscape.png`, `…-plan-landscape.png` | The four stat cards (about 112 px tall) became a thin strip, the stage no longer has a 416 px minimum height, and the wide arrangement now requires 521 px of height so the queue/legend docks collapse into the toggle row (alert queue, tables, recentre all reachable) and the detail opens as the modal instead of a 24 rem card. |

**Light-stage conflict (reproduced and fixed).** The Ultimate room sat in a dark olive ground, near-black road and `#151515` fog under a light page (`r1-before-ultimate-desktop-light.png`; KayKit on the same stage: `r1-before-kaykit-…`). The visible part of the world is the ground disc, so the stage now uses a pale ground (`#d3ccc1`), a lighter asphalt (`#85868a`) and the stage background as fog. Dark theme keeps the same light maquette, like KayKit.

**Keyboard, focus, touch** (portrait 390): every interactive element over the stage is ≥ 44 px (the only smaller one is the visually hidden skip link). Enter on a "Ver mesa" list row opens the card; **Esc and the card's X return focus to that row** (new: before, focus was dropped); the 3D/Plano selector keeps its arrow-key roving focus. Not done: touch gestures (no device).

**States.** Loading ("Cargando el salón 3D…" with the stats already on screen, `r2-state-loading-portrait.png`), restaurant without layout (falls to Plan, then back to 3D on the next restaurant: `r1-G-switch-no-layout.png`), unlinked layout table (number pin only, Mesa 9), operational table outside the layout (list), scene failures (§5.2 H, captures `r1-H*`), restaurant switch (`r1-G-switch-terraza.png`).

**KayKit vs Ultimate** (bundled builds, 5 loads each, headless Chromium with software GL, loopback API with no latency; median time to the first overlay, i.e. a usable scene): KayKit **1.6 s cold / 1.3 s warm**; Ultimate **1.7 s cold / 1.6 s warm** (canvas present at about 1.1 s in both). Heap about 110 MB after load in both. `off`: no canvas and no scene requests. Draw calls/triangles are not exposed outside development builds, so no new render counts are claimed. These are relative numbers, not device numbers.

**Switching views.** 20 × (Plano → 3D) on the Ultimate dashboard: 1 realtime socket before and after, one subsequent event caused exactly **1** `operations/live` refetch (no duplicate subscription), UI responsive, canvas 1, no WebGL-context or listener warnings, JS heap 61 → 78 MB.

**Larger visual adjustments left for another round.**
1. Landscape phones: the stage canvas is only about 334 px tall, so the room (with the street) stays small; the camera framing for short, wide canvases needs a dedicated design (insets, angle and whether to drop the street). A steeper short-screen angle and smaller insets were added but only help slightly; the table pin above the top row of tables can still touch the stats strip.
2. Stat cards in portrait truncate "67% ocu…" (existing).
3. Lamp posts stay near-black on the pale stage; fine, but the street furniture could take the stage palette too.
4. `ca-ES-valencia` / `en-GB` screens were not inspected.

## 7. Needs a physical phone, the real QA environment, or a product decision
- **Physical phone**: native tap, one-finger orbit, pinch, pan, **Centrar vista** by touch, landscape reachability and FPS (§11 of the phase report). Viewport emulation only so far.
- **Real QA environment**: criterion E with a received Reverb envelope and the one-refetch-per-burst count, F with a real outside-the-layout event, G with a real event for another restaurant (see §4), and a real user whose permissions come from the backend.
- **Product/licence**: hosted QA needs an approved Ultimate Pack source and terms; archive the lowpoly authorization e-mail; decide whether Ultimate should ever be a per-restaurant setting (needs a backend field) instead of a build flag; decide whether to treat exceptions inside the 3D subtree (needs an app-level error handler tagged by origin) as a Plan fallback; decide the landscape-phone design (item 1 above).
- Edition and saving of the layout remain their own delivery; the editor was not touched.
