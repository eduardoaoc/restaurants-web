<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhWhatsappLogo } from '@phosphor-icons/vue'
import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ATextField from '@/components/ui/ATextField.vue'
import AToggle from '@/components/ui/AToggle.vue'
import SectionCard from '@/components/dashboard/SectionCard.vue'
import { useDayCloseWhatsAppSettings } from '@/composables/useDayCloseWhatsAppSettings'
import { usePermissions } from '@/composables/usePermissions'
import { useRestaurantStore } from '@/stores/restaurant'
import { whatsappErrorKey } from '@/utils/day-close-whatsapp'

const { t } = useI18n()
const { can } = usePermissions()
const restaurant = useRestaurantStore()
const state = useDayCloseWhatsAppSettings(() => can('manage_restaurants'))
const editing = ref(false)
const changingPhone = ref(false)
const name = ref('')
const phone = ref('')
const consent = ref(false)
const submitted = ref(false)
const saved = ref(false)
const consentId = useId()
const recipient = computed(() => state.settings.value?.recipient)
const needsConsent = computed(() => changingPhone.value || !recipient.value?.consent_given_at || recipient.value.consent_text_version !== state.settings.value?.consent_text_version)
const phoneError = computed(() => (submitted.value && changingPhone.value && !/^\+[1-9]\d{7,14}$/.test(phone.value.trim())) || state.saveError.value?.fieldErrors?.['recipient.phone'] ? t('dayClose.whatsapp.settings.phoneInvalid') : undefined)
const nameError = computed(() => (submitted.value && (!name.value.trim() || name.value.trim().length > 100)) || state.saveError.value?.fieldErrors?.['recipient.name'] ? t('dayClose.whatsapp.settings.nameInvalid') : undefined)
const consentError = computed(() => (submitted.value && needsConsent.value && !consent.value) || state.saveError.value?.fieldErrors?.['recipient.consent_confirmed'] ? t('dayClose.whatsapp.errors.consent') : undefined)
const banner = computed(() => {
  const err = state.saveError.value
  if (!err) return null
  if (err.fieldErrors?.enabled) return t('dayClose.whatsapp.settings.enableRequiresRecipient')
  if (err.kind === 'validation' && (phoneError.value || nameError.value || consentError.value)) return null
  return t(whatsappErrorKey(err))
})
function resetEditor(): void {
  editing.value = false; changingPhone.value = false; name.value = ''; phone.value = ''; consent.value = false; submitted.value = false; saved.value = false
}
watch(() => restaurant.currentRestaurantId, resetEditor, { flush: 'sync' })
watch(phone, () => { consent.value = false })
watch([name, phone, consent], () => { state.saveError.value = null })
function edit(change: boolean): void {
  name.value = recipient.value?.name ?? ''
  phone.value = ''
  changingPhone.value = change || !recipient.value
  consent.value = false
  submitted.value = false
  state.saveError.value = null
  saved.value = false
  editing.value = true
}
function cancel(): void { if (!state.saving.value) { resetEditor(); state.saveError.value = null } }
async function save(): Promise<void> {
  if (state.saving.value || !state.settings.value) return
  submitted.value = true
  if (phoneError.value || nameError.value || consentError.value) return
  const ok = await state.update({ enabled: state.settings.value.enabled, recipient: {
    name: name.value.trim(), user_id: recipient.value?.linked_user_id ?? null,
    ...(changingPhone.value ? { phone: phone.value.trim() } : {}),
    ...(needsConsent.value ? { consent_confirmed: consent.value } : {}),
  } })
  if (ok) { resetEditor(); saved.value = true }
}
async function toggle(value: boolean): Promise<void> {
  const current = state.settings.value
  if (!current || editing.value || (value && !current.available)) return
  saved.value = false
  const ok = await state.update({ enabled: value, recipient: current.recipient ? { name: current.recipient.name, user_id: current.recipient.linked_user_id } : null })
  if (ok) saved.value = true
}
</script>
<template>
  <SectionCard v-if="can('manage_restaurants')" :icon="PhWhatsappLogo" :title="t('dayClose.whatsapp.settings.title')">
    <p class="text-body-md text-on-surface-variant">{{ t('dayClose.whatsapp.settings.description') }}</p>
    <AProgress v-if="state.loading.value" class="mt-4" />
    <div v-else-if="state.error.value" class="mt-4">
      <p class="text-body-md text-error" role="alert">{{ t(whatsappErrorKey(state.error.value)) }}</p>
      <AButton variant="outlined" class="mt-3" @click="state.load">{{ t('dayClose.refresh') }}</AButton>
    </div>
    <template v-else-if="state.settings.value">
      <p v-if="!state.settings.value.available" class="mt-4 rounded-lg bg-surface-container-high p-3 text-body-md text-on-surface-variant" role="status">{{ t('dayClose.whatsapp.settings.unavailable') }}</p>
      <p class="mt-3 text-label-lg text-on-surface-variant">{{ t('dayClose.whatsapp.settings.states.' + state.settings.value.status) }}</p>
      <AToggle class="mt-3" :model-value="state.settings.value.enabled" :label="t('dayClose.whatsapp.settings.toggle')" :disabled="state.saving.value || editing || (!state.settings.value.available && !state.settings.value.enabled)" @update:model-value="toggle" />
      <div class="mt-4 border-t border-outline-variant pt-4">
        <p class="text-label-lg text-on-surface-variant">{{ t('dayClose.whatsapp.settings.recipient') }}</p>
        <template v-if="recipient">
          <p class="mt-1 break-words text-body-lg font-medium text-on-surface">{{ recipient.name }}</p>
          <p class="text-body-md text-on-surface-variant">{{ recipient.phone_masked }}</p>
          <p class="mt-1 text-label-md text-on-surface-variant">{{ t(recipient.consent_given_at && recipient.consent_text_version === state.settings.value.consent_text_version ? 'dayClose.whatsapp.settings.consentRecorded' : 'dayClose.whatsapp.errors.consent') }}</p>
        </template>
        <p v-else class="mt-1 text-body-md text-on-surface-variant">{{ t('dayClose.whatsapp.settings.noRecipient') }}</p>
        <div v-if="!editing" class="mt-3 flex flex-wrap gap-2">
          <AButton variant="outlined" :disabled="state.saving.value" @click="edit(false)">{{ t('dayClose.whatsapp.settings.edit') }}</AButton>
          <AButton v-if="recipient" variant="text" :disabled="state.saving.value" @click="edit(true)">{{ t('dayClose.whatsapp.settings.changePhone') }}</AButton>
        </div>
        <form v-else class="mt-4 flex max-w-lg flex-col gap-4" @submit.prevent="save">
          <ATextField v-model="name" :label="t('dayClose.whatsapp.settings.name')" :error="nameError" :disabled="state.saving.value" required />
          <AButton v-if="!changingPhone" variant="text" class="self-start" :disabled="state.saving.value" @click="changingPhone = true; consent = false">{{ t('dayClose.whatsapp.settings.changePhone') }}</AButton>
          <ATextField v-if="changingPhone" v-model="phone" type="tel" inputmode="tel" autocomplete="off" :label="t('dayClose.whatsapp.settings.phone')" :help-text="t('dayClose.whatsapp.settings.phoneHelper')" :error="phoneError" :disabled="state.saving.value" required />
          <div v-if="needsConsent">
            <label :for="consentId" class="flex min-h-11 items-start gap-3 text-body-md text-on-surface">
              <input :id="consentId" v-model="consent" type="checkbox" :disabled="state.saving.value" :aria-describedby="consentError ? consentId + '-error' : undefined" :aria-invalid="!!consentError" class="mt-1 h-5 w-5 shrink-0 accent-primary" />
              {{ t('dayClose.whatsapp.settings.consent') }}
            </label>
            <p v-if="consentError" :id="consentId + '-error'" class="mt-1 text-label-md text-error" role="alert">{{ consentError }}</p>
          </div>
          <div class="flex flex-wrap gap-3">
            <AButton type="submit" :loading="state.saving.value">{{ t('settings.saveChanges') }}</AButton>
            <AButton variant="outlined" :disabled="state.saving.value" @click="cancel">{{ t('common.cancel') }}</AButton>
          </div>
        </form>
      </div>
      <p v-if="banner" class="mt-3 text-body-md text-error" role="alert">{{ banner }}</p>
      <p v-if="saved" class="mt-3 text-label-lg text-on-surface-variant" role="status">{{ t('settings.saved') }}</p>
    </template>
  </SectionCard>
</template>
