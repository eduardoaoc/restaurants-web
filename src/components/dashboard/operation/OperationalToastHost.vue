<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhX } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import AStatusBadge, { type StatusBadgeState } from '@/components/ui/AStatusBadge.vue'
import { INERT_EXEMPT_ATTRIBUTE } from '@/components/ui/overlay-focus'
import type { OperationalToast, ToastTone } from '@/utils/operational-toast-queue'

/**
 * Live operational notifications: top centre of the window, above every panel and above an open modal (it is a body-level
 * element exempt from the modal's inertness, see overlay-focus). It never moves focus: critical items sit in an
 * assertive live region, the rest in a polite one, so a screen reader announces each by urgency without taking over the
 * keyboard. Hover or keyboard focus on the stack pauses the countdown (the queue owns the timers).
 */
const props = defineProps<{ toasts: readonly OperationalToast[]; waiting: number }>()
const emit = defineEmits<{ dismiss: [string]; pause: [string]; resume: [string]; action: [OperationalToast] }>()
const { t } = useI18n()

const BADGE: Record<ToastTone, StatusBadgeState> = { critical: 'critical', warning: 'warning', info: 'normal' }
const urgent = computed(() => props.toasts.filter(toast => toast.tone === 'critical'))
const routine = computed(() => props.toasts.filter(toast => toast.tone !== 'critical'))
const exempt = { [INERT_EXEMPT_ATTRIBUTE]: '' }

function onFocusOut(event: FocusEvent): void {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) emit('resume', 'focus')
}
function onPointerEnter(event: PointerEvent): void { if (event.pointerType !== 'touch') emit('pause', 'hover') }
function onPointerLeave(event: PointerEvent): void { if (event.pointerType !== 'touch') emit('resume', 'hover') }
function onPointerDown(event: PointerEvent): void { if (event.pointerType === 'touch') emit('pause', 'touch') }
function onPointerUp(event: PointerEvent): void { if (event.pointerType === 'touch') emit('resume', 'touch') }
</script>

<template>
  <Teleport to="body">
    <section
      v-bind="exempt"
      class="op-toasts"
      :aria-label="t('operations.toast.region')"
      data-operational-toasts
      @pointerenter="onPointerEnter" @pointerleave="onPointerLeave"
      @pointerdown="onPointerDown" @pointerup="onPointerUp" @pointercancel="onPointerUp"
      @focusin="emit('pause', 'focus')" @focusout="onFocusOut"
    >
      <template v-for="group in [{ key: 'urgent', role: 'alert', items: urgent }, { key: 'routine', role: 'status', items: routine }]" :key="group.key">
        <TransitionGroup :name="'op-toast'" tag="div" :role="group.role" :aria-live="group.role === 'alert' ? 'assertive' : 'polite'" aria-atomic="false" class="op-toasts__group">
          <article
            v-for="toast in group.items"
            :key="toast.id"
            class="op-toast"
            :data-tone="toast.tone"
          >
            <div class="op-toast__body">
              <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <AStatusBadge :state="BADGE[toast.tone]" :label="t(`operations.alerts.severity.${toast.tone}`)" />
                <time v-if="toast.time" class="text-label-md tabular-nums text-fg-muted">{{ toast.time }}</time>
              </div>
              <p class="mt-1 break-words text-body-sm font-semibold text-fg">{{ toast.title }}</p>
              <p v-if="toast.table || toast.detail" class="break-words text-body-sm text-fg-muted">
                <strong v-if="toast.table" class="font-semibold text-fg">{{ toast.table }}</strong><span v-if="toast.table && toast.detail"> · </span>{{ toast.detail }}
              </p>
            </div>
            <div class="op-toast__side">
              <button type="button" class="op-toast__close" :aria-label="t('common.dismiss')" @click="emit('dismiss', toast.id)">
                <PhX :size="18" aria-hidden="true" />
              </button>
              <AButton v-if="toast.action" variant="secondary" size="sm" class="op-toast__action" @click="emit('action', toast)">{{ toast.action.label }}</AButton>
            </div>
          </article>
        </TransitionGroup>
      </template>
      <p v-if="waiting > 0" class="op-toasts__more" role="status">{{ t('operations.toast.more', { count: waiting }) }}</p>
    </section>
  </Teleport>
</template>

<style scoped>
/* Fixed to the window, so scrolling the page never moves it. Side margins and the notch are respected. */
.op-toasts {
  position: fixed; inset: 0 0 auto 0; z-index: calc(var(--z-snackbar) + 5);
  display: flex; flex-direction: column; align-items: center; gap: calc(var(--spacing) * 2);
  padding: calc(env(safe-area-inset-top) + var(--spacing) * 3) max(calc(var(--spacing) * 4), env(safe-area-inset-right)) 0 max(calc(var(--spacing) * 4), env(safe-area-inset-left));
  pointer-events: none;
}
.op-toasts__group { display: flex; flex-direction: column; align-items: center; gap: calc(var(--spacing) * 2); width: 100%; }
.op-toasts__group:empty { display: none; }
.op-toast {
  pointer-events: auto; display: flex; align-items: flex-start; gap: calc(var(--spacing) * 2);
  width: min(100%, calc(var(--spacing) * 108)); padding: calc(var(--spacing) * 3) calc(var(--spacing) * 2) calc(var(--spacing) * 3) calc(var(--spacing) * 4);
  border: 1px solid var(--color-border); border-left-width: 4px; border-radius: var(--radius-md);
  background: var(--color-surface); color: var(--color-text-primary); box-shadow: var(--elevation-floating);
}
.op-toast[data-tone='critical'] { border-left-color: var(--color-danger, var(--color-critical)); }
.op-toast[data-tone='warning'] { border-left-color: var(--color-warning); }
.op-toast[data-tone='info'] { border-left-color: var(--color-border-strong, var(--color-border)); }
.op-toast__body { min-width: 0; flex: 1; }
.op-toast__side { display: flex; flex-shrink: 0; flex-direction: column; align-items: flex-end; gap: var(--spacing); }
.op-toast__action { min-height: calc(var(--spacing) * 11); }
.op-toast__close {
  display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center;
  width: calc(var(--spacing) * 11); height: calc(var(--spacing) * 11); border-radius: var(--radius-sm); color: var(--color-text-secondary); cursor: pointer;
}
.op-toast__close:hover { background: var(--color-surface-subtle, transparent); color: var(--color-text-primary); }
.op-toast__close:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: 2px; }
.op-toasts__more {
  pointer-events: none; padding: var(--spacing) calc(var(--spacing) * 3); border-radius: 999px;
  background: var(--color-surface); border: 1px solid var(--color-border); box-shadow: var(--elevation-floating);
  font-size: var(--text-label-md); color: var(--color-text-secondary);
}
.op-toast-enter-active, .op-toast-leave-active { transition: opacity var(--duration-base) var(--ease-out), transform var(--duration-base) var(--ease-out); }
.op-toast-enter-from, .op-toast-leave-to { opacity: 0; transform: translateY(-8px); }
@media (prefers-reduced-motion: reduce) { .op-toast-enter-active, .op-toast-leave-active { transition: none; } }
</style>
