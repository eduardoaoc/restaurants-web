import { type Ref, ref, watch } from 'vue'

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Animates a displayed number from its current value to `source`'s new
 * value whenever `source` changes — never re-animating from zero on a live
 * update (only the very first paint, where the displayed ref legitimately
 * starts at 0 before any real data has arrived, looks like a 0->value
 * animation). This is presentation only: `source` itself must always hold
 * the real, already-fetched value — never animate while a request is still
 * in flight (see the task's "loading is not real zero" rule).
 */
export function useCountUp(source: Ref<number>, durationMs = 900): Ref<number> {
  const displayed = ref(0)
  let frame: number | null = null

  watch(
    source,
    (target, previous) => {
      if (frame !== null) cancelAnimationFrame(frame)

      if (prefersReducedMotion()) {
        displayed.value = target
        return
      }

      const from = previous ?? displayed.value
      const start = performance.now()

      const step = (now: number): void => {
        const elapsed = now - start
        const progress = Math.min(elapsed / durationMs, 1)
        displayed.value = from + (target - from) * easeOutCubic(progress)
        if (progress < 1) {
          frame = requestAnimationFrame(step)
        } else {
          displayed.value = target
          frame = null
        }
      }

      frame = requestAnimationFrame(step)
    },
    { immediate: true },
  )

  return displayed
}
