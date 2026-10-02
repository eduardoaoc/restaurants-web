<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  PhArrowSquareOut,
  PhBuildings,
  PhCaretDown,
  PhCaretRight,
  PhCheckCircle,
  PhCircleDashed,
  PhFloppyDisk,
  PhGear,
  PhStar,
  PhStorefront,
} from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import ATextField from '@/components/ui/ATextField.vue'
import AToggle from '@/components/ui/AToggle.vue'
import { AVAILABLE_LOCALES, LOCALE_LABEL, type AppLocale } from '@/i18n'
import { useOrganizationSettings } from '@/composables/useOrganizationSettings'
import { usePermissions } from '@/composables/usePermissions'
import { useRestaurantSettings } from '@/composables/useRestaurantSettings'
import { describeApiError } from '@/utils/error-message'
import { RESTAURANT_SETTINGS_SUPPORTED_CURRENCIES, type UpdateRestaurantSettingsPayload } from '@/types/restaurant'

/**
 * "Ajustes" (Passo 2.10) — the minimal admin surface an Owner/Manager needs
 * before the first pilot: their organization's name, this restaurant's
 * name, and this restaurant's real operational settings. Three
 * independently-gated, independently-saved sections, never one giant form
 * — see CLAUDE.md's own "don't build a giant settings panel" framing for
 * this Passo.
 */
const { t } = useI18n()
const { can, canOrganization, refreshAuthContext } = usePermissions()

const canManageOrganization = computed(() => canOrganization('manage_organization'))
const canManageRestaurant = computed(() => can('manage_restaurants'))
const hasAnyAccess = computed(() => canManageOrganization.value || canManageRestaurant.value)

const org = useOrganizationSettings(() => canManageOrganization.value)
const restaurantSettings = useRestaurantSettings(() => canManageRestaurant.value)

watch(canManageOrganization, () => void org.load(), { immediate: true })

/** IANA time zone names the runtime itself knows about — never a hand-typed list (Passo 2.10 §11). */
const TIMEZONES: string[] = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []

/* ---------------------------------------------------------------- Organization ---------------------------------------------------------------- */

const orgName = ref('')
const orgSaved = ref(false)

watch(
  () => org.organization.value,
  (value) => {
    orgName.value = value?.name ?? ''
    orgSaved.value = false
  },
)

const orgDirty = computed(() => org.organization.value !== null && orgName.value.trim() !== org.organization.value.name)
const orgNameError = computed(() => org.saveError.value?.fieldErrors?.name?.[0])
const orgBannerError = computed(() => {
  if (!org.saveError.value || org.saveError.value.kind !== 'validation') return org.saveError.value ? describeApiError(org.saveError.value, t) : null
  return org.saveError.value.fieldErrors?.name ? null : describeApiError(org.saveError.value, t)
})

async function saveOrganization(): Promise<void> {
  if (!orgDirty.value) return
  orgSaved.value = false
  const error = await org.update({ name: orgName.value.trim() })
  if (!error) orgSaved.value = true
}

/* ----------------------------------------------------------------- Restaurant ----------------------------------------------------------------- */

const restaurantName = ref('')
const profileSaved = ref(false)

watch(
  () => restaurantSettings.restaurant.value,
  (value) => {
    restaurantName.value = value?.name ?? ''
    profileSaved.value = false
  },
)

const profileDirty = computed(
  () => restaurantSettings.restaurant.value !== null && restaurantName.value.trim() !== restaurantSettings.restaurant.value.name,
)
const profileNameError = computed(() => restaurantSettings.profileSaveError.value?.fieldErrors?.name?.[0])
const profileBannerError = computed(() => {
  const err = restaurantSettings.profileSaveError.value
  if (!err) return null
  if (err.kind === 'validation' && err.fieldErrors?.name) return null
  return describeApiError(err, t)
})

async function saveProfile(): Promise<void> {
  if (!profileDirty.value) return
  profileSaved.value = false
  // `applied` is false when the user switched restaurants before this
  // PATCH resolved (race-condition fix) — never flash "saved" for a
  // response that belonged to a restaurant that isn't this form anymore.
  const { error, applied } = await restaurantSettings.updateProfile({ name: restaurantName.value.trim() })
  if (!error && applied) profileSaved.value = true
}

/* ------------------------------------------------------------- Operational settings ------------------------------------------------------------- */

interface OperationalForm {
  default_locale: string
  enabled_locales: AppLocale[]
  currency: string
  timezone: string
  customer_ordering_enabled: boolean
  customer_order_requires_approval: boolean
  waiter_call_enabled: boolean
  bill_request_enabled: boolean
  kitchen_ticket_printing_enabled: boolean
  bill_receipt_printing_enabled: boolean
  waiter_table_management_enabled: boolean
}

function emptyOperationalForm(): OperationalForm {
  return {
    default_locale: '',
    enabled_locales: [],
    currency: '',
    timezone: '',
    customer_ordering_enabled: false,
    customer_order_requires_approval: false,
    waiter_call_enabled: false,
    bill_request_enabled: false,
    kitchen_ticket_printing_enabled: false,
    bill_receipt_printing_enabled: false,
    waiter_table_management_enabled: true,
  }
}

const operationalForm = ref<OperationalForm>(emptyOperationalForm())
const operationalOriginal = ref<OperationalForm | null>(null)
const settingsSaved = ref(false)
/** Own-call-only error ref — see its full docblock further down, by `saveOperational`. */
const operationalSaveError = ref<ApiError | null>(null)

watch(
  () => restaurantSettings.settings.value,
  (value) => {
    settingsSaved.value = false
    operationalSaveError.value = null
    if (!value) {
      operationalOriginal.value = null
      operationalForm.value = emptyOperationalForm()
      return
    }
    const seeded: OperationalForm = {
      default_locale: value.default_locale,
      enabled_locales: [...(value.enabled_locales as AppLocale[])],
      currency: value.currency,
      timezone: value.timezone,
      customer_ordering_enabled: value.customer_ordering_enabled,
      customer_order_requires_approval: value.customer_order_requires_approval,
      waiter_call_enabled: value.waiter_call_enabled,
      bill_request_enabled: value.bill_request_enabled,
      kitchen_ticket_printing_enabled: value.kitchen_ticket_printing_enabled,
      bill_receipt_printing_enabled: value.bill_receipt_printing_enabled,
      waiter_table_management_enabled: value.waiter_table_management_enabled,
    }
    operationalOriginal.value = seeded
    operationalForm.value = { ...seeded, enabled_locales: [...seeded.enabled_locales] }
  },
  { immediate: true },
)

const settingsDirty = computed(() => {
  const original = operationalOriginal.value
  if (!original) return false
  const current = operationalForm.value
  return (
    original.default_locale !== current.default_locale ||
    original.currency !== current.currency ||
    original.timezone !== current.timezone ||
    original.customer_ordering_enabled !== current.customer_ordering_enabled ||
    original.customer_order_requires_approval !== current.customer_order_requires_approval ||
    original.waiter_call_enabled !== current.waiter_call_enabled ||
    original.bill_request_enabled !== current.bill_request_enabled ||
    original.kitchen_ticket_printing_enabled !== current.kitchen_ticket_printing_enabled ||
    original.bill_receipt_printing_enabled !== current.bill_receipt_printing_enabled ||
    original.waiter_table_management_enabled !== current.waiter_table_management_enabled ||
    [...original.enabled_locales].sort().join(',') !== [...current.enabled_locales].sort().join(',')
  )
})

/**
 * The same invariant the backend enforces atomically (Passo 2.10 — see
 * UpdateRestaurantSettingsRequest::withValidator): the default locale can
 * never be unchecked from the enabled set. Enforced here too so the user
 * gets an immediate, obvious reason instead of a round-trip 422.
 */
function toggleEnabledLocale(loc: AppLocale): void {
  if (loc === operationalForm.value.default_locale) return
  const set = new Set(operationalForm.value.enabled_locales)
  if (set.has(loc)) set.delete(loc)
  else set.add(loc)
  operationalForm.value.enabled_locales = [...set]
}

function setDefaultLocale(loc: string): void {
  operationalForm.value.default_locale = loc
  if (!operationalForm.value.enabled_locales.includes(loc as AppLocale)) {
    operationalForm.value.enabled_locales = [...operationalForm.value.enabled_locales, loc as AppLocale]
  }
}

/**
 * `operationalSaveError` (declared above, next to `settingsSaved`) is
 * deliberately local, own-call-only — NOT `restaurantSettings.
 * settingsSaveError` — because Carta 5.3B added a second, independent
 * caller of the same `updateSettings()`/"settings" domain (Google Reviews
 * below), and that shared ref is written by BOTH callers regardless of
 * which one is currently reading it. Reading it directly here would leak
 * a Google Reviews validation error into this card's banner (and vice
 * versa) any time the two happened to be used back to back. Capturing
 * each save's own `{error, applied}` result into a section-local ref is
 * what actually isolates them; `restaurantSettings.savingSettings`
 * (shared) is still fine to read for the loading/disabled state, since
 * blocking a second concurrent PATCH for the same restaurant+"settings"
 * key is the correct, intentional behaviour, not a leak.
 */
function settingsFieldError(key: string): string | undefined {
  return operationalSaveError.value?.fieldErrors?.[key]?.[0]
}

const settingsBannerError = computed(() => {
  const err = operationalSaveError.value
  if (!err) return null
  const handled = new Set(['default_locale', 'enabled_locales', 'currency', 'timezone'])
  if (err.kind === 'validation') {
    const keys = Object.keys(err.fieldErrors ?? {})
    return keys.every((key) => handled.has(key)) ? null : describeApiError(err, t)
  }
  return describeApiError(err, t)
})

async function saveOperational(): Promise<void> {
  if (!settingsDirty.value) return
  settingsSaved.value = false
  operationalSaveError.value = null
  // Captured BEFORE the PATCH — the toggle's own CURRENT (pre-save) state is
  // what every other open session's auth context still reflects; comparing
  // against it after the fact is what decides whether this save is one that
  // actually needs a context refresh (CARTA 8.2B §8/§9), not just any save.
  const tableManagementChanged =
    operationalOriginal.value?.waiter_table_management_enabled !== operationalForm.value.waiter_table_management_enabled
  const payload: UpdateRestaurantSettingsPayload = { ...operationalForm.value }
  // Same race-condition guard as saveProfile: only celebrate a save that
  // was actually applied to the restaurant currently on screen.
  const { error, applied } = await restaurantSettings.updateSettings(payload)
  if (!applied) return
  if (error) {
    operationalSaveError.value = error
    return
  }
  settingsSaved.value = true
  // §9: the admin's OWN session keeps can_manage_table_structure true
  // regardless (manage_floor_plan already makes it unconditional) — this
  // refresh is for THIS tab's own permission-derived UI to stay consistent
  // with the setting it just changed, never a realtime push to anyone
  // else's session (§9 "não inventar realtime para setting").
  if (tableManagementChanged) void refreshAuthContext()
}

/* ----------------------------------------------------------------- Google Reviews ----------------------------------------------------------------- */

/**
 * Independently-saved (Carta 5.3B), same one-card-per-domain philosophy as
 * Organization/Restaurant profile above — deliberately NOT folded into
 * `operationalForm`, even though it shares the same PATCH endpoint and the
 * same `restaurantSettings.settings` source, so saving the link never
 * requires (or risks) resending unrelated operational fields, and vice
 * versa.
 *
 * `googleReviewSaveError` is its OWN local ref, populated only from this
 * section's own `updateSettings()` call result — never read from the
 * shared `restaurantSettings.settingsSaveError` the operational form
 * writes to, which would otherwise leak an unrelated (e.g. timezone)
 * validation error into this card or vice versa. The shared
 * `restaurantSettings.savingSettings` IS still consulted (see
 * `saveGoogleReview`/the Save button's `:disabled`) purely to block a
 * concurrent PATCH — the composable's single-flight lock is per
 * restaurant+"settings" domain, not per field, so a click here while the
 * operational form is mid-save would otherwise be silently dropped.
 */
const googleReviewUrlDraft = ref('')
const googleReviewSaved = ref(false)
const savingGoogleReview = ref(false)
const googleReviewSaveError = ref<ApiError | null>(null)
const googleReviewTutorialOpen = ref(false)

watch(
  () => restaurantSettings.settings.value,
  (value) => {
    googleReviewSaved.value = false
    googleReviewSaveError.value = null
    googleReviewUrlDraft.value = value?.google_review_url ?? ''
  },
)

/** The last value the BACKEND confirmed — never the draft (§9 "Testar link" must never open an unvalidated draft). */
const savedGoogleReviewUrl = computed(() => restaurantSettings.settings.value?.google_review_url ?? null)
const googleReviewConfigured = computed(() => savedGoogleReviewUrl.value !== null)
const googleReviewDirty = computed(() => googleReviewUrlDraft.value !== (savedGoogleReviewUrl.value ?? ''))
const canTestGoogleReviewLink = computed(
  () => savedGoogleReviewUrl.value !== null && !googleReviewDirty.value && !restaurantSettings.savingSettings.value,
)

/**
 * Never the backend's raw field message (always English, see
 * `GoogleReviewUrl` validation rule) — the allowlist itself is NOT
 * duplicated here (§8), only a generic, localized "not a supported
 * format" text, shown whenever this field failed validation regardless
 * of the backend's exact wording.
 */
const googleReviewFieldError = computed(() =>
  googleReviewSaveError.value?.fieldErrors?.google_review_url ? t('settings.googleReview.invalidUrl') : undefined,
)
const googleReviewBannerError = computed(() => {
  const err = googleReviewSaveError.value
  if (!err) return null
  if (err.kind === 'validation' && err.fieldErrors?.google_review_url) return null
  return describeApiError(err, t)
})

async function saveGoogleReview(): Promise<void> {
  if (!googleReviewDirty.value || restaurantSettings.savingSettings.value) return
  googleReviewSaved.value = false
  googleReviewSaveError.value = null
  savingGoogleReview.value = true
  // Sent exactly as typed (trimmed only by the AText field's own browser
  // behaviour, never here) — the backend owns trim/blank-to-null/scheme
  // normalization AND the allowlist itself (§7/§8); the form is
  // resynchronized from its authoritative response via the watcher above.
  const { error, applied } = await restaurantSettings.updateSettings({ google_review_url: googleReviewUrlDraft.value })
  savingGoogleReview.value = false
  if (!applied) return
  if (error) googleReviewSaveError.value = error
  else googleReviewSaved.value = true
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h2 class="text-headline font-bold text-on-surface">{{ t('settings.pageTitle') }}</h2>
      <p class="mt-1.5 text-body-md text-on-surface-variant">{{ t('settings.pageSubtitle') }}</p>
    </div>

    <ASurface v-if="!hasAnyAccess" tone="container" radius="lg" class="max-w-xl p-6">
      <p class="text-title-md font-medium text-on-surface">{{ t('settings.noAccess') }}</p>
    </ASurface>

    <div v-else class="flex max-w-3xl flex-col gap-6">
      <!-- Organization -->
      <ASurface v-if="canManageOrganization" tone="container" radius="lg" bordered elevated class="p-6">
        <div class="flex items-center gap-2 text-on-surface">
          <PhBuildings :size="20" class="text-on-surface-variant" />
          <h3 class="text-title-lg font-semibold">{{ t('settings.organization.title') }}</h3>
        </div>
        <p class="mt-1 text-body-md text-on-surface-variant">{{ t('settings.organization.subtitle') }}</p>

        <div v-if="org.loading.value" class="mt-4 flex items-center gap-2 text-on-surface-variant">
          <AProgress size="sm" />
        </div>
        <ASurface v-else-if="org.error.value" tone="container" radius="md" role="alert" class="mt-4 border border-error/40 bg-error-container p-4 text-on-error-container">
          {{ describeApiError(org.error.value, t) }}
        </ASurface>
        <form v-else class="mt-4 flex flex-col gap-4" @submit.prevent="saveOrganization">
          <ATextField
            v-model="orgName"
            class="max-w-md"
            :label="t('settings.organization.nameLabel')"
            :error="orgNameError"
            :disabled="org.saving.value"
            required
          />
          <p v-if="orgBannerError" class="text-label-md text-error" role="alert">{{ orgBannerError }}</p>
          <div class="flex items-center gap-3">
            <AButton type="submit" :loading="org.saving.value" :disabled="!orgDirty">
              <template #leading><PhFloppyDisk :size="16" /></template>
              {{ t('settings.saveChanges') }}
            </AButton>
            <p v-if="orgSaved && !orgDirty" class="text-label-lg text-on-surface-variant">{{ t('settings.saved') }}</p>
          </div>
        </form>
      </ASurface>

      <!-- Restaurant profile -->
      <ASurface v-if="canManageRestaurant" tone="container" radius="lg" bordered elevated class="p-6">
        <div class="flex items-center gap-2 text-on-surface">
          <PhStorefront :size="20" class="text-on-surface-variant" />
          <h3 class="text-title-lg font-semibold">{{ t('settings.restaurant.title') }}</h3>
        </div>
        <p class="mt-1 text-body-md text-on-surface-variant">{{ t('settings.restaurant.subtitle') }}</p>

        <div v-if="restaurantSettings.loading.value" class="mt-4 flex items-center gap-2 text-on-surface-variant">
          <AProgress size="sm" />
        </div>
        <ASurface v-else-if="restaurantSettings.error.value" tone="container" radius="md" role="alert" class="mt-4 border border-error/40 bg-error-container p-4 text-on-error-container">
          {{ describeApiError(restaurantSettings.error.value, t) }}
        </ASurface>
        <template v-else>
          <form class="mt-4 flex flex-col gap-4" @submit.prevent="saveProfile">
            <ATextField
              v-model="restaurantName"
              class="max-w-md"
              :label="t('settings.restaurant.nameLabel')"
              :error="profileNameError"
              :disabled="restaurantSettings.savingProfile.value"
              required
            />
            <p v-if="profileBannerError" class="text-label-md text-error" role="alert">{{ profileBannerError }}</p>
            <div class="flex items-center gap-3">
              <AButton type="submit" :loading="restaurantSettings.savingProfile.value" :disabled="!profileDirty">
                <template #leading><PhFloppyDisk :size="16" /></template>
                {{ t('settings.saveChanges') }}
              </AButton>
              <p v-if="profileSaved && !profileDirty" class="text-label-lg text-on-surface-variant">{{ t('settings.saved') }}</p>
            </div>
          </form>
        </template>
      </ASurface>

      <!-- Operational settings -->
      <ASurface v-if="canManageRestaurant && !restaurantSettings.loading.value && !restaurantSettings.error.value" tone="container" radius="lg" bordered elevated class="p-6">
        <div class="flex items-center gap-2 text-on-surface">
          <PhGear :size="20" class="text-on-surface-variant" />
          <h3 class="text-title-lg font-semibold">{{ t('settings.operational.title') }}</h3>
        </div>
        <p class="mt-1 text-body-md text-on-surface-variant">{{ t('settings.operational.subtitle') }}</p>

        <form class="mt-5 flex flex-col gap-6" @submit.prevent="saveOperational">
          <fieldset class="flex flex-col gap-3">
            <legend class="text-label-lg font-semibold text-on-surface">{{ t('settings.operational.localeGroup') }}</legend>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div class="flex flex-col gap-1.5">
                <label for="settings-default-locale" class="text-label-lg font-medium text-on-surface-variant">
                  {{ t('settings.operational.defaultLocaleLabel') }}
                </label>
                <select
                  id="settings-default-locale"
                  :value="operationalForm.default_locale"
                  :disabled="restaurantSettings.savingSettings.value"
                  class="min-h-11 w-full rounded-lg border border-outline bg-surface-container-lowest px-3 text-body-lg text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-[0.38]"
                  @change="setDefaultLocale(($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="loc in AVAILABLE_LOCALES" :key="loc" :value="loc">{{ LOCALE_LABEL[loc] }}</option>
                </select>
                <p v-if="settingsFieldError('default_locale')" class="text-label-md text-error" role="alert">
                  {{ settingsFieldError('default_locale') }}
                </p>
              </div>

              <div class="flex flex-col gap-1.5">
                <label for="settings-currency" class="text-label-lg font-medium text-on-surface-variant">
                  {{ t('settings.operational.currencyLabel') }}
                </label>
                <select
                  id="settings-currency"
                  v-model="operationalForm.currency"
                  :disabled="restaurantSettings.savingSettings.value"
                  class="min-h-11 w-full rounded-lg border border-outline bg-surface-container-lowest px-3 text-body-lg text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-[0.38]"
                >
                  <option v-for="c in RESTAURANT_SETTINGS_SUPPORTED_CURRENCIES" :key="c" :value="c">{{ c }}</option>
                </select>
                <p v-if="settingsFieldError('currency')" class="text-label-md text-error" role="alert">
                  {{ settingsFieldError('currency') }}
                </p>
              </div>
            </div>

            <div class="flex flex-col gap-1.5">
              <p class="text-label-lg font-medium text-on-surface-variant">{{ t('settings.operational.enabledLocalesLabel') }}</p>
              <div class="flex flex-wrap gap-x-6 gap-y-2">
                <label
                  v-for="loc in AVAILABLE_LOCALES"
                  :key="loc"
                  class="flex min-h-11 items-center gap-2 text-body-lg text-on-surface"
                  :class="loc === operationalForm.default_locale ? 'opacity-[0.7]' : ''"
                >
                  <input
                    type="checkbox"
                    class="h-5 w-5 rounded border-outline text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    :checked="operationalForm.enabled_locales.includes(loc)"
                    :disabled="restaurantSettings.savingSettings.value || loc === operationalForm.default_locale"
                    @change="toggleEnabledLocale(loc)"
                  />
                  {{ LOCALE_LABEL[loc] }}
                </label>
              </div>
              <p class="text-label-md text-on-surface-variant">{{ t('settings.operational.enabledLocalesHelp') }}</p>
              <p v-if="settingsFieldError('enabled_locales')" class="text-label-md text-error" role="alert">
                {{ settingsFieldError('enabled_locales') }}
              </p>
            </div>
          </fieldset>

          <fieldset class="flex flex-col gap-1.5">
            <legend class="text-label-lg font-semibold text-on-surface">{{ t('settings.operational.timezoneGroup') }}</legend>
            <label for="settings-timezone" class="sr-only">{{ t('settings.operational.timezoneLabel') }}</label>
            <select
              id="settings-timezone"
              v-model="operationalForm.timezone"
              :disabled="restaurantSettings.savingSettings.value"
              class="min-h-11 w-full max-w-md rounded-lg border border-outline bg-surface-container-lowest px-3 text-body-lg text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-[0.38]"
            >
              <option v-if="operationalForm.timezone && !TIMEZONES.includes(operationalForm.timezone)" :value="operationalForm.timezone">
                {{ operationalForm.timezone }}
              </option>
              <option v-for="tz in TIMEZONES" :key="tz" :value="tz">{{ tz }}</option>
            </select>
            <p class="text-label-md text-on-surface-variant">{{ t('settings.operational.timezoneHelp') }}</p>
            <p v-if="settingsFieldError('timezone')" class="text-label-md text-error" role="alert">
              {{ settingsFieldError('timezone') }}
            </p>
          </fieldset>

          <fieldset class="flex flex-col divide-y divide-outline-variant">
            <legend class="pb-2 text-label-lg font-semibold text-on-surface">{{ t('settings.operational.ordersGroup') }}</legend>
            <AToggle
              v-model="operationalForm.customer_ordering_enabled"
              :label="t('settings.operational.customerOrderingEnabled')"
              :description="t('settings.operational.customerOrderingEnabledHelp')"
              :disabled="restaurantSettings.savingSettings.value"
            />
            <AToggle
              v-model="operationalForm.customer_order_requires_approval"
              :label="t('settings.operational.customerOrderRequiresApproval')"
              :description="t('settings.operational.customerOrderRequiresApprovalHelp')"
              :disabled="restaurantSettings.savingSettings.value"
            />
            <AToggle
              v-model="operationalForm.waiter_call_enabled"
              :label="t('settings.operational.waiterCallEnabled')"
              :description="t('settings.operational.waiterCallEnabledHelp')"
              :disabled="restaurantSettings.savingSettings.value"
            />
            <AToggle
              v-model="operationalForm.bill_request_enabled"
              :label="t('settings.operational.billRequestEnabled')"
              :description="t('settings.operational.billRequestEnabledHelp')"
              :disabled="restaurantSettings.savingSettings.value"
            />
          </fieldset>

          <fieldset class="flex flex-col divide-y divide-outline-variant">
            <legend class="pb-2 text-label-lg font-semibold text-on-surface">{{ t('settings.operational.tablesGroup') }}</legend>
            <AToggle
              v-model="operationalForm.waiter_table_management_enabled"
              :label="t('settings.operational.waiterTableManagementEnabled')"
              :description="t('settings.operational.waiterTableManagementEnabledHelp')"
              :disabled="restaurantSettings.savingSettings.value"
            />
          </fieldset>

          <fieldset class="flex flex-col divide-y divide-outline-variant">
            <legend class="pb-2 text-label-lg font-semibold text-on-surface">{{ t('settings.operational.printingGroup') }}</legend>
            <AToggle
              v-model="operationalForm.kitchen_ticket_printing_enabled"
              :label="t('settings.operational.kitchenTicketPrintingEnabled')"
              :disabled="restaurantSettings.savingSettings.value"
            />
            <AToggle
              v-model="operationalForm.bill_receipt_printing_enabled"
              :label="t('settings.operational.billReceiptPrintingEnabled')"
              :disabled="restaurantSettings.savingSettings.value"
            />
          </fieldset>

          <p v-if="settingsBannerError" class="text-label-md text-error" role="alert">{{ settingsBannerError }}</p>

          <div class="flex items-center gap-3">
            <AButton type="submit" :loading="restaurantSettings.savingSettings.value" :disabled="!settingsDirty">
              <template #leading><PhFloppyDisk :size="16" /></template>
              {{ t('settings.saveChanges') }}
            </AButton>
            <p v-if="settingsSaved && !settingsDirty" class="text-label-lg text-on-surface-variant">{{ t('settings.saved') }}</p>
          </div>
        </form>
      </ASurface>

      <!-- Google Reviews -->
      <ASurface
        v-if="canManageRestaurant && !restaurantSettings.loading.value && !restaurantSettings.error.value"
        tone="container"
        radius="lg"
        bordered
        elevated
        class="p-6"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2 text-on-surface">
            <PhStar :size="20" class="text-on-surface-variant" />
            <h3 class="text-title-lg font-semibold">{{ t('settings.googleReview.title') }}</h3>
          </div>
          <span class="inline-flex items-center gap-1.5 text-body-md text-on-surface">
            <PhCheckCircle v-if="googleReviewConfigured" :size="16" class="shrink-0 text-primary" aria-hidden="true" />
            <PhCircleDashed v-else :size="16" class="shrink-0 text-on-surface-variant" aria-hidden="true" />
            {{ googleReviewConfigured ? t('settings.googleReview.configured') : t('settings.googleReview.notConfigured') }}
          </span>
        </div>
        <p class="mt-1 text-body-md text-on-surface-variant">{{ t('settings.googleReview.subtitle') }}</p>

        <form class="mt-5 flex flex-col gap-4" @submit.prevent="saveGoogleReview">
          <ATextField
            v-model="googleReviewUrlDraft"
            class="max-w-lg"
            type="url"
            autocomplete="off"
            :label="t('settings.googleReview.urlLabel')"
            :placeholder="t('settings.googleReview.urlPlaceholder')"
            :help-text="!googleReviewFieldError ? t('settings.googleReview.urlHelp') : undefined"
            :error="googleReviewFieldError"
            :disabled="savingGoogleReview"
          />

          <p v-if="googleReviewBannerError" class="text-label-md text-error" role="alert">{{ googleReviewBannerError }}</p>

          <div class="flex flex-wrap items-center gap-3">
            <AButton type="submit" :loading="savingGoogleReview" :disabled="!googleReviewDirty || restaurantSettings.savingSettings.value">
              <template #leading><PhFloppyDisk :size="16" /></template>
              {{ t('settings.saveChanges') }}
            </AButton>

            <a
              v-if="canTestGoogleReviewLink"
              :href="savedGoogleReviewUrl ?? undefined"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex min-h-11 items-center gap-2 rounded-lg border border-outline px-6 text-label-lg font-medium text-on-surface hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {{ t('settings.googleReview.testLink') }}
              <PhArrowSquareOut :size="16" aria-hidden="true" />
            </a>
            <button
              v-else
              type="button"
              disabled
              class="inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-lg border border-outline px-6 text-label-lg font-medium text-on-surface opacity-[0.38]"
            >
              {{ t('settings.googleReview.testLink') }}
              <PhArrowSquareOut :size="16" aria-hidden="true" />
            </button>

            <p v-if="googleReviewSaved && !googleReviewDirty" class="text-label-lg text-on-surface-variant">{{ t('settings.saved') }}</p>
          </div>

          <p v-if="googleReviewDirty && savedGoogleReviewUrl !== null" class="text-label-md text-on-surface-variant">
            {{ t('settings.googleReview.testLinkUnsavedHint') }}
          </p>

          <p class="text-label-md text-on-surface-variant">{{ t('settings.googleReview.effectNote') }}</p>
        </form>

        <div class="mt-5 border-t border-outline-variant pt-4">
          <button
            type="button"
            class="flex min-h-11 w-full items-center justify-between gap-3 text-left text-label-lg font-medium text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :aria-expanded="googleReviewTutorialOpen"
            aria-controls="google-review-tutorial"
            @click="googleReviewTutorialOpen = !googleReviewTutorialOpen"
          >
            {{ t('settings.googleReview.tutorial.trigger') }}
            <PhCaretDown v-if="googleReviewTutorialOpen" :size="18" class="shrink-0 text-on-surface-variant" aria-hidden="true" />
            <PhCaretRight v-else :size="18" class="shrink-0 text-on-surface-variant" aria-hidden="true" />
          </button>
          <div v-if="googleReviewTutorialOpen" id="google-review-tutorial" class="mt-3 flex flex-col gap-2 text-body-md text-on-surface-variant">
            <ol class="list-decimal space-y-1.5 pl-5">
              <li>{{ t('settings.googleReview.tutorial.step1') }}</li>
              <li>{{ t('settings.googleReview.tutorial.step2') }}</li>
              <li>{{ t('settings.googleReview.tutorial.step3') }}</li>
              <li>{{ t('settings.googleReview.tutorial.step4') }}</li>
              <li>{{ t('settings.googleReview.tutorial.step5') }}</li>
            </ol>
            <p class="text-label-md">{{ t('settings.googleReview.tutorial.recommendation') }}</p>
          </div>
        </div>
      </ASurface>
    </div>
  </div>
</template>
