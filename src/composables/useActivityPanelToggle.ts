import { ref } from 'vue'

/**
 * Module-level singleton so any screen (Carta 6.2's Dashboard "Ver
 * actividad" CTA) can open the SAME Activity Center panel `ActivityBell`
 * (Carta 6.1B) owns, instead of a second timeline being built. `ActivityBell`
 * is the only place that watches `isOpen` to drive the real fetch/mark-read
 * side effects (`useRestaurantActivity`) — this composable is only the
 * open/closed signal, never a second source of activity data.
 */
const isOpen = ref(false)

export function useActivityPanelToggle() {
  return {
    isOpen,
    open: () => {
      isOpen.value = true
    },
    close: () => {
      isOpen.value = false
    },
  }
}
