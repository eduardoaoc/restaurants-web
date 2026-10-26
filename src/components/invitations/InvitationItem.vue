<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowClockwise, PhCheckCircle, PhClock, PhEnvelopeSimple, PhProhibit, PhWarningCircle } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import AConfirmDialog from '@/components/ui/AConfirmDialog.vue'
import { describeApiError } from '@/utils/error-message'
import { formatDateTime } from '@/utils/format'
import type { Invitation } from '@/types/invitation'

/**
 * One invitation as its manager sees it (platform owner invitations and the
 * Equipo staff invitations share this). State and delivery are two separate
 * lines on purpose: "handed to the mail server" is never shown as
 * "received", and acceptance is its own state — never inferred from a send.
 * Meaning is always carried by text + icon, not colour alone.
 */
const props = defineProps<{
  invitation: Invitation
  busy: boolean
  error: ApiError | null
  /** Extra context line (e.g. organization name on the platform list). */
  context?: string
}>()

const emit = defineEmits<{ resend: []; revoke: [] }>()

const { t, locale } = useI18n()

const confirmingRevoke = ref(false)
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

const isPending = computed(() => props.invitation.state === 'pending' || props.invitation.state === 'expired')

const resendAvailableAt = computed(() => {
  const value = props.invitation.delivery.resend_available_at
  return value ? new Date(value).getTime() : null
})

const resendWait = computed(() => {
  if (resendAvailableAt.value === null) return 0
  return Math.max(0, Math.ceil((resendAvailableAt.value - now.value) / 1000))
})

// A 1 s tick only while a cooldown is actually running; stops at zero.
watch(
  resendWait,
  (wait) => {
    if (wait > 0 && timer === null) {
      timer = setInterval(() => { now.value = Date.now() }, 1000)
    } else if (wait === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => { if (timer !== null) clearInterval(timer) })

const stateIcon = computed(() => ({
  pending: PhClock,
  expired: PhWarningCircle,
  accepted: PhCheckCircle,
  revoked: PhProhibit,
}[props.invitation.state]))

const stateClass = computed(() => ({
  pending: 'bg-secondary-container text-on-secondary-container',
  expired: 'bg-error-container text-on-error-container',
  accepted: 'bg-primary-container text-on-primary-container',
  revoked: 'bg-surface-container-highest text-on-surface-variant',
}[props.invitation.state]))

const deliveryIcon = computed(() => (props.invitation.delivery.status === 'failed' ? PhWarningCircle : PhEnvelopeSimple))

const dateLine = computed(() => {
  const invitation = props.invitation
  if (invitation.state === 'accepted' && invitation.accepted_at) {
    return t('invitations.acceptedAt', { date: formatDateTime(invitation.accepted_at, locale.value) })
  }
  if (isPending.value) {
    return t('invitations.expiresAt', { date: formatDateTime(invitation.expires_at, locale.value) })
  }
  return null
})

function confirmRevoke(): void {
  confirmingRevoke.value = false
  emit('revoke')
}
</script>

<template>
  <!-- Container query, not viewport: this item lives both in wide cards and
       in a narrow side column on desktop. -->
  <div class="@container">
  <div class="flex flex-col gap-3 py-3 @lg:flex-row @lg:items-start @lg:justify-between">
    <div class="min-w-0 flex-1">
      <p class="truncate text-title-md font-medium text-on-surface">{{ invitation.name || invitation.email }}</p>
      <p v-if="invitation.name" class="truncate text-body-md text-on-surface-variant">{{ invitation.email }}</p>
      <p v-if="context" class="truncate text-body-md text-on-surface-variant">{{ context }}</p>

      <div class="mt-2 flex flex-wrap items-center gap-2">
        <span class="inline-flex min-h-7 items-center gap-1.5 rounded-full px-3 text-label-md font-medium" :class="stateClass">
          <component :is="stateIcon" :size="14" aria-hidden="true" />
          {{ t(`invitations.state.${invitation.state}`) }}
        </span>
        <span
          v-if="isPending"
          class="inline-flex items-center gap-1.5 text-label-md"
          :class="invitation.delivery.status === 'failed' ? 'text-error' : 'text-on-surface-variant'"
          :title="t('invitations.deliveryHelp')"
        >
          <component :is="deliveryIcon" :size="14" aria-hidden="true" />
          {{ t(`invitations.delivery.${invitation.delivery.status}`) }}
          · {{ t('invitations.sendCount', { count: invitation.delivery.send_count }, invitation.delivery.send_count) }}
        </span>
      </div>
      <p v-if="dateLine" class="mt-1 text-label-md text-on-surface-variant">{{ dateLine }}</p>
      <p v-if="error" class="mt-2 text-label-md text-error" role="alert">{{ describeApiError(error, t) }}</p>
    </div>

    <div v-if="isPending" class="flex shrink-0 flex-wrap gap-2">
      <AButton variant="tonal" :disabled="busy || resendWait > 0" :loading="busy" @click="emit('resend')">
        <template #leading><PhArrowClockwise :size="16" /></template>
        {{ resendWait > 0 ? t('invitations.resendIn', { seconds: resendWait }) : t('invitations.resend') }}
      </AButton>
      <AButton variant="text" :disabled="busy" @click="confirmingRevoke = true">
        {{ t('invitations.revoke') }}
      </AButton>
    </div>

    <AConfirmDialog
      v-if="confirmingRevoke"
      :label="t('invitations.revoke')"
      :message="t('invitations.revokeConfirm', { email: invitation.email })"
      :confirm-label="t('invitations.revokeConfirmLabel')"
      :loading="busy"
      @confirm="confirmRevoke"
      @cancel="confirmingRevoke = false"
    />
  </div>
  </div>
</template>
