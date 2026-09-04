# AFORO — restaurants-web

Permanent project memory for `restaurants-web`, the frontend of the AFORO
restaurant SaaS. These rules are durable — every future task in this repo
must respect them, not just the task that introduced them.

## 1. Project

- Product: AFORO, restaurant operations SaaS. Initial market: Valencia, Spain.
- Stack: Vue 3 + TypeScript + Vite, Vue Router, Pinia, Vue I18n, Tailwind CSS v4, Axios.
- Backend: Laravel REST API, auth via Sanctum SPA session-cookie.
- Locales: `es-ES` (default), `ca-ES-valencia`, `en-GB`.
- Default restaurant timezone: `Europe/Madrid` (each restaurant has its own from the backend — never assume the browser's).

## 2. Design system authority — mandatory, permanent

- **`docs/design-system.md`** is the single source of truth for all visual
  decisions: brand colour, Material 3 tokens, typography, shape, spacing,
  surfaces, elevation, motion, theming, responsive/adaptive strategy.
- **Before implementing or modifying any user-facing interface, use
  `/ui-ux-pro-max` to plan and review the UX.** This includes layouts, pages,
  components, forms, inputs, buttons, cards, tables, dialogs/modals,
  navigation (sidebar/topbar/bottom nav), dashboards, KDS, staff screens,
  settings, the public QR experience, cart/checkout-like flows, and
  loading/empty/error states — at every breakpoint (mobile/tablet/desktop).
- All UI must follow the AFORO Material Design 3 design system documented in
  `docs/design-system.md`. This is not optional and not a one-time setup
  step — it applies to every future UI task.
- **Permanent visual reference images** live at `src/assets/images/ref/`
  (`imagem 1.jpg`, `imagem 2.webp`, `imagem 3.png`) — see
  `docs/design-system.md` §21 for the full mapping. Governing weighting:
  **60% ref 2 (dark premium/technological base) → 30% ref 1 (AFORO orange
  personality, refined — not its thick borders) → 10% ref 3 (Light Mode
  softness, not its low contrast or neumorphism)**. This is a directional
  weighting of visual *treatment* (contour/shadow/depth/surface/radius),
  never the layout/content of those images. Any agent uncertain about a
  visual-treatment decision must open and look at these images, not rely on
  a text description — this applies permanently, to every future screen.

## 3. Visual language & brand

- Structural foundation: **Material Design 3 / Material You** (hierarchy,
  tonal surfaces, shape, navigation, motion, states, accessibility, adaptive
  layout) — never a literal Google-product reskin. AFORO keeps its own
  identity on top of that structure.
- Brand colour family: warm gradient **golden-orange → orange → deep
  orange → dark rust-red**, always over near-black. Never introduce purple,
  blue, random green, or cold gradients as a primary brand colour.
- **Real AFORO assets exist** at `src/assets/brand/`: `aforo-symbol.png`
  (circular "A" mark) and `aforo-wordmark.png` (full "AFORO" wordmark), both
  processed into transparent PNGs from the originals dropped in `public/`
  (which were opaque with a baked-in black background — unusable on light
  surfaces as-is). `public/icon-logo.png` remains as the site favicon
  (opaque-on-black is the correct format for a favicon). The brand palette
  in `docs/design-system.md` §4 is sampled directly from these real pixels,
  not guessed — it is no longer provisional.
- Use the **wordmark** wherever there's room for it (login brand panel,
  mobile drawer header); use the **symbol** in compact contexts (nav rail,
  favicon/app-mark). Never use textual "AFORO"/"A" placeholders where the
  real asset fits instead.
- Never redesign/recreate the logo, never apply CSS filters that distort it,
  never regenerate the transparent PNGs from scratch — treat
  `src/assets/brand/*.png` as the source of truth; if the brand assets ever
  change, redo the chroma-key extraction from the new originals instead of
  hand-editing pixels.

## 4. Design tokens

- All color/typography/shape tokens live in `src/styles/tokens.css` (three
  layers: brand primitives → Material 3 system roles → shape/type scale),
  mapped into Tailwind v4 via `@theme` in `src/style.css`.
- Components consume Material 3 **system role** tokens (`--color-primary`,
  `--color-on-surface`, `bg-surface-container-high`, etc.) — never raw brand
  hex values (`--brand-*`) or arbitrary hex/px values directly. The one
  deliberate exception is `--color-brand-panel`/`--color-on-brand-panel`
  (the login brand panel's theme-invariant near-black surface) — it's a
  named token, just not a themed one; still never a raw hex in a component.
- `--brand-gradient` and `--brand-glow` are centralized tokens — never
  duplicate a gradient/glow string in a component. Gradient is for accent
  moments only (logo areas, hero surfaces, a selected/premium highlight) —
  never a background for buttons/cards/whole sections. Glow is atmosphere
  for a handful of high-value surfaces (login brand panel today), not a
  default card treatment.
- Don't repeat a magic number across components — add or reuse a token.

## 5. Light & dark mode — mandatory from day one

- Every screen/component must work correctly in **both** Light and Dark
  mode. A screen is not finished if it only works in one theme.
- Dark mode is **not** a naive white↔black inversion. It uses warm neutral
  dark surfaces + elevated tonal containers + warm orange/gold highlights —
  never neon/gaming-styled, never a flat invert.
- Theme resolution: `system` (via `prefers-color-scheme`) is the default;
  `data-theme="light"` / `data-theme="dark"` on `<html>` forces a mode for a
  future `useTheme()` composable/store. Persist theme (and locale)
  preference in `localStorage` — **never** auth tokens.
- Don't build the theme store/composable speculatively before there's an App
  Shell UI to attach it to — but every token added must already support all
  three states.

## 6. Typography & shape

- Font family is currently a **provisional** native system-font stack (see
  `docs/design-system.md` §7) — inspect existing brand assets before ever
  installing a new font; don't install one arbitrarily.
- Type roles (display/headline/title/body/label) are centralized as Tailwind
  `text-*` tokens in `src/style.css` — never set font-size/weight ad hoc per
  component.
- Shape (border-radius) follows the Material 3 corner scale mapped to
  Tailwind `rounded-*` tokens — never a bespoke radius per component.

## 7. Spacing

- Tailwind v4's default 4px-based spacing scale **is** the project's spacing
  system (it already matches 4/8/12/16/24/32/40/48). Don't invent a parallel
  spacing scale — use Tailwind spacing utilities directly.

## 8. i18n

- `es-ES` (default), `ca-ES-valencia`, `en-GB` via Vue I18n
  (`src/i18n/index.ts`, `src/i18n/locales/*`).
- Vue I18n translates **interface chrome only**. Restaurant content
  (products, categories, modifier groups/options, menu copy) is translated
  by the **backend** — never mix the two systems.
- No hardcoded UI strings — everything user-facing goes through i18n.
- Respect locale-aware currency/date/number formatting (e.g. `es-ES` →
  `12,50 €`, even when the backend returns `"12.50"`).
- A language selector should exist wherever it makes sense, using a
  consistent component, with the choice persisted locally.

## 9. Auth & API contracts

- Auth is **Laravel Sanctum SPA session-cookie only**. Never Bearer tokens,
  JWTs, or tokens in `localStorage`.
- `src/api/http.ts` is already configured with `withCredentials: true` and
  `VITE_API_URL` — keep it that way; don't introduce a second HTTP client
  pattern.
- **Never invent** an endpoint, payload shape, response field, permission
  name, or status code. Inspect the real backend/OpenAPI contract before
  wiring any integration.
- Backend is always the authority for authorization. Frontend may only
  hide/disable/adapt UX based on permissions/capabilities returned by the
  backend — never gate a UX decision on `role === 'owner'` string checks
  when a permission/capability is available instead.
- **Current real gap (confirmed against the live backend, FRONT BLOCO 2):**
  `GET /api/v1/auth/me` returns only `id/name/email/email_verified_at/
  created_at/updated_at` — no roles, no permissions, no capabilities. The
  frontend cannot yet adapt UI to what a user is allowed to do; every
  permission-gated action (e.g. viewing `/restaurants/{id}/settings`,
  which needs `manage_restaurants` — a `view_reports`-only user gets 403)
  can only be discovered by attempting the call and handling 403, never by
  a frontend-side check. Don't build a permissions store or a
  `hasPermission()` helper against nothing — that would be inventing
  authorization. Revisit once the backend exposes this.

## 10. Multi-restaurant domain

- Never assume `user.restaurant` (singular). The domain is
  `User → 1..N Restaurants`. Owners see restaurants org-wide; staff only see
  restaurants they're explicitly assigned to.
- Maintain an explicit `currentRestaurant` context (`src/stores/restaurant.ts`)
  and only allow switching among restaurants the user is actually permitted
  to access.

## 11. State management & services

- Pinia is only for real global/cross-cutting state: auth, active
  organization/restaurant, theme, user preferences. Don't cache full API
  responses in Pinia.
- Keep HTTP calls in a services/API layer (`src/api/`, `src/services/`), not
  inline in components — components shouldn't contain large Axios blocks.

## 12. TypeScript

- Avoid `any`. Use `unknown` only as a temporary placeholder until the real
  contract has been inspected, then replace it with a proper type.

## 13. UI states, errors, forms

- Every data-bearing screen must handle, where applicable: loading, success,
  empty, error, forbidden, not-found, offline/network-failure.
- Map HTTP failures (401/403/404/409/422/429/500, network failure) to clear,
  human UX — never show a raw status code to the user.
- Forms need: visible label (not placeholder-only), help/error text near the
  field, disabled/loading states, and clear validation feedback.
- Confirm only destructive/irreversible/high-impact actions — don't ask "are
  you sure?" for routine actions.

## 14. Accessibility

- Semantic HTML — `<button>` for actions, never `<div @click>`.
- Every interactive element: visible focus state, keyboard operability, a
  label (visible or `aria-label` for icon-only controls).
- WCAG AA contrast minimums (4.5:1 text, 3:1 large text/UI/icons) — verify,
  don't assume, especially with the brand's warm/bright colours.
- Never convey meaning by colour alone.
- No emoji as interface icons.

## 15. Motion

- Short (150–300ms), functional, purposeful animations that express a real
  state change — never purely decorative, never blocking. Respect
  `prefers-reduced-motion`.

## 16. Responsive & restaurant-first UX

- Every screen is designed for mobile/tablet/desktop together — never
  "desktop first, shrink later."
- Mobile-first priority: waiter, tables, orders, customer-facing QR menu,
  table requests. Tablet priority: KDS, cashier, manager. Desktop priority:
  management, reports, menu configuration, staff, settings.
- Touch targets ≥44×44px with ≥8px spacing between adjacent targets.
- Navigation is adaptive per breakpoint/role (rail/drawer on desktop,
  bar/drawer/overflow on mobile) — never assume a fixed sidebar everywhere.
  Choose the pattern per screen via `/ui-ux-pro-max`.
- Desktop can use real data tables; mobile adapts to cards/stacked rows with
  progressive disclosure, not a blanket horizontal-scroll table.
- Before shipping any flow, ask: how many taps? how long? does it work
  during a full house? on tablet? one-handed? is it easy for a
  waiter/kitchen-staff member?

## 17. Components & dependencies

- Check `src/components/ui`, `src/components/shared`, and (for anything
  data/metric/chart-shaped) `src/components/dashboard` for an existing
  component before creating a new one — avoid near-duplicate components.
  `src/components/dashboard/` already has `MetricCard`, `SectionCard`,
  `EmptyState`, `DonutChart`, `BarList`, `ProgressRing` (FRONT BLOCO 2.1) —
  reuse these for any future module's stat/chart needs rather than building
  parallel ones per screen.
- Build reusable AFORO components (`AButton`, `ATextField`, `ACard`, etc.)
  only when a real screen needs them — don't pre-build the full inventory.
- No full UI framework (Vuetify, PrimeVue, Quasar, Element Plus, Material
  Web). Stack stays Vue + Tailwind + own components; Material 3 is a design
  language here, not a dependency.
- Before writing chart code anywhere (any module, not just Dashboard): load
  the `dataviz` skill first. It governs form choice, the emphasis-pattern
  color rule already applied to the Dashboard charts (§21 of
  `docs/design-system.md`), and the accessibility checks (legend, direct
  labels, contrast relief) — don't reinvent this per screen.

## 18. Build & scripts

- `npm run build` must keep passing after any change.
- Only run `npm run lint` if that script actually exists in `package.json`
  at the time — don't invent scripts that aren't there.

## 19. Workflow for every future agent touching UI

1. Read this file (`CLAUDE.md`).
2. Read `docs/design-system.md` when the task involves any UI.
3. Use `/ui-ux-pro-max` to plan/review the UX before implementing.
4. Inspect the real backend/API contract — never invent one.
5. Plan, then implement.
6. `npm run build` — technical validation only, not the finish line (§20).
7. Validate the real, touched flow with `agent-browser` — functional +
   visual, proportional to the change (§20).
8. Validate light mode / dark mode / `es-ES` / `ca-ES-valencia` / `en-GB` /
   mobile-tablet-desktop, as relevant to what changed (§20).
9. Fix anything real `agent-browser` surfaces, inside the task's scope, then
   re-run the affected flow.
10. Report briefly (§20) and stop — don't start a new block without
    approval.

## 20. Mandatory Browser Validation — agent-browser

This is a **permanent** workflow rule, not a one-time setup step. It applies
automatically to every future frontend prompt — it does not need to be
repeated in the prompt itself.

```text
IMPLEMENT → BUILD → AGENT-BROWSER → FUNCTIONAL VALIDATION → VISUAL VALIDATION → FIX IF NEEDED → REPORT
```

- **Tool**: [agent-browser](https://github.com/vercel-labs/agent-browser)
  (Vercel Labs), installed as a local devDependency. Run it via
  `npx agent-browser <command>` on Windows/PowerShell (global install isn't
  used here — no technical reason forced that choice, project-local keeps
  the tool versioned with the repo like everything else). One-time browser
  setup: `npx agent-browser install` (Chrome for Testing) — already done in
  this environment.
- **Do not use Claude-in-Chrome as the default AFORO validation workflow.**
  `agent-browser` is the standard from now on. Claude-in-Chrome is
  exceptional-use only, with a specific stated reason for that instance.
- **Rule**: every frontend implementation must be validated against the
  real running app with `agent-browser` before being considered done —
  new screens, new components, visual changes, API integrations, forms,
  navigation, state, auth, Restaurant context, Dashboard, Tables, Orders,
  KDS, Menu, Staff, Settings, Public QR, bug fixes, and any refactor that
  could change behavior.
- **`npm run build` is technical validation, not functional or visual
  validation — a green build does not mean the task is done.** Expected
  flow for relevant frontend work: implementation + build + agent-browser
  validation.
- **Functional validation**: run the actual flow that was touched (e.g.
  Dashboard → login → dashboard → Restaurant selector → switch restaurant →
  data reloads; Tables → login → Tables → open/create table → primary
  action → state updates) — not the whole app. Proportional to the change:
  small change → the touched flow + affected screen; structural change →
  touched flow + directly related flows; critical-path change (auth,
  router, Restaurant context, API layer, App Shell) → a bit wider.
- **Visual validation**: for any UI change, actually render it — screenshot
  and/or live inspection via `agent-browser`, never just reading Tailwind
  classes/tokens in source. Normally 1 desktop + 1 mobile screenshot is
  enough for a new/changed screen; add Dark when the theme is relevant.
  Compare against `docs/design-system.md`, this file, and
  `src/assets/images/ref` (design-system.md §21 — 60/30/10 reference
  weighting): surface, depth, shadow, border, radius, contrast, AFORO
  orange, typography, spacing, overall consistency.
- **Responsive**: validate the viewports relevant to the module
  (`agent-browser set viewport <w> <h>` — mobile 375, tablet 768, desktop
  1440 as base reference) — not every breakpoint on every micro-change.
  Waiter/public QR → mobile required. KDS → tablet required.
  Manager/dashboard → desktop required.
- **Theme**: validate Light/Dark/System (`agent-browser set media
  dark|light`) only when the change is visually relevant — no need to
  repeat all three on a micro-change with no visual impact.
- **Console/runtime**: check real runtime errors (`agent-browser console`).
  A screen that builds but throws a Vue runtime error, an i18n exception,
  an undefined access, or causes a request loop is **not** done — this
  exact class of bug already happened once in Login with Vue I18n.
- **Network**: when a change touches the API, check requests relevant to
  the touched flow only (`agent-browser network requests`) — not a full HAR
  dump.
- **Selectors**: prefer `agent-browser snapshot` → interact by ref
  (`@e1`) / role / label / text over fixed-pixel clicks — refs stay stable
  across a session; re-snapshot after any DOM change.
- **Fix in scope**: a real bug `agent-browser` surfaces (functional,
  visual, overflow, invisible element, broken action, a frontend-caused API
  error, runtime exception) gets fixed within the task's scope, then the
  affected flow gets re-run — don't just report a fixable frontend bug
  without attempting the fix.
- **Backend**: `agent-browser` never authorizes inventing backend changes.
  A real Laravel-side problem found during validation gets identified and
  documented, then follows this project's normal rules before any
  API/domain change.
- **Auth for validation**: use a real dev user — never invent credentials.
  Confirm the current dev/seed user against the actual environment before
  relying on one (don't assume a credential from an earlier session is
  still valid).
- **Screenshots are throwaway**: use a scratch/temp directory for
  `agent-browser` screenshots taken for inspection — don't commit them into
  the repo. A permanent visual-evidence convention would be a separate,
  deliberate decision later.

**Definition of Done — frontend.** A frontend task is done only when, as
applicable:

```text
implementation complete
TypeScript/build green
real browser flow tested (agent-browser)
visual output inspected (agent-browser screenshot / live)
relevant API integration validated
obvious responsive issues checked
no relevant runtime errors
```

Don't demand checks irrelevant to the task's actual scope.

**Reporting**: keep it short, no PASS/FAIL matrices. Per block: `Build:`,
`agent-browser:` (flows tested), `Visual:` (viewports/themes checked),
`Problems found:`, `Fixes made:`, then a short manual-validation pointer
for the user.
