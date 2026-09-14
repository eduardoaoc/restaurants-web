<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { PhX } from '@phosphor-icons/vue'

import AIconButton from '@/components/ui/AIconButton.vue'

/**
 * The one shared modal shell for this app's sheet/dialog UIs — originally
 * built for the public QR surface (Passo 3.1 §26), promoted here (Passo
 * 3.2) once the Servicio screen needed the exact same backdrop/Escape/
 * focus/transition handling for its own order-detail and manual-order
 * flows. Nothing about this component is public-domain-specific — it never
 * imports a Public* type — so reusing it from `/app/service` is reusing a
 * generic UI primitive (like ASurface/AButton), never "reusing the public
 * flow" itself.
 *
 * Bottom sheet on mobile (where both flows actually live), a centred
 * dialog from `sm:` up — same breakpoint convention as TableDetailsDrawer,
 * but this one adds what that admin-only drawer doesn't: Escape-to-close
 * and moving focus into the sheet on open.
 */
withDefaults(defineProps<{ label: string }>(), {})

const emit = defineEmits<{ close: [] }>()

const sheetRef = ref<HTMLElement | null>(null)
let returnFocus: HTMLElement | null = null

/**
 * `visible` decouples "the parent wants this closed" from "this DOM is
 * actually removed": closing sets `visible = false`, the Transition below
 * plays, and only once it finishes does `emit('close')` actually run (the
 * parent's v-if only then removes the component) — CLAUDE.md §15 / the
 * same slide+fade already used by TableDetailsDrawer.vue.
 */
const visible = ref(true)

function requestClose(): void {
  visible.value = false
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') requestClose()
  if (event.key !== 'Tab' || !sheetRef.value) return
  const controls = Array.from(sheetRef.value.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'))
    .filter(element => element.getClientRects().length > 0)
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (!first || !last) { event.preventDefault(); sheetRef.value.focus(); return }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === sheetRef.value)) {
    event.preventDefault(); last.focus()
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === sheetRef.value)) {
    event.preventDefault(); first.focus()
  }
}

onMounted(() => {
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  document.addEventListener('keydown', onKeydown)
  // Moves keyboard focus into the sheet the moment it opens — without this
  // a screen reader / keyboard user has no signal that a dialog just took
  // over the screen.
  sheetRef.value?.focus()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  if (returnFocus?.isConnected) returnFocus.focus()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="a-sheet" appear @after-leave="emit('close')">
      <div v-if="visible" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
        <div class="a-sheet-backdrop absolute inset-0 bg-black/50" aria-hidden="true" @click="requestClose" />
        <div
          ref="sheetRef"
          role="dialog"
          aria-modal="true"
          :aria-label="label"
          tabindex="-1"
          class="a-sheet-panel relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface-container-high text-on-surface shadow-elevated focus:outline-none sm:max-w-lg sm:rounded-2xl"
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
.a-sheet-enter-active .a-sheet-backdrop,
.a-sheet-leave-active .a-sheet-backdrop {
  transition: opacity 200ms ease-out;
}
.a-sheet-enter-from .a-sheet-backdrop,
.a-sheet-leave-to .a-sheet-backdrop {
  opacity: 0;
}
.a-sheet-enter-active .a-sheet-panel,
.a-sheet-leave-active .a-sheet-panel {
  transition:
    transform 250ms ease-out,
    opacity 250ms ease-out;
}
.a-sheet-enter-from .a-sheet-panel,
.a-sheet-leave-to .a-sheet-panel {
  transform: translateY(100%);
  opacity: 0;
}
@media (min-width: 640px) {
  .a-sheet-enter-from .a-sheet-panel,
  .a-sheet-leave-to .a-sheet-panel {
    transform: translateY(12px) scale(0.98);
  }
}
@media (prefers-reduced-motion: reduce) {
  .a-sheet-enter-active .a-sheet-backdrop,
  .a-sheet-leave-active .a-sheet-backdrop,
  .a-sheet-enter-active .a-sheet-panel,
  .a-sheet-leave-active .a-sheet-panel {
    transition: none;
  }
}
</style>
