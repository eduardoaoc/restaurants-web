<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhBuildings, PhCheckCircle, PhMagnifyingGlass, PhPlus } from '@phosphor-icons/vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import InvitationItem from '@/components/invitations/InvitationItem.vue'
import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import ATextField from '@/components/ui/ATextField.vue'
import { usePermissions } from '@/composables/usePermissions'
import { LOCALE_LABEL, type AppLocale } from '@/i18n'
import { platformService } from '@/services/platform.service'
import { describeApiError } from '@/utils/error-message'
import { slugify } from '@/utils/slugify'
import type { Invitation, OnboardingPayload, OnboardingResult, PlatformOrganizationOption } from '@/types/invitation'

/**
 * Platform "Alta de restaurante": manual onboarding by a platform admin
 * (POST /platform/restaurants), then the owner invitation's state with
 * resend/revoke. The backend owns every rule (permissions, slugs, platform
 * accounts, idempotency); this screen only collects the minimum and shows
 * the authoritative result.
 *
 * Double submit / retry: one Idempotency-Key per form draft. A retry of the
 * same draft (e.g. after a network failure) reuses the key, so the backend
 * replays instead of creating a second restaurant; editing the form mints a
 * new key.
 */
type Mode = 'new' | 'existing'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Spain-first product: peninsular/Balearic time and the Canary Islands.
const TIMEZONES = ['Europe/Madrid', 'Atlantic/Canary'] as const
const LOCALES: AppLocale[] = ['es-ES', 'ca-ES-valencia', 'en-GB']

const { t } = useI18n()
const { canPlatform } = usePermissions()
const fieldId = useId()

const canOnboard = computed(() => canPlatform('create_platform_restaurants'))
const canPickExisting = computed(() => canPlatform('manage_platform_organizations'))

const mode = ref<Mode>('new')
const organizationName = ref('')
const organizationSlug = ref('')
const organizationSlugTouched = ref(false)
const restaurantName = ref('')
const restaurantSlug = ref('')
const restaurantSlugTouched = ref(false)
const timezone = ref<string>(TIMEZONES[0])
const defaultLocale = ref<AppLocale>('es-ES')
const ownerEmail = ref('')
const ownerName = ref('')

const organizationQuery = ref('')
const organizationOptions = ref<PlatformOrganizationOption[]>([])
const organizationId = ref<number | null>(null)
const organizationsLoading = ref(false)

const submitting = ref(false)
const submitError = ref<ApiError | null>(null)
const localErrors = ref<Record<string, string>>({})
const result = ref<OnboardingResult | null>(null)

let idempotencyKey = newKey()

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

watch(organizationName, (value) => { if (!organizationSlugTouched.value) organizationSlug.value = slugify(value) })
watch(restaurantName, (value) => { if (!restaurantSlugTouched.value) restaurantSlug.value = slugify(value) })

// Any change to what would be sent is a new draft → new key.
watch(
  [mode, organizationName, organizationSlug, organizationId, restaurantName, restaurantSlug, timezone, defaultLocale, ownerEmail, ownerName],
  () => {
    if (!submitting.value) idempotencyKey = newKey()
  },
)

// Editing a field clears that field's own client-side message.
const FIELD_KEYS: [() => unknown, string[]][] = [
  [() => organizationName.value, ['organization.name']],
  [() => organizationSlug.value, ['organization.slug']],
  [() => organizationId.value, ['organization_id']],
  [() => restaurantName.value, ['restaurant.name']],
  [() => restaurantSlug.value, ['restaurant.slug']],
  [() => ownerEmail.value, ['owner.email']],
]
for (const [source, keys] of FIELD_KEYS) {
  watch(source, () => {
    if (keys.some((key) => key in localErrors.value)) {
      localErrors.value = Object.fromEntries(Object.entries(localErrors.value).filter(([key]) => !keys.includes(key)))
    }
  })
}

let searchController: AbortController | null = null
let searchTimer: ReturnType<typeof setTimeout> | null = null

async function searchOrganizations(): Promise<void> {
  searchController?.abort()
  const controller = new AbortController()
  searchController = controller
  organizationsLoading.value = true
  try {
    const items = await platformService.searchOrganizations(organizationQuery.value.trim(), controller.signal)
    if (!controller.signal.aborted) organizationOptions.value = items.filter((item) => item.status !== 'suspended')
  } catch {
    if (!controller.signal.aborted) organizationOptions.value = []
  } finally {
    if (!controller.signal.aborted) organizationsLoading.value = false
  }
}

watch(organizationQuery, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { void searchOrganizations() }, 300)
})
watch(mode, (value) => {
  submitError.value = null
  localErrors.value = {}
  if (value === 'existing' && organizationOptions.value.length === 0) void searchOrganizations()
})

function fieldError(key: string): string | undefined {
  if (localErrors.value[key]) return localErrors.value[key]
  if (submitError.value?.kind !== 'validation') return undefined
  const message = submitError.value.fieldErrors?.[key]?.[0]
  if (!message) return undefined
  if (/taken/i.test(message)) return t('platform.onboarding.errors.slugTaken')
  if (/platform administrator/i.test(message)) return t('platform.onboarding.errors.platformOwner')
  return message
}

const bannerError = computed(() => {
  const error = submitError.value
  if (!error) return null
  if (error.code === 'IDEMPOTENCY_KEY_REUSED') return t('platform.onboarding.errors.idempotency')
  if (error.kind === 'validation') {
    const handled = ['organization.name', 'organization.slug', 'organization_id', 'restaurant.name', 'restaurant.slug', 'owner.email', 'owner.name', 'owner']
    const unhandled = Object.keys(error.fieldErrors ?? {}).filter((key) => !handled.includes(key))
    return unhandled.length > 0 ? describeApiError(error, t) : null
  }
  return describeApiError(error, t)
})

function validate(): boolean {
  const errors: Record<string, string> = {}
  const required = t('platform.onboarding.errors.required')
  if (mode.value === 'new') {
    if (!organizationName.value.trim()) errors['organization.name'] = required
    if (!SLUG_PATTERN.test(organizationSlug.value)) errors['organization.slug'] = t('platform.onboarding.errors.slug')
    if (!EMAIL_PATTERN.test(ownerEmail.value.trim())) errors['owner.email'] = t('platform.onboarding.errors.email')
  } else if (organizationId.value === null) {
    errors.organization_id = t('platform.onboarding.errors.organizationRequired')
  }
  if (!restaurantName.value.trim()) errors['restaurant.name'] = required
  if (!SLUG_PATTERN.test(restaurantSlug.value)) errors['restaurant.slug'] = t('platform.onboarding.errors.slug')
  localErrors.value = errors
  return Object.keys(errors).length === 0
}

function buildPayload(): OnboardingPayload {
  const restaurant = {
    name: restaurantName.value.trim(),
    slug: restaurantSlug.value,
    timezone: timezone.value,
    default_locale: defaultLocale.value,
  }
  if (mode.value === 'existing' && organizationId.value !== null) {
    return { organization_id: organizationId.value, restaurant }
  }
  return {
    organization: { name: organizationName.value.trim(), slug: organizationSlug.value },
    restaurant,
    owner: { email: ownerEmail.value.trim(), ...(ownerName.value.trim() ? { name: ownerName.value.trim() } : {}) },
  }
}

async function submit(): Promise<void> {
  if (submitting.value || !validate()) return
  submitting.value = true
  submitError.value = null
  try {
    result.value = await platformService.onboard(buildPayload(), idempotencyKey)
    void loadRecent()
  } catch (err) {
    submitError.value = normalizeApiError(err)
  } finally {
    submitting.value = false
  }
}

function reset(): void {
  result.value = null
  submitError.value = null
  localErrors.value = {}
  organizationName.value = ''
  organizationSlug.value = ''
  organizationSlugTouched.value = false
  restaurantName.value = ''
  restaurantSlug.value = ''
  restaurantSlugTouched.value = false
  ownerEmail.value = ''
  ownerName.value = ''
  organizationId.value = null
  idempotencyKey = newKey()
}

// Owner invitations (recent) + per-invitation actions.
const recent = ref<Invitation[]>([])
const recentLoading = ref(false)
const recentError = ref<ApiError | null>(null)
const busyId = ref<number | null>(null)
const itemErrors = ref<Record<number, ApiError | null>>({})
let recentController: AbortController | null = null

async function loadRecent(): Promise<void> {
  recentController?.abort()
  const controller = new AbortController()
  recentController = controller
  recentLoading.value = recent.value.length === 0
  recentError.value = null
  try {
    const items = await platformService.listOwnerInvitations(controller.signal)
    if (!controller.signal.aborted) recent.value = items
  } catch (err) {
    if (!controller.signal.aborted) recentError.value = normalizeApiError(err)
  } finally {
    if (!controller.signal.aborted) recentLoading.value = false
  }
}

function applyInvitation(updated: Invitation): void {
  recent.value = recent.value.some((item) => item.id === updated.id)
    ? recent.value.map((item) => (item.id === updated.id ? updated : item))
    : [updated, ...recent.value]
  if (result.value?.owner_invitation?.id === updated.id) {
    result.value = { ...result.value, owner_invitation: updated }
  }
}

async function act(invitation: Invitation, action: 'resend' | 'revoke'): Promise<void> {
  if (busyId.value !== null) return
  busyId.value = invitation.id
  itemErrors.value = { ...itemErrors.value, [invitation.id]: null }
  try {
    const updated = action === 'resend'
      ? await platformService.resendOwnerInvitation(invitation.id)
      : await platformService.revokeOwnerInvitation(invitation.id)
    applyInvitation(updated)
  } catch (err) {
    itemErrors.value = { ...itemErrors.value, [invitation.id]: normalizeApiError(err) }
  } finally {
    busyId.value = null
  }
}

// Recovery after a revoked/expired owner invitation (e.g. mistyped address):
// a NEW invitation for the same organization, refused server-side once it
// has an active owner.
const reinviteFor = ref<Invitation | null>(null)
const reinviteEmail = ref('')
const reinviteSaving = ref(false)
const reinviteError = ref<ApiError | null>(null)

function startReinvite(invitation: Invitation): void {
  reinviteFor.value = invitation
  reinviteEmail.value = invitation.email
  reinviteError.value = null
}

async function submitReinvite(): Promise<void> {
  const target = reinviteFor.value
  if (!target?.organization || reinviteSaving.value) return
  if (!EMAIL_PATTERN.test(reinviteEmail.value.trim())) {
    reinviteError.value = { kind: 'validation', fieldErrors: { email: [t('platform.onboarding.errors.email')] } }
    return
  }
  reinviteSaving.value = true
  reinviteError.value = null
  try {
    const created = await platformService.inviteOwner(target.organization.id, reinviteEmail.value.trim())
    applyInvitation(created)
    reinviteFor.value = null
  } catch (err) {
    reinviteError.value = normalizeApiError(err)
  } finally {
    reinviteSaving.value = false
  }
}

onMounted(() => { if (canOnboard.value) void loadRecent() })
onBeforeUnmount(() => {
  recentController?.abort()
  searchController?.abort()
  if (searchTimer) clearTimeout(searchTimer)
})

const selectClass =
  'mt-1.5 min-h-11 w-full rounded-lg border border-outline bg-surface-container-lowest px-3 text-body-lg text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-[0.38]'
</script>

<template>
  <div class="mx-auto flex max-w-6xl flex-col gap-6">
    <div>
      <h1 class="text-headline font-bold text-on-surface">{{ t('platform.onboarding.pageTitle') }}</h1>
      <p class="mt-1.5 max-w-2xl text-body-md text-on-surface-variant">{{ t('platform.onboarding.pageSubtitle') }}</p>
    </div>

    <ASurface v-if="!canOnboard" tone="container" radius="lg" role="alert" class="max-w-xl p-6">
      <p class="text-title-md font-medium text-on-surface">{{ t('platform.onboarding.forbidden') }}</p>
    </ASurface>

    <div v-else class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <!-- Result summary -->
      <ASurface v-if="result" tone="container" radius="lg" bordered elevated class="flex flex-col gap-4 p-5 sm:p-6" role="status">
        <div class="flex items-start gap-3">
          <PhCheckCircle :size="26" class="shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h2 class="text-title-lg font-semibold text-on-surface">{{ t('platform.onboarding.successTitle') }}</h2>
            <p v-if="result.replayed" class="mt-1 text-body-md text-on-surface-variant">{{ t('platform.onboarding.replayed') }}</p>
          </div>
        </div>
        <dl class="grid gap-3 text-body-md sm:grid-cols-2">
          <div>
            <dt class="text-label-md text-on-surface-variant">
              {{ result.organization.created ? t('platform.onboarding.organizationCreated') : t('platform.onboarding.organizationExisting') }}
            </dt>
            <dd class="text-on-surface">{{ result.organization.name }} <span class="text-on-surface-variant">· {{ result.organization.slug }}</span></dd>
          </div>
          <div>
            <dt class="text-label-md text-on-surface-variant">{{ t('platform.onboarding.restaurantSection') }}</dt>
            <dd class="text-on-surface">{{ result.restaurant.name }} <span class="text-on-surface-variant">· {{ result.restaurant.slug }}</span></dd>
          </div>
          <div class="sm:col-span-2">
            <dd class="text-on-surface-variant">
              {{ t('platform.onboarding.settingsSummary', {
                timezone: result.restaurant.timezone,
                currency: result.restaurant.currency,
                language: LOCALE_LABEL[result.restaurant.default_locale as AppLocale] ?? result.restaurant.default_locale,
              }) }}
            </dd>
          </div>
        </dl>

        <div class="border-t border-outline-variant pt-3">
          <h3 class="text-title-md font-medium text-on-surface">{{ t('platform.onboarding.invitationTitle') }}</h3>
          <InvitationItem
            v-if="result.owner_invitation"
            :invitation="result.owner_invitation"
            :busy="busyId === result.owner_invitation.id"
            :error="itemErrors[result.owner_invitation.id] ?? null"
            @resend="act(result.owner_invitation, 'resend')"
            @revoke="act(result.owner_invitation, 'revoke')"
          />
          <p v-else class="mt-1 text-body-md text-on-surface-variant">{{ t('platform.onboarding.noInvitation') }}</p>
          <p v-if="result.owner_invitation" class="mt-1 text-label-md text-on-surface-variant">{{ t('invitations.deliveryHelp') }}</p>
        </div>

        <AButton variant="outlined" class="self-start" @click="reset">
          <template #leading><PhPlus :size="16" /></template>
          {{ t('platform.onboarding.createAnother') }}
        </AButton>
      </ASurface>

      <!-- Form -->
      <ASurface v-else tone="container" radius="lg" bordered class="p-5 sm:p-6">
        <form class="flex flex-col gap-5" novalidate @submit.prevent="submit">
          <fieldset v-if="canPickExisting" class="flex flex-col gap-2">
            <legend class="text-label-lg font-medium text-on-surface-variant">{{ t('platform.onboarding.modeLabel') }}</legend>
            <div class="inline-flex w-full flex-wrap gap-2 sm:w-auto" role="radiogroup">
              <label
                v-for="value in (['new', 'existing'] as Mode[])"
                :key="value"
                class="inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-label-lg font-medium has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary"
                :class="mode === value ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-high text-on-surface-variant'"
              >
                <input v-model="mode" type="radio" class="sr-only" :value="value" :disabled="submitting" />
                {{ value === 'new' ? t('platform.onboarding.modeNew') : t('platform.onboarding.modeExisting') }}
              </label>
            </div>
          </fieldset>

          <section class="flex flex-col gap-3">
            <h2 class="text-title-md font-medium text-on-surface">{{ t('platform.onboarding.organizationSection') }}</h2>
            <template v-if="mode === 'new'">
              <ATextField v-model="organizationName" :label="t('platform.onboarding.organizationName')" :error="fieldError('organization.name')" :disabled="submitting" required />
              <ATextField
                v-model="organizationSlug"
                :label="t('platform.onboarding.organizationSlug')"
                :help-text="t('platform.onboarding.slugHelp')"
                :error="fieldError('organization.slug')"
                :disabled="submitting"
                required
                @input="organizationSlugTouched = true"
              />
            </template>
            <template v-else>
              <ATextField v-model="organizationQuery" :label="t('platform.onboarding.organizationSearch')" :placeholder="t('platform.onboarding.organizationSearchPlaceholder')" :disabled="submitting">
                <template #leading><PhMagnifyingGlass :size="18" /></template>
              </ATextField>
              <div>
                <label :for="`${fieldId}-org`" class="text-label-lg font-medium text-on-surface-variant">{{ t('platform.onboarding.organizationPick') }}</label>
                <select :id="`${fieldId}-org`" v-model="organizationId" :class="selectClass" :disabled="submitting || organizationsLoading">
                  <option :value="null" disabled>{{ organizationOptions.length ? t('platform.onboarding.organizationPick') : t('platform.onboarding.organizationNone') }}</option>
                  <option v-for="option in organizationOptions" :key="option.id" :value="option.id">{{ option.name }} · {{ option.slug }}</option>
                </select>
                <p v-if="fieldError('organization_id')" class="mt-1 text-label-md text-error" role="alert">{{ fieldError('organization_id') }}</p>
                <p class="mt-1.5 flex items-start gap-1.5 text-label-md text-on-surface-variant">
                  <PhBuildings :size="16" class="mt-px shrink-0" aria-hidden="true" />{{ t('platform.onboarding.existingHelp') }}
                </p>
              </div>
            </template>
          </section>

          <section class="flex flex-col gap-3">
            <h2 class="text-title-md font-medium text-on-surface">{{ t('platform.onboarding.restaurantSection') }}</h2>
            <ATextField v-model="restaurantName" :label="t('platform.onboarding.restaurantName')" :error="fieldError('restaurant.name')" :disabled="submitting" required />
            <ATextField
              v-model="restaurantSlug"
              :label="t('platform.onboarding.restaurantSlug')"
              :help-text="t('platform.onboarding.slugHelp')"
              :error="fieldError('restaurant.slug')"
              :disabled="submitting"
              required
              @input="restaurantSlugTouched = true"
            />
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label :for="`${fieldId}-tz`" class="text-label-lg font-medium text-on-surface-variant">{{ t('platform.onboarding.timezone') }}</label>
                <select :id="`${fieldId}-tz`" v-model="timezone" :class="selectClass" :disabled="submitting">
                  <option v-for="zone in TIMEZONES" :key="zone" :value="zone">{{ zone }}</option>
                </select>
              </div>
              <div>
                <label :for="`${fieldId}-locale`" class="text-label-lg font-medium text-on-surface-variant">{{ t('platform.onboarding.language') }}</label>
                <select :id="`${fieldId}-locale`" v-model="defaultLocale" :class="selectClass" :disabled="submitting">
                  <option v-for="code in LOCALES" :key="code" :value="code">{{ LOCALE_LABEL[code] }}</option>
                </select>
              </div>
            </div>
            <p class="text-label-md text-on-surface-variant">{{ t('platform.onboarding.currencyNote') }}</p>
          </section>

          <section v-if="mode === 'new'" class="flex flex-col gap-3">
            <h2 class="text-title-md font-medium text-on-surface">{{ t('platform.onboarding.ownerSection') }}</h2>
            <ATextField
              v-model="ownerEmail"
              type="email"
              inputmode="email"
              autocomplete="off"
              :label="t('platform.onboarding.ownerEmail')"
              :help-text="t('platform.onboarding.ownerEmailHelp')"
              :error="fieldError('owner.email')"
              :disabled="submitting"
              required
            />
            <ATextField v-model="ownerName" autocomplete="off" :label="t('platform.onboarding.ownerName')" :error="fieldError('owner.name')" :disabled="submitting" />
          </section>

          <p v-if="bannerError" class="text-body-md text-error" role="alert">{{ bannerError }}</p>

          <AButton type="submit" class="self-start" :loading="submitting">
            {{ submitting ? t('platform.onboarding.submitting') : t('platform.onboarding.submit') }}
          </AButton>
        </form>
      </ASurface>

      <!-- Recent owner invitations -->
      <ASurface tone="container" radius="lg" bordered class="h-fit p-5">
        <h2 class="text-title-md font-medium text-on-surface">{{ t('platform.onboarding.recentTitle') }}</h2>
        <div v-if="recentLoading" class="flex justify-center py-6"><AProgress size="sm" /></div>
        <p v-else-if="recentError" class="mt-3 text-body-md text-error" role="alert">{{ t('platform.onboarding.recentError') }}</p>
        <p v-else-if="recent.length === 0" class="mt-3 text-body-md text-on-surface-variant">{{ t('platform.onboarding.recentEmpty') }}</p>
        <ul v-else class="mt-1 divide-y divide-outline-variant">
          <li v-for="invitation in recent" :key="invitation.id">
            <InvitationItem
              :invitation="invitation"
              :context="invitation.organization?.name"
              :busy="busyId === invitation.id"
              :error="itemErrors[invitation.id] ?? null"
              @resend="act(invitation, 'resend')"
              @revoke="act(invitation, 'revoke')"
            />
            <div v-if="invitation.state === 'revoked'" class="pb-3">
              <AButton v-if="reinviteFor?.id !== invitation.id" variant="text" @click="startReinvite(invitation)">
                {{ t('platform.onboarding.reinvite') }}
              </AButton>
              <form v-else class="flex flex-col gap-2" novalidate @submit.prevent="submitReinvite">
                <ATextField
                  v-model="reinviteEmail"
                  type="email"
                  inputmode="email"
                  :label="t('platform.onboarding.ownerEmail')"
                  :error="reinviteError?.kind === 'validation' ? reinviteError.fieldErrors?.email?.[0] : undefined"
                  :disabled="reinviteSaving"
                />
                <p v-if="reinviteError && reinviteError.kind !== 'validation'" class="text-label-md text-error" role="alert">{{ describeApiError(reinviteError, t) }}</p>
                <div class="flex flex-wrap gap-2">
                  <AButton type="submit" :loading="reinviteSaving">{{ t('platform.onboarding.reinviteSubmit') }}</AButton>
                  <AButton variant="text" :disabled="reinviteSaving" @click="reinviteFor = null">{{ t('common.cancel') }}</AButton>
                </div>
              </form>
            </div>
          </li>
        </ul>
      </ASurface>
    </div>
  </div>
</template>
