<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhBellRinging, PhCheckCircle, PhDotsThreeVertical, PhReceipt, PhStar } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import AIconButton from '@/components/ui/AIconButton.vue'
import ASurface from '@/components/ui/ASurface.vue'
import AButton from '@/components/ui/AButton.vue'
import { describeApiError } from '@/utils/error-message'

/**
 * Waiter call / bill request / feedback, compacted into one menu (Carta
 * 4.4 §28) — none of the underlying capability, state, or copy changes
 * from the pre-Reel carta (CLAUDE.md §1 "preservar integralmente"): this
 * is purely a visual relocation from an always-on banner to a
 * discoverable trigger, so a Reel card's media never has to share space
 * with a persistent action bar. The trigger shows a small dot whenever
 * there's a confirmed state worth knowing about, so "camarero avisado" /
 * "cuenta solicitada" are never actually hidden (§28), just one tap away.
 */
const props = defineProps<{
  showWaiterCall: boolean
  waiterCalled: boolean
  requestingWaiter: boolean
  showBillRequest: boolean
  billRequested: boolean
  requestingBill: boolean
  requestError: ApiError | null
  showFeedback: boolean
  feedbackAlreadySubmitted: boolean
}>()

const emit = defineEmits<{
  'call-waiter': []
  'request-bill': []
  'open-feedback': []
}>()

const { t } = useI18n()
const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const hasAnyAction = computed(() => props.showWaiterCall || props.showBillRequest || props.showFeedback)
const hasConfirmedState = computed(() => props.waiterCalled || props.billRequested)

function onFocusOut(event: FocusEvent): void {
  if (!rootRef.value?.contains(event.relatedTarget as Node | null)) open.value = false
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') open.value = false
}

function onFeedbackClick(): void {
  emit('open-feedback')
  open.value = false
}
</script>

<template>
  <div v-if="hasAnyAction" ref="rootRef" class="relative" @focusout="onFocusOut" @keydown="onKeydown">
    <span class="relative inline-flex">
      <AIconButton :label="t('publicMenu.feed.actionsLabel')" variant="onMedia" :pressed="open" @click="open = !open">
        <PhDotsThreeVertical :size="20" weight="bold" />
      </AIconButton>
      <span
        v-if="hasConfirmedState"
        aria-hidden="true"
        class="pointer-events-none absolute right-1 top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-black/40"
      />
    </span>

    <ASurface
      v-if="open"
      tone="high"
      radius="md"
      role="menu"
      :aria-label="t('publicMenu.feed.actionsLabel')"
      class="absolute right-0 z-20 mt-2 w-64 py-2 shadow-elevated"
    >
      <div v-if="showWaiterCall" class="px-3 py-1.5">
        <p v-if="waiterCalled" class="flex items-center gap-1.5 text-label-lg text-on-surface-variant">
          <PhCheckCircle :size="16" class="shrink-0 text-primary" aria-hidden="true" />
          {{ t('publicMenu.requests.waiterConfirmed') }}
        </p>
        <AButton v-else variant="outlined" full-width :loading="requestingWaiter" @click="emit('call-waiter')">
          <template #leading><PhBellRinging :size="16" /></template>
          {{ t('publicMenu.requests.callWaiter') }}
        </AButton>
      </div>

      <div v-if="showBillRequest" class="px-3 py-1.5">
        <p v-if="billRequested" class="flex items-center gap-1.5 text-label-lg text-on-surface-variant">
          <PhCheckCircle :size="16" class="shrink-0 text-primary" aria-hidden="true" />
          {{ t('publicMenu.requests.billConfirmed') }}
        </p>
        <AButton v-else variant="outlined" full-width :loading="requestingBill" @click="emit('request-bill')">
          <template #leading><PhReceipt :size="16" /></template>
          {{ t('publicMenu.requests.requestBill') }}
        </AButton>
      </div>

      <p v-if="requestError" role="alert" class="mx-3 mt-1 rounded-md bg-error-container px-3 py-2 text-label-md text-on-error-container">
        {{ describeApiError(requestError, t) }}
      </p>

      <div v-if="showFeedback" class="px-3 py-1.5">
        <p v-if="feedbackAlreadySubmitted" class="flex items-center gap-1.5 text-label-lg text-on-surface-variant">
          <PhCheckCircle :size="16" class="shrink-0 text-primary" aria-hidden="true" />
          {{ t('publicMenu.feedback.alreadySubmitted') }}
        </p>
        <AButton v-else variant="outlined" full-width @click="onFeedbackClick">
          <template #leading><PhStar :size="16" /></template>
          {{ t('publicMenu.feedback.open') }}
        </AButton>
      </div>
    </ASurface>
  </div>
</template>
