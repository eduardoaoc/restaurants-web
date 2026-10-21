<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { PhArrowLeft, PhList, PhShoppingCart, PhWarningCircle } from '@phosphor-icons/vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import ABottomSheet from '@/components/ui/ABottomSheet.vue'
import AButton from '@/components/ui/AButton.vue'
import PublicOrderHistory from '@/components/public/PublicOrderHistory.vue'
import { useSessionOrderHistory } from '@/composables/useSessionOrderHistory'
import AIconButton from '@/components/ui/AIconButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ThemeSwitcher from '@/components/shared/ThemeSwitcher.vue'
import EmptyState from '@/components/dashboard/EmptyState.vue'
import PublicActionsMenu from '@/components/public/PublicActionsMenu.vue'
import PublicCartSheet from '@/components/public/PublicCartSheet.vue'
import PublicCategoryNav from '@/components/public/PublicCategoryNav.vue'
import PublicEntryIntro from '@/components/public/PublicEntryIntro.vue'
import PublicFeedbackSheet from '@/components/public/PublicFeedbackSheet.vue'
import PublicLanguageSwitcher from '@/components/public/PublicLanguageSwitcher.vue'
import PublicMenuCatalog from '@/components/public/PublicMenuCatalog.vue'
import PublicOrderSuccess from '@/components/public/PublicOrderSuccess.vue'
import PublicPostVisitView from '@/components/public/PublicPostVisitView.vue'
import PublicProductFeed from '@/components/public/PublicProductFeed.vue'
import PublicProductInfoSheet from '@/components/public/PublicProductInfoSheet.vue'
import PublicProductSheet from '@/components/public/PublicProductSheet.vue'
import PublicWelcomeGate from '@/components/public/PublicWelcomeGate.vue'
import { usePublicCart, type CartModifierSelection } from '@/composables/usePublicCart'
import { markPublicIntroSeen, markPublicMenuEntered, readPublicEntryState } from '@/composables/usePublicEntryState'
import { clearStoredFeedback, readStoredFeedback, syncStoredFeedback } from '@/composables/usePublicFeedbackToken'
import { usePublicMenu } from '@/composables/usePublicMenu'
import { usePublicTableResolution } from '@/composables/usePublicTableResolution'
import { usePublicVisit } from '@/composables/usePublicVisit'
import { useStaffTableEntry } from '@/composables/useStaffTableEntry'
import { publicTableService } from '@/services/public-table.service'
import { clearPublicVisitToken, readPublicVisitToken } from '@/utils/public-visit-context'
import { clearPublicEntryState } from '@/composables/usePublicEntryState'
import { AVAILABLE_LOCALES, DEFAULT_LOCALE, i18n, type AppLocale } from '@/i18n'
import type { PublicFeedItem, PublicOrderCreated, PublicProduct } from '@/types/public-menu'
import { describeApiError } from '@/utils/error-message'
import { formatMoney } from '@/utils/format'

/**
 * The public QR customer surface (Passo 3.1) — top-level route component,
 * entirely outside AppShellLayout/the admin auth stack (see router/index.ts
 * `meta.public`). One instance per `publicToken` (keyed by the route in
 * PublicTableView's own parent — App.vue's RouterView), so a different
 * table always starts from a clean slate, never reusing another table's
 * in-memory state.
 */
const showOrderHistory = ref(false)
const route = useRoute()
const publicToken = route.params.publicToken as string
let initialVisitToken = readPublicVisitToken(publicToken)

const { t } = useI18n()

/**
 * `resolveTable` (Carta Cliente 4.1 final fix) is the source of truth for
 * the entry experience (intro/gateway) — it exists independently of the
 * carta itself, so a table with no menu published yet still resolves fine.
 * `usePublicMenu` waits for entry to establish the visit and remains
 * authoritative for actual carta content once the visitor reaches MENU.
 */
const { resolution, error: resolutionError, serviceClosed, reload: reloadResolution, retryEntry, beginNewVisit } = usePublicTableResolution(publicToken)

// Carta 8.1B §11-§14 — runs in parallel, never gates or delays anything
// above/below: a genuine staff member gets redirected into the operational
// table once (and only once) the authenticated resolver actually confirms
// it; every other visitor (the overwhelming majority) sees zero difference.
useStaffTableEntry(publicToken)

// Only ever set by the customer's own manual language pick (never by the
// admin's persisted `aforo-locale`, and never fed back from the first,
// locale-less load) — see usePublicMenu's own docblock for why re-feeding
// the resolved locale back in would cause a redundant second fetch.
const requestedLocale = ref<string | undefined>(undefined)
const { menu, loading, error, reload } = usePublicMenu(publicToken, requestedLocale, computed(() => Boolean(resolution.value) || serviceClosed.value))

/**
 * The restaurant's own `default_locale`/`enabled_locales` are real
 * `AVAILABLE_LOCALES`-shaped tags (unlike `PublicMenu.locale`'s own
 * example, which uses a short "es" form) — used as the single source of
 * truth for both the switcher and interface-chrome translation, so no
 * format mapping is ever needed. Read from `resolution` first (available
 * as soon as the table resolves, independent of the menu), falling back to
 * `menu` only for the unlikely case it's already loaded and resolution
 * somehow isn't (both come from the same `PublicRestaurant` shape).
 */
const currentLocale = computed<AppLocale>(() => {
  const requested = requestedLocale.value
  if (requested && (AVAILABLE_LOCALES as readonly string[]).includes(requested)) return requested as AppLocale
  const restaurantDefault = resolution.value?.restaurant.default_locale ?? menu.value?.restaurant.default_locale
  if (restaurantDefault && (AVAILABLE_LOCALES as readonly string[]).includes(restaurantDefault)) {
    return restaurantDefault as AppLocale
  }
  return DEFAULT_LOCALE
})

const availableLocales = computed<AppLocale[]>(() => {
  const enabled = resolution.value?.restaurant.enabled_locales ?? menu.value?.restaurant.enabled_locales ?? []
  return AVAILABLE_LOCALES.filter((loc) => enabled.includes(loc))
})

function selectLocale(loc: AppLocale): void {
  requestedLocale.value = loc
}

// Drives $t()/t() for this page's own chrome without ever touching the
// admin's persisted `aforo-locale` (Passo 3.1 §10/§27) — restored to
// whatever it was before on unmount, so a staff member returning to /app
// in the same tab after visiting a public link never sees their own
// language preference silently changed.
let previousGlobalLocale: AppLocale | null = null
onMounted(() => {
  previousGlobalLocale = i18n.global.locale.value
})
onBeforeUnmount(() => {
  if (previousGlobalLocale) i18n.global.locale.value = previousGlobalLocale
})
watch(currentLocale, (value) => (i18n.global.locale.value = value), { immediate: true })

const cart = usePublicCart(publicToken)
let cartVisitChecked = false
watch(() => resolution.value?.session.feedback.token, (token) => {
  if (!token || cartVisitChecked) return
  cartVisitChecked = true
  // A fresh browser context must not inherit a previous visit's local cart.
  if (token !== initialVisitToken) cart.clear()
}, { immediate: true })

const currentProducts = computed(() => menu.value?.menu.categories.flatMap(c => c.products) ?? [])
function currentProduct(id: number): PublicProduct | undefined {
  return currentProducts.value.find(p => p.restaurant_product_id === id)
}
const unavailableIds = computed(() => cart.lines.value.filter(line => {
  const product = currentProduct(line.restaurant_product_id)
  return !product || line.modifiers.some(m => !product.modifier_groups.some(g => g.id === m.group_id && g.options.some(o => o.id === m.option_id)))
}).map(line => line.restaurant_product_id))
const selectedProduct = ref<PublicProduct | null>(null)
const showCart = ref(false)
const successOrder = ref<PublicOrderCreated | null>(null)
const submitting = ref(false)
const submitError = ref<ApiError | null>(null)
let idempotencyKey: string | null = null

function openProduct(product: PublicProduct): void {
  selectedProduct.value = currentProduct(product.restaurant_product_id) ?? null
}

/**
 * The info sheet (Carta 4.5) — a second, distinct intent from `openProduct`
 * above: tapping the Reel media opens this (pure information), the
 * "Añadir" CTA still only ever calls `openProduct` (purchase). `infoProduct`
 * is its own ref, never reusing `selectedProduct`, so the two sheets can
 * never accidentally show for two different products or fight over the
 * same close handler.
 */
const infoProduct = ref<PublicProduct | null>(null)
watch(currentProducts, () => {
  if (selectedProduct.value) selectedProduct.value = currentProduct(selectedProduct.value.restaurant_product_id) ?? null
  if (infoProduct.value) infoProduct.value = currentProduct(infoProduct.value.restaurant_product_id) ?? null
})
function onOpenProductInfo(product: PublicProduct): void {
  infoProduct.value = product
}
/** The info sheet's own optional "Añadir" (§6) — closes itself and hands off to the exact same `openProduct` the card's own CTA uses, never a second purchase path. */
function onRequestAddFromInfo(): void {
  const product = infoProduct.value
  infoProduct.value = null
  if (product) openProduct(product)
}

function onAddToCart(payload: { quantity: number; selections: CartModifierSelection[]; note: string | null }): void {
  const product = selectedProduct.value && currentProduct(selectedProduct.value.restaurant_product_id)
  if (!product) return
  cart.addItem(product, payload.quantity, payload.selections, payload.note)
  selectedProduct.value = null
}

async function confirmOrder(): Promise<void> {
  if (unavailableIds.value.length > 0 || !menu.value || submitting.value || cart.lines.value.length === 0) return
  // Defense-in-depth: PublicCartSheet's own footer already replaces the
  // confirm button once effectiveBillRequested is true, so this only fires
  // if that guard is ever bypassed — never a second network round-trip for a
  // request the backend has already told us it will refuse (§5 "impedir
  // reenvio inútil").
  if (effectiveBillRequested.value) return
  // Same defense-in-depth for a STALE cart (Carta 4.6 hardening): items
  // added while ordering was enabled stay in localStorage/cart state even
  // after the restaurant turns `customer_ordering` off (a later reload, or
  // staff disabling it mid-visit) — `orderingEnabled` going false must never
  // let that old cart become a way to still place an order. PublicCartSheet's
  // own footer already blocks this in the common path; this only fires if
  // that guard is ever bypassed.
  if (!orderingEnabled.value) return
  // Same reasoning again for a QR opened before staff seats the table
  // (§ above on `sessionActive`) — PublicCartSheet's own footer already
  // blocks this in the common path.
  if (!sessionActive.value) return
  if (!idempotencyKey) idempotencyKey = crypto.randomUUID()

  submitting.value = true
  submitError.value = null
  try {
    const order = await publicTableService.createOrder(
      publicToken,
      { locale: currentLocale.value, items: cart.toOrderItems() },
      idempotencyKey,
    )
    cart.clear()
    idempotencyKey = null
    showCart.value = false
    successOrder.value = order
    void publicHistory.refresh()
    // CARTA 5.1E §9 — a fresh order can flip bill_request.reason from
    // no_billable_orders to open_orders; the backend alone decides this, so
    // refresh the read-model once rather than inferring the transition
    // locally. A single extra GET, not a new poll.
    void reloadResolution()
  } catch (err) {
    const normalized = normalizeApiError(err)
    if (normalized.kind === 'conflict' && normalized.code === 'TABLE_SESSION_BILL_REQUESTED') {
      // The backend remains authoritative even when THIS session never saw
      // a successful requestBill() call — a reload after requesting, or a
      // different device at the same table, are both real cases (§6). Never
      // create the order; the cart's items are left exactly as they were
      // (§5 "preservar itens, bloquear checkout") — cart.clear() is never
      // called here. idempotencyKey is reset so a stale key never lingers.
      billRequested.value = true
      idempotencyKey = null
    } else {
      submitError.value = normalized
      if (['INVALID_ORDER_ITEM', 'INVALID_MODIFIER_SELECTION'].includes(normalized.code ?? '')) {
        idempotencyKey = null
        await reload(true)
      }
      if (['TABLE_SESSION_ALREADY_PAID', 'TABLE_SESSION_NOT_ACTIVE'].includes(normalized.code ?? '')) void reloadResolution()
    }
  } finally {
    submitting.value = false
  }
}

function dismissSuccess(): void {
  successOrder.value = null
}

// `resolution` is the authoritative source for entry (arrives before, and
// independently of, the menu) — `menu` is only a fallback for the rare case
// it's already loaded while resolution hasn't (in practice both agree).
const restaurantName = computed(() => resolution.value?.restaurant.name ?? menu.value?.restaurant.name ?? '')
const tableLabel = computed(() => resolution.value?.table.name ?? menu.value?.table.name ?? '')

/**
 * "Solicitar conta" / "Llamar camarero" (Passo 3.4 §4, revalidated) — gated
 * on the restaurant's own real capabilities (never assumed on) and on an
 * active session (the backend 409s otherwise anyway — TABLE_SESSION_NOT_ACTIVE).
 *
 * Revalidation finding: the backend NOW blocks further public ordering once
 * a bill has been requested — POST .../orders 409s with
 * TABLE_SESSION_BILL_REQUESTED (confirmed live; the OpenAPI doc's own 409
 * description for that endpoint still doesn't list it, same doc-lag pattern
 * already known from Passo 3.1/3.4 — never trust the doc alone). `effectiveBillRequested`
 * below is therefore also the single source of truth `confirmOrder()` reads
 * to block checkout (see its own handling of that exact code), not just a
 * flag for this banner.
 *
 * `billRequested`/`waiterCalled` become true from either (a) this session's
 * own successful POST, (b) a TABLE_REQUEST_ALREADY_OPEN 409 (the customer
 * taps twice, or reopens the page after already asking — same desired end
 * state, so treated as a confirmation, never an error banner), or (c) for
 * `billRequested` specifically, a TABLE_SESSION_BILL_REQUESTED 409 hit while
 * trying to order (the reload case, §6 — this session never saw its own
 * request-bill call succeed, but the backend still knows). Every other
 * failure (disabled capability, no active session, network, ...) surfaces
 * as a real error via describeApiError, never silently swallowed.
 */
const billRequested = ref(false)
const waiterCalled = ref(false)
const requestingBill = ref(false)
const requestingWaiter = ref(false)
const requestError = ref<ApiError | null>(null)

/**
 * CARTA 5.1E — the backend-derived `session.bill_request` read-model,
 * sourced from `resolution` specifically (never `menu`): `resolution` is
 * what the controlled poll below refreshes, so reading the reason from
 * anywhere else would silently go stale while polling "succeeds". Both
 * endpoints serialize the exact same shape (see PublicSessionState's own
 * docblock), so this is not a divergence from `menu`, just a choice of
 * which already-loaded copy to trust.
 */
const billRequestCapability = computed(() => resolution.value?.restaurant.capabilities.bill_request ?? false)
const billRequestState = computed(() => resolution.value?.session.bill_request ?? null)
const billRequestReason = computed(() => billRequestState.value?.reason ?? null)
const billRequestEligibleOnServer = computed(() => billRequestState.value?.eligible ?? false)

/**
 * The effective "already asked for the bill" flag `confirmOrder()` and the
 * CTA both read — the union of this session's own local success/408-open
 * flag and the backend's own `already_requested` reason, so a reload or a
 * second device at the same table shows the confirmed state without ever
 * needing another click (§6/§14 "backend sozinho deve ser suficiente").
 */
const effectiveBillRequested = computed(() => billRequested.value || billRequestReason.value === 'already_requested')

/**
 * Whether the bill-request area shows at all (§4 no_active_session, §4
 * already_paid) — capability off or no active session hides it outright;
 * `already_paid` also hides it so this never becomes a second, competing
 * flow alongside the CARTA 5.1B post-visit screen, which already takes over
 * the moment payment is detected (§4 "não criar fluxo paralelo").
 */
const showBillRequestAction = computed(() => {
  if (!billRequestCapability.value) return false
  if (!resolution.value?.session.active) return false
  if (billRequestReason.value === 'no_active_session') return false
  if (billRequestReason.value === 'already_paid') return false
  return true
})

/** Non-null only for `open_orders`/`no_billable_orders` (§5) — never rendered once confirmed. */
const billRequestBlockedMessage = computed<string | null>(() => {
  if (effectiveBillRequested.value) return null
  if (billRequestReason.value === 'open_orders') return t('publicMenu.requests.billBlockedOpenOrders')
  if (billRequestReason.value === 'no_billable_orders') return t('publicMenu.requests.billBlockedNoBillableOrders')
  return null
})

async function requestBill(): Promise<void> {
  if (requestingBill.value || effectiveBillRequested.value) return
  // Defense-in-depth (§7) — re-check every condition the template already
  // disables the button on, never trust the template alone.
  if (!billRequestCapability.value) return
  if (!resolution.value?.session.active) return
  if (!billRequestEligibleOnServer.value) return

  requestingBill.value = true
  requestError.value = null
  try {
    await publicTableService.requestBill(publicToken)
    billRequested.value = true
  } catch (err) {
    const normalized = normalizeApiError(err)
    if (normalized.kind === 'conflict' && normalized.code === 'TABLE_REQUEST_ALREADY_OPEN') {
      billRequested.value = true
      void reloadResolution()
    } else if (
      normalized.kind === 'conflict' &&
      (normalized.code === 'TABLE_SESSION_HAS_OPEN_ORDERS' ||
        normalized.code === 'TABLE_SESSION_HAS_NO_BILLABLE_ORDERS' ||
        normalized.code === 'TABLE_SESSION_ALREADY_PAID')
    ) {
      // A real race (§8): the eligibility we saw a moment ago no longer
      // holds. Never mark the bill as requested — refresh the read-model so
      // the disabled CTA + localized reason (or the 5.1B post-visit
      // redirect, for TABLE_SESSION_ALREADY_PAID) take over instead of a
      // raw/generic error banner.
      void reloadResolution()
    } else {
      requestError.value = normalized
    }
  } finally {
    requestingBill.value = false
  }
}

async function callWaiter(): Promise<void> {
  if (waiterCalled.value || requestingWaiter.value) return
  requestingWaiter.value = true
  requestError.value = null
  try {
    await publicTableService.callWaiter(publicToken)
    waiterCalled.value = true
  } catch (err) {
    const normalized = normalizeApiError(err)
    if (normalized.kind === 'conflict' && normalized.code === 'TABLE_REQUEST_ALREADY_OPEN') {
      waiterCalled.value = true
    } else {
      requestError.value = normalized
    }
  } finally {
    requestingWaiter.value = false
  }
}

// Never depends on the menu (Carta Cliente 4.1 final fix §4) — `resolution`
// alone carries `session.active`/`capabilities`, so the waiter can be
// called from the gateway even when the carta isn't published yet.
const showWaiterCallOnGate = computed(() =>
  Boolean(resolution.value?.session.active && resolution.value?.restaurant.capabilities.waiter_call),
)

/**
 * Same waiter/bill-request gating as the gateway above, but evaluated once
 * inside the actual carta (Carta 4.4 §28) — kept as its own computed
 * rather than reusing `showWaiterCallOnGate` because this one is correctly
 * `menu`-driven (the gate's version deliberately isn't, since it must work
 * before the menu exists at all — see that computed's own comment).
 */
const showWaiterCallInMenu = computed(() =>
  Boolean(resolution.value?.session.active && menu.value?.restaurant.capabilities.waiter_call),
)
// Bill-request visibility is `showBillRequestAction` (defined alongside the
// rest of the bill_request read-model above) — deliberately `resolution`-driven
// rather than `menu`-driven like `showWaiterCallInMenu`, since `resolution` is
// what the controlled eligibility poll below refreshes (CARTA 5.1E).

/** Carta 4.4 §29 — the Reel still shows every product as a visual carta either way; only the "Añadir" CTA itself depends on this. */
const orderingEnabled = computed(() => menu.value?.restaurant.capabilities.customer_ordering ?? false)

/**
 * Carta 4.6 hardening — the backend 409s POST .../orders with
 * TABLE_SESSION_NOT_ACTIVE whenever the table hasn't been opened yet (a QR
 * scanned before staff seats the table is a real, reachable path: browsing
 * the carta and building a cart never required a session, only checkout
 * does). That 409 was already shown as a clear, localized error — this adds
 * the same PROACTIVE block already used for `billRequested`/`orderingEnabled`,
 * same reasoning: the frontend already has `session.active` for the
 * waiter/bill gating above, so checkout shouldn't invite an attempt already
 * known to fail.
 */
const sessionActive = computed(() => Boolean(resolution.value?.session.active && !resolution.value.session.feedback.eligible))

/**
 * Flattened (category, product) read-model for the Reel feed (Carta 4.4
 * §4) — a single `flatMap`, never duplicating a product, preserving the
 * backend's own category/product order exactly. `categoriesWithProducts`
 * feeds the nav: a category with zero products has nothing to scroll to,
 * so it's excluded there rather than rendered as a dead-end pill.
 */
const feedItems = computed<PublicFeedItem[]>(() => {
  if (!menu.value) return []
  return menu.value.menu.categories.flatMap((category) => category.products.map((product) => ({ category, product })))
})
const categoriesWithProducts = computed(() => menu.value?.menu.categories.filter((category) => category.products.length > 0) ?? [])

/**
 * Set once when the feed first has items, then left alone — the feed's own
 * IntersectionObserver keeps this accurate as the customer scrolls
 * (`active-category-change`), and a locale switch must never reset it back
 * to the first category out from under someone already scrolled further
 * in (same reasoning as `PublicProductFeed`'s own `lastItemsKey` guard).
 */
const activeCategoryId = ref<number | null>(null)
watch(
  feedItems,
  (items) => {
    if (activeCategoryId.value === null) activeCategoryId.value = items[0]?.category.id ?? null
  },
  { immediate: true },
)

const feedRef = ref<InstanceType<typeof PublicProductFeed> | null>(null)
function onSelectCategory(categoryId: number): void {
  feedRef.value?.scrollToCategory(categoryId)
}

/**
 * The category menu (Carta 4.4.1) — `PublicCategoryNav` used to be a
 * permanent row of pills always visible over the media; it's now a sheet
 * this hamburger trigger opens on demand, same `v-if`-owns-the-sheet
 * pattern as every other public sheet below. Picking a category still goes
 * through the exact same `onSelectCategory` (§ above, unchanged since Carta
 * 4.4) — this handler only adds "and close the menu" on top of it, mirroring
 * how `onAddToCart` already closes `PublicProductSheet` by clearing its own
 * `v-if` state directly rather than waiting on a close transition.
 */
const showCategoryMenu = ref(false)
function onSelectCategoryFromMenu(categoryId: number): void {
  onSelectCategory(categoryId)
  showCategoryMenu.value = false
}

/** Any overlay that must pause the active card's video (Carta 4.4 §10) — the product sheet, cart, order success, feedback sheet, category menu, and now the info sheet all count. Carta 4.5 §4 relies on this exact flag for its own pause/resume — no second, parallel pause mechanism. */
const anyOverlayOpen = computed(() =>
  Boolean(
    selectedProduct.value || showCart.value || successOrder.value || showFeedback.value || showCategoryMenu.value || infoProduct.value || showOrderHistory.value,
  ),
)

/** Whether there's anything to show once "Ver la carta" is pressed — the gateway's own CTA reflects this instead of leading to a broken/empty carta. */
const menuAvailable = computed(() => resolution.value?.menu.available ?? false)

/**
 * Entry experience state machine (Carta Cliente 4.1 §3/§10, final fix §2) —
 * INTRO_RESTAURANT + INTRO_MESSAGE (both inside PublicEntryIntro) ->
 * WELCOME_GATE -> MENU. Computed exactly once per real table resolution
 * (guarded by `stageInitialized`) from sessionStorage — deliberately keyed
 * off `resolution`, never `menu`, so a table whose carta isn't published
 * yet (menu 404s) still gets an intro/gateway instead of being stuck behind
 * a loading/error screen it has nothing to do with.
 *
 * `post-visit` (Carta 5.1B) is the one stage NOT reached through this
 * watcher — the dedicated `resolution.session` watcher further below sets
 * it directly, from ANY other stage, the moment a paid visit is confirmed
 * (a returning customer whose visit already closed has nothing to "enter"
 * anymore; a still-open, already-paid table shouldn't keep offering
 * ordering just because the entry animation happened to be mid-flight).
 */
type EntryStage = 'entry-intro' | 'gateway' | 'menu' | 'post-visit'
const stage = ref<EntryStage>('entry-intro')
let stageInitialized = false

watch(
  resolution,
  (value) => {
    if (!value || stageInitialized) return
    stageInitialized = true
    const state = readPublicEntryState(publicToken)
    if (state.menuEntered) stage.value = 'menu'
    else if (state.introSeen) stage.value = 'gateway'
    else stage.value = 'entry-intro'
  },
  { immediate: true },
)

function onIntroDone(): void {
  markPublicIntroSeen(publicToken)
  stage.value = 'gateway'
}

function enterMenu(): void {
  // Defense-in-depth: PublicWelcomeGate's own CTA is already disabled once
  // `menuAvailable` is false, so this only matters if that guard is ever
  // bypassed — never navigate into a carta that has nothing to show.
  if (!menuAvailable.value) return
  markPublicMenuEntered(publicToken)
  stage.value = 'menu'
  menuView.value = 'catalog'
}

/**
 * Catalog + Reel (never a new `EntryStage` — `stage === 'menu'` still means
 * exactly what it always did, so every polling/session/post-payment watcher
 * above keeps working unchanged) — the traditional carta is now the default
 * presentation inside the 'menu' stage; the Reel is a second, deliberately
 * entered way to explore the exact same products. Never persisted (§15 "não
 * persistir menuView = reels") — a reload always lands back on 'catalog' via
 * this ref's own default, same as a visitor whose `menuEntered` flag already
 * sends them straight into 'menu' above.
 */
type PublicMenuView = 'catalog' | 'reels'
const menuView = ref<PublicMenuView>('catalog')

/**
 * Lifted out of `PublicMenuCatalog` itself (not local `ref`s there) for the
 * same reason `activeCategoryId` above already lives here rather than
 * inside `PublicProductFeed`: `usePublicMenu`'s `loading` flips true on
 * every locale switch, and the template's `v-if="loading"` chain fully
 * unmounts whatever's in `v-else` (catalog included) while that happens —
 * local child state would silently reset on every language switch, not
 * just a Reel round trip. Living here, neither does.
 */
const catalogSearchQuery = ref('')
const catalogSelectedCategoryId = ref<number | null>(null)

/** "Volver a la mesa" (§11) — pure navigation back to the existing gateway, reusing PublicWelcomeGate; never touches session/cart/requests/feedback state. */
function onBackToTable(): void {
  stage.value = 'gateway'
}

/**
 * Opens the Reel at the EXACT product tapped in the catalog (§9) —
 * `restaurant_product_id` is the only identity trusted (never a persisted
 * index, see `PublicProductFeed.scrollToProduct`'s own doc). The feed is
 * already mounted the moment `stage` first became 'menu' (kept alive via
 * `v-show`, never re-created by switching `menuView`), so there's no
 * loading to wait for — `nextTick` here only guards against the rare case
 * this fires in the same tick `feedItems` itself just changed.
 */
function openReelFromCatalog(product: PublicProduct): void {
  menuView.value = 'reels'
  void nextTick(() => feedRef.value?.scrollToProduct(product.restaurant_product_id))
}

/**
 * Post-visit feedback (Passo 3.5 §3-6) — the CTA is driven by
 * `feedbackToken`/`feedbackEligible`/`feedbackAlreadySubmitted`, never
 * directly by `menu.value.session.feedback` in the template, because the
 * live response alone cannot survive the table closing (confirmed live:
 * once the session is inactive, the backend stops returning the token at
 * all — see usePublicFeedbackToken.ts's own docblock for the full
 * persistence design). This watcher is the single place that reconciles
 * "what the live menu just said" with "what's stored for this table" into
 * one effective context:
 *   - Session active + a live token: that's always authoritative — synced
 *     into storage (new token replaces any old one outright; a matching
 *     token only ever advances `submitted` from false to true, per
 *     syncStoredFeedback's own contract) and used directly.
 *   - Session inactive (closed) or menu not loaded yet: falls back to
 *     whatever is stored for this table. `eligible` is assumed true here —
 *     there is no live signal to say otherwise once the session is gone,
 *     and the real gate is the backend re-checking payment on every POST
 *     regardless (never trust a stale local "yes" over what the API says
 *     when it's actually called).
 * This intentionally never polls (Passo 3.5 §21/§32 — "sem depender de
 * novo polling após payment"): it only re-evaluates when `menu` itself
 * changes (initial load, locale switch, or the existing error-state
 * "Reintentar" button), i.e. exactly the app's one existing refetch
 * mechanism, never a new one.
 */
const feedbackToken = ref<string | null>(null)
const feedbackEligible = ref(false)
const feedbackAlreadySubmitted = ref(false)
const showFeedback = ref(false)

watch(
  () => resolution.value?.session,
  (session) => {
    const live = session?.feedback
    if (live?.token) {
      syncStoredFeedback(publicToken, live.token, live.already_submitted ?? false)
      feedbackToken.value = live.token
      feedbackEligible.value = live.eligible
      feedbackAlreadySubmitted.value = live.already_submitted ?? false
      return
    }
    const stored = readStoredFeedback(publicToken)
    if (stored) {
      feedbackToken.value = stored.token
      feedbackEligible.value = true
      feedbackAlreadySubmitted.value = stored.submitted
    } else {
      feedbackToken.value = null
      feedbackEligible.value = false
      feedbackAlreadySubmitted.value = false
    }
  },
  { immediate: true },
)

function onFeedbackSubmitted(): void {
  feedbackAlreadySubmitted.value = true
}

function onFeedbackInvalid(): void {
  // The stored token turned out to be dead server-side (expired/invalidated)
  // — drop it so the CTA never reopens a sheet that can only fail again.
  clearStoredFeedback(publicToken)
  feedbackToken.value = null
  feedbackEligible.value = false
  feedbackAlreadySubmitted.value = false
}

/**
 * Post-payment detection (Carta 5.1B) — `resolution.session` (not `menu`)
 * is the trigger source on purpose, same reasoning as `showWaiterCallOnGate`
 * above: it's the one session signal that's always available regardless of
 * whether the carta itself ever published successfully, and it's already
 * what the controlled poll below refetches. `GET /public/visits/{token}`
 * itself is NEVER called from a timer (§17 — it shares its rate-limit
 * bucket with the feedback form) — only from this watcher, which fires at
 * most once per real state transition: eligible flips true (still active,
 * just paid), or the session goes inactive while a stored token exists
 * (closed — including the payment→close race, §5/§24: the very next
 * `resolution` refresh after staff closes the table lands straight in the
 * `!session.active` branch below, using the token already captured before
 * any of this happened, well before close).
 */
const { visit, loading: visitLoading, error: visitError, resolve: resolveVisit } = usePublicVisit()

/**
 * `enterOnError` distinguishes the two callers: a session that's gone
 * inactive has nothing else useful to show if resolving its visit fails
 * (ordering is off regardless — §10 — so falling back to the ordinary carta
 * would just be a confusing, non-functional-looking "browse and order"
 * screen); a STILL-ACTIVE session just checking whether it's newly eligible
 * must never be yanked out of the Reel for a transient blip — the next
 * `resolution` poll simply tries again. Only the closed-session path (and
 * the post-visit screen's own manual retry, which only ever runs from
 * there already) ever passes `true`.
 */
async function enterPostVisitIfPaid(token: string, enterOnError: boolean): Promise<void> {
  const outcome = await resolveVisit(token)
  if (outcome === 'resolved') {
    stage.value = 'post-visit'
    // A cart from before payment can never look purchasable again (§11) —
    // always through the composable's own clear(), never a direct
    // localStorage write.
    cart.clear()
  } else if (outcome === 'not-found') {
    onFeedbackInvalid()
  } else if (outcome === 'error' && enterOnError) {
    // Network/429/500 while resolving a CLOSED session's visit — never
    // silently strand the customer on the ordinary carta with no
    // indication anything went wrong (§16 "network/offline → mensagem
    // localizada + retry"). `visit` stays null and `visitError` is set,
    // which is exactly PublicPostVisitView's own built-in error+retry
    // state — no separate error UI needed here.
    stage.value = 'post-visit'
  }
  // 'not-paid': genuinely not paid yet — never inferred, never surfaced as
  // an error, simply doesn't enter post-visit (§3/§5).
}

watch(
  () => resolution.value?.session,
  (session) => {
    if (!session || stage.value === 'post-visit' || visitLoading.value) return
    if (session.feedback.eligible && session.feedback.token) {
      void enterPostVisitIfPaid(session.feedback.token, false)
      return
    }
    if (!session.active) {
      const stored = readStoredFeedback(publicToken)
      if (stored) void enterPostVisitIfPaid(stored.token, true)
    }
  },
  { immediate: true },
)

/** Explicit customer intent is required before detaching a closed visit. */
async function startNewVisit(): Promise<void> {
  if (resolutionError.value?.code !== 'PUBLIC_VISIT_INVALID' && resolution.value?.session.active !== false) return
  if (submitting.value || requestingBill.value || requestingWaiter.value || visitLoading.value) return
  stopResolutionPolling()
  clearPublicVisitToken(publicToken)
  clearPublicEntryState(publicToken)
  clearStoredFeedback(publicToken)
  initialVisitToken = null
  cartVisitChecked = false
  cart.clear()
  idempotencyKey = null
  billRequested.value = false
  waiterCalled.value = false
  requestError.value = null
  submitError.value = null
  successOrder.value = null
  selectedProduct.value = null
  infoProduct.value = null
  showCart.value = false
  showCategoryMenu.value = false
  feedbackToken.value = null
  feedbackEligible.value = false
  feedbackAlreadySubmitted.value = false
  showFeedback.value = false
  visit.value = null
  stageInitialized = false
  stage.value = 'entry-intro'
  await beginNewVisit()
}

/** Retry keeps the original paid visit; it never starts another session. */
function retryVisit(): void {
  const token = feedbackToken.value ?? readStoredFeedback(publicToken)?.token
  if (token) void enterPostVisitIfPaid(token, true)
}

/**
 * Controlled MVP refresh while waiting for payment (§4) — there is no
 * public realtime for payment yet. Reuses `reloadResolution`, the exact
 * function the hard-error screen's own "Reintentar" already calls
 * (`throttle:public-menu` on the backend, 60/min — a ~12s cadence here is a
 * small, constant fraction of that budget, never a request racing another
 * in-flight one: `usePublicTableResolution`'s own `load()` already aborts
 * any previous call first). Polls ONLY while every one of these holds: the
 * customer asked for the bill, still on the ordering stage, the session
 * still looks active, and the tab is actually visible. Deliberately does
 * NOT stop the instant `feedback.eligible` flips true — `enterPostVisitIfPaid`
 * above needs at least one more tick to actually resolve the visit and
 * flip `stage`, and continuing this same safe, cheap poll in the meantime
 * is what lets a transient failure on THAT call retry itself automatically
 * instead of stranding the customer mid-transition. Stops for real the
 * moment `stage` actually changes (paid+resolved), the tab hides, or the
 * component unmounts.
 */
const shouldPollForPayment = computed(
  () =>
    billRequested.value &&
    stage.value === 'menu' &&
    Boolean(resolution.value?.session.active) &&
    typeof document !== 'undefined' &&
    document.visibilityState === 'visible',
)

/**
 * CARTA 5.1E §10/§11 — the second reason the SAME controlled poll below
 * keeps running: an order is in the kitchen/approval pipeline
 * (`reason === 'open_orders'`) and might get served without the customer
 * ever reloading. Deliberately excludes `no_billable_orders` (§11 — that
 * just means nothing has been ordered yet; polling for it would burn
 * requests for the whole visit for no reason) and stops the instant
 * `reason` becomes anything else (`eligible`, `already_requested`,
 * `already_paid`, `no_active_session` all have their own settled UI, no
 * transition left to watch for).
 */
const shouldPollForBillEligibility = computed(
  () =>
    billRequestCapability.value &&
    stage.value === 'menu' &&
    Boolean(resolution.value?.session.active) &&
    billRequestReason.value === 'open_orders' &&
    typeof document !== 'undefined' &&
    document.visibilityState === 'visible',
)

/**
 * CARTA 5.1E §12 — single decision for the ONE `resolution` poll timer:
 * either reason above keeps it running, but there is only ever one
 * `setInterval`, one visibility listener, and one in-flight request (the
 * composable's own `load()` already aborts any previous call), never two
 * timers racing each other.
 */
const historyContext = computed(() => stage.value === 'menu' && resolution.value?.session.active
  ? resolution.value.session.feedback.token ?? null : null)
const publicHistory = useSessionOrderHistory(
  () => historyContext.value,
  (beforeId, signal) => publicTableService.orders(publicToken, beforeId, signal),
)
const shouldPollResolution = computed(() => Boolean(historyContext.value) || shouldPollForPayment.value || shouldPollForBillEligibility.value)
let resolutionPollTimer: ReturnType<typeof setTimeout> | null = null
let trackingPending: Promise<void> | null = null
let trackingRetryAt = 0
let trackingFailures = 0
let trackingStopped = false
function stopResolutionPolling(): void {
  if (resolutionPollTimer) clearTimeout(resolutionPollTimer)
  resolutionPollTimer = null
}
function trackingVisible(): boolean {
  return document.visibilityState === 'visible' && navigator.onLine
}
function startResolutionPollingIfNeeded(): void {
  if (resolutionPollTimer || trackingPending || !shouldPollResolution.value || !trackingVisible() || trackingStopped) return
  resolutionPollTimer = setTimeout(() => { resolutionPollTimer = null; void refreshTracking() }, Math.max(12000, trackingRetryAt - Date.now()))
}
function refreshTracking(): Promise<void> {
  if (trackingPending) return trackingPending
  if (!trackingVisible() || trackingStopped || Date.now() < trackingRetryAt) { startResolutionPollingIfNeeded(); return Promise.resolve() }
  stopResolutionPolling()
  trackingPending = (async () => {
    await reloadResolution()
    if (trackingStopped || !trackingVisible()) return
    if (stage.value === 'menu') await reload(true)
    if (historyContext.value) await publicHistory.refresh()
    const failure = resolutionError.value ?? error.value ?? publicHistory.error.value
    if (failure) {
      trackingFailures++
      trackingRetryAt = Date.now() + Math.max((failure.retryAfterSeconds ?? 0) * 1000, Math.min(60000, 12000 * 2 ** Math.min(trackingFailures, 3)))
      if (['forbidden', 'unauthenticated', 'not_found'].includes(failure.kind) || failure.code === 'PUBLIC_VISIT_INVALID') trackingStopped = true
    } else { trackingFailures = 0; trackingRetryAt = 0 }
  })().finally(() => { trackingPending = null; startResolutionPollingIfNeeded() })
  return trackingPending
}
watch(shouldPollResolution, should => { if (should) startResolutionPollingIfNeeded(); else stopResolutionPolling() })
watch(historyContext, () => { showOrderHistory.value = false; trackingStopped = false; trackingRetryAt = 0; trackingFailures = 0 })
function onVisibilityChangeForResolutionPolling(): void {
  stopResolutionPolling()
  if (trackingVisible() && shouldPollResolution.value) void refreshTracking()
}
onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChangeForResolutionPolling)
  window.addEventListener('online', onVisibilityChangeForResolutionPolling)
  window.addEventListener('offline', onVisibilityChangeForResolutionPolling)
  window.addEventListener('focus', onVisibilityChangeForResolutionPolling)
})
onBeforeUnmount(() => {
  trackingStopped = true
  document.removeEventListener('visibilitychange', onVisibilityChangeForResolutionPolling)
  window.removeEventListener('online', onVisibilityChangeForResolutionPolling)
  window.removeEventListener('offline', onVisibilityChangeForResolutionPolling)
  window.removeEventListener('focus', onVisibilityChangeForResolutionPolling)
  stopResolutionPolling()
})

</script>

<template>
  <!-- Table resolution failed outright (invalid token, rate limited, network/server) — the
       one case where there's genuinely nothing to show, not even an intro. Same visual
       language as the carta's own hard-error state below, just standalone (no header yet:
       we don't have a restaurant name to show one for). -->
  <!-- Operational day not open: the carta stays readable (no visit, no
       cart, no requests) and only an explicit tap tries to enter again. -->
  <div v-if="serviceClosed" class="flex h-dvh w-full items-center justify-center bg-surface-container-lowest sm:p-6">
    <div class="flex h-full w-full flex-col overflow-hidden bg-background sm:max-w-[560px] sm:rounded-xl sm:shadow-elevated">
      <div role="status" class="flex shrink-0 flex-col gap-3 border-b border-outline-variant bg-warning-container px-4 py-4 text-on-warning-container">
        <div>
          <p class="text-body-lg font-semibold">{{ t('dailyOperation.public.closedTitle') }}</p>
          <p class="text-body-md">{{ t('dailyOperation.public.closedText') }}</p>
        </div>
        <button
          type="button"
          class="min-h-11 self-start rounded-full border border-outline bg-surface px-5 text-label-lg font-medium text-on-surface hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          @click="retryEntry()"
        >
          {{ t('dailyOperation.public.checkAgain') }}
        </button>
      </div>
      <div class="relative flex-1">
        <div v-if="loading && !menu" class="flex h-full items-center justify-center"><AProgress size="sm" /></div>
        <PublicMenuCatalog
          v-else-if="menu"
          class="absolute inset-0"
          :restaurant-name="menu.restaurant.name"
          :table-name="menu.table.name"
          :locale="currentLocale"
          :categories="categoriesWithProducts"
          :ordering-enabled="false"
          :cart-count="0"
          :cart-total="0"
          :available-locales="availableLocales"
          :current-locale="currentLocale"
          :search-query="catalogSearchQuery"
          :selected-category-id="catalogSelectedCategoryId"
          :show-waiter-call="false"
          :waiter-called="false"
          :requesting-waiter="false"
          :show-bill-request="false"
          :bill-request-confirmed="false"
          :bill-request-blocked-message="null"
          :requesting-bill="false"
          :request-error="null"
          :show-feedback="false"
          :feedback-already-submitted="false"
          hide-back-to-table
          @select-locale="selectLocale"
          @update:search-query="catalogSearchQuery = $event"
          @update:selected-category-id="catalogSelectedCategoryId = $event"
        />
      </div>
    </div>
  </div>

  <div v-else-if="resolutionError" class="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
    <PhWarningCircle :size="32" class="text-on-surface-variant" aria-hidden="true" />
    <p class="max-w-xs text-body-lg text-on-surface-variant">
      {{ resolutionError.kind === 'not_found' ? t('publicMenu.errors.tableNotFound') : describeApiError(resolutionError, t) }}
    </p>
    <button
      type="button"
      class="min-h-11 rounded-full border border-outline px-5 text-label-lg font-medium text-on-surface hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      @click="resolutionError.code === 'PUBLIC_VISIT_INVALID' ? startNewVisit() : reloadResolution()"
    >
      {{ resolutionError.code === 'PUBLIC_VISIT_INVALID' ? t('publicMenu.entry.newVisit') : t('publicMenu.errors.retry') }}
    </button>
  </div>

  <!-- Still resolving the table — discreet, matches §11: never show "Bienvenido a" before we have a name. -->
  <div v-else-if="!resolution" class="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background text-on-surface-variant">
    <AProgress size="sm" />
    <span class="text-body-md">{{ t('publicMenu.loading') }}</span>
  </div>

  <PublicEntryIntro v-else-if="stage === 'entry-intro'" :restaurant-name="restaurantName" @done="onIntroDone" />

  <PublicWelcomeGate
    v-else-if="stage === 'gateway'"
    :restaurant-name="restaurantName"
    :table-name="tableLabel"
    :show-waiter-call="showWaiterCallOnGate"
    :waiter-called="waiterCalled"
    :requesting-waiter="requestingWaiter"
    :request-error="requestError"
    :available-locales="availableLocales"
    :current-locale="currentLocale"
    :menu-available="menuAvailable"
    @enter-menu="enterMenu"
    @call-waiter="callWaiter"
    @select-locale="selectLocale"
  />

  <!-- stage === 'menu' — Carta 4.4: the QR carta is now a vertical Reel feed.
       Loading/hard-error/empty-menu stay as their own simple, full-screen states
       (never a card-shaped skeleton — §31); the feed itself only ever mounts once
       there's at least one real product to show. Desktop/tablet centers a fixed-width
       panel instead of stretching a vertical photo/video across the whole window (§34). -->
  <div v-else-if="stage === 'menu'" class="flex h-dvh w-full items-center justify-center bg-surface-container-lowest sm:p-6">
    <div class="relative h-full w-full overflow-hidden bg-background sm:max-w-[560px] sm:rounded-xl sm:shadow-elevated">
      <div v-if="resolution?.session.active === false" class="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <p class="text-body-lg text-on-surface-variant">{{ t('publicMenu.postVisit.visitClosed') }}</p>
        <button type="button" class="min-h-11 rounded-full border border-outline px-5 text-label-lg text-on-surface hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" @click="startNewVisit">
          {{ t('publicMenu.entry.newVisit') }}
        </button>
      </div>
      <div v-else-if="loading" class="flex h-full flex-col items-center justify-center gap-3 text-on-surface-variant">
        <AProgress size="sm" />
        <span class="text-body-md">{{ t('publicMenu.loading') }}</span>
      </div>

      <!-- Hard error: token invalid, table/menu not found, rate limited, network, server -->
      <div v-else-if="error && !menu" class="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <PhWarningCircle :size="32" class="text-on-surface-variant" aria-hidden="true" />
        <p class="max-w-xs text-body-lg text-on-surface-variant">
          {{ error.kind === 'not_found' ? t('publicMenu.errors.tableNotFound') : describeApiError(error, t) }}
        </p>
        <button
          type="button"
          class="min-h-11 rounded-full border border-outline px-5 text-label-lg font-medium text-on-surface hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          @click="reload()"
        >
          {{ t('publicMenu.errors.retry') }}
        </button>
      </div>

      <!-- No orderable product at all (categories missing, or every category empty) -->
      <div v-else-if="feedItems.length === 0" class="flex h-full flex-col items-center justify-center px-6">
        <EmptyState :icon="PhWarningCircle" :message="t('publicMenu.emptyMenu')" />
      </div>

      <template v-else>
        <!-- menuView === 'catalog' — the new default landing (CARTA catalog+reels
             §2/§3): the traditional list, kept mounted via v-show rather than
             v-if whenever the Reel is open, so its own search/category/scroll
             state survives a round trip into the Reel and back for free. -->
        <div v-show="menuView === 'catalog'" class="absolute inset-0">
          <PublicMenuCatalog
            :restaurant-name="restaurantName"
            :table-name="tableLabel"
            :locale="currentLocale"
            :categories="categoriesWithProducts"
            :ordering-enabled="orderingEnabled"
            :cart-count="cart.totalItems.value"
            :cart-total="cart.total.value"
            :available-locales="availableLocales"
            :current-locale="currentLocale"
            :search-query="catalogSearchQuery"
            :selected-category-id="catalogSelectedCategoryId"
            :show-waiter-call="showWaiterCallInMenu"
            :waiter-called="waiterCalled"
            :requesting-waiter="requestingWaiter"
            :show-bill-request="showBillRequestAction"
            :bill-request-confirmed="effectiveBillRequested"
            :bill-request-blocked-message="billRequestBlockedMessage"
            :requesting-bill="requestingBill"
            :request-error="requestError"
            :show-feedback="!error && Boolean(feedbackToken) && (feedbackEligible || feedbackAlreadySubmitted)"
            :feedback-already-submitted="feedbackAlreadySubmitted"
            @back-to-table="onBackToTable"
            @open-reel="openReelFromCatalog"
            @open-info="onOpenProductInfo"
            @open-cart="showCart = true"
            @select-locale="selectLocale"
            @call-waiter="callWaiter"
            @request-bill="requestBill"
            @open-feedback="showFeedback = true"
            @update:search-query="catalogSearchQuery = $event"
            @update:selected-category-id="catalogSelectedCategoryId = $event"
          />
        </div>

        <!-- menuView === 'reels' — the exact same Reel as before (CARTA
             catalog+reels §12: nothing about PublicProductFeed/
             PublicProductReelCard/video windowing/IntersectionObserver
             changed), now reached deliberately from the catalog rather than
             being the default. `:suspended` additionally pauses playback the
             instant the customer isn't actually looking at it (menuView
             !== 'reels'), on top of every pre-existing overlay/visibility
             reason — never plays hidden behind the catalog. -->
        <div v-show="menuView === 'reels'" class="absolute inset-0">
          <PublicProductFeed
            ref="feedRef"
            :items="feedItems"
            :locale="currentLocale"
            :suspended="anyOverlayOpen || menuView !== 'reels'"
            :ordering-enabled="orderingEnabled"
            @add="openProduct"
            @open-product-info="onOpenProductInfo"
            @active-category-change="activeCategoryId = $event"
          />

          <!-- Compact overlay header (§26, simplified Carta 4.4.1) — floats on top
               of the media, never reserves layout space from it. The restaurant/
               table identity pill and the permanent category pills are both gone
               from here (never deleted from state — `restaurantName`/`tableLabel`
               still back the intro/gateway stages above, and `categoriesWithProducts`
               still feeds the hamburger's sheet below): the media itself is the
               only thing competing for attention now. `pointer-events-none` on the
               wrapper keeps the empty gaps tap-through; only the actual controls
               are interactive. -->
          <div
            class="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-2 px-3 pb-1"
            style="padding-top: max(0.625rem, env(safe-area-inset-top))"
          >
            <!-- "← Carta" (CARTA catalog+reels §10) — the one way back to the
                 catalog from here; never falls through to the gateway, never
                 touches session/cart/feedback/search/category state. -->
            <button
              type="button"
              class="pointer-events-auto inline-flex h-11 items-center gap-1.5 rounded-full bg-black/35 px-3 text-label-lg font-medium text-white backdrop-blur-sm transition-colors duration-200 ease-out hover:bg-black/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              @click="menuView = 'catalog'"
            >
              <PhArrowLeft :size="18" aria-hidden="true" />
              {{ t('publicMenu.feed.backToCatalog') }}
            </button>

            <AIconButton
              v-if="categoriesWithProducts.length > 1"
              :label="t('publicMenu.feed.categoryNavLabel')"
              variant="onMedia"
              class="pointer-events-auto rounded-full bg-black/35 backdrop-blur-sm"
              @click="showCategoryMenu = true"
            >
              <PhList :size="20" />
            </AIconButton>

            <div class="pointer-events-auto ml-auto flex shrink-0 items-center gap-0.5 rounded-full bg-black/35 px-1 backdrop-blur-sm">
              <PublicLanguageSwitcher :available="availableLocales" :current="currentLocale" on-media @select="selectLocale" />
              <ThemeSwitcher on-media />
              <PublicActionsMenu
                :show-waiter-call="showWaiterCallInMenu"
                :waiter-called="waiterCalled"
                :requesting-waiter="requestingWaiter"
                :show-bill-request="showBillRequestAction"
                :bill-request-confirmed="effectiveBillRequested"
                :bill-request-blocked-message="billRequestBlockedMessage"
                :requesting-bill="requestingBill"
                :request-error="requestError"
                :show-feedback="!error && Boolean(feedbackToken) && (feedbackEligible || feedbackAlreadySubmitted)"
                :feedback-already-submitted="feedbackAlreadySubmitted"
                @call-waiter="callWaiter"
                @request-bill="requestBill"
                @open-feedback="showFeedback = true"
              />
            </div>
          </div>

          <PublicCategoryNav
            v-if="showCategoryMenu"
            :categories="categoriesWithProducts"
            :active-category-id="activeCategoryId"
            @select="onSelectCategoryFromMenu"
            @close="showCategoryMenu = false"
          />

          <!-- Persistent cart access (§27) — a floating pill, never a full-width
               bar competing with the media. Positioned clear of each card's own
               bottom content block (name/description/allergens/price/CTA). -->
          <button
            v-if="cart.lines.value.length > 0"
            type="button"
            class="pointer-events-auto absolute right-3 z-30 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-label-lg font-medium text-on-primary shadow-elevated hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            style="bottom: max(7.5rem, calc(7.5rem + env(safe-area-inset-bottom)))"
            @click="showCart = true"
          >
            <PhShoppingCart :size="20" />
            <span>{{ cart.totalItems.value }}</span>
            <span class="tabular-nums">{{ formatMoney(String(cart.total.value), currentLocale) }}</span>
          </button>
        </div>
      </template>

      <AButton v-if="cart.lines.value.length > 0 && (feedItems.length === 0 || (!menu && error))"
        class="absolute bottom-6 right-4 z-30" @click="showCart = true">
        {{ t('publicMenu.cart.title') }} · {{ cart.totalItems.value }}
      </AButton>
      <PublicProductSheet
        v-if="selectedProduct"
        :product="selectedProduct"
        :locale="currentLocale"
        @close="selectedProduct = null"
        @add="onAddToCart"
      />

      <PublicProductInfoSheet
        v-if="infoProduct"
        :product="infoProduct"
        :locale="currentLocale"
        :ordering-enabled="orderingEnabled"
        @close="infoProduct = null"
        @request-add="onRequestAddFromInfo"
      />

      <PublicCartSheet
        v-if="showCart"
        :lines="cart.lines.value"
        :total="cart.total.value"
        :locale="currentLocale"
        :submitting="submitting"
        :submit-error="submitError"
        :unavailable-ids="unavailableIds"
        :bill-requested="effectiveBillRequested"
        :ordering-enabled="orderingEnabled"
        :session-active="sessionActive"
        @close="showCart = false"
        @set-quantity="cart.setQuantity"
        @remove="cart.removeItem"
        @confirm="confirmOrder"
      />

      <div v-if="historyContext" class="fixed bottom-24 right-4 z-30">
        <AButton variant="tonal" @click="showOrderHistory = true">{{ t('sessionHistory.publicTitle') }}</AButton>
      </div>
      <ABottomSheet v-if="showOrderHistory" :label="t('sessionHistory.publicTitle')" @close="showOrderHistory = false">
        <PublicOrderHistory :orders="publicHistory.orders.value" :loading="publicHistory.loading.value" :error="publicHistory.error.value"
          :has-more="publicHistory.nextBeforeId.value !== null" :locale="currentLocale" @retry="refreshTracking" @more="publicHistory.loadMore" />
      </ABottomSheet>
      <PublicOrderSuccess v-if="successOrder" :order="successOrder" :locale="currentLocale" @close="dismissSuccess" />

      <PublicFeedbackSheet
        v-if="showFeedback && feedbackToken"
        :token="feedbackToken"
        :table-public-token="publicToken"
        @close="showFeedback = false"
        @submitted="onFeedbackSubmitted"
        @invalid="onFeedbackInvalid"
      />
    </div>
  </div>

  <!-- stage === 'post-visit' (Carta 5.1B) — same "centered panel on desktop,
       full-bleed on mobile" treatment as the menu stage above, for visual
       continuity, but a plain scrollable surface instead of the Reel's
       fixed-media layout: there is nothing left to swipe through once a
       visit is paid. -->
  <div v-else class="flex h-dvh w-full items-center justify-center bg-surface-container-lowest sm:p-6">
    <div class="relative flex h-full w-full flex-col overflow-hidden bg-background sm:max-w-[560px] sm:rounded-xl sm:shadow-elevated">
      <!-- Same language/theme access every other stage already has (gateway,
           menu) — the post-visit screen is a brand-new top-level stage with
           no "back", so losing these here would strand the customer with
           whatever locale/theme happened to be active when payment was
           detected. -->
      <div class="flex shrink-0 items-center justify-end gap-1 border-b border-outline-variant p-3">
        <PublicLanguageSwitcher :available="availableLocales" :current="currentLocale" @select="selectLocale" />
        <ThemeSwitcher />
      </div>

      <div class="min-h-0 flex-1">
        <PublicPostVisitView
          :visit="visit"
          :loading="visitLoading"
          :error="visitError"
          :locale="currentLocale"
          :feedback-already-submitted="feedbackAlreadySubmitted"
          :waiter-call-capable="Boolean(resolution?.restaurant.capabilities.waiter_call)"
          :waiter-called="waiterCalled"
          :requesting-waiter="requestingWaiter"
          :request-error="requestError"
          @retry="retryVisit"
          @new-visit="startNewVisit"
          @open-feedback="showFeedback = true"
          @call-waiter="callWaiter"
        />
      </div>

      <PublicFeedbackSheet
        v-if="showFeedback && feedbackToken"
        :token="feedbackToken"
        :table-public-token="publicToken"
        @close="showFeedback = false"
        @submitted="onFeedbackSubmitted"
        @invalid="onFeedbackInvalid"
      />
    </div>
  </div>
</template>
