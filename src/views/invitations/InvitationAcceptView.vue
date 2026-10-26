<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { PhEnvelopeSimple, PhEye, PhEyeSlash, PhStorefront, PhWarningCircle } from '@phosphor-icons/vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import LanguageSwitcher from '@/components/shared/LanguageSwitcher.vue'
import ThemeSwitcher from '@/components/shared/ThemeSwitcher.vue'
import AButton from '@/components/ui/AButton.vue'
import AIconButton from '@/components/ui/AIconButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import ATextField from '@/components/ui/ATextField.vue'
import { authService } from '@/services/auth.service'
import { invitationsService } from '@/services/invitations.service'
import { useAuthStore } from '@/stores/auth'
import { describeApiError } from '@/utils/error-message'
import { formatDateTime } from '@/utils/format'
import { takeUrlSecret } from '@/utils/url-secret'
import { staffRoleLabelKey } from '@/utils/staff'
import type { InvitationPreview } from '@/types/invitation'
import aforoWordmark from '@/assets/brand/aforo-wordmark.png'

/**
 * /invitation#token=... — the invitee's page.
 *
 * The token is read ONCE from the URL fragment (which no server ever
 * receives), kept only in this component's memory and immediately removed
 * from the address bar/history. It is sent only in POST bodies. Preview
 * never consumes the invitation; acceptance is an explicit button.
 *
 * New account → name + password (+ confirmation). Existing account → the
 * current password of THAT account (the backend picks the account from the
 * invitation's e-mail; this page never sends an e-mail). A session of a
 * different person is shown as a mismatch with a sign-out action — never
 * silently replaced.
 */
type PageState = 'loading' | 'ready' | 'invalid' | 'expired' | 'revoked' | 'used' | 'missing' | 'network'

const { t, locale } = useI18n()
const router = useRouter()
const auth = useAuthStore()

let token = ''
const state = ref<PageState>('loading')
const preview = ref<InvitationPreview | null>(null)

const name = ref('')
const password = ref('')
const passwordConfirmation = ref('')
const passwordVisible = ref(false)
const submitting = ref(false)
const submitError = ref<ApiError | null>(null)
const localErrors = ref<Record<string, string>>({})
const signingOut = ref(false)

function readTokenFromFragment(): string {
  // Already moved out of the address bar by src/utils/url-secret.ts.
  return takeUrlSecret('/invitation')?.get('token') ?? ''
}

const PAGE_STATE_BY_CODE: Record<string, PageState> = {
  INVITATION_NOT_FOUND: 'invalid',
  INVITATION_EXPIRED: 'expired',
  INVITATION_REVOKED: 'revoked',
  INVITATION_ALREADY_ACCEPTED: 'used',
}

function stateFromError(error: ApiError): PageState | null {
  if (error.code && PAGE_STATE_BY_CODE[error.code]) return PAGE_STATE_BY_CODE[error.code]
  if (error.kind === 'not_found') return 'invalid'
  return null
}

async function loadPreview(): Promise<void> {
  state.value = 'loading'
  try {
    // Preview is a POST on the stateful SPA surface (token in the body,
    // never the URL), so it needs the Sanctum CSRF cookie first.
    await authService.csrf()
    preview.value = await invitationsService.preview(token)
    name.value = preview.value.name ?? ''
    state.value = 'ready'
  } catch (err) {
    const error = normalizeApiError(err)
    state.value = stateFromError(error) ?? 'network'
  }
}

onMounted(() => {
  token = readTokenFromFragment()
  if (!token) {
    state.value = 'missing'
    return
  }
  void loadPreview()
})

const sessionMismatch = computed(
  () => preview.value !== null && auth.user !== null && auth.user.email.toLowerCase() !== preview.value.email.toLowerCase(),
)

const roleLabel = computed(() => (preview.value ? t(staffRoleLabelKey(preview.value.role)) : ''))
const intro = computed(() => {
  if (!preview.value) return ''
  const key = preview.value.type === 'owner' ? 'invitation.ownerIntro' : 'invitation.staffIntro'
  return t(key, { organization: preview.value.organization.name })
})

function fieldError(key: string): string | undefined {
  if (localErrors.value[key]) return localErrors.value[key]
  if (submitError.value?.kind !== 'validation') return undefined
  const message = submitError.value.fieldErrors?.[key]?.[0]
  if (!message) return undefined
  if (key === 'password' && /incorrect/i.test(message)) return t('invitation.errors.passwordIncorrect')
  if (key === 'password' && /8/.test(message)) return t('invitation.errors.passwordMin')
  if (key === 'password' && /confirm/i.test(message)) return t('invitation.errors.passwordMismatch')
  return message
}

const bannerError = computed(() => {
  const error = submitError.value
  if (!error) return null
  if (error.kind === 'validation' && !error.code) return null
  return describeApiError(error, t)
})

function validate(): boolean {
  const errors: Record<string, string> = {}
  if (preview.value?.account_exists) {
    if (!password.value) errors.password = t('invitation.errors.passwordRequired')
  } else {
    if (!name.value.trim()) errors.name = t('invitation.errors.nameRequired')
    if (password.value.length < 8) errors.password = t('invitation.errors.passwordMin')
    else if (password.value !== passwordConfirmation.value) errors.password_confirmation = t('invitation.errors.passwordMismatch')
  }
  localErrors.value = errors
  return Object.keys(errors).length === 0
}

async function submit(): Promise<void> {
  if (submitting.value || !preview.value || sessionMismatch.value) return
  if (!validate()) return

  submitting.value = true
  submitError.value = null
  try {
    await authService.csrf()
    if (preview.value.account_exists) {
      await invitationsService.acceptExisting(token, password.value)
    } else {
      await invitationsService.acceptNew(token, name.value.trim(), password.value, passwordConfirmation.value)
    }
    token = ''
    password.value = ''
    passwordConfirmation.value = ''
    await auth.adoptAcceptedSession()
    await router.replace({ name: 'app-dashboard' })
  } catch (err) {
    const error = normalizeApiError(err)
    const pageState = stateFromError(error)
    if (pageState) state.value = pageState
    else submitError.value = error
    // The account type may have changed meanwhile (another tab created it).
    if (error.code === 'INVITATION_ACCOUNT_EXISTS' && preview.value) preview.value = { ...preview.value, account_exists: true }
    if (error.code === 'INVITATION_ACCOUNT_REQUIRED' && preview.value) preview.value = { ...preview.value, account_exists: false }
  } finally {
    submitting.value = false
  }
}

async function signOutCurrent(): Promise<void> {
  if (signingOut.value) return
  signingOut.value = true
  try {
    await auth.logout()
  } finally {
    signingOut.value = false
  }
}

const stateMessageKey = computed(() => `invitation.states.${state.value === 'missing' ? 'missingToken' : state.value}`)
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
        <h1 class="text-headline font-semibold text-on-surface">{{ t('invitation.pageTitle') }}</h1>

        <div v-if="state === 'loading'" class="mt-8 flex items-center gap-3 text-body-md text-on-surface-variant" role="status">
          <AProgress size="sm" />
          {{ t('invitation.loading') }}
        </div>

        <ASurface
          v-else-if="state !== 'ready'"
          tone="container"
          radius="lg"
          bordered
          role="alert"
          class="mt-6 flex flex-col gap-4 p-5"
        >
          <div class="flex items-start gap-3">
            <PhWarningCircle :size="22" class="mt-0.5 shrink-0 text-error" aria-hidden="true" />
            <p class="text-body-lg text-on-surface">{{ t(stateMessageKey) }}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <AButton v-if="state === 'network'" @click="loadPreview">{{ t('auth.retry') }}</AButton>
            <AButton variant="outlined" @click="router.push({ name: 'login' })">{{ t('invitation.goToLogin') }}</AButton>
          </div>
        </ASurface>

        <template v-else-if="preview">
          <ASurface tone="container" radius="lg" bordered elevated class="mt-6 p-5">
            <div class="flex items-start gap-3">
              <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
                <PhStorefront :size="22" aria-hidden="true" />
              </span>
              <p class="text-title-md font-medium text-on-surface">{{ intro }}</p>
            </div>
            <dl class="mt-4 grid gap-3 text-body-md">
              <div>
                <dt class="text-label-md text-on-surface-variant">{{ t('invitation.roleLabel') }}</dt>
                <dd class="text-on-surface">{{ roleLabel }}</dd>
              </div>
              <div v-if="preview.restaurants.length">
                <dt class="text-label-md text-on-surface-variant">{{ t('invitation.restaurantsLabel') }}</dt>
                <dd class="text-on-surface">{{ preview.restaurants.map((r) => r.name).join(', ') }}</dd>
              </div>
              <div>
                <dt class="text-label-md text-on-surface-variant">{{ t('invitation.emailLabel') }}</dt>
                <dd class="flex items-center gap-1.5 break-all text-on-surface">
                  <PhEnvelopeSimple :size="16" aria-hidden="true" class="shrink-0" />{{ preview.email }}
                </dd>
              </div>
              <div>
                <dt class="text-label-md text-on-surface-variant">{{ t('invitation.expiresLabel') }}</dt>
                <dd class="text-on-surface">{{ formatDateTime(preview.expires_at, locale) }}</dd>
              </div>
            </dl>
          </ASurface>

          <ASurface v-if="sessionMismatch" tone="container" radius="lg" bordered role="alert" class="mt-4 flex flex-col gap-3 p-5">
            <p class="text-title-md font-medium text-on-surface">{{ t('invitation.mismatchTitle') }}</p>
            <p class="text-body-md text-on-surface-variant">{{ t('invitation.mismatchText', { email: preview.email }) }}</p>
            <AButton class="self-start" :loading="signingOut" @click="signOutCurrent">{{ t('invitation.signOut') }}</AButton>
          </ASurface>

          <form v-else class="mt-6 flex flex-col gap-4" novalidate @submit.prevent="submit">
            <div>
              <h2 class="text-title-lg font-semibold text-on-surface">
                {{ preview.account_exists ? t('invitation.existingAccountTitle') : t('invitation.newAccountTitle') }}
              </h2>
              <p class="mt-1 text-body-md text-on-surface-variant">
                {{ preview.account_exists ? t('invitation.existingAccountHelp') : t('invitation.newAccountHelp') }}
              </p>
            </div>

            <!-- Hidden username field so password managers file the right account. -->
            <input type="email" :value="preview.email" autocomplete="username" class="sr-only" tabindex="-1" aria-hidden="true" readonly />

            <ATextField
              v-if="!preview.account_exists"
              v-model="name"
              :label="t('invitation.nameLabel')"
              :error="fieldError('name')"
              :disabled="submitting"
              autocomplete="name"
              required
            />

            <div class="flex items-end gap-2">
              <ATextField
                v-model="password"
                class="flex-1"
                :label="preview.account_exists ? t('invitation.currentPasswordLabel') : t('invitation.passwordLabel')"
                :help-text="preview.account_exists ? undefined : t('invitation.newPasswordHelp')"
                :error="fieldError('password')"
                :disabled="submitting"
                :type="passwordVisible ? 'text' : 'password'"
                :autocomplete="preview.account_exists ? 'current-password' : 'new-password'"
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
              v-if="!preview.account_exists"
              v-model="passwordConfirmation"
              :label="t('invitation.passwordConfirmLabel')"
              :error="fieldError('password_confirmation')"
              :disabled="submitting"
              :type="passwordVisible ? 'text' : 'password'"
              autocomplete="new-password"
              required
            />

            <p v-if="bannerError" class="text-body-md text-error" role="alert">{{ bannerError }}</p>

            <!-- Recovery never accepts the invitation: after resetting, the person
                 opens this same e-mail link again and accepts with the new password. -->
            <RouterLink v-if="preview.account_exists" :to="{ name: 'forgot-password' }" class="inline-flex min-h-11 items-center self-start rounded-full px-3 text-label-lg font-medium text-primary hover:bg-primary-container/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              {{ t('passwordReset.forgotLink') }}
            </RouterLink>

            <AButton type="submit" full-width :loading="submitting">
              {{ submitting ? t('invitation.accepting') : t('invitation.accept') }}
            </AButton>
          </form>
        </template>
      </div>
    </main>
  </div>
</template>
