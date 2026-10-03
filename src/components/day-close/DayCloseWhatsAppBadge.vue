<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DayCloseDeliveryStatus } from '@/types/day-close-whatsapp'
const props = defineProps<{ status: DayCloseDeliveryStatus }>()
const { t } = useI18n()
const tone = computed(() => {
  if (props.status === 'failed') return 'bg-error-container text-on-error-container'
  if (props.status === 'delivered' || props.status === 'read') return 'bg-success-container text-on-success-container'
  if (props.status === 'skipped') return 'bg-surface-container-high text-on-surface-variant'
  return 'bg-secondary-container text-on-secondary-container'
})
</script>
<template>
  <span class="inline-flex max-w-full items-center rounded-xs px-2 py-0.5 text-label-md font-medium" :class="tone">{{ t('dayClose.whatsapp.statuses.' + status) }}</span>
</template>
