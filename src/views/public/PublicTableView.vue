<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { PhBellRinging, PhCheckCircle, PhReceipt, PhShoppingCart, PhStar, PhWarningCircle } from '@phosphor-icons/vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ThemeSwitcher from '@/components/shared/ThemeSwitcher.vue'
import EmptyState from '@/components/dashboard/EmptyState.vue'
import PublicCartSheet from '@/components/public/PublicCartSheet.vue'
import PublicEntryIntro from '@/components/public/PublicEntryIntro.vue'
import PublicFeedbackSheet from '@/components/public/PublicFeedbackSheet.vue'
import PublicLanguageSwitcher from '@/components/public/PublicLanguageSwitcher.vue'
import PublicOrderSuccess from '@/components/public/PublicOrderSuccess.vue'
import PublicProductSheet from '@/components/public/PublicProductSheet.vue'
import PublicWelcomeGate from '@/components/public/PublicWelcomeGate.vue'
import { usePublicCart, type CartModifierSelection } from '@/composables/usePublicCart'
import { markPublicIntroSeen, markPublicMenuEntered, readPublicEntryState } from '@/composables/usePublicEntryState'
import { clearStoredFeedback, readStoredFeedback, syncStoredFeedback } from '@/composables/usePublicFeedbackToken'
import { usePublicMenu } from '@/composables/usePublicMenu'
import { usePublicTableResolution } from '@/composables/usePublicTableResolution'
import { publicTableService } from '@/services/public-table.service'
import { AVAILABLE_LOCALES, DEFAULT_LOCALE, i18n, type AppLocale } from '@/i18n'
import type { PublicOrderCreated, PublicProduct } from '@/types/public-menu'
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
const route = useRoute()
const publicToken = route.params.publicToken as string

const { t } = useI18n()

/**
 * `resolveTable` (Carta Cliente 4.1 final fix) is the source of truth for
 * the entry experience (intro/gateway) — it exists independently of the
 * carta itself, so a table with no menu published yet still resolves fine.
 * `usePublicMenu` keeps running in parallel exactly as before and remains
 * authoritative for actual carta content once the visitor reaches MENU.
 */
const { resolution, error: resolutionError, reload: reloadResolution } = usePublicTableResolution(publicToken)

// Only ever set by the customer's own manual language pick (never by the
// admin's persisted `aforo-locale`, and never fed back from the first,
// locale-less load) — see usePublicMenu's own docblock for why re-feeding
// the resolved locale back in would cause a redundant second fetch.
const requestedLocale = ref<string | undefined>(undefined)
const { menu, loading, error, reload } = usePublicMenu(publicToken, requestedLocale)

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

const selectedProduct = ref<PublicProduct | null>(null)
const showCart = ref(false)
const successOrder = ref<PublicOrderCreated | null>(null)
const submitting = ref(false)
const submitError = ref<ApiError | null>(null)
let idempotencyKey: string | null = null

function openProduct(product: PublicProduct): void {
  selectedProduct.value = product
}

function onAddToCart(payload: { quantity: number; selections: CartModifierSelection[]; note: string | null }): void {
  if (!selectedProduct.value) return
  cart.addItem(selectedProduct.value, payload.quantity, payload.selections, payload.note)
  selectedProduct.value = null
}

async function confirmOrder(): Promise<void> {
  if (cart.lines.value.length === 0) return
  // Defense-in-depth: PublicCartSheet's own footer already replaces the
  // confirm button once billRequested is true, so this only fires if that
  // guard is ever bypassed — never a second network round-trip for a
  // request the backend has already told us it will refuse (§5 "impedir
  // reenvio inútil").
  if (billRequested.value) return
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
 * already known from Passo 3.1/3.4 — never trust the doc alone). `billRequested`
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

async function requestBill(): Promise<void> {
  if (billRequested.value || requestingBill.value) return
  requestingBill.value = true
  requestError.value = null
  try {
    await publicTableService.requestBill(publicToken)
    billRequested.value = true
  } catch (err) {
    const normalized = normalizeApiError(err)
    if (normalized.kind === 'conflict' && normalized.code === 'TABLE_REQUEST_ALREADY_OPEN') {
      billRequested.value = true
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
 */
type EntryStage = 'entry-intro' | 'gateway' | 'menu'
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
  () => menu.value?.session,
  (session) => {
    const live = session?.active ? session.feedback : undefined
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
</script>

<template>
  <!-- Table resolution failed outright (invalid token, rate limited, network/server) — the
       one case where there's genuinely nothing to show, not even an intro. Same visual
       language as the carta's own hard-error state below, just standalone (no header yet:
       we don't have a restaurant name to show one for). -->
  <div v-if="resolutionError" class="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
    <PhWarningCircle :size="32" class="text-on-surface-variant" aria-hidden="true" />
    <p class="max-w-xs text-body-lg text-on-surface-variant">
      {{ resolutionError.kind === 'not_found' ? t('publicMenu.errors.tableNotFound') : describeApiError(resolutionError, t) }}
    </p>
    <button
      type="button"
      class="min-h-11 rounded-full border border-outline px-5 text-label-lg font-medium text-on-surface hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      @click="reloadResolution"
    >
      {{ t('publicMenu.errors.retry') }}
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

  <!-- stage === 'menu' — the carta itself, entirely unchanged: its own loading/error/empty
       states below are about the MENU fetch specifically, never about whether the table/QR
       itself is valid (that's already settled above by the time this branch can render). -->
  <div v-else class="min-h-dvh bg-background pb-24">
    <header class="sticky top-0 z-30 border-b border-outline-variant bg-surface-container-low/95 backdrop-blur">
      <div class="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
        <div class="min-w-0">
          <p class="truncate text-title-md font-semibold text-on-surface">{{ restaurantName || ' ' }}</p>
          <!-- Table.name already reads e.g. "Mesa 1" — never re-prefix it, that produced "Mesa Mesa 1". -->
          <p v-if="tableLabel" class="truncate text-label-lg text-on-surface-variant">{{ tableLabel }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <PublicLanguageSwitcher :available="availableLocales" :current="currentLocale" @select="selectLocale" />
          <ThemeSwitcher />
        </div>
      </div>

      <nav
        v-if="menu && menu.menu.categories.length > 0"
        class="mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 pb-3"
        :aria-label="t('common.menu')"
      >
        <a
          v-for="category in menu.menu.categories"
          :key="category.id"
          :href="`#public-category-${category.id}`"
          class="shrink-0 whitespace-nowrap rounded-full bg-surface-container px-4 py-2 text-label-lg font-medium text-on-surface hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {{ category.name }}
        </a>
      </nav>
    </header>

    <main class="mx-auto max-w-2xl px-4 py-4">
      <div
        v-if="menu && menu.session.active && (menu.restaurant.capabilities.waiter_call || menu.restaurant.capabilities.bill_request)"
        class="mb-4 flex flex-col gap-2 rounded-xl border border-outline-variant bg-surface-container-low p-3"
      >
        <div class="flex flex-wrap items-center gap-2">
          <template v-if="menu.restaurant.capabilities.waiter_call">
            <p v-if="waiterCalled" class="flex items-center gap-1.5 text-label-lg text-on-surface-variant">
              <PhCheckCircle :size="16" class="text-primary" aria-hidden="true" />
              {{ t('publicMenu.requests.waiterConfirmed') }}
            </p>
            <AButton v-else variant="outlined" :loading="requestingWaiter" @click="callWaiter">
              <template #leading><PhBellRinging :size="16" /></template>
              {{ t('publicMenu.requests.callWaiter') }}
            </AButton>
          </template>
          <template v-if="menu.restaurant.capabilities.bill_request">
            <p v-if="billRequested" class="flex items-center gap-1.5 text-label-lg text-on-surface-variant">
              <PhCheckCircle :size="16" class="text-primary" aria-hidden="true" />
              {{ t('publicMenu.requests.billConfirmed') }}
            </p>
            <AButton v-else variant="outlined" :loading="requestingBill" @click="requestBill">
              <template #leading><PhReceipt :size="16" /></template>
              {{ t('publicMenu.requests.requestBill') }}
            </AButton>
          </template>
        </div>
        <p v-if="requestError" class="rounded-md bg-error-container px-3 py-2 text-label-lg text-on-error-container" role="alert">
          {{ describeApiError(requestError, t) }}
        </p>
      </div>

      <!-- Post-visit feedback (Passo 3.5) — shown once we have a usable
           token AND (the live session says the visit is paid, or the
           session already closed and we're relying on the stored token —
           see the watcher above). Nothing shown at all while eligible is
           known-false (§4 "pode mostrar nada"), and never above a hard
           error state. -->
      <div
        v-if="!error && feedbackToken && (feedbackEligible || feedbackAlreadySubmitted)"
        class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-3"
      >
        <p v-if="feedbackAlreadySubmitted" class="flex items-center gap-1.5 text-label-lg text-on-surface-variant">
          <PhCheckCircle :size="16" class="text-primary" aria-hidden="true" />
          {{ t('publicMenu.feedback.alreadySubmitted') }}
        </p>
        <template v-else>
          <p class="text-body-lg font-medium text-on-surface">{{ t('publicMenu.feedback.cta') }}</p>
          <AButton variant="tonal" @click="showFeedback = true">
            <template #leading><PhStar :size="16" /></template>
            {{ t('publicMenu.feedback.open') }}
          </AButton>
        </template>
      </div>

      <!-- Loading skeleton -->
      <div v-if="loading" class="flex flex-col gap-6" aria-hidden="true">
        <div class="flex gap-2">
          <div v-for="i in 3" :key="i" class="h-9 w-24 shrink-0 rounded-full bg-surface-container-high public-skeleton" />
        </div>
        <div v-for="i in 3" :key="i" class="flex flex-col gap-3">
          <div class="h-6 w-40 rounded bg-surface-container-high public-skeleton" />
          <div class="h-20 rounded-lg bg-surface-container-high public-skeleton" />
          <div class="h-20 rounded-lg bg-surface-container-high public-skeleton" />
        </div>
      </div>

      <!-- Hard error: token invalid, table/menu not found, rate limited, network, server -->
      <div v-else-if="error" class="flex flex-col items-center gap-4 py-16 text-center">
        <PhWarningCircle :size="32" class="text-on-surface-variant" aria-hidden="true" />
        <p class="max-w-xs text-body-lg text-on-surface-variant">
          {{ error.kind === 'not_found' ? t('publicMenu.errors.tableNotFound') : describeApiError(error, t) }}
        </p>
        <button
          type="button"
          class="min-h-11 rounded-full border border-outline px-5 text-label-lg font-medium text-on-surface hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          @click="reload"
        >
          {{ t('publicMenu.errors.retry') }}
        </button>
      </div>

      <!-- Menu explicitly not available for this table -->
      <div v-else-if="menu && menu.menu.categories.length === 0" class="py-10">
        <EmptyState :icon="PhWarningCircle" :message="t('publicMenu.emptyMenu')" />
      </div>

      <template v-else-if="menu">
        <section
          v-for="category in menu.menu.categories"
          :id="`public-category-${category.id}`"
          :key="category.id"
          class="scroll-mt-32 py-4 first:pt-0"
        >
          <h2 class="text-title-lg font-semibold text-on-surface">{{ category.name }}</h2>
          <p v-if="category.description" class="mt-1 text-body-md text-on-surface-variant">{{ category.description }}</p>

          <EmptyState
            v-if="category.products.length === 0"
            :icon="PhWarningCircle"
            :message="t('publicMenu.emptyCategoryProducts')"
          />

          <ul v-else class="mt-3 flex flex-col divide-y divide-outline-variant">
            <li v-for="product in category.products" :key="product.restaurant_product_id">
              <button
                type="button"
                class="flex w-full items-start justify-between gap-3 py-3 text-left hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                @click="openProduct(product)"
              >
                <div class="min-w-0">
                  <p class="text-body-lg font-medium text-on-surface">{{ product.name }}</p>
                  <p v-if="product.description" class="mt-0.5 line-clamp-2 text-body-md text-on-surface-variant">
                    {{ product.description }}
                  </p>
                </div>
                <span class="shrink-0 text-body-lg font-semibold tabular-nums text-on-surface">
                  {{ formatMoney(product.price, currentLocale) }}
                </span>
              </button>
            </li>
          </ul>
        </section>
      </template>
    </main>

    <!-- Sticky cart CTA (Passo 3.1 §17) — safe-area aware, never covers content since the page has bottom padding to match. -->
    <div
      v-if="cart.lines.value.length > 0 && !loading && !error"
      class="fixed inset-x-0 bottom-0 z-30 border-t border-outline-variant bg-surface-container-low px-4 pt-3"
      style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom))"
    >
      <button
        type="button"
        class="mx-auto flex min-h-11 w-full max-w-2xl items-center justify-between gap-3 rounded-full bg-primary px-5 py-3 text-label-lg font-medium text-on-primary hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        @click="showCart = true"
      >
        <span class="flex items-center gap-2">
          <PhShoppingCart :size="20" />
          {{ t('publicMenu.cart.itemsCount', { count: cart.totalItems.value }) }}
        </span>
        <span class="tabular-nums">{{ formatMoney(String(cart.total.value), currentLocale) }}</span>
      </button>
    </div>

    <PublicProductSheet
      v-if="selectedProduct"
      :product="selectedProduct"
      :locale="currentLocale"
      @close="selectedProduct = null"
      @add="onAddToCart"
    />

    <PublicCartSheet
      v-if="showCart"
      :lines="cart.lines.value"
      :total="cart.total.value"
      :locale="currentLocale"
      :submitting="submitting"
      :submit-error="submitError"
      :bill-requested="billRequested"
      @close="showCart = false"
      @set-quantity="cart.setQuantity"
      @remove="cart.removeItem"
      @confirm="confirmOrder"
    />

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
</template>

<style scoped>
.public-skeleton {
  animation: public-pulse 1.6s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .public-skeleton {
    animation: none;
  }
}
@keyframes public-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
