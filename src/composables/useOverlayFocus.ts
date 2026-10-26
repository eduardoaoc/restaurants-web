import { onBeforeUnmount, watchEffect, type Ref } from 'vue'
import { activateOverlay } from '@/components/ui/overlay-focus'

export function useOverlayFocus(
  root: Ref<HTMLElement | null>, panel: Ref<HTMLElement | null>, active: Ref<boolean>,
  options: { modal: () => boolean; initialFocus?: () => HTMLElement | string | undefined; onEscape: () => void },
) {
  let release: (() => void) | undefined
  const cleanup = () => { release?.(); release = undefined }
  watchEffect(() => {
    if (!active.value) { cleanup(); return }
    // Keep the lock/trap through the leave animation even as Vue clears refs.
    if (!release && root.value && panel.value) {
      release = activateOverlay({ root: root.value, panel: panel.value, modal: options.modal(), initialFocus: options.initialFocus?.(), onEscape: options.onEscape })
    }
  }, { flush: 'post' })
  onBeforeUnmount(cleanup)
  return { release: cleanup }
}
