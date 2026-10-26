<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { PhEnvelopeSimple } from '@phosphor-icons/vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import LanguageSwitcher from '@/components/shared/LanguageSwitcher.vue'
import ThemeSwitcher from '@/components/shared/ThemeSwitcher.vue'
import AButton from '@/components/ui/AButton.vue'
import ASurface from '@/components/ui/ASurface.vue'
import ATextField from '@/components/ui/ATextField.vue'
import { authService } from '@/services/auth.service'
import { describeApiError } from '@/utils/error-message'
import aforoWordmark from '@/assets/brand/aforo-wordmark.png'

/**
 * "¿Olvidaste tu contraseña?" — POST /auth/forgot-password. The backend
 * answers the same for every address (existing, unknown, suspended), so the
 * success state is deliberately generic and never says whether an account
 * exists. Only a malformed e-mail (422), rate limiting (429) or a network
 * failure are shown as errors.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const { t, locale } = useI18n()

const email = ref('')
const submitting = ref(false)
const sent = ref(false)
const fieldError = ref<string | null>(null)
const error = ref<ApiError | null>(null)

async function submit(): Promise<void> {
  if (submitting.value) return
  fieldError.value = EMAIL_PATTERN.test(email.value.trim()) ? null : t('passwordReset.errors.email')
  if (fieldError.value) return

  submitting.value = true
  error.value = null
  try {
    await authService.csrf()
    await authService.forgotPassword(email.value.trim(), locale.value)
    sent.value = true
  } catch (err) {
    const normalized = normalizeApiError(err)
    if (normalized.kind === 'validation') fieldError.value = t('passwordReset.errors.email')
    else error.value = normalized
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
        <h1 class="text-headline font-semibold text-on-surface">{{ t('passwordReset.forgotTitle') }}</h1>

        <ASurface v-if="sent" tone="container" radius="lg" bordered role="status" class="mt-6 flex flex-col gap-4 p-5">
          <div class="flex items-start gap-3">
            <PhEnvelopeSimple :size="22" class="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <p class="text-body-lg text-on-surface">{{ t('passwordReset.sentGeneric') }}</p>
          </div>
          <p class="text-body-md text-on-surface-variant">{{ t('passwordReset.sentHelp') }}</p>
          <RouterLink
            :to="{ name: 'login' }"
            class="inline-flex min-h-11 items-center self-start rounded-full px-4 text-label-lg font-medium text-primary hover:bg-primary-container/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {{ t('passwordReset.backToLogin') }}
          </RouterLink>
        </ASurface>

        <form v-else class="mt-6 flex flex-col gap-4" novalidate @submit.prevent="submit">
          <p class="text-body-md text-on-surface-variant">{{ t('passwordReset.forgotHelp') }}</p>
          <ATextField
            v-model="email"
            type="email"
            inputmode="email"
            autocomplete="email"
            :label="t('passwordReset.emailLabel')"
            :error="fieldError ?? undefined"
            :disabled="submitting"
            required
          />
          <p v-if="error" class="text-body-md text-error" role="alert">{{ describeApiError(error, t) }}</p>
          <AButton type="submit" full-width :loading="submitting">{{ t('passwordReset.sendLink') }}</AButton>
          <RouterLink
            :to="{ name: 'login' }"
            class="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-label-lg font-medium text-primary hover:bg-primary-container/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {{ t('passwordReset.backToLogin') }}
          </RouterLink>
        </form>
      </div>
    </main>
  </div>
</template>
