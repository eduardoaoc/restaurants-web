import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { useVisualViewport } from './useVisualViewport'

export const SIDEBAR_STORAGE_KEY = 'aforo-sidebar-collapsed'
export function readSidebarCollapsed(): boolean {
  try { return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true' } catch { return false }
}
export function persistSidebarCollapsed(value: boolean): void {
  try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(value)) } catch { /* Preference is optional. */ }
}

/** Presentation only: no route, permission, restaurant or domain state. */
export function useShellLayout(topbar: Ref<HTMLElement | null>, bottom: Ref<HTMLElement | null>, chromeVisible: () => boolean) {
  const medium = window.matchMedia('(min-width: 768px)')
  const expanded = window.matchMedia('(min-width: 1280px)')
  const compact = ref(!medium.matches)
  const desktop = ref(expanded.matches)
  const collapsed = ref(readSidebarCollapsed())
  const { viewport } = useVisualViewport()
  const sidebar = computed(() => desktop.value && !collapsed.value)
  // Desktop always lists every destination (expanded or icon-only); the rail
  // with a More overflow remains the tablet presentation.
  const mode = computed(() => compact.value ? 'bottom' : desktop.value ? 'sidebar' : 'rail')
  const keyboard = computed(() => compact.value && viewport.value.keyboard)
  let resize: ResizeObserver | undefined
  let previousTop = '', previousBottom = '', previousShell: string | null = null
  let mounted = false

  function updateMedia(): void { compact.value = !medium.matches; desktop.value = expanded.matches }
  function measure(): void {
    if (!mounted) return
    const root = document.documentElement
    // Tailwind v4 exposes --spacing as .25rem (a CSS length). Read the
    // computed pixel value rather than parseFloat(), which would treat .25
    // as a quarter pixel and produce a visibly undersized fallback.
    const spacingValue = getComputedStyle(root).getPropertyValue('--spacing').trim()
    const spacing = spacingValue.endsWith('px') ? parseFloat(spacingValue) : parseFloat(spacingValue) * parseFloat(getComputedStyle(root).fontSize || '16px')
    const unit = Number.isFinite(spacing) && spacing > 0 ? spacing : 4
    // Browser geometry includes safe-area and wrapped labels, exactly once.
    const top = chromeVisible() ? topbar.value?.getBoundingClientRect().height || unit * (compact.value ? 13 : 14) : 0
    const foot = chromeVisible() && compact.value && !keyboard.value ? bottom.value?.getBoundingClientRect().height || unit * 14 : 0
    root.style.setProperty('--bar-top', `${top}px`)
    root.style.setProperty('--bar-bottom', `${foot}px`)
  }
  watch(collapsed, persistSidebarCollapsed)
  watch([compact, desktop, keyboard, chromeVisible, topbar, bottom], () => {
    if (!mounted) return
    resize?.disconnect()
    if (topbar.value) resize?.observe(topbar.value)
    if (bottom.value) resize?.observe(bottom.value)
    measure()
  }, { flush: 'post' })
  onMounted(() => {
    mounted = true
    const root = document.documentElement
    previousTop = root.style.getPropertyValue('--bar-top')
    previousBottom = root.style.getPropertyValue('--bar-bottom')
    previousShell = root.getAttribute('data-shell-v2')
    root.setAttribute('data-shell-v2', '')
    medium.addEventListener('change', updateMedia)
    expanded.addEventListener('change', updateMedia)
    if (typeof ResizeObserver !== 'undefined') {
      resize = new ResizeObserver(measure)
      if (topbar.value) resize.observe(topbar.value)
      if (bottom.value) resize.observe(bottom.value)
    }
    measure()
  })
  onBeforeUnmount(() => {
    mounted = false
    resize?.disconnect()
    medium.removeEventListener('change', updateMedia)
    expanded.removeEventListener('change', updateMedia)
    const root = document.documentElement
    if (previousTop) root.style.setProperty('--bar-top', previousTop); else root.style.removeProperty('--bar-top')
    if (previousBottom) root.style.setProperty('--bar-bottom', previousBottom); else root.style.removeProperty('--bar-bottom')
    if (previousShell !== null) root.setAttribute('data-shell-v2', previousShell); else root.removeAttribute('data-shell-v2')
  })
  return { compact, desktop, sidebar, collapsed, mode, keyboard }
}
