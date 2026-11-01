<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { PhCaretRight } from '@phosphor-icons/vue'

import DashboardPageHead from '@/components/dashboard/DashboardPageHead.vue'
import type { DashboardTab } from '@/components/dashboard/DashboardTabs.vue'
import AButton from '@/components/ui/AButton.vue'
import ASurface from '@/components/ui/ASurface.vue'
import { useOperationalTableDeepLink } from '@/composables/useOperationalTableDeepLink'
import { provideCatalogRefresh } from '@/composables/useCatalogRefresh'
import { usePermissions } from '@/composables/usePermissions'
import { useRestaurantAnalytics } from '@/composables/useRestaurantAnalytics'
import { useRestaurantOperations } from '@/composables/useRestaurantOperations'
import { useRestaurantRealtime } from '@/composables/useRestaurantRealtime'
import { useRestaurantStore } from '@/stores/restaurant'
import { SERVICE_ACCESS_PERMISSIONS } from '@/types/auth-context'
import { describeApiError } from '@/utils/error-message'
import { formatDateOnly } from '@/utils/format'
import AnalyticsView from './analytics/AnalyticsView.vue'
import OperationView from './operation/OperationView.vue'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const restaurantStore = useRestaurantStore()
const refreshCatalog = provideCatalogRefresh()
const { can, canAny, isPlatformAdmin } = usePermissions()

// Operation and Analytics are separate pages: the route is the only source
// of truth for which one is on screen (back/forward and links just work).
const tab = computed<DashboardTab>(() => (route.name === 'app-dashboard-analytics' ? 'analysis' : 'operation'))
// CLAUDE.md §16 / Passo 1.2C: don't call GET /operations/live and wait for a
// 403 when the current restaurant's context already says view_operations is
// missing — useRestaurantOperations() simply never fetches while this is false.
const canViewOperations = computed(() => can('view_operations'))
const operations = useRestaurantOperations(() => canViewOperations.value)

/**
 * Carta 8.1B §16/§17/§18 — the one place `?table=`/`?restaurant=` query
 * params are ever consumed for the Dashboard, regardless of how they got
 * there: a staff member's QR scan (useStaffTableEntry's redirect) or a
 * manually typed/bookmarked URL. Shared with ServiceView via
 * useOperationalTableDeepLink (Carta 8.1B revision) — only the gate
 * (`canViewOperations` here) differs per screen. `pendingTableId` is only
 * ever handed to OperationView once any requested restaurant switch has
 * actually resolved, so it never races a stale snapshot from the PREVIOUS
 * restaurant (§18 "evitar race").
 */
const { pendingTableId, onPendingTableConsumed } = useOperationalTableDeepLink(route, router, () => canViewOperations.value)
watch(pendingTableId, (id) => {
  if (id !== null && tab.value !== 'operation') void router.replace({ name: 'app-dashboard', query: route.query })
})

// Passo 1.3: same reactive gate as `operations` above — subscribes to
// `restaurant.{id}` only while there's a snapshot on screen worth keeping
// fresh. `refreshTick` is a debounced/coalesced signal (see the
// composable's own docblock): every bump here means "call
// operations.refetch()", never a manual snapshot mutation, so no domain
// logic is duplicated on the frontend (docs/realtime.md).
const realtime = useRestaurantRealtime(() => restaurantStore.currentRestaurantId, () => canViewOperations.value, {
  refresh: async () => { const errors = await refreshCatalog(); await operations.refetch(); return [operations.refreshError.value, ...errors] },
})
// Passo 1.2C-B: GET /analytics reuses RestaurantPolicy::viewReports ->
// view_reports (verified against the real backend Policy) — a distinct
// permission from view_operations. Same proactive-gate treatment: never
// call the endpoint just to get a 403.
const canViewReports = computed(() => can('view_reports'))
const analytics = useRestaurantAnalytics(() => canViewReports.value)

// §26: a platform admin who belongs to zero organizations reaches this same
// "no restaurant" branch below (GET /restaurants naturally returns none) —
// distinguished here only for a truthful message, never a redirect into an
// unbuilt /platform area and never a broken tenant Dashboard.
const isPlatformAdminWithoutTenant = computed(
  () => isPlatformAdmin.value && restaurantStore.restaurants.length === 0,
)

watch(tab, (value) => {
  if (value === 'analysis' && !analytics.hasLoadedOnce.value) {
    void analytics.load()
  }
}, { immediate: true })

const canViewService = computed(() => canAny(SERVICE_ACCESS_PERMISSIONS))
const dayState = computed(() => {
  const daily = operations.snapshot.value?.daily_operation
  if (tab.value !== 'operation' || !daily) return null
  return daily.status === 'open'
    ? { open: true, label: t('operations.board.dayOpen', { date: formatDateOnly(daily.business_date, locale.value) }) }
    : { open: false, label: t('operations.board.dayNotOpen') }
})

</script>

<template>
  <div>
    <div v-if="restaurantStore.loading" class="flex max-w-5xl flex-col gap-6" aria-busy="true" role="status">
      <span class="sr-only">{{ t('operations.loading') }}</span>
      <div class="h-10 w-2/3 rounded-md bg-surface-subtle motion-safe:animate-pulse motion-reduce:animate-none" />
      <div class="h-16 rounded-md bg-surface-subtle motion-safe:animate-pulse motion-reduce:animate-none" />
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div v-for="index in 4" :key="index" class="h-24 rounded-md bg-surface-subtle motion-safe:animate-pulse motion-reduce:animate-none" />
      </div>
    </div>

    <ASurface
      v-else-if="restaurantStore.error"
      tone="container"
      radius="lg"
      role="alert"
      class="max-w-xl border border-error/40 bg-error-container p-6 text-on-error-container"
    >
      <p class="text-title-md font-medium">{{ t('dashboard.errors.generic') }}</p>
      <p class="mt-1 text-body-md">{{ describeApiError(restaurantStore.error, t) }}</p>
    </ASurface>

    <ASurface
      v-else-if="restaurantStore.restaurants.length === 0"
      tone="container"
      radius="lg"
      class="max-w-xl p-6"
    >
      <p class="text-title-md font-medium text-on-surface">
        {{ isPlatformAdminWithoutTenant ? t('dashboard.platformAdminNoTenant') : t('dashboard.noRestaurantAccess') }}
      </p>
    </ASurface>

    <template v-else>
      <DashboardPageHead
        :tab="tab"
        :refreshing="operations.refreshing.value"
        :can-refresh="canViewOperations"
        :connection-state="realtime.connectionState.value"
        :day-state="dayState"
        @refresh="operations.refetch"
      >
        <!-- Day closed: the closed-day strip owns the only primary action ("Abrir el día"). -->
        <template v-if="tab === 'operation' && dayState?.open && canViewService" #cta>
          <AButton as="RouterLink" :to="{ name: 'app-service' }" variant="secondary" size="sm">
            {{ t('operations.now.viewService') }}
            <template #trailing><PhCaretRight /></template>
          </AButton>
        </template>
      </DashboardPageHead>

      <!-- view_operations missing for the current restaurant: never call
           GET /operations/live and wait for a 403 (CLAUDE.md §16) — this
           reuses the same forbidden copy that route would have returned. -->
      <ASurface
        v-if="tab === 'operation' && !canViewOperations"
        tone="container"
        radius="lg"
        class="max-w-xl p-6"
      >
        <p class="text-title-md font-medium text-on-surface">{{ t('operations.errors.forbidden') }}</p>
      </ASurface>
      <OperationView
        v-else-if="tab === 'operation'"
        :restaurant-id="restaurantStore.currentRestaurantId"
        :snapshot="operations.snapshot.value"
        :loading="operations.loading.value"
        :refreshing="operations.refreshing.value"
        :error="operations.error.value"
        :last-realtime-event="realtime.lastEvent.value"
        :pending-table-id="pendingTableId"
        @refresh="operations.refetch"
        @pending-table-consumed="onPendingTableConsumed"
      />
      <!-- view_reports missing for the current restaurant: never call
           GET /analytics and wait for a 403 — same treatment as Operations
           above, just gated by the Policy Analytics actually reuses. -->
      <ASurface
        v-else-if="!canViewReports"
        tone="container"
        radius="lg"
        class="max-w-xl p-6"
      >
        <p class="text-title-md font-medium text-on-surface">{{ t('analytics.errors.forbidden') }}</p>
      </ASurface>
      <AnalyticsView
        v-else
        :data="analytics.data.value"
        :loading="analytics.loading.value"
        :error="analytics.error.value"
        @change-query="analytics.load"
      />
    </template>
  </div>
</template>
