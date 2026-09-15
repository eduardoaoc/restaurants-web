<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheckCircle } from '@phosphor-icons/vue'

import ABottomSheet from '@/components/ui/ABottomSheet.vue'
import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import AStarRating from '@/components/ui/AStarRating.vue'
import ATextField from '@/components/ui/ATextField.vue'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { markStoredFeedbackSubmitted } from '@/composables/usePublicFeedbackToken'
import { publicFeedbackService } from '@/services/public-feedback.service'
import type { CreatePublicFeedbackRequest, PublicFeedbackContext } from '@/types/public-feedback'
import { describeApiError } from '@/utils/error-message'

/**
 * The post-visit feedback form (Passo 3.5 §7-11) — one sheet, one job:
 * confirm the visit's context, collect the required name + 4 ratings (plus
 * optional comments/contact), submit, and land in a final state. Every
 * transition below is driven by the real backend response, never guessed:
 *   already_submitted (from GET context, or a 409 FEEDBACK_ALREADY_SUBMITTED
 *     on submit) -> final "ya enviaste tu valoración" state, no form shown.
 *   404 FEEDBACK_TOKEN_NOT_FOUND -> final "enlace no válido" state; the
 *     stale token is dropped from localStorage by the caller (see `invalid`
 *     emit) so this dead context is never retried.
 *   409 TABLE_SESSION_NOT_PAID_FOR_FEEDBACK -> should not normally happen
 *     (the caller only opens this sheet once it believes the visit is
 *     eligible), but the backend re-checks payment on every POST — shown as
 *     its own specific message, never a generic error.
 *   422 -> field-level errors from the backend's own `errors` map, the form
 *     stays exactly as the customer left it.
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
const waitTimeError = computed(() => touched.value && waitTimeRating.value === 0)
const foodError = computed(() => touched.value && foodRating.value === 0)
const serviceError = computed(() => touched.value && serviceRating.value === 0)
const overallError = computed(() => touched.value && overallRating.value === 0)

const isValid = computed(
  () =>
    firstName.value.trim() !== '' &&
    lastName.value.trim() !== '' &&
    waitTimeRating.value > 0 &&
    foodRating.value > 0 &&
    serviceRating.value > 0 &&
    overallRating.value > 0,
)

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
      submitError.value = normalized.fieldErrors ? null : normalized
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

    <form v-else-if="phase === 'form'" class="flex flex-col gap-5" @submit.prevent="submit">
      <p v-if="feedbackContext" class="text-body-md text-on-surface-variant">
        {{ feedbackContext.restaurant.name }} · {{ feedbackContext.table.name }}
      </p>

      <p v-if="contextError" class="rounded-md bg-warning-container px-3 py-2 text-label-lg text-on-warning-container" role="status">
        {{ describeApiError(contextError, t) }}
      </p>

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

      <div class="flex flex-col gap-4">
        <AStarRating v-model="waitTimeRating" :label="t('publicMenu.feedback.waitTime')" :error="waitTimeError" />
        <AStarRating v-model="foodRating" :label="t('publicMenu.feedback.food')" :error="foodError" />
        <AStarRating v-model="serviceRating" :label="t('publicMenu.feedback.service')" :error="serviceError" />
        <AStarRating v-model="overallRating" :label="t('publicMenu.feedback.overall')" :error="overallError" />
        <p v-if="touched && (waitTimeError || foodError || serviceError || overallError)" class="text-label-md text-error" role="alert">
          {{ t('publicMenu.feedback.errors.ratingRequired') }}
        </p>
      </div>

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

      <ATextField v-model="contact" :label="t('publicMenu.feedback.contact')" autocomplete="email" />

      <p v-if="notPaidYet" class="rounded-md bg-warning-container px-3 py-2 text-label-lg text-on-warning-container" role="status">
        {{ t('publicMenu.feedback.notPaidYet') }}
      </p>
      <p v-if="submitError" class="rounded-md bg-error-container px-3 py-2 text-label-lg text-on-error-container" role="alert">
        {{ describeApiError(submitError, t) }}
      </p>
    </form>

    <template v-if="phase === 'form'" #footer>
      <AButton full-width :loading="submitting" @click="submit">
        {{ submitting ? t('publicMenu.feedback.submitting') : t('publicMenu.feedback.submit') }}
      </AButton>
    </template>
  </ABottomSheet>
</template>
