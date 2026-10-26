import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'

export interface ViewportGeometry {
  width: number; height: number; top: number; left: number; scale: number; keyboard: boolean
}

export function readViewportGeometry(): ViewportGeometry {
  if (typeof window === 'undefined') return { width: 0, height: 0, top: 0, left: 0, scale: 1, keyboard: false }
  const viewport = window.visualViewport
  const focused = document.activeElement
  const editable = focused instanceof HTMLElement && focused.matches('input:not([type="checkbox"]):not([type="radio"]):not([readonly]), textarea:not([readonly]), [contenteditable="true"]')
  return {
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
    top: viewport?.offsetTop ?? 0,
    left: viewport?.offsetLeft ?? 0,
    scale: viewport?.scale ?? 1,
    // Geometry remains correct even on browsers that resize innerHeight for IME.
    // Pinch zoom alone must not be treated as a keyboard opening.
    keyboard: !!editable && (viewport?.scale ?? 1) === 1 && (viewport?.height ?? window.innerHeight) < window.innerHeight,
  }
}

/** Local geometry, not design tokens or a second viewport/store system. */
export function useVisualViewport() {
  const viewport = shallowRef(readViewportGeometry())
  const update = () => { viewport.value = readViewportGeometry() }
  onMounted(() => {
    update()
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('resize', update)
    window.visualViewport?.removeEventListener('resize', update)
    window.visualViewport?.removeEventListener('scroll', update)
    document.removeEventListener('focusin', update)
    document.removeEventListener('focusout', update)
  })
  const style = computed(() => viewport.value.height > 0 ? {
    top: `${viewport.value.top}px`, left: `${viewport.value.left}px`,
    width: `${viewport.value.width}px`, height: `${viewport.value.height}px`,
  } : undefined)
  return { viewport, style }
}
