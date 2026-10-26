<script setup lang="ts">
import { ref, useId } from 'vue'
import { PhX } from '@phosphor-icons/vue'
import AIconButton from '@/components/ui/AIconButton.vue'
import { useOverlayFocus } from '@/composables/useOverlayFocus'

// Legacy presentation/API retained. Behavior is shared with ADialog/ASheet.
const props = withDefaults(defineProps<{ label: string; dismissible?: boolean }>(), { dismissible: true })
const emit = defineEmits<{ close: [] }>()
const rootRef = ref<HTMLElement | null>(null)
const sheetRef = ref<HTMLElement | null>(null)
const titleId = useId()
const visible = ref(true)
const active = ref(true)
function requestClose(): void {
  if (props.dismissible) visible.value = false
}
function afterLeave(): void {
  active.value = false
  emit('close')
}
useOverlayFocus(rootRef, sheetRef, active, {
  modal: () => true, initialFocus: () => sheetRef.value ?? undefined, onEscape: requestClose,
})
</script>

<template>
  <Teleport to="body">
    <Transition name="a-sheet" appear @after-leave="afterLeave">
      <div v-if="visible" ref="rootRef" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
        <div class="a-sheet-backdrop absolute inset-0 bg-black/50" aria-hidden="true" @click="requestClose" />
        <div
          ref="sheetRef"
          role="dialog"
          aria-modal="true"
          :aria-label="label"
          :aria-labelledby="titleId"
          tabindex="-1"
          class="a-sheet-panel relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface-container-high text-on-surface shadow-elevated focus:outline-none sm:max-w-lg sm:rounded-2xl"
        >
          <div class="flex items-center justify-between gap-3 border-b border-outline-variant px-5 py-4">
            <h2 :id="titleId" class="text-title-lg font-semibold text-on-surface">{{ label }}</h2>
            <AIconButton :label="$t('common.close')" :disabled="!dismissible" @click="requestClose">
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
