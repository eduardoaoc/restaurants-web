<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import type { ApiError } from '@/api/errors'
import type { PublicTrackedOrder } from '@/types/public-menu'
import { describeApiError } from '@/utils/error-message'
import { formatMoney } from '@/utils/format'
defineProps<{ orders: PublicTrackedOrder[] | null; loading: boolean; error: ApiError | null; hasMore: boolean; locale: string }>()
const emit = defineEmits<{ retry: []; more: [] }>()
const { t } = useI18n()
</script>
<template>
  <section class="flex flex-col gap-4" :aria-label="t('sessionHistory.publicTitle')">
    <p class="text-body-md text-on-surface-variant">{{ t('sessionHistory.groupVisibility') }}</p>
    <AProgress v-if="loading && orders === null" size="sm" />
    <div v-if="error" class="flex flex-col items-start gap-2">
      <p class="text-body-md text-error" role="alert">{{ describeApiError(error, t) }}</p>
      <AButton variant="outlined" @click="emit('retry')">{{ t('sessionHistory.retry') }}</AButton>
    </div>
    <p v-if="orders?.length === 0" class="text-body-md text-on-surface-variant">{{ t('sessionHistory.empty') }}</p>
    <article v-for="order in orders" :key="order.id" class="rounded-lg border border-outline-variant bg-surface-container p-4">
      <h3 class="text-title-md font-semibold text-on-surface">{{ order.order_number }}</h3>
      <p class="mt-1 text-body-md font-medium text-on-surface" role="status">{{ t(`tableDrawer.orders.status.${order.status}`) }}</p>
      <ul class="mt-3 flex flex-col gap-3">
        <li v-for="(item, index) in order.items" :key="index">
          <div class="flex items-start justify-between gap-3 text-body-md text-on-surface">
            <span class="min-w-0 break-words">{{ item.quantity }} × {{ item.name }}</span>
            <span class="shrink-0 tabular-nums">{{ formatMoney(item.line_total, locale) }}</span>
          </div>
          <p v-for="(modifier, mi) in item.modifiers" :key="mi" class="text-label-md text-on-surface-variant">
            {{ modifier.group_name }} · {{ modifier.name }}
          </p>
        </li>
      </ul>
      <p class="mt-3 text-right text-body-lg font-semibold tabular-nums text-on-surface">{{ formatMoney(order.total, locale) }}</p>
    </article>
    <AButton v-if="hasMore" variant="outlined" :loading="loading" @click="emit('more')">{{ t('sessionHistory.loadMore') }}</AButton>
  </section>
</template>
