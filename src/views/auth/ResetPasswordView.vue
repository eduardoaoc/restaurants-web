<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { PhCheckCircle, PhEye, PhEyeSlash, PhWarningCircle } from '@phosphor-icons/vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import LanguageSwitcher from '@/components/shared/LanguageSwitcher.vue'
import ThemeSwitcher from '@/components/shared/ThemeSwitcher.vue'
import AButton from '@/components/ui/AButton.vue'
import AIconButton from '@/components/ui/AIconButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import ATextField from '@/components/ui/ATextField.vue'
import { authService } from '@/services/auth.service'
import { describeApiError } from '@/utils/error-message'
import { takeUrlSecret } from '@/utils/url-secret'
import aforoWordmark from '@/assets/brand/aforo-wordmark.png'

/**
 * /reset-password#token=...&email=... — the link from the reset e-mail.
 *
 * The secret was moved out of the URL by src/utils/url-secret.ts before the
 * app started; it lives only in this component's memory. Preview (POST)
 * never consumes it; the password only changes on explicit submit. Success
 * never signs anyone in: it points back to the login (and to the pending
 * invitation link, if that is why the person came here).
 */
type PageState = 'loading' | 'ready' | 'invalid' | 'missing' | 'network' | 'done'

const { t } = useI18n()

let token = ''
let email = ''
const state = ref<PageState>('loading')
const password = ref('')
const passwordConfirmation = ref('')
const passwordVisible = ref(false)
const submitting = ref(false)
const localErrors = ref<Record<string, string>>({})
const submitError = ref<ApiError | null>(null)

async function check(): Promise<void> {
  state.value = 'loading'
  try {
    await authService.csrf()
    await authService.previewPasswordReset(email, token)
    state.value = 'ready'
  } catch (err) {
    const error = normalizeApiError(err)
    state.value = error.code === 'PASSWORD_RESET_INVALID' || error.kind === 'validation' ? 'invalid' : 'network'
  }
}

onMounted(() => {
  const params = takeUrlSecret('/reset-password')
  token = params?.get('token') ?? ''
  email = params?.get('email') ?? ''
  if (!token || !email) {
    state.value = 'missing'
    return
  }
  void check()
})

function fieldError(key: string): string | undefined {
  if (localErrors.value[key]) return localErrors.value[key]
  if (submitError.value?.kind !== 'validation' || submitError.value.code) return undefined
  return submitError.value.fieldErrors?.[key]?.[0] ? t('passwordReset.errors.passwordRules') : undefined
}

async function submit(): Promise<void> {
  if (submitting.value || state.value !== 'ready') return
  const errors: Record<string, string> = {}
  if (password.value.length < 8) errors.password = t('passwordReset.errors.passwordMin')
  else if (password.value !== passwordConfirmation.value) errors.password_confirmation = t('passwordReset.errors.passwordMismatch')
  localErrors.value = errors
  if (Object.keys(errors).length > 0) return

  submitting.value = true
  submitError.value = null
  try {
    await authService.csrf()
    await authService.resetPassword(email, token, password.value, passwordConfirmation.value)
    token = ''
    password.value = ''
    passwordConfirmation.value = ''
    state.value = 'done'
  } catch (err) {
    const error = normalizeApiError(err)
    if (error.code === 'PASSWORD_RESET_INVALID') state.value = 'invalid'
    else submitError.value = error
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-background">
    <header class="flex items-center justify-between px-4 pt-4 sm:px-8 sm:pt-6">
      <img :src="aforoWordmark" alt="AFORO" class="h-7 w-auto" />
      <div class="flex items-center gap-1">
        <LanguageSwitcher />
        <ThemeSwitcher />
      </div>
    </header>

    <main class="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:px-8">
      <div class="w-full max-w-md">
        <h1 class="text-headline font-semibold text-on-surface">{{ t('passwordReset.resetTitle') }}</h1>

        <div v-if="state === 'loading'" class="mt-8 flex items-center gap-3 text-body-md text-on-surface-variant" role="status">
          <AProgress size="sm" />
          {{ t('passwordReset.checking') }}
        </div>

        <ASurface v-else-if="state === 'done'" tone="container" radius="lg" bordered role="status" class="mt-6 flex flex-col gap-4 p-5">
          <div class="flex items-start gap-3">
            <PhCheckCircle :size="22" class="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <p class="text-body-lg text-on-surface">{{ t('passwordReset.done') }}</p>
          </div>
          <p class="text-body-md text-on-surface-variant">{{ t('passwordReset.doneInvitationHint') }}</p>
          <RouterLink
            :to="{ name: 'login' }"
            class="inline-flex min-h-11 items-center justify-center self-start rounded-full bg-primary px-5 text-label-lg font-medium text-on-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {{ t('passwordReset.backToLogin') }}
          </RouterLink>
        </ASurface>

        <ASurface v-else-if="state !== 'ready'" tone="container" radius="lg" bordered role="alert" class="mt-6 flex flex-col gap-4 p-5">
          <div class="flex items-start gap-3">
            <PhWarningCircle :size="22" class="mt-0.5 shrink-0 text-error" aria-hidden="true" />
            <p class="text-body-lg text-on-surface">
              {{ state === 'network' ? t('passwordReset.network') : state === 'missing' ? t('passwordReset.missing') : t('passwordReset.invalid') }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <AButton v-if="state === 'network'" @click="check">{{ t('auth.retry') }}</AButton>
            <RouterLink
              :to="{ name: 'forgot-password' }"
              class="inline-flex min-h-11 items-center rounded-full border border-outline px-4 text-label-lg font-medium text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {{ t('passwordReset.requestNew') }}
            </RouterLink>
          </div>
        </ASurface>

        <form v-else class="mt-6 flex flex-col gap-4" novalidate @submit.prevent="submit">
          <p class="text-body-md text-on-surface-variant">{{ t('passwordReset.resetHelp') }}</p>
          <input type="email" :value="email" autocomplete="username" class="sr-only" tabindex="-1" aria-hidden="true" readonly />
          <div class="flex items-end gap-2">
            <ATextField
              v-model="password"
              class="flex-1"
              :label="t('passwordReset.newPasswordLabel')"
              :help-text="t('passwordReset.newPasswordHelp')"
              :error="fieldError('password')"
              :disabled="submitting"
              :type="passwordVisible ? 'text' : 'password'"
              autocomplete="new-password"
              required
            />
            <AIconButton
              :label="passwordVisible ? t('invitation.hidePassword') : t('invitation.showPassword')"
              :disabled="submitting"
              @click="passwordVisible = !passwordVisible"
            >
              <PhEyeSlash v-if="passwordVisible" :size="18" />
              <PhEye v-else :size="18" />
            </AIconButton>
          </div>
          <ATextField
            v-model="passwordConfirmation"
            :label="t('passwordReset.confirmLabel')"
            :error="fieldError('password_confirmation')"
            :disabled="submitting"
            :type="passwordVisible ? 'text' : 'password'"
            autocomplete="new-password"
            required
          />
          <p v-if="submitError && !(submitError.kind === 'validation' && !submitError.code)" class="text-body-md text-error" role="alert">
            {{ describeApiError(submitError, t) }}
          </p>
          <AButton type="submit" full-width :loading="submitting">{{ t('passwordReset.save') }}</AButton>
        </form>
      </div>
    </main>
  </div>
</template>
