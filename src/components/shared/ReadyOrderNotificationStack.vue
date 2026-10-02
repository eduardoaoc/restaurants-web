<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhBellRinging, PhX } from '@phosphor-icons/vue'
import type { ReadyOrderNotification } from '@/composables/useReadyOrderNotifications'

defineProps<{ notifications: ReadyOrderNotification[] }>()
const emit = defineEmits<{ dismiss: [string] }>()

const { t } = useI18n()
</script>

<template>
  <!--
    Carta 7.1B §18/§19/§31 — a strong, persistent operational alert, NOT a
    blocking modal and NOT the Activity Center: lives at AppShell level
    (mounted once, outside RouterView) so it survives navigating away from
    Kitchen. `aria-live="assertive"` because a ready order genuinely is
    time-sensitive for whoever is serving that table, but nothing here ever
    calls .focus() — a screen reader announces it without hijacking
    keyboard focus from whatever the waiter was doing (§31 "não sequestrar
    foco automaticamente"). No auto-dismiss timer — it stays until the
    waiter dismisses it (§19).
  -->
  <div
    v-if="notifications.length"
    role="region"
    :aria-label="t('readyAlert.regionLabel')"
    aria-live="assertive"
    aria-atomic="false"
    class="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col gap-2 p-3 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-96 sm:p-0"
  >
    <TransitionGroup name="ready-alert" tag="div" class="flex flex-col gap-2">
      <div
        v-for="notification in notifications"
        :key="notification.eventId"
        role="alert"
        class="pointer-events-auto flex items-start gap-3 rounded-lg border border-outline-variant bg-warning-container p-4 text-on-warning-container shadow-elevated"
      >
        <PhBellRinging :size="24" weight="fill" aria-hidden="true" class="mt-0.5 shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="text-title-md font-bold">{{ t('readyAlert.title') }}</p>
          <!-- `tableName` already reads e.g. "Mesa 06" (backend data, not UI chrome — same as everywhere else this app renders a table name, never wrapped in its own i18n label). -->
          <p class="text-body-lg font-semibold">{{ notification.tableName }}</p>
          <p class="text-body-md">{{ t('readyAlert.order', { reference: notification.orderReference }) }}</p>
          <p class="mt-1 text-body-md">{{ t('readyAlert.instruction') }}</p>
        </div>
        <button
          type="button"
          :aria-label="t('readyAlert.dismiss')"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ease-out hover:bg-on-warning-container/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-warning-container"
          @click="emit('dismiss', notification.eventId)"
        >
          <PhX :size="20" aria-hidden="true" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.ready-alert-enter-active,
.ready-alert-leave-active {
  transition: opacity 200ms ease-out, transform 200ms ease-out;
}
.ready-alert-enter-from,
.ready-alert-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
@media (prefers-reduced-motion: reduce) {
  .ready-alert-enter-active,
  .ready-alert-leave-active {
    transition: none;
  }
}
</style>
