<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhBellRinging, PhCheckCircle, PhWarningCircle } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import PublicGoogleReviewCta from './PublicGoogleReviewCta.vue'
import PublicVisitSummary from './PublicVisitSummary.vue'
import type { ApiError } from '@/api/errors'
import type { PublicVisit } from '@/types/public-visit'
import { describeApiError } from '@/utils/error-message'

/**
 * Post-payment stage (Carta 5.1B §6/§7) — what `PublicTableView` switches
 * to once a visit is confirmed paid. Purely the presentation/orchestration
 * of THIS stage: loading/error for the visit fetch, the read-only
 * `PublicVisitSummary`, and its two CTAs. Every piece of cross-cutting
 * state it needs (waiter-call, feedback) is still owned by
 * `PublicTableView` and only ever passed in/emitted out — this component
 * never calls a service or touches `usePublicCart`/localStorage itself.
 *
 * No "Añadir"/cart/checkout affordance exists anywhere in this file on
 * purpose (§10/§11) — there is nothing here for `orderingEnabled`/
 * `sessionActive`/`billRequested` to even guard, which is the whole point:
 * a paid visit simply never renders a purchase surface again, regardless
 * of what an old cart might still hold.
 */
const props = defineProps<{
  visit: PublicVisit | null
  loading: boolean
  error: ApiError | null
  locale: string
  feedbackAlreadySubmitted: boolean
  /** Restaurant-level capability only — combined with `visit.visit.active` in this component's own template, never pre-baked by the caller (§14 "sessão fechada" must win regardless of capability). */
  waiterCallCapable: boolean
  waiterCalled: boolean
  requestingWaiter: boolean
  requestError: ApiError | null
}>()

const emit = defineEmits<{
  retry: []
  'open-feedback': []
  'call-waiter': []
}>()

const { t } = useI18n()

// Focus lands on the visit content once it's actually loaded — never
// during the loading spinner, and never re-stolen on a re-render once
// already placed there (§20 "não causar salto incômodo").
const rootRef = ref<HTMLElement | null>(null)
let focusPlaced = false
watch(
  () => props.visit,
  (visit) => {
    if (!visit || focusPlaced) return
    focusPlaced = true
    void nextTick(() => rootRef.value?.focus())
  },
  { immediate: true },
)

/**
 * Carta 5.3C — the Google review CTA appears once the AFORO feedback is
 * submitted AND the restaurant has a configured link, never before and
 * never conditioned on any rating (§3/§4). `feedbackAlreadySubmitted`
 * already flips true the moment `PublicFeedbackSheet` emits `submitted`
 * (see PublicTableView's `onFeedbackSubmitted`), independent of whether
 * that sheet is still open — so this stays visible after closing it, and
 * after a reload (the caller re-derives `feedbackAlreadySubmitted` from
 * the backend/stored context either way, never from this component's own
 * state) without ever needing to reopen the feedback sheet.
 */
const googleReviewUrl = computed(() =>
  props.feedbackAlreadySubmitted && props.visit?.google_review.available ? props.visit.google_review.url : null,
)
</script>

<template>
  <div class="flex h-full flex-col overflow-y-auto bg-background px-4 py-6" style="padding-bottom: max(1.5rem, env(safe-area-inset-bottom))">
    <div v-if="loading" class="flex flex-1 flex-col items-center justify-center gap-3 text-on-surface-variant">
      <AProgress size="sm" />
      <span class="text-body-md">{{ t('publicMenu.loading') }}</span>
    </div>

    <div v-else-if="!visit" class="flex flex-1 flex-col items-center justify-center gap-4 px-2 text-center">
      <PhWarningCircle :size="32" class="text-on-surface-variant" aria-hidden="true" />
      <div>
        <p class="text-body-lg font-medium text-on-surface">{{ t('publicMenu.postVisit.loadFailed') }}</p>
        <p v-if="error" class="mt-1 text-body-md text-on-surface-variant">{{ describeApiError(error, t) }}</p>
      </div>
      <button
        type="button"
        class="min-h-11 rounded-full border border-outline px-5 text-label-lg font-medium text-on-surface hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        @click="emit('retry')"
      >
        {{ t('publicMenu.errors.retry') }}
      </button>
    </div>

    <div v-else ref="rootRef" tabindex="-1" class="mx-auto flex w-full max-w-lg flex-col gap-6 focus:outline-none">
      <p v-if="!visit.visit.active" class="text-center text-label-lg font-medium text-on-surface-variant">
        {{ t('publicMenu.postVisit.visitClosed') }}
      </p>

      <PublicVisitSummary :visit="visit" :locale="locale" />

      <div class="flex flex-col gap-3">
        <p v-if="feedbackAlreadySubmitted" class="flex items-center justify-center gap-2 rounded-lg bg-surface-container-low px-3 py-2.5 text-label-lg text-on-surface-variant">
          <PhCheckCircle :size="18" class="shrink-0 text-primary" aria-hidden="true" />
          {{ t('publicMenu.postVisit.feedbackSubmittedBadge') }}
        </p>
        <AButton v-else full-width variant="outlined" @click="emit('open-feedback')">
          {{ t('publicMenu.postVisit.evaluateExperience') }}
        </AButton>

        <PublicGoogleReviewCta v-if="googleReviewUrl" :url="googleReviewUrl" />

        <template v-if="visit.visit.active && waiterCallCapable">
          <p v-if="waiterCalled" class="flex items-center justify-center gap-2 rounded-lg bg-surface-container-low px-3 py-2.5 text-label-lg text-on-surface-variant">
            <PhCheckCircle :size="18" class="shrink-0 text-primary" aria-hidden="true" />
            {{ t('publicMenu.postVisit.wantMoreConfirmed') }}
          </p>
          <template v-else>
            <AButton full-width :loading="requestingWaiter" @click="emit('call-waiter')">
              <template #leading><PhBellRinging :size="16" /></template>
              {{ t('publicMenu.postVisit.wantMore') }}
            </AButton>
            <p class="text-center text-label-md text-on-surface-variant">{{ t('publicMenu.postVisit.wantMoreHint') }}</p>
          </template>
          <p v-if="requestError" class="rounded-md bg-error-container px-3 py-2 text-label-lg text-on-error-container" role="alert">
            {{ describeApiError(requestError, t) }}
          </p>
        </template>
      </div>
    </div>
  </div>
</template>
