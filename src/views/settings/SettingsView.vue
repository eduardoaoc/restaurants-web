<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhBuildings, PhFloppyDisk, PhGear, PhStorefront } from '@phosphor-icons/vue'

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
const { can, canOrganization } = usePermissions()

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
  }
}

const operationalForm = ref<OperationalForm>(emptyOperationalForm())
const operationalOriginal = ref<OperationalForm | null>(null)
const settingsSaved = ref(false)

watch(
  () => restaurantSettings.settings.value,
  (value) => {
    settingsSaved.value = false
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

function settingsFieldError(key: string): string | undefined {
  return restaurantSettings.settingsSaveError.value?.fieldErrors?.[key]?.[0]
}

const settingsBannerError = computed(() => {
  const err = restaurantSettings.settingsSaveError.value
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
  const payload: UpdateRestaurantSettingsPayload = { ...operationalForm.value }
  // Same race-condition guard as saveProfile: only celebrate a save that
  // was actually applied to the restaurant currently on screen.
  const { error, applied } = await restaurantSettings.updateSettings(payload)
  if (!error && applied) settingsSaved.value = true
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
    </div>
  </div>
</template>
