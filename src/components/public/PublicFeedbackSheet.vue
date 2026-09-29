<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheckCircle } from '@phosphor-icons/vue'

import ABottomSheet from '@/components/ui/ABottomSheet.vue'
import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ATextField from '@/components/ui/ATextField.vue'
import PublicFeedbackProgress from './PublicFeedbackProgress.vue'
import PublicFeedbackRatingStep from './PublicFeedbackRatingStep.vue'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { markStoredFeedbackSubmitted } from '@/composables/usePublicFeedbackToken'
import { publicFeedbackService } from '@/services/public-feedback.service'
import type { CreatePublicFeedbackRequest, PublicFeedbackContext } from '@/types/public-feedback'
import { describeApiError } from '@/utils/error-message'

/**
 * The post-visit feedback form (Passo 3.5 §7-11, guided wizard since Carta
 * 5.2) — one sheet, one job: confirm the visit's context, collect the
 * required name + 4 ratings (plus optional comments/contact) through a
 * short guided flow, submit once, and land in a final state. Every
 * transition below is driven by the real backend response, never guessed:
 *   already_submitted (from GET context, or a 409 FEEDBACK_ALREADY_SUBMITTED
 *     on submit) -> final "ya enviaste tu valoración" state, no wizard shown.
 *   404 FEEDBACK_TOKEN_NOT_FOUND -> final "enlace no válido" state; the
 *     stale token is dropped from localStorage by the caller (see `invalid`
 *     emit) so this dead context is never retried.
 *   409 TABLE_SESSION_NOT_PAID_FOR_FEEDBACK -> should not normally happen
 *     (the caller only opens this sheet once it believes the visit is
 *     eligible), but the backend re-checks payment on every POST — shown as
 *     its own specific message, never a generic error.
 *   422 -> field-level errors from the backend's own `errors` map, the form
 *     stays exactly as the customer left it (last step, values untouched).
 *
 * Carta 5.2 — the backend contract is UNCHANGED (still one
 * CreatePublicFeedbackRequest, one POST). The wizard is purely a frontend
 * presentation layer over the exact same in-memory refs the old single-form
 * version used: 5 steps (food -> service -> wait time -> overall -> comments
 * + identification + submit), nothing is sent to the backend before the
 * final step's submit.
 */
const props = defineProps<{ token: string; tablePublicToken: string }>()
const emit = defineEmits<{ close: []; submitted: []; invalid: [] }>()

const { t } = useI18n()

type Phase = 'loading' | 'form' | 'already-submitted' | 'invalid-token' | 'success'
const phase = ref<Phase>('loading')
const contextError = ref<ApiError | null>(null)
const feedbackContext = ref<PublicFeedbackContext | null>(null)

async function loadContext(): Promise<void> {
  phase.value = 'loading'
  contextError.value = null
  try {
    const result = await publicFeedbackService.getContext(props.token)
    feedbackContext.value = result
    if (result.already_submitted) {
      markStoredFeedbackSubmitted(props.tablePublicToken)
      phase.value = 'already-submitted'
    } else {
      phase.value = 'form'
    }
  } catch (err) {
    const normalized = normalizeApiError(err)
    if (normalized.kind === 'not_found') {
      emit('invalid')
      phase.value = 'invalid-token'
    } else {
      contextError.value = normalized
      phase.value = 'form'
    }
  }
}
onMounted(loadContext)

const firstName = ref('')
const lastName = ref('')
const waitTimeRating = ref(0)
const foodRating = ref(0)
const serviceRating = ref(0)
const overallRating = ref(0)
const experienceComment = ref('')
const improvementComment = ref('')
const contact = ref('')

const touched = ref(false)
const fieldErrors = ref<Record<string, string[]> | null>(null)
const submitting = ref(false)
const submitError = ref<ApiError | null>(null)
const notPaidYet = ref(false)

const firstNameError = computed(() => {
  if (fieldErrors.value?.first_name?.[0]) return fieldErrors.value.first_name[0]
  if (touched.value && !firstName.value.trim()) return t('publicMenu.feedback.errors.firstNameRequired')
  return undefined
})
const lastNameError = computed(() => {
  if (fieldErrors.value?.last_name?.[0]) return fieldErrors.value.last_name[0]
  if (touched.value && !lastName.value.trim()) return t('publicMenu.feedback.errors.lastNameRequired')
  return undefined
})

const isValid = computed(
  () =>
    firstName.value.trim() !== '' &&
    lastName.value.trim() !== '' &&
    waitTimeRating.value > 0 &&
    foodRating.value > 0 &&
    serviceRating.value > 0 &&
    overallRating.value > 0,
)

/**
 * Guided wizard state (Carta 5.2) — 5 steps, 0-based: food, service, wait
 * time, overall, then comments + identification + submit. `direction`
 * only picks which transition plays (§19); it never affects validation or
 * what gets kept — going back and forward again never resets a value,
 * since every rating/text field above is a single ref shared across every
 * step render, never re-created per step (§8 "não resetar ratings ao
 * navegar").
 */
const TOTAL_STEPS = 5
const step = ref(0)
const direction = ref<'forward' | 'back'>('forward')

const ratingValueLabels = computed<string[]>(() => [
  t('publicMenu.feedback.ratingValues.r1'),
  t('publicMenu.feedback.ratingValues.r2'),
  t('publicMenu.feedback.ratingValues.r3'),
  t('publicMenu.feedback.ratingValues.r4'),
  t('publicMenu.feedback.ratingValues.r5'),
])

/** Whether the current rating step has a value — gates "Continuar" so a customer can never advance past an unanswered rating (§8), no error state needed. */
const canContinue = computed(() => {
  switch (step.value) {
    case 0:
      return foodRating.value > 0
    case 1:
      return serviceRating.value > 0
    case 2:
      return waitTimeRating.value > 0
    case 3:
      return overallRating.value > 0
    default:
      return true
  }
})

function goNext(): void {
  if (step.value >= TOTAL_STEPS - 1 || !canContinue.value) return
  direction.value = 'forward'
  step.value += 1
}

function goBack(): void {
  if (step.value <= 0) return
  direction.value = 'back'
  step.value -= 1
}

/**
 * Moves focus to the new step's region on every step change (§22 "mover
 * foco de forma discreta para o heading da nova etapa") — same pattern
 * already used by PublicPostVisitView's own `rootRef`: a single
 * `tabindex="-1"` wrapper focused programmatically, not a raw per-star
 * `aria-live` announcement.
 *
 * Wired to the `<Transition>`'s own `@after-enter` (not a `watch(step, ...)`
 * + `nextTick`) on purpose: `mode="out-in"` delays mounting the NEW step's
 * DOM node until the OLD one's leave animation finishes, so a plain
 * `nextTick` callback fires while `stepRef` is still null/stale and the
 * focus call silently no-ops — the browser then drops focus to `<body>`
 * once the old (now-unmounted) button is removed. `after-enter` only fires
 * once the new node is actually in the DOM and its own enter transition has
 * completed, which is also exactly when the very first entry (loading ->
 * form) needs it.
 */
const stepRef = ref<HTMLElement | null>(null)
function focusCurrentStep(): void {
  stepRef.value?.focus()
}

async function submit(): Promise<void> {
  touched.value = true
  submitError.value = null
  notPaidYet.value = false
  if (!isValid.value || submitting.value) return

  const payload: CreatePublicFeedbackRequest = {
    first_name: firstName.value.trim(),
    last_name: lastName.value.trim(),
    wait_time_rating: waitTimeRating.value,
    food_rating: foodRating.value,
    service_rating: serviceRating.value,
    overall_rating: overallRating.value,
    experience_comment: experienceComment.value.trim() || null,
    improvement_comment: improvementComment.value.trim() || null,
    contact: contact.value.trim() || null,
  }

  submitting.value = true
  fieldErrors.value = null
  try {
    await publicFeedbackService.submit(props.token, payload)
    markStoredFeedbackSubmitted(props.tablePublicToken)
    phase.value = 'success'
    emit('submitted')
  } catch (err) {
    const normalized = normalizeApiError(err)
    if (normalized.kind === 'conflict' && normalized.code === 'FEEDBACK_ALREADY_SUBMITTED') {
      markStoredFeedbackSubmitted(props.tablePublicToken)
      phase.value = 'already-submitted'
    } else if (normalized.kind === 'conflict' && normalized.code === 'TABLE_SESSION_NOT_PAID_FOR_FEEDBACK') {
      notPaidYet.value = true
    } else if (normalized.kind === 'not_found') {
      emit('invalid')
      phase.value = 'invalid-token'
    } else if (normalized.kind === 'validation') {
      fieldErrors.value = normalized.fieldErrors ?? null
      // first_name/last_name errors already render inline via their own
      // computeds above — anything else (e.g. an out-of-range rating, which
      // the wizard's own step gating should already prevent) still needs a
      // visible, localized fallback rather than failing silently.
      const hasDisplayableFieldError = Boolean(fieldErrors.value?.first_name || fieldErrors.value?.last_name)
      submitError.value = hasDisplayableFieldError ? null : normalized
    } else {
      submitError.value = normalized
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <ABottomSheet :label="t('publicMenu.feedback.sheetTitle')" @close="emit('close')">
    <div v-if="phase === 'loading'" class="flex justify-center py-10">
      <AProgress />
    </div>

    <div v-else-if="phase === 'already-submitted'" class="flex flex-col items-center gap-3 py-8 text-center">
      <PhCheckCircle :size="40" class="text-primary" aria-hidden="true" />
      <p class="text-title-md font-semibold text-on-surface">{{ t('publicMenu.feedback.alreadySubmittedTitle') }}</p>
      <p class="max-w-xs text-body-md text-on-surface-variant">{{ t('publicMenu.feedback.alreadySubmittedMessage') }}</p>
    </div>

    <div v-else-if="phase === 'invalid-token'" class="flex flex-col items-center gap-3 py-8 text-center">
      <p class="max-w-xs text-body-md text-on-surface-variant">{{ t('publicMenu.feedback.invalidToken') }}</p>
    </div>

    <div v-else-if="phase === 'success'" class="flex flex-col items-center gap-3 py-8 text-center">
      <PhCheckCircle :size="40" class="text-primary" aria-hidden="true" />
      <p class="text-title-md font-semibold text-on-surface">{{ t('publicMenu.feedback.successTitle') }}</p>
      <p class="max-w-xs text-body-md text-on-surface-variant">{{ t('publicMenu.feedback.successMessage') }}</p>
    </div>

    <div v-else-if="phase === 'form'" class="flex flex-col gap-5">
      <p v-if="feedbackContext" class="text-body-md text-on-surface-variant">
        {{ feedbackContext.restaurant.name }} · {{ feedbackContext.table.name }}
      </p>

      <p v-if="contextError" class="rounded-md bg-warning-container px-3 py-2 text-label-lg text-on-warning-container" role="status">
        {{ describeApiError(contextError, t) }}
      </p>

      <PublicFeedbackProgress :current="step + 1" :total="TOTAL_STEPS" />

      <Transition :name="direction === 'forward' ? 'wizard-fwd' : 'wizard-back'" mode="out-in" appear @after-enter="focusCurrentStep">
        <div :key="step" ref="stepRef" tabindex="-1" class="outline-none">
          <PublicFeedbackRatingStep
            v-if="step === 0"
            v-model="foodRating"
            :question="t('publicMenu.feedback.questions.food')"
            :rating-label="t('publicMenu.feedback.food')"
            :value-labels="ratingValueLabels"
          />
          <PublicFeedbackRatingStep
            v-else-if="step === 1"
            v-model="serviceRating"
            :question="t('publicMenu.feedback.questions.service')"
            :rating-label="t('publicMenu.feedback.service')"
            :value-labels="ratingValueLabels"
          />
          <PublicFeedbackRatingStep
            v-else-if="step === 2"
            v-model="waitTimeRating"
            :question="t('publicMenu.feedback.questions.waitTime')"
            :rating-label="t('publicMenu.feedback.waitTime')"
            :value-labels="ratingValueLabels"
          />
          <PublicFeedbackRatingStep
            v-else-if="step === 3"
            v-model="overallRating"
            :question="t('publicMenu.feedback.questions.overall')"
            :rating-label="t('publicMenu.feedback.overall')"
            :value-labels="ratingValueLabels"
          />

          <form v-else class="flex flex-col gap-5" @submit.prevent="submit">
            <h2 class="text-title-lg font-semibold text-on-surface">{{ t('publicMenu.feedback.questions.more') }}</h2>

            <div class="flex flex-col gap-1.5">
              <label for="feedback-experience" class="text-label-lg font-medium text-on-surface-variant">
                {{ t('publicMenu.feedback.experienceComment') }}
              </label>
              <textarea
                id="feedback-experience"
                v-model="experienceComment"
                rows="2"
                class="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-body-lg text-on-surface placeholder:text-on-surface-variant/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <label for="feedback-improvement" class="text-label-lg font-medium text-on-surface-variant">
                {{ t('publicMenu.feedback.improvementComment') }}
              </label>
              <textarea
                id="feedback-improvement"
                v-model="improvementComment"
                rows="2"
                class="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-body-lg text-on-surface placeholder:text-on-surface-variant/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              />
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ATextField
                v-model="firstName"
                :label="t('publicMenu.feedback.firstName')"
                required
                autocomplete="given-name"
                :error="firstNameError"
              />
              <ATextField
                v-model="lastName"
                :label="t('publicMenu.feedback.lastName')"
                required
                autocomplete="family-name"
                :error="lastNameError"
              />
            </div>

            <ATextField v-model="contact" :label="t('publicMenu.feedback.contact')" autocomplete="email" />

            <p v-if="notPaidYet" class="rounded-md bg-warning-container px-3 py-2 text-label-lg text-on-warning-container" role="status">
              {{ t('publicMenu.feedback.notPaidYet') }}
            </p>
            <p v-if="submitError" class="rounded-md bg-error-container px-3 py-2 text-label-lg text-on-error-container" role="alert">
              {{ describeApiError(submitError, t) }}
            </p>
          </form>
        </div>
      </Transition>
    </div>

    <template v-if="phase === 'form'" #footer>
      <div class="flex gap-3">
        <AButton v-if="step > 0" variant="outlined" class="flex-1" @click="goBack">
          {{ t('common.back') }}
        </AButton>
        <AButton v-if="step < TOTAL_STEPS - 1" class="flex-1" :disabled="!canContinue" @click="goNext">
          {{ t('publicMenu.feedback.wizard.continueLabel') }}
        </AButton>
        <AButton v-else class="flex-1" :loading="submitting" @click="submit">
          {{ submitting ? t('publicMenu.feedback.submitting') : t('publicMenu.feedback.submit') }}
        </AButton>
      </div>
    </template>
  </ABottomSheet>
</template>

<style scoped>
.wizard-fwd-enter-active,
.wizard-back-enter-active {
  transition:
    transform 200ms ease-out,
    opacity 200ms ease-out;
}
.wizard-fwd-leave-active,
.wizard-back-leave-active {
  transition:
    transform 150ms ease-out,
    opacity 150ms ease-out;
}
.wizard-fwd-enter-from {
  transform: translateX(16px);
  opacity: 0;
}
.wizard-fwd-leave-to {
  transform: translateX(-16px);
  opacity: 0;
}
.wizard-back-enter-from {
  transform: translateX(-16px);
  opacity: 0;
}
.wizard-back-leave-to {
  transform: translateX(16px);
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .wizard-fwd-enter-active,
  .wizard-back-enter-active,
  .wizard-fwd-leave-active,
  .wizard-back-leave-active {
    transition: none;
  }
}
</style>
