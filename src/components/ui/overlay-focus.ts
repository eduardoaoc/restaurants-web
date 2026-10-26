/** Shared modal behavior for V2 overlays and the legacy ABottomSheet.
 * Keep Tab native (including radio groups), then correct an escaped focus.
 */
export interface OverlayFocusOptions {
  root: HTMLElement
  panel: HTMLElement
  modal: boolean
  initialFocus?: HTMLElement | string
  onEscape: () => void
}

interface Entry extends OverlayFocusOptions { trigger: HTMLElement | null }
const stack: Entry[] = []
const inertBefore = new Map<HTMLElement, boolean>()
let overflowBefore: string | null = null
let paddingBefore = ''
let observer: MutationObserver | undefined
let shiftTab = false
let correctingFocus = false

function controls(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]')]
    .filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[hidden], [inert], [aria-hidden="true"]') && el.getClientRects().length > 0)
}
function focusEdge(entry: Entry, last = false): void {
  const list = controls(entry.panel)
  ;(last ? list.at(-1) : list[0])?.focus({ preventScroll: true })
  if (!entry.panel.contains(document.activeElement)) entry.panel.focus({ preventScroll: true })
}
function restoreInert(): void {
  inertBefore.forEach((inert, el) => { el.inert = inert })
  inertBefore.clear()
}
function syncBackground(): void {
  restoreInert()
  const modal = [...stack].reverse().find(entry => entry.modal)
  if (modal) {
    for (const child of document.body.children) {
      if (!(child instanceof HTMLElement) || child === modal.root || child.contains(modal.root)) continue
      // Nonmodal overlays opened above this modal remain reachable.
      if (stack.slice(stack.indexOf(modal) + 1).some(entry => child === entry.root || child.contains(entry.root))) continue
      inertBefore.set(child, child.inert)
      child.inert = true
    }
    if (overflowBefore === null) {
      overflowBefore = document.body.style.overflow
      paddingBefore = document.body.style.paddingRight
      const scrollbar = Math.max(0, window.innerWidth - document.documentElement.clientWidth)
      if (scrollbar) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight || '0') + scrollbar}px`
      document.body.style.overflow = 'hidden'
    }
  } else if (overflowBefore !== null) {
    document.body.style.overflow = overflowBefore
    document.body.style.paddingRight = paddingBefore
    overflowBefore = null
  }
}
function onKeydown(event: KeyboardEvent): void {
  const top = stack.at(-1)
  if (!top || event.defaultPrevented) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    top.onEscape()
  } else if (event.key === 'Tab' && top.modal) {
    shiftTab = event.shiftKey
    requestAnimationFrame(() => {
      if (stack.at(-1) === top && !top.panel.contains(document.activeElement)) focusEdge(top, event.shiftKey)
    })
  }
}
function onFocusin(event: FocusEvent): void {
  const top = stack.at(-1)
  if (!top?.modal || correctingFocus || top.panel.contains(event.target as Node)) return
  correctingFocus = true
  focusEdge(top, shiftTab)
  correctingFocus = false
}

export function activateOverlay(options: OverlayFocusOptions): () => void {
  const entry: Entry = { ...options, trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null }
  if (!stack.length) {
    document.addEventListener('keydown', onKeydown)
    document.addEventListener('focusin', onFocusin)
    observer = new MutationObserver(syncBackground)
    observer.observe(document.body, { childList: true })
  }
  stack.push(entry)
  syncBackground()
  let requested: HTMLElement | null | undefined
  if (typeof entry.initialFocus === 'string') {
    // A malformed optional selector must not strand the page under scroll lock.
    try { requested = entry.panel.querySelector<HTMLElement>(entry.initialFocus) } catch { requested = null }
  } else requested = entry.initialFocus
  const field = [...entry.panel.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled)')]
    .find(el => !el.closest('[hidden], [inert], [aria-hidden="true"]') && el.getClientRects().length > 0)
  const heading = entry.panel.querySelector<HTMLElement>('[data-overlay-title]')
  const initial = requested && entry.panel.contains(requested) ? requested : field ?? heading ?? entry.panel
  initial.focus({ preventScroll: true })
  if (!entry.panel.contains(document.activeElement)) (heading ?? entry.panel).focus({ preventScroll: true })
  let released = false
  return () => {
    if (released) return
    released = true
    const wasTop = stack.at(-1) === entry
    stack.splice(stack.indexOf(entry), 1)
    syncBackground()
    if (!stack.length) {
      document.removeEventListener('keydown', onKeydown)
      document.removeEventListener('focusin', onFocusin)
      observer?.disconnect()
      observer = undefined
      shiftTab = false
    }
    if (wasTop) {
      if (entry.trigger?.isConnected && !entry.trigger.closest('[inert]')) entry.trigger.focus({ preventScroll: true })
      else if (stack.at(-1)?.modal) focusEdge(stack.at(-1)!)
    }
  }
}
