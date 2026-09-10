import { type Ref, onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * True once `target` has entered the viewport, and stays true forever after
 * (a chart animates in once as the user scrolls to it — never replaying on
 * scroll-up/scroll-down/hover/refocus, see the task's chart-animation rules).
 */
export function useInViewOnce(target: Ref<HTMLElement | null>): Ref<boolean> {
  const inView = ref(false)
  let observer: IntersectionObserver | null = null

  onMounted(() => {
    if (!target.value || typeof IntersectionObserver === 'undefined') {
      inView.value = true
      return
    }

    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          inView.value = true
          observer?.disconnect()
        }
      },
      { threshold: 0.2 },
    )
    observer.observe(target.value)
  })

  onBeforeUnmount(() => observer?.disconnect())

  return inView
}
