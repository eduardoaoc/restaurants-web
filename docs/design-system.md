# AFORO Design System

Official visual source of truth for the `restaurants-web` frontend. `CLAUDE.md`
references this document and requires it to be followed for any user-facing
interface work. Generated with `/ui-ux-pro-max` (UI/UX Pro Max skill) as the
initial permanent foundation — no screens were implemented as part of this pass.

---

## 1. Design Philosophy

AFORO is operational software for restaurants in a fast-paced, hands-busy,
often-loud environment (Valencia, Spain, as the initial market). Every design
decision is filtered through restaurant-first UX questions before aesthetics:

- How many taps does this take?
- How long does it take?
- Does it hold up during a full house / rush?
- Does it work on a tablet? One-handed on a phone?
- Is it easy for a waiter mid-service? For kitchen staff with wet/gloved hands?

Visually, AFORO uses **Material Design 3 / Material You** as its structural
language (hierarchy, tonal surfaces, shape, states, motion, adaptive layout),
but is never a literal reskin of a Google product — it carries its own warm,
appetizing brand identity on top of that structure.

---

## 2. AFORO Brand Identity

The AFORO mark uses a warm gradient — **golden-orange → orange → deep
orange → dark rust-red** — always set against near-black.

**Real assets in use** (`src/assets/brand/`):

| File | Use |
|---|---|
| `aforo-wordmark.png` | Full "AFORO" wordmark — use wherever there's room (login brand panel, mobile drawer header) |
| `aforo-symbol.png` | Circular "A" mark — use in compact contexts (nav rail) |

Both were processed from the originals dropped in `public/`
(`logo-aforo-complete.png`, `icon-logo.png`), which are opaque PNGs with a
baked-in solid-black background — unusable directly on any light surface.
The versions in `src/assets/brand/` are chroma-keyed to transparent (a
brightness-threshold alpha mask with a soft edge band matching the
artwork's own anti-aliasing) so they composite correctly on both themes.
This is asset *preparation*, not a redesign — no pixels of the mark itself
were altered, only the flat black backdrop was made transparent.
`public/icon-logo.png` (opaque) remains as-is for the site favicon, where a
solid background is the normal, expected format.

Brand usage rules:

- Use the real assets above — never a textual "AFORO"/"A" standing in for
  the mark once there's room for the real thing.
- Never redraw, re-vectorize, distort, or CSS-filter the mark.
- If the source artwork ever changes, redo the chroma-key extraction from
  the new original — don't hand-edit the transparent PNGs.
- The brand gradient (`--brand-gradient`) is for identity moments (logo
  areas, hero surfaces, a selected/active accent) — **not** a background for
  every button or card. The brand glow (`--brand-glow`) is atmosphere for a
  handful of high-value surfaces (the login brand panel today) — not a
  default treatment for every card or empty state.

---

## 3. Material Design 3 Principles Adopted

| M3 concept | AFORO usage |
|---|---|
| Tonal surfaces | Elevation communicated via `surface-container*` steps, not heavy shadows |
| Color roles | `primary/secondary/tertiary` + container/on-* pairs, never raw hex in components |
| Shape system | Consistent corner radii by component tier (§8), not ad hoc per component |
| Adaptive layout | Nav pattern changes by breakpoint and role, chosen deliberately per screen |
| Motion | Short, purposeful, interruptible; respects `prefers-reduced-motion` |
| States | Explicit hover/pressed/focus/disabled treatment via opacity/color, not layout shift |
| Accessibility | WCAG AA contrast minimums are non-negotiable, checked before shipping |

Explicitly avoided: Material Design 1/2 skeuomorphic affordances, generic
Bootstrap-admin/ERP look, corporate blue, gratuitous box-shadows, and cold
gradients unrelated to the brand.

---

## 4. Brand Colour Strategy

Brand primitives (`src/styles/tokens.css`) — **sampled directly from the
real logo pixels** (`src/assets/brand/*.png`), not chosen by eye:

| Token | Hex | Role |
|---|---|---|
| `--brand-orange-100` | `#FFB000` | Lightest gradient stop (golden-orange) |
| `--brand-orange-300` | `#FF9500` | Light-mid orange |
| `--brand-orange-500` | `#FF7300` | Core AFORO orange — seeds `primary` |
| `--brand-orange-700` | `#E8420A` | Deep/intense orange |
| `--brand-red-orange` | `#B82400` | Deepest stop |

These primitives are **never** consumed directly by components (the one
named exception is `--brand-panel-surface`/`--brand-panel-on-surface`, see
below). All UI reads Material 3 *system role* tokens (`--color-primary`,
`--color-on-surface`, etc.), derived from this seed.

**A real finding from sampling, not a blind guess:** the logo's deepest
gradient stop measured `rgb(189,34,1)`/`rgb(173,38,1)` across both assets —
a dark, saturated rust-red, noticeably darker and more desaturated than an
early conceptual placeholder (`#FF4D00`) would suggest. The token above
(`#B82400`) reflects the real asset, not the placeholder.

**Primary and its contrast:** `--md-sys-color-primary` is
`--brand-orange-500` (`#FF7300`) in **both** light and dark mode — the brand
accent is intentionally theme-invariant; only neutrals shift between
themes. `#FF7300` does not clear 4.5:1 against white text at any reasonable
size (~2.7:1 measured) — this is exactly the "don't assume white-on-orange
works" trap. `on-primary` is a dark warm near-black (`#1A0F00`) instead,
which clears **~6.9:1** against the primary — the "premium high-contrast
interface" pattern (dark text on a bright accent) called for in this pass.

**Theme-invariant brand-panel tokens** (login brand panel only —
`--brand-panel-surface: #0B0A08` / `--brand-panel-on-surface: #F2EAE3`):
never redefined in the light/dark blocks, so the login brand panel is
always near-black regardless of active theme — a deliberate, constant brand
statement, not a themed surface. Don't reuse these two tokens anywhere else;
every other surface should be theme-aware.

---

## 5. Light Theme

Warm off-white hierarchy (never clinical white, never blue-tinted gray),
Material 3 role tokens, all defined in `:root` of `src/styles/tokens.css`:

| Role | Hex |
|---|---|
| `primary` / `on-primary` | `#FF7300` / `#1A0F00` |
| `primary-container` / `on-primary-container` | `#FFE0C2` / `#431E00` |
| `secondary` / `on-secondary` | `#7A5B3E` / `#FFFFFF` |
| `secondary-container` / `on-secondary-container` | `#F3E2D0` / `#2E1F10` |
| `tertiary` / `on-tertiary` | `#7A5C00` / `#FFFFFF` |
| `tertiary-container` / `on-tertiary-container` | `#FFE9A8` / `#241A00` |
| `background` / `on-background` | `#FBF3EA` / `#241C14` |
| `surface` | `#FDF8F2` |
| `surface-container-lowest → highest` | `#FFFFFF → #E5D2B8` (5-step scale) |
| `on-surface` / `on-surface-variant` | `#241C14` / `#6B5D4F` |
| `outline` / `outline-variant` | `#A6957F` / `#E4D4BE` |
| `error` / `on-error` | `#BA1A1A` / `#FFFFFF` |
| `error-container` / `on-error-container` | `#FFDAD6` / `#410002` |

Key pairs spot-checked against WCAG AA: primary/on-primary ≈6.9:1,
on-primary-container/primary-container ≈11.7:1, on-background/background
very high. Run a full contrast audit before shipping the first real
operational screens — spot checks aren't a substitute for auditing every
pairing actually used in UI.

---

## 6. Dark Theme

Dark mode is the environment where the AFORO brand has the **most** visual
impact — not an inversion of light mode, and not pure black anywhere. A
**neutral graphite/steel** scale gives real, perceptible hierarchy:
`background` (the app canvas) is the darkest step, and each
`surface-container-*` step above it is a small, deliberate lift, so chrome
and cards read as sitting *on* the canvas rather than one flat dark
rectangle. The neutral ramp itself carries **no warm undertone** — the
AFORO orange is the one warm note in the whole surface, by contrast; that
contrast is deliberate (§3/§11).

**Revision history** (two corrections, both against the real reference
image, not its text description — see §21):
1. FRONT BLOCO 1's first pass landed too close to pure black.
2. FRONT BLOCO 2.1 lightened it but kept a warm brown-graphite undertone —
   which, compared side-by-side against the actual reference screenshot
   (`src/assets/images/ref/imagem 2.webp`), read as "chocolate/muddy," not
   the neutral technological steel that image actually shows. FRONT BLOCO
   2.2 re-derived the ramp with **zero warm tint** in the neutrals — this is
   the corrected, current version. Every pair below was verified with the
   WCAG contrast formula, not eyeballed.

| Role | Hex |
|---|---|
| `primary` / `on-primary` | `#FF7300` / `#1A0F00` (same accent as light — see §4) |
| `primary-container` / `on-primary-container` | `#3D1A00` / `#FFD9B8` |
| `secondary` / `on-secondary` | `#D9B79A` / `#3D2A18` |
| `secondary-container` / `on-secondary-container` | `#4A3420` / `#F0DAC0` |
| `tertiary` / `on-tertiary` | `#E8B23A` / `#3D2E00` |
| `tertiary-container` / `on-tertiary-container` | `#4A3800` / `#FFE9A8` |
| `background` / `on-background` | `#17181C` / `#F4F4F2` (darkest step — the canvas) |
| `surface` | `#1E2024` |
| `surface-container-lowest → highest` | `#1C1E22 → #30343A` (5-step scale above background) |
| `on-surface` / `on-surface-variant` | `#F4F4F2` / `#A8ABB2` (neutral off-white / neutral gray — no warm or blue tint) |
| `outline` | `#777B83` |
| `outline-variant` | `rgba(255,255,255,0.06)` — translucent so it reads correctly over *any* surface step, not just one |
| `error` / `on-error` | `#FFB4AB` / `#690005` (standard M3 dark error pair) |
| `error-container` / `on-error-container` | `#93000A` / `#FFDAD6` |

Spot-checked (WCAG contrast formula): on-background/background ≈16.1:1,
on-surface-variant/surface ≈7.1:1, on-surface-variant/surface-container-highest
≈5.4:1 (the tightest real pairing — clears 4.5:1 body-text AA with room to
spare), outline/surface-container-lowest ≈3.9:1 (clears the 3:1 non-text/
UI-boundary minimum), on-primary/primary (button label) ≈6.9:1 (same pair
as light, by design), primary/surface-container ≈5.5:1 (icons/accents on a
card).

**Note on `secondary`/`tertiary`:** these two roles still carry a warm tan/
gold tone (unchanged) — currently harmless because nothing in the built UI
renders them yet (`AButton`'s `tonal` variant is the only consumer and no
screen uses it). If a future block puts one on screen, re-derive it neutral
too rather than assuming it's already covered by this pass.

**Ambient glow** (`--brand-glow`, a large low-opacity radial gradient) is
reserved for a small number of high-value dark surfaces — the login brand
panel today, future hero/empty states later. It's atmosphere, applied once
per screen at most, never a per-card decoration.

---

## 7. Typography

**Font family — provisional.** No brand typeface decision exists yet and no
brand asset was available to infer one from, so per the standing rule
("inspect existing assets before installing a font, don't install one
arbitrarily") the system uses a **native system-font stack** with zero
install cost and no FOUT risk:

```
ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
"Helvetica Neue", Arial, sans-serif
```

This already resolves to Roboto on Android/Chrome-OS and San Francisco on
Apple platforms, which happens to line up with Material 3's own Roboto-based
type system on the platforms that matter most for staff-facing tablet/phone
use. Revisit once a brand typeface is chosen; it's a one-line change in
`src/styles/tokens.css` (`--font-sans-family`).

**Type scale** (Material 3-inspired roles, mapped to Tailwind `text-*`
utilities via `@theme` in `src/style.css` — never set font-size/weight ad hoc
in a component):

| Token | Size / line-height | Typical use |
|---|---|---|
| `text-display` | 40px / 1.15 | Rare hero numbers (e.g. big KPI) |
| `text-headline` | 28px / 1.25 | Page/section headlines |
| `text-title-lg` | 22px / 1.3 | Card/dialog titles |
| `text-title-md` | 16px / 1.4 (medium weight) | List item titles, form section titles |
| `text-body-lg` | 16px / 1.5 | Default body text |
| `text-body-md` | 14px / 1.5 | Secondary body text |
| `text-label-lg` | 14px / 1.4 (medium weight) | Buttons, prominent labels |
| `text-label-md` | 12px / 1.4 (medium weight) | Chips, badges, captions |

---

## 8. Shape System

Material 3 corner scale, centralized as Tailwind radius utilities so no two
components invent their own radius:

| Token | Value | Tailwind utility | Typical use |
|---|---|---|---|
| `--shape-corner-extra-small` | 4px | `rounded-xs` | Chips, small badges |
| `--shape-corner-small` | 8px | `rounded-sm` | Compact/dense chips (not currently used by a built component) |
| `--shape-corner-medium` | 12px | `rounded-md` | Small/secondary cards, dropdown menus |
| `--shape-corner-large` | 16px | `rounded-lg` | Primary/standard cards, dialogs, sheets, text fields (`ATextField`), buttons (`AButton`) |
| `--shape-corner-extra-large` | 28px | `rounded-xl` | Large modals, hero surfaces |
| `--shape-corner-full` | 9999px | `rounded-full` | Icon-only controls, avatars, FAB — **not** text buttons |

Per the permanent visual direction (§21): buttons take **12–16px** radius
(`AButton` uses `rounded-lg`/16px), never a full pill — that reads as
gaming/landing-page, not operational software. Icon-only controls
(`AIconButton`) stay circular (`rounded-full`) — that's a distinct,
idiomatic Material 3 pattern, not a button-radius exception. Cards generally
run 16–20px; smaller/secondary cards can go down to 12–16px — see §21.

---

## 9. Spacing

Tailwind v4's default spacing scale (4px increments: `1`=4px, `2`=8px,
`3`=12px, `4`=16px, `6`=24px, `8`=32px, `10`=40px, `12`=48px, ...) **is** the
AFORO spacing system — it already matches the requested 4/8/12/16/24/32/40/48
grid exactly. No parallel spacing tokens are defined; use Tailwind spacing
utilities directly (`p-4`, `gap-6`, ...) and never a raw pixel value.

---

## 10. Surfaces

Prefer the `surface-container-*` ladder over shadows to express elevation:

`surface-container-lowest` → `surface-container-low` → `surface-container` →
`surface-container-high` → `surface-container-highest`

Reach for a heavier `surface-container-*` step (or a small `box-shadow` only
when truly necessary — e.g. a floating action button, an open dropdown over
unrelated content) rather than layering box-shadows on every card.

---

## 11. Elevation

Elevation communicates hierarchy, not decoration. A dashboard should not be
"card soup" — flat lists/sections on `surface-container-low` are preferred
over dozens of individually-elevated cards *of equal weight*. That said,
real content cards (Dashboard metric/section cards) do carry their own
soft, close shadow now (revised in FRONT BLOCO 2.1 after visual review
against the references — a flat/borderless card read as "generic dashboard
template," not premium; see §21) — the rule is still "don't make everything
loud," not "no card ever gets a shadow." Reserve the *stronger* elevation
tier for things that are actually floating above content: menus, dialogs,
sheets, tooltips, a FAB.

**Two shadow tokens**, both in `src/styles/tokens.css` / mapped to Tailwind
utilities in `src/style.css`, theme-aware and intentionally different by
theme (never a single value reused everywhere):

- **`--elevation-shadow`** → `shadow-elevated`. The stronger tier, for the
  floating layer only — dropdown menus (`ThemeSwitcher`/`LanguageSwitcher`/
  `UserMenu`/`RestaurantSwitcher`), the mobile nav drawer, dialogs/sheets
  when built.
  - Light: `0 10px 30px rgba(30, 20, 15, 0.1)` — warm-tinted (never a cool
    gray/blue shadow — see §21 ref 3).
  - Dark: `0 10px 30px rgba(0, 0, 0, 0.35)` — plain low-opacity black reads
    correctly against any `surface-container-*` step, where a tinted shadow
    would look muddy.
- **`--card-shadow`** → `shadow-card`. The softer, closer tier for resting
  content cards — `ASurface` takes it via the `elevated` prop (paired with
  `bordered` for the 1px `outline-variant` edge; see `MetricCard`/
  `SectionCard` in `src/components/dashboard/`). Never combined with
  `shadow-elevated` on the same element.
  - Light: `0 1px 2px rgba(30,20,15,.04), 0 6px 16px rgba(30,20,15,.06)`.
  - Dark: `0 1px 2px rgba(0,0,0,.2), 0 6px 18px rgba(0,0,0,.22)`.

Never reach for Tailwind's default `shadow-lg`/`shadow-xl` etc. directly in
a component — they carry a generic cool-gray shadow color that fights the
warm neutral system. Most depth still comes from the `surface-container`
tonal ladder (§10) plus the card shadow above, not from the stronger
floating-layer shadow — see §21 for the full depth system.

---

## 12. Motion

- Micro-interactions: 150–300ms, `ease-out` on enter / `ease-in` on exit.
- Every animation expresses cause → effect (state change, navigation
  direction, confirmation) — never purely decorative.
- Never blocks input; animations must be interruptible.
- Respect `prefers-reduced-motion: reduce` — disable/shorten non-essential
  motion when set.

---

## 13. Accessibility

- Semantic HTML first: `<button>` for actions, never `<div @click>`.
- Every interactive element: visible focus ring, keyboard-operable, labeled
  (visible label or `aria-label` for icon-only controls).
- Minimum contrast: 4.5:1 body text, 3:1 large text/UI components/icons —
  checked against the tokens above, not assumed.
- Never convey state/meaning by color alone (pair with icon/text/pattern).
- Touch targets ≥44×44px, ≥8px between adjacent targets.
- Respect `prefers-reduced-motion` and OS text-scaling.
- No emoji as interface icons.

---

## 14. Responsive / Adaptive Strategy

Mobile / tablet / desktop are designed together, not "desktop then shrink."
Priority by role (§19 of `CLAUDE.md`):

| Device | Primary users/flows |
|---|---|
| Mobile | Waiter, tables, orders, customer-facing QR menu, table requests |
| Tablet (landscape especially) | KDS, cashier, manager |
| Desktop | Management, reports, menu configuration, staff, settings |

Navigation is **adaptive, not fixed**: a persistent sidebar is not assumed at
every breakpoint. Desktop may use a navigation rail/drawer; mobile may use a
bottom nav (≤5 items), drawer, or "more" overflow — chosen per screen with
`/ui-ux-pro-max`, not defaulted.

Data tables: desktop may use real `<table>`s; mobile adapts to stacked
cards/rows with progressive disclosure, not raw horizontal scroll dumped on
every table.

---

## 15. i18n

Vue I18n, three initial locales, `es-ES` default:

| Locale | Language |
|---|---|
| `es-ES` (default) | Castellano |
| `ca-ES-valencia` | Valencià |
| `en-GB` | English |

Rules:

- Vue I18n translates **interface chrome only** (labels, buttons, nav,
  system messages). Restaurant content (products, categories, modifier
  groups/options, menu copy) is translated by the **backend** — the two
  systems are never mixed.
- No hardcoded UI strings — everything relevant goes through `$t()`/`useI18n`.
- A language selector should be available wherever it makes sense, and the
  choice persists in `localStorage`.
- Currency/date/number formatting follows the active locale (e.g. `es-ES` →
  `12,50 €`), even when the backend returns a raw value like `"12.50"`.
- Default restaurant timezone is `Europe/Madrid`; each restaurant carries its
  own timezone from the backend — never assume the browser's timezone is
  authoritative for operational dates/times.

---

## 16. Component Principles

Build reusable components only when real usage demands them (no speculative
full inventory). When one is needed, check `src/components/ui` and
`src/components/shared` first to avoid near-duplicates. Expected eventual
inventory (build on demand, not upfront):

`AButton`, `ATextField`, `ASelect`, `ACard`, `AIconButton`, `ABadge`, `AChip`,
`ADialog`, `ASnackbar`, `ATooltip`, `AAvatar`, `ASkeleton`, `AEmptyState`,
`AProgress`.

No full UI framework (Vuetify, PrimeVue, Quasar, Element Plus, Material Web)
is installed or planned — Material 3 here is a design language expressed
through Vue + Tailwind + these own components, not a dependency.

---

## 17. Operational Restaurant UX

- **KDS**: legibility at distance, accessible status colors (not color-only),
  large touch actions, tablet-landscape-first.
- **Waiter UI**: one-hand use, fast table selection, minimal taps, large
  touch targets, mobile-first.
- **Dashboard**: hierarchy over "card soup" — a few primary metrics with
  progressive disclosure into detail, not walls of equal-weight cards.
- **Confirmations**: only for destructive/irreversible/high-impact actions —
  not sprinkled on every action.
- **Feedback**: fast, non-blocking snackbars for routine confirmations
  ("Configuración guardada", "Pedido enviado", "Mesa actualizada").

---

## 18. Public Customer UX

QR-based menu/cart/order/call-waiter/request-bill flows are the public
surface. Extremely simple, mobile-first, minimal steps, no account friction
assumed. Shares the same design system/tokens as the staff app, but its UX
can and should diverge (simpler nav, larger CTAs, no dense data views).

---

## 19. Theme Architecture

Three-state theme support is foundational, not deferred:

- **`system`** (default): resolved purely by `prefers-color-scheme` — no JS
  needed, works from the very first render.
- **`light`** / **`dark`**: forced via a `data-theme="light"` /
  `data-theme="dark"` attribute on `<html>`.
- Preference persists in `localStorage` (never auth tokens — see `CLAUDE.md`
  §Auth).
- `useThemeStore` (`src/stores/theme.ts`) reads/sets the attribute, persists
  the choice, and listens for OS scheme changes; `ThemeSwitcher`
  (`src/components/shared/`) is the visible control, present on both Login
  and the App Shell.

---

## 20. Future Component Inventory

Tracked here as a wishlist, not a build queue — create each only when a real
screen needs it (see §16). As screens are built, this section should grow
into a real component catalog (props, states, variants) rather than a flat
name list.

---

## 21. Visual Reference Sources (permanent)

This is a **permanent** direction, not a one-time moodboard — it governs
every future screen (Tables, Orders, KDS, Menu, Staff, Reports, Settings,
Public QR), not just the ones built when it was written.

Three real reference images live in the repo at:

```
src/assets/images/ref/
```

| File | Role | What AFORO takes from it |
|---|---|---|
| `imagem 2.webp` | **Ref 2 — base (60%)** | A dark vehicle-app concept (deep graphite/near-black surfaces, near-zero borders, depth from subtle tonal steps + a soft ambient accent glow, bold high-contrast numerals, very low visual noise). This is the primary source for AFORO's "dark premium, operational, technological" feel. |
| `imagem 1.jpg` | **Ref 1 — personality (30%)** | A near-black-background UI kit with bright orange/red-orange gradient accents (donut chart, avatar, pill buttons) on light cards with a thick dark bezel/frame. AFORO takes the **orange energy and card-vs-background contrast** from this one — explicitly **not** the thick borders or the cartoon-ish bezel-frame treatment, which read as gaming/toy UI, not operational SaaS. |
| `imagem 3.png` | **Ref 3 — softness (10%)** | A light, softly-elevated card UI (gentle shadow, comfortable light neutral surfaces, low-drama elevation). AFORO takes the **gentle Light Mode elevation feel** from this one — explicitly **not** its low text/surface contrast or its cool blue accent, and **not** neumorphism (no recessed/embossed controls, no low-contrast controls that are hard to distinguish from their background). |

The 60/30/10 split is a **directional weighting of visual language**, not a
literal pixel/color mix — read it as "when in doubt, default to ref 2's
restraint; reach for ref 1 only for a deliberate brand/accent moment; reach
for ref 3 only to soften Light Mode elevation."

**Any future agent uncertain about a contour, shadow, depth, surface
treatment, or radius decision must open and look at these three images
before deciding** — not rely on this text description alone. The images are
the source of truth for visual *treatment*; ignore their actual UI layouts,
navigation structure, card counts, and content — none of that is relevant
to AFORO (see §2 of the originating prompt for this rule; not reproduced
here since this file describes outcome, not process).

**Depth system** (ties together §10 Surfaces + §11 Elevation): hierarchy
comes primarily from tonal steps, secondarily from the one shared shadow
token, and only rarely from a visible border —

```
background → surface → surface-container → surface-container-high → floating/overlay
```

`floating/overlay` (menus, dialogs, sheets, the mobile drawer) is the only
layer that gets the stronger `--elevation-shadow`/`shadow-elevated` (§11).
Resting content cards get the softer `--card-shadow`/`shadow-card` instead
(§11) — everything below the card layer (background/surface/container) is
tonal only, no shadow at all.

**Chart colors — no new hues.** Real-data visualizations (Dashboard donuts/
bar lists, `src/components/dashboard/`) do **not** introduce a multicolor
categorical palette — that would break the single-accent brand rule for a
handful of charts. Instead they use the "emphasis" pattern from the
`dataviz` skill: one series in the accent orange (`--chart-accent`, i.e.
`--md-sys-color-primary`), the rest in the two neutral steps already
established elsewhere in this file — `--chart-neutral-mid`
(`on-surface-variant`) and `--chart-neutral-low` (`outline`). All three are
plain aliases in `src/styles/tokens.css`, never new hex values — they
automatically follow whatever the neutral ramp is at the time (warm-tinted
in Light, neutral graphite in Dark, per §6). Because two of the three don't
carry hue-based identity, every chart ships a visible legend + direct value
labels — identity never depends on telling two neutral grays apart. Where a
fill's contrast against its card surface falls under 3:1 (the accent orange
in Light, the neutral-low gray in both themes — real, checked with the WCAG
formula, not assumed), the visible labels are the required relief channel
per the skill's own contrast rule — never shipped
bare.

**Validating against these references**: comparing a live screen to ref
1/2/3 means looking at the actual rendered app, not the source code — see
`CLAUDE.md` §20 (Mandatory Browser Validation). Use `agent-browser` to
screenshot the real page (desktop + mobile, Dark when relevant) and compare
that render — surface, depth, shadow, border, radius, contrast, orange
treatment — against these three images, not against how the Tailwind
classes read on paper.

**What AFORO must never look like** (explicit anti-goals, not just absence
of a style): a marketing landing page, gaming/cyberpunk UI, cartoon UI,
generic Bootstrap-admin dashboard template, or experimental/heavy
neumorphism. It's operational software used for hours at a time by
managers, waiters, kitchen staff, cashiers, and owners — legibility,
operational speed, contrast, and hierarchy come before visual effects,
every time a trade-off comes up.

---

## 22. Operational Density by Module

The visual language (§2–§21) stays constant everywhere; information
*density* is what changes per module, deliberately:

| Module | Density | Notes |
|---|---|---|
| Dashboard | Medium | A few primary metrics, progressive disclosure — never "card soup" (§17). |
| Tables | Medium/high | Enough table state visible at a glance without a second tap. |
| Orders | High scanability | Waiter/kitchen need to scan status fast, mid-service. |
| KDS | High density + high contrast | Legible at distance, tablet-landscape-first (§17). |
| Settings | Lower | Configuration is deliberate, not time-pressured — more breathing room is correct here. |
| Public QR menu | Consumer-friendly | Simpler nav, larger CTAs, no dense data views (§18) — not "high density" even though it's customer-facing content. |

Same components, same tokens, same shape/elevation rules everywhere —
density is spacing/information-per-screen, never a different visual
language per module.
