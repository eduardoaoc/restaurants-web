<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhCheckCircle } from '@phosphor-icons/vue'

import ASurface from '@/components/ui/ASurface.vue'
import type { PublicVisit } from '@/types/public-visit'
import { formatDateTime, formatMoney } from '@/utils/format'

/**
 * Pure presentation of a paid visit (Carta 5.1B §7/§8/§9) — restaurant/
 * table, every billable order with its items/modifiers (snapshot values
 * from the backend, never reconstructed from the live menu — §8), and the
 * one authoritative `summary.total` (never re-summed here to "establish"
 * anything, only ever displayed as-is — §9). No logic, no fetching, no
 * cart/ordering awareness — `PublicPostVisitView` owns everything above
 * this.
 */
defineProps<{
  visit: PublicVisit
  locale: string
}>()

const { t } = useI18n()
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col items-center gap-2 text-center">
      <span class="flex h-14 w-14 items-center justify-center rounded-full bg-success-container text-on-success-container">
        <PhCheckCircle :size="28" aria-hidden="true" />
      </span>
      <span class="rounded-full bg-success-container px-3 py-1 text-label-lg font-medium text-on-success-container">
        {{ t('publicMenu.postVisit.paidBadge') }}
      </span>
      <h1 class="text-headline font-semibold text-on-surface">{{ t('publicMenu.postVisit.thankYou') }}</h1>
      <p class="text-body-lg text-on-surface-variant">{{ visit.restaurant.name }} · {{ visit.table.name }}</p>
    </div>

    <section aria-labelledby="visit-orders-heading" class="flex flex-col gap-4">
      <h2 id="visit-orders-heading" class="text-title-md font-semibold text-on-surface">
        {{ t('publicMenu.postVisit.ordersHeading') }}
      </h2>

      <ASurface v-for="order in visit.orders" :key="order.order_number" tone="container" radius="lg" bordered class="flex flex-col gap-3 p-4">
        <div class="flex items-baseline justify-between gap-3">
          <h3 class="text-label-lg font-semibold text-on-surface">
            {{ t('publicMenu.confirmation.orderNumber', { number: order.order_number }) }}
          </h3>
          <time v-if="order.created_at" :datetime="order.created_at" class="shrink-0 text-label-md text-on-surface-variant">
            {{ formatDateTime(order.created_at, locale) }}
          </time>
        </div>

        <ul class="flex flex-col divide-y divide-outline-variant">
          <li v-for="(item, index) in order.items" :key="index" class="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <div class="min-w-0">
              <p class="text-body-lg text-on-surface">{{ item.quantity }} × {{ item.name }}</p>
              <p v-for="(modifier, mIndex) in item.modifiers" :key="mIndex" class="mt-0.5 text-label-md text-on-surface-variant">
                {{ modifier.group_name }} · {{ modifier.name }}
              </p>
            </div>
            <span class="shrink-0 text-body-lg font-medium tabular-nums text-on-surface">{{ formatMoney(item.line_total, locale) }}</span>
          </li>
        </ul>

        <div class="flex items-center justify-between border-t border-outline-variant pt-2.5 text-label-lg font-medium text-on-surface-variant">
          <span>{{ t('publicMenu.cart.total') }}</span>
          <span class="tabular-nums">{{ formatMoney(order.total, locale) }}</span>
        </div>
      </ASurface>
    </section>

    <div class="flex items-center justify-between border-t border-outline-variant pt-4 text-title-lg font-semibold text-on-surface">
      <span>{{ t('publicMenu.cart.total') }}</span>
      <span class="tabular-nums">{{ formatMoney(visit.summary.total, locale) }}</span>
    </div>
  </div>
</template>
