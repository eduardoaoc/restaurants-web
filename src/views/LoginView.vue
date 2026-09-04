<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { PhArrowRight, PhEnvelopeSimple, PhEye, PhEyeSlash, PhLockSimple, PhShareNetwork } from '@phosphor-icons/vue'

import { normalizeApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import AIconButton from '@/components/ui/AIconButton.vue'
import ASurface from '@/components/ui/ASurface.vue'
import ATextField from '@/components/ui/ATextField.vue'
import LanguageSwitcher from '@/components/shared/LanguageSwitcher.vue'
import ThemeSwitcher from '@/components/shared/ThemeSwitcher.vue'
import { useAuthStore } from '@/stores/auth'
import aforoSymbol from '@/assets/brand/aforo-symbol.png'
import aforoWordmark from '@/assets/brand/aforo-wordmark.png'
import loginHeroImage from '@/assets/images/aforro-agency-restauramt-pexels-imgs.jpg'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const remember = ref(false)
const showPassword = ref(false)

const emailError = ref<string>()
const passwordError = ref<string>()
const bannerError = ref<string>()

const currentYear = computed(() => new Date().getFullYear())

function validateEmail(): void {
  if (!email.value.trim()) {
    emailError.value = t('auth.errors.fieldRequired')
    return
  }
  emailError.value = EMAIL_PATTERN.test(email.value) ? undefined : t('auth.errors.emailInvalid')
}

function validatePassword(): void {
  passwordError.value = password.value ? undefined : t('auth.errors.fieldRequired')
}

function validate(): boolean {
  validateEmail()
  validatePassword()
  return !emailError.value && !passwordError.value
}

async function onSubmit(): Promise<void> {
  if (auth.submitting) return

  bannerError.value = undefined
  if (!validate()) return

  try {
    await auth.login({ email: email.value, password: password.value, remember: remember.value })
    await router.push({ name: 'app-dashboard' })
  } catch (error) {
    const apiError = normalizeApiError(error)

    if (apiError.kind === 'validation' && apiError.fieldErrors) {
      emailError.value = apiError.fieldErrors.email?.[0]
      passwordError.value = apiError.fieldErrors.password?.[0]
      return
    }

    switch (apiError.kind) {
      case 'invalid_credentials':
        bannerError.value = t('auth.errors.invalidCredentials')
        break
      case 'rate_limited':
        bannerError.value = t('auth.errors.rateLimited')
        break
      case 'network':
        bannerError.value = t('auth.errors.network')
        break
      default:
        bannerError.value = t('auth.errors.generic')
    }
  }
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-background lg:flex-row">
    <!--
      Left panel (desktop/tablet only, ~60%): brand + restaurant context.
      bg-brand-panel is the theme-invariant near-black fallback (shows only
      if the image fails to load) — the real content is the restaurant
      photograph (src/assets/images/), object-cover'd and framed on the
      group of people (the photo is much wider than this column, so cover
      crops the sides — object-position keeps the faces/table in frame
      instead of centering blindly). A warm/dark scrim sits on top for
      legibility, and the two --brand-glow blobs add the AFORO orange
      ambient light called for in the design system on top of the photo.
    -->
    <div
      class="relative hidden overflow-hidden bg-brand-panel px-10 py-10 lg:flex lg:w-3/5 lg:flex-col lg:justify-between xl:px-16 xl:py-14"
    >
      <img
        :src="loginHeroImage"
        alt=""
        aria-hidden="true"
        class="absolute inset-0 h-full w-full object-cover object-[58%_38%]"
      />
      <div aria-hidden="true" class="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/65 via-black/40 to-black/85" />
      <div
        aria-hidden="true"
        class="pointer-events-none absolute -right-32 -top-32 h-[34rem] w-[34rem] opacity-40 mix-blend-screen blur-3xl"
        style="background: var(--brand-glow)"
      />
      <div
        aria-hidden="true"
        class="pointer-events-none absolute -bottom-40 -left-24 h-[30rem] w-[30rem] opacity-30 mix-blend-screen blur-3xl"
        style="background: var(--brand-glow)"
      />

      <!--
        Symbol, not the wordmark, here: the wordmark's chroma-keyed edges were
        cut for sitting on the flat near-black panel and show a visible halo
        once placed over a busy, variable-brightness photo. The compact
        circular mark holds up over any part of the image; a soft drop-shadow
        (not a filter on the mark's own pixels) keeps it legible regardless
        of what's behind it.
      -->
      <img :src="aforoSymbol" alt="AFORO" class="relative z-10 h-30 w-30 drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]" />

      <div class="relative z-10 flex flex-col gap-6">
        <div class="flex flex-col gap-3">
          <p class="max-w-md whitespace-pre-line text-headline font-semibold text-on-brand-panel">
            {{ t('auth.heroTitle') }}
          </p>
          <p class="max-w-sm text-body-lg text-on-brand-panel/75">{{ t('auth.heroSubtitle') }}</p>
        </div>

        <div class="max-w-sm rounded-lg border border-white/10 bg-white/5 p-5 text-on-brand-panel backdrop-blur-sm">
          <div class="flex items-center gap-2">
            <PhShareNetwork :size="18" class="text-primary" />
            <span class="text-title-md font-medium">{{ t('auth.highlightTitle') }}</span>
          </div>
          <p class="mt-1.5 text-body-md text-on-brand-panel/70">{{ t('auth.highlightText') }}</p>
        </div>
      </div>
    </div>

    <!-- Right panel (~40%): the actual login, follows the active theme -->
    <div class="flex flex-1 flex-col lg:w-2/5">
      <div class="flex items-center justify-between px-6 pt-6 sm:px-10 lg:justify-end lg:px-12">
        <img :src="aforoWordmark" alt="AFORO" class="h-7 w-auto lg:hidden" />
        <div class="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeSwitcher />
        </div>
      </div>

      <div class="flex flex-1 flex-col items-center justify-center px-6 py-10 sm:px-10 lg:px-12">
        <div class="w-full max-w-sm">
          <h1 class="text-headline font-semibold text-on-surface">{{ t('auth.title') }}</h1>
          <p class="mt-1.5 text-body-md text-on-surface-variant">{{ t('auth.subtitle') }}</p>

          <ASurface
            v-if="bannerError"
            tone="container"
            radius="md"
            role="alert"
            class="mt-6 border border-error/40 bg-error-container px-4 py-3 text-body-md text-on-error-container"
          >
            {{ bannerError }}
          </ASurface>

          <form class="mt-6 flex flex-col gap-5" novalidate @submit.prevent="onSubmit">
            <ATextField
              v-model="email"
              :label="t('auth.emailLabel')"
              type="email"
              inputmode="email"
              autocomplete="email"
              required
              :placeholder="t('auth.emailPlaceholder')"
              :error="emailError"
              @blur="validateEmail"
            >
              <template #leading>
                <PhEnvelopeSimple :size="20" />
              </template>
            </ATextField>

            <ATextField
              v-model="password"
              :label="t('auth.passwordLabel')"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              required
              :error="passwordError"
              @blur="validatePassword"
            >
              <template #leading>
                <PhLockSimple :size="20" />
              </template>
              <template #trailing>
                <AIconButton
                  :label="showPassword ? t('auth.hidePassword') : t('auth.showPassword')"
                  @click="showPassword = !showPassword"
                >
                  <PhEyeSlash v-if="showPassword" :size="20" />
                  <PhEye v-else :size="20" />
                </AIconButton>
              </template>
            </ATextField>

            <label class="flex min-h-11 items-center gap-3 text-body-md text-on-surface-variant">
              <input
                v-model="remember"
                type="checkbox"
                class="h-5 w-5 accent-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              />
              {{ t('auth.rememberMe') }}
            </label>

            <AButton type="submit" full-width :loading="auth.submitting">
              {{ auth.submitting ? t('auth.submitting') : t('auth.submit') }}
              <template #trailing>
                <PhArrowRight :size="18" />
              </template>
            </AButton>
          </form>
        </div>
      </div>

      <footer class="px-6 pb-6 text-center text-label-md text-on-surface-variant sm:px-10 lg:px-12">
        {{ t('auth.footer', { year: currentYear }) }}
      </footer>
    </div>
  </div>
</template>
