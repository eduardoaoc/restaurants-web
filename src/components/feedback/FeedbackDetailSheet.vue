<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhStar } from '@phosphor-icons/vue'

import ABottomSheet from '@/components/ui/ABottomSheet.vue'
import AProgress from '@/components/ui/AProgress.vue'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { customerFeedbackService } from '@/services/customer-feedback.service'
import { useRestaurantStore } from '@/stores/restaurant'
import type { CustomerFeedback } from '@/types/customer-feedback'
import { describeApiError } from '@/utils/error-message'

/**
 * Full customer feedback detail (Passo 3.5 §16) — owner/manager only
 * (the parent only ever opens this when `view_customer_feedback` is
 * already confirmed; the endpoint itself is the real gate regardless).
 * Shows every field the backend's CustomerFeedback resource carries EXCEPT
 * technical ids (feedback id, table id, table_session id) — those are read
 * off the URL/response to fetch this, never displayed.
 */
const props = defineProps<{ feedbackId: number }>()
const emit = defineEmits<{ close: [] }>()

const { t, locale } = useI18n()
const restaurantStore = useRestaurantStore()

const feedback = ref<CustomerFeedback | null>(null)
const loading = ref(true)
const error = ref<ApiError | null>(null)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    feedback.value = await customerFeedbackService.get(props.feedbackId)
  } catch (err) {
    error.value = normalizeApiError(err)
  } finally {
    loading.value = false
  }
}
onMounted(load)

function timestamp(value: string): string {
  const timezone = restaurantStore.currentSettings?.timezone ?? 'Europe/Madrid'
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(value))
}

const RATING_ROWS = [
  { key: 'wait_time_rating', labelKey: 'feedback.detail.waitTime' },
  { key: 'food_rating', labelKey: 'feedback.detail.food' },
  { key: 'service_rating', labelKey: 'feedback.detail.service' },
  { key: 'overall_rating', labelKey: 'feedback.detail.overall' },
] as const
</script>

<template>
  <ABottomSheet :label="t('feedback.detail.title')" @close="emit('close')">
    <div v-if="loading" class="flex justify-center py-10">
      <AProgress />
    </div>

    <p v-else-if="error" class="text-body-md text-error" role="alert">{{ describeApiError(error, t) }}</p>

    <div v-else-if="feedback" class="flex flex-col gap-4">
      <div>
        <p class="text-title-lg font-semibold text-on-surface">{{ feedback.first_name }} {{ feedback.last_name }}</p>
        <p class="text-label-md text-on-surface-variant">{{ timestamp(feedback.submitted_at) }}</p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-lg bg-surface-container p-3">
          <span class="block text-label-md text-on-surface-variant">{{ t('feedback.detail.table') }}</span>
          <span class="mt-1 block text-body-lg font-medium text-on-surface">{{ feedback.table_session.table.name }}</span>
        </div>
        <div class="rounded-lg bg-surface-container p-3">
          <span class="block text-label-md text-on-surface-variant">{{ t('feedback.detail.waiter') }}</span>
          <span class="mt-1 block truncate text-body-lg font-medium text-on-surface">
            {{ feedback.waiter ? feedback.waiter.name : t('feedback.noWaiter') }}
          </span>
        </div>
      </div>

      <dl class="flex flex-col divide-y divide-outline-variant rounded-lg border border-outline-variant">
        <div v-for="row in RATING_ROWS" :key="row.key" class="flex items-center justify-between px-3 py-2.5">
          <dt class="text-body-md text-on-surface-variant">{{ t(row.labelKey) }}</dt>
          <dd class="inline-flex items-center gap-1 text-body-lg font-semibold text-on-surface">
            <PhStar :size="16" weight="fill" class="text-primary" aria-hidden="true" />
            {{ feedback[row.key] }}/5
          </dd>
        </div>
      </dl>

      <div v-if="feedback.experience_comment">
        <p class="text-label-lg font-medium text-on-surface-variant">{{ t('feedback.detail.experienceComment') }}</p>
        <p class="mt-1 text-body-md text-on-surface">{{ feedback.experience_comment }}</p>
      </div>

      <div v-if="feedback.improvement_comment">
        <p class="text-label-lg font-medium text-on-surface-variant">{{ t('feedback.detail.improvementComment') }}</p>
        <p class="mt-1 text-body-md text-on-surface">{{ feedback.improvement_comment }}</p>
      </div>

      <div v-if="feedback.contact">
        <p class="text-label-lg font-medium text-on-surface-variant">{{ t('feedback.detail.contact') }}</p>
        <p class="mt-1 text-body-md text-on-surface">{{ feedback.contact }}</p>
      </div>
    </div>
  </ABottomSheet>
</template>
