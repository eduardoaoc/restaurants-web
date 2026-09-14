<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { PhX } from '@phosphor-icons/vue'

import AIconButton from '@/components/ui/AIconButton.vue'

/**
 * The one shared modal shell for the public QR surface (Passo 3.1 §26) —
 * product detail, cart review, and order confirmation all render inside
 * this rather than each re-implementing backdrop/Escape/focus handling.
 * Bottom sheet on mobile (where this experience actually lives), a
 * centred dialog from `sm:` up — same breakpoint convention as
 * TableDetailsDrawer, but this one adds what that admin-only drawer
 * doesn't need: Escape-to-close and moving focus into the sheet on open,
 * both real requirements for a first-time anonymous visitor who has never
 * seen this UI before.
 */
withDefaults(defineProps<{ label: string }>(), {})

const emit = defineEmits<{ close: [] }>()

const sheetRef = ref<HTMLElement | null>(null)

/**
 * Real gap found in the /ui-ux-pro-max review: every sheet used to pop
 * in/out with zero transition — the parent's `v-if` mounted/unmounted this
 * component instantly, so there was never a moment for a leave animation to
 * play. `visible` decouples "the parent wants this closed" from "this DOM
 * is actually removed": closing sets `visible = false`, the Transition
 * below plays, and only once it finishes does `emit('close')` actually run
 * (the parent's v-if only then removes the component) — CLAUDE.md §15 /
 * the same slide+fade already used by TableDetailsDrawer.vue.
 */
const visible = ref(true)

function requestClose(): void {
  visible.value = false
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') requestClose()
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  // Moves keyboard focus into the sheet the moment it opens — without this
  // a screen reader / keyboard user has no signal that a dialog just took
  // over the screen.
  sheetRef.value?.focus()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="public-sheet" appear @after-leave="emit('close')">
      <div v-if="visible" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
        <div class="public-sheet-backdrop absolute inset-0 bg-black/50" aria-hidden="true" @click="requestClose" />
        <div
          ref="sheetRef"
          role="dialog"
          aria-modal="true"
          :aria-label="label"
          tabindex="-1"
          class="public-sheet-panel relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface-container-high text-on-surface shadow-elevated focus:outline-none sm:max-w-lg sm:rounded-2xl"
        >
          <div class="flex items-center justify-between gap-3 border-b border-outline-variant px-5 py-4">
            <h2 class="text-title-lg font-semibold text-on-surface">{{ label }}</h2>
            <AIconButton :label="$t('common.close')" @click="requestClose">
              <PhX :size="18" />
            </AIconButton>
          </div>
          <div class="flex-1 overflow-y-auto px-5 py-4" style="padding-bottom: max(1rem, env(safe-area-inset-bottom))">
            <slot />
          </div>
          <div v-if="$slots.footer" class="border-t border-outline-variant px-5 py-4" style="padding-bottom: max(1rem, env(safe-area-inset-bottom))">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.public-sheet-enter-active .public-sheet-backdrop,
.public-sheet-leave-active .public-sheet-backdrop {
  transition: opacity 200ms ease-out;
}
.public-sheet-enter-from .public-sheet-backdrop,
.public-sheet-leave-to .public-sheet-backdrop {
  opacity: 0;
}
.public-sheet-enter-active .public-sheet-panel,
.public-sheet-leave-active .public-sheet-panel {
  transition:
    transform 250ms ease-out,
    opacity 250ms ease-out;
}
.public-sheet-enter-from .public-sheet-panel,
.public-sheet-leave-to .public-sheet-panel {
  transform: translateY(100%);
  opacity: 0;
}
@media (min-width: 640px) {
  .public-sheet-enter-from .public-sheet-panel,
  .public-sheet-leave-to .public-sheet-panel {
    transform: translateY(12px) scale(0.98);
  }
}
@media (prefers-reduced-motion: reduce) {
  .public-sheet-enter-active .public-sheet-backdrop,
  .public-sheet-leave-active .public-sheet-backdrop,
  .public-sheet-enter-active .public-sheet-panel,
  .public-sheet-leave-active .public-sheet-panel {
    transition: none;
  }
}
</style>
