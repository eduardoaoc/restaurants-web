import { onMounted, onUnmounted, readonly, ref } from 'vue'

/**
 * One shared clock for the whole scene. The timer lives at module level and is
 * reference-counted: it starts with the first consumer and stops with the
 * last, so any number of tables/labels never create more than one interval.
 * Elapsed times are minute-level, so a short tick is plenty.
 */
const TICK_MS = 10_000

const now = ref(Date.now())
let consumers = 0
let timer: ReturnType<typeof setInterval> | undefined

export function useSceneClock() {
  onMounted(() => {
    if (consumers++ === 0) {
      now.value = Date.now()
      timer = setInterval(() => {
        now.value = Date.now()
      }, TICK_MS)
    }
  })
  onUnmounted(() => {
    if (--consumers === 0 && timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  })
  return readonly(now)
}
