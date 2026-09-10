<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import DashboardPageHead from '@/components/dashboard/DashboardPageHead.vue'
import type { DashboardTab } from '@/components/dashboard/DashboardTabs.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import { usePermissions } from '@/composables/usePermissions'
import { useRestaurantAnalytics } from '@/composables/useRestaurantAnalytics'
import { useRestaurantOperations } from '@/composables/useRestaurantOperations'
import { useRestaurantStore } from '@/stores/restaurant'
import AnalyticsView from './analytics/AnalyticsView.vue'
import OperationView from './operation/OperationView.vue'

const { t } = useI18n()
const restaurantStore = useRestaurantStore()
const { can, isPlatformAdmin } = usePermissions()

const tab = ref<DashboardTab>('operation')
// CLAUDE.md §16 / Passo 1.2C: don't call GET /operations/live and wait for a
// 403 when the current restaurant's context already says view_operations is
// missing — useRestaurantOperations() simply never fetches while this is false.
const canViewOperations = computed(() => can('view_operations'))
const operations = useRestaurantOperations(() => canViewOperations.value)
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
})

const health = computed(() =>
  operations.snapshot.value ? { score: operations.snapshot.value.operation.health_score, level: operations.snapshot.value.operation.health_level } : null,
)
const attentionCount = computed(() => operations.snapshot.value?.alerts.length ?? 0)
</script>

<template>
  <div>
    <div v-if="restaurantStore.loading" class="flex items-center justify-center py-24">
      <AProgress />
    </div>

    <ASurface
      v-else-if="restaurantStore.error"
      tone="container"
      radius="lg"
      role="alert"
      class="max-w-xl border border-error/40 bg-error-container p-6 text-on-error-container"
    >
      <p class="text-title-md font-medium">{{ t('dashboard.errors.generic') }}</p>
      <p class="mt-1 text-body-md">{{ restaurantStore.error.message ?? t('dashboard.errors.generic') }}</p>
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
        v-model:tab="tab"
        :health="health"
        :attention-count="attentionCount"
        :refreshing="operations.refreshing.value"
      />

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
        @refresh="operations.refetch"
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
