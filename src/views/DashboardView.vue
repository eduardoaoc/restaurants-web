<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import DashboardPageHead from '@/components/dashboard/DashboardPageHead.vue'
import type { DashboardTab } from '@/components/dashboard/DashboardTabs.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import { useRestaurantAnalytics } from '@/composables/useRestaurantAnalytics'
import { useRestaurantOperations } from '@/composables/useRestaurantOperations'
import { useRestaurantStore } from '@/stores/restaurant'
import AnalyticsView from './analytics/AnalyticsView.vue'
import OperationView from './operation/OperationView.vue'

const { t } = useI18n()
const restaurantStore = useRestaurantStore()

const tab = ref<DashboardTab>('operation')
const operations = useRestaurantOperations()
const analytics = useRestaurantAnalytics()

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
      <p class="text-title-md font-medium text-on-surface">{{ t('dashboard.noRestaurantAccess') }}</p>
    </ASurface>

    <template v-else>
      <DashboardPageHead v-model:tab="tab" :health="health" :attention-count="attentionCount" />

      <OperationView
        v-if="tab === 'operation'"
        :restaurant-id="restaurantStore.currentRestaurantId"
        :snapshot="operations.snapshot.value"
        :loading="operations.loading.value"
        :error="operations.error.value"
        @refresh="operations.refetch"
      />
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
