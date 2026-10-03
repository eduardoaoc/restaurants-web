<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhWhatsappLogo } from '@phosphor-icons/vue'
import AButton from '@/components/ui/AButton.vue'
import ABottomSheet from '@/components/ui/ABottomSheet.vue'
import AProgress from '@/components/ui/AProgress.vue'
import SectionCard from '@/components/dashboard/SectionCard.vue'
import DayCloseWhatsAppBadge from '@/components/day-close/DayCloseWhatsAppBadge.vue'
import { useDayCloseDeliveries } from '@/composables/useDayCloseDeliveries'
import { useDayCloseWhatsAppResend } from '@/composables/useDayCloseWhatsAppResend'
import { useDayCloseWhatsAppSettings } from '@/composables/useDayCloseWhatsAppSettings'
import { usePermissions } from '@/composables/usePermissions'
import { useRestaurantStore } from '@/stores/restaurant'
import type { DayClose } from '@/types/day-close'
import type { DayCloseDelivery } from '@/types/day-close-whatsapp'
import { whatsappErrorKey, whatsappFailureKey } from '@/utils/day-close-whatsapp'

const props = defineProps<{ dayClose: DayClose }>()
const emit = defineEmits<{ resent: [] }>()
const { t, locale } = useI18n()
const { can } = usePermissions()
const restaurant = useRestaurantStore()
const allowed = () => can('view_daily_closes') && restaurant.currentRestaurantId === props.dayClose.restaurant_id
const history = useDayCloseDeliveries(() => props.dayClose.id, allowed)
const resend = useDayCloseWhatsAppResend(() => props.dayClose.id, allowed)
// Settings is permission-protected; viewers without manage_restaurants still may resend.
const settings = useDayCloseWhatsAppSettings(() => allowed() && can('manage_restaurants'))
const last = computed(() => history.deliveries.value.at(-1))
const status = computed(() => history.loaded.value ? last.value?.status : props.dayClose.whatsapp?.status)
const phone = computed(() => history.loaded.value ? last.value?.recipient?.phone_masked : props.dayClose.whatsapp?.recipient_phone_masked)
const kind = computed(() => history.loaded.value ? last.value?.kind : props.dayClose.whatsapp?.kind)
const summaryTime = computed(() => history.loaded.value ? null : props.dayClose.whatsapp?.updated_at)
const blocked = computed(() => settings.settings.value !== null && !settings.settings.value.available)
const timestampFields = ['queued_at', 'accepted_at', 'sent_at', 'delivered_at', 'read_at', 'failed_at'] as const
let disposed = false
onBeforeUnmount(() => { disposed = true })
function timestamps(delivery: DayCloseDelivery) {
  return timestampFields.flatMap(field => delivery[field] ? [{ field, value: delivery[field] }] : [])
}
function dateTime(value: string): string {
  const options: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short', timeZone: props.dayClose.timezone }
  try { return new Intl.DateTimeFormat(locale.value, options).format(new Date(value)) }
  catch { return new Intl.DateTimeFormat('es-ES', options).format(new Date(value)) }
}
async function confirm(): Promise<void> {
  const id = props.dayClose.id
  const restaurantId = restaurant.currentRestaurantId
  if (await resend.confirm()) {
    await history.refresh()
    if (!disposed && allowed() && id === props.dayClose.id && restaurantId === restaurant.currentRestaurantId) emit('resent')
  }
}
</script>
<template>
  <SectionCard v-if="allowed()" :icon="PhWhatsappLogo" :title="t('dayClose.whatsapp.title')">
    <div v-if="status" class="flex flex-wrap items-center gap-2" role="status" aria-live="polite" aria-atomic="true">
      <DayCloseWhatsAppBadge :status="status" />
      <span v-if="kind" class="text-label-md text-on-surface-variant">{{ t('dayClose.whatsapp.kinds.' + kind) }}</span>
      <span v-if="phone" class="text-label-md text-on-surface-variant">{{ phone }}</span>
      <span v-if="summaryTime" class="text-label-md text-on-surface-variant">{{ dateTime(summaryTime) }}</span>
    </div>
    <AProgress v-if="history.loading.value && !history.loaded.value" class="mt-3" />
    <div v-if="history.error.value" class="mt-3">
      <p class="text-body-md text-error" role="alert">{{ t(whatsappErrorKey(history.error.value)) }}</p>
      <AButton variant="text" @click="history.refresh">{{ t('dayClose.refresh') }}</AButton>
    </div>
    <p v-else-if="history.loaded.value && !history.deliveries.value.length" class="mt-3 text-body-md text-on-surface-variant">{{ t('dayClose.whatsapp.empty') }}</p>
    <ul v-if="history.deliveries.value.length" class="mt-4 flex flex-col divide-y divide-outline-variant">
      <li v-for="delivery in history.deliveries.value" :key="delivery.id" class="min-w-0 py-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-body-md font-medium text-on-surface">{{ t('dayClose.whatsapp.kinds.' + delivery.kind) }}</span>
          <DayCloseWhatsAppBadge :status="delivery.status" />
        </div>
        <p v-if="delivery.recipient" class="mt-1 break-words text-body-md text-on-surface-variant">{{ delivery.recipient.name }} <span v-if="delivery.recipient.phone_masked">· {{ delivery.recipient.phone_masked }}</span></p>
        <dl class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-label-md text-on-surface-variant">
          <div v-for="stamp in timestamps(delivery)" :key="stamp.field" class="flex flex-wrap gap-1">
            <dt>{{ t('dayClose.whatsapp.timestamps.' + stamp.field) }}:</dt>
            <dd>{{ dateTime(stamp.value) }}</dd>
          </div>
        </dl>
        <p v-if="whatsappFailureKey(delivery.status, delivery.failure?.code ?? null)" class="mt-2 text-body-md text-on-surface-variant">{{ t(whatsappFailureKey(delivery.status, delivery.failure?.code ?? null)!) }}</p>
      </li>
    </ul>
    <p v-if="blocked" class="mt-3 text-body-md text-on-surface-variant">{{ t('dayClose.whatsapp.settings.unavailable') }}</p>
    <AButton variant="outlined" class="mt-4" :disabled="blocked || resend.submitting.value || settings.loading.value" @click="resend.begin">{{ t('dayClose.whatsapp.resend.button') }}</AButton>
    <ABottomSheet v-if="resend.open.value" :label="t('dayClose.whatsapp.resend.title')" :dismissible="!resend.submitting.value" @close="resend.cancel">
      <p class="text-body-md text-on-surface-variant">{{ t('dayClose.whatsapp.resend.description') }}</p>
      <p v-if="settings.settings.value?.recipient" class="mt-3 break-words text-body-md text-on-surface">{{ t('dayClose.whatsapp.settings.recipient') }}: {{ settings.settings.value.recipient.name }} · {{ settings.settings.value.recipient.phone_masked }}</p>
      <p v-if="resend.error.value" class="mt-3 text-body-md text-error" role="alert">{{ t(whatsappErrorKey(resend.error.value)) }}</p>
      <template #footer>
        <div class="flex gap-3">
          <AButton variant="outlined" class="flex-1" :disabled="resend.submitting.value" @click="resend.cancel">{{ t('common.cancel') }}</AButton>
          <AButton class="flex-1" :loading="resend.submitting.value" @click="confirm">{{ t(resend.submitting.value ? 'dayClose.whatsapp.resend.loading' : 'dayClose.whatsapp.resend.confirm') }}</AButton>
        </div>
      </template>
    </ABottomSheet>
  </SectionCard>
</template>
