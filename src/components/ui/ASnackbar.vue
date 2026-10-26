<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheckCircle, PhInfo, PhWarning, PhWarningOctagon, PhX } from '@phosphor-icons/vue'
import { useSnackbar, type SnackbarKind } from '@/composables/useSnackbar'
import { useVisualViewport } from '@/composables/useVisualViewport'
import { findSnackbarTop } from './snackbar-placement'

const emit = defineEmits<{ 'action-error': [unknown] }>()
const { t } = useI18n()
const { current, actionPending, dismiss, pause, resume, performAction, attachHost } = useSnackbar()
const registration = shallowRef<ReturnType<typeof attachHost> | null>(null)
const ownsHost = computed(() => registration.value?.ownsHost.value ?? false)
const hostElement = ref<HTMLElement | null>(null)
const { viewport, style: viewportStyle } = useVisualViewport()
const panelOffset = ref<number>()
const deferred = ref(false)
let observer: ResizeObserver | undefined
let pageObserver: MutationObserver | undefined
let mounted = false
let positioning = false
async function keepActionsVisible(): Promise<void> {
  if (!mounted || positioning) return
  positioning = true
  await nextTick()
  positioning = false
  const host = hostElement.value
  const panel = host?.firstElementChild
  if (!host || !panel || !current.value || !ownsHost.value) return
  if (host.closest('[inert]')) { deferred.value = true; pause('responsive-space'); return }
  const box = panel.getBoundingClientRect(), hostBox = host.getBoundingClientRect()
  if (!box.width || !box.height) return // No layout in SSR/unit hosts.
  if (panel.classList.contains('a-snackbar-enter-active') || panel.classList.contains('a-snackbar-leave-active')) {
    pause('layout')
    return
  }
  resume('layout')
  const css = getComputedStyle(host)
  const top = hostBox.top + parseFloat(css.paddingTop)
  const bottom = hostBox.bottom - parseFloat(css.paddingBottom)
  const obstacles = [...document.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex="0"]')]
    .filter(el => !host.contains(el) && !el.closest('[inert], [hidden], [aria-hidden="true"]') && el.getClientRects().length > 0)
    .map(el => el.getBoundingClientRect())
  const nextTop = findSnackbarTop({ top, bottom, left: box.left, right: box.right }, box.height, obstacles, parseFloat(css.rowGap) || 0)
  deferred.value = nextTop === null
  panelOffset.value = nextTop === null ? undefined : Math.max(0, nextTop - top)
  if (deferred.value) pause('responsive-space')
  else resume('responsive-space')
}
function onPageScroll(event: Event): void {
  if (!(event.target instanceof Node) || !hostElement.value?.contains(event.target)) void keepActionsVisible()
}
function observePanel(): void {
  observer?.disconnect()
  const panel = hostElement.value?.firstElementChild
  if (panel) observer?.observe(panel)
  void keepActionsVisible()
}
watch([() => current.value?.id, ownsHost, viewport], async () => { await nextTick(); observePanel() }, { flush: 'post' })
onMounted(() => {
  mounted = true
  registration.value = attachHost()
  if (typeof ResizeObserver !== 'undefined') observer = new ResizeObserver(() => { void keepActionsVisible() })
  pageObserver = new MutationObserver(records => {
    if (records.some(record => !hostElement.value?.contains(record.target) || record.attributeName === 'inert')) void keepActionsVisible()
  })
  pageObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style', 'inert'] })
  document.addEventListener('focusin', keepActionsVisible)
  document.addEventListener('scroll', onPageScroll, true)
})
onBeforeUnmount(() => {
  mounted = false
  observer?.disconnect()
  pageObserver?.disconnect()
  const wasOwner = ownsHost.value
  registration.value?.release()
  // These pauses belong to the rendered panel, not to the next host/message.
  if (wasOwner) { resume('touch'); resume('layout'); resume('responsive-space') }
  document.removeEventListener('focusin', keepActionsVisible)
  document.removeEventListener('scroll', onPageScroll, true)
})
const icons = { info: PhInfo, success: PhCheckCircle, warning: PhWarning, danger: PhWarningOctagon } satisfies Record<SnackbarKind, unknown>
function onFocusOut(event: FocusEvent): void {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) resume('focus')
}
function onPointerEnter(event: PointerEvent): void { if (event.pointerType !== 'touch') pause('hover') }
function onPointerDown(event: PointerEvent): void { if (event.pointerType === 'touch') pause('touch') }
async function onAction(): Promise<void> {
  try { await performAction() } catch (error) { emit('action-error', error) }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="ownsHost" ref="hostElement" class="a-snackbar-host" :style="viewportStyle" :data-keyboard="viewport.keyboard || undefined" :data-deferred="deferred || undefined" :aria-hidden="deferred || undefined" role="status" aria-live="polite" aria-atomic="true">
      <Transition name="a-snackbar" mode="out-in" @after-enter="observePanel">
        <div
          v-if="current" :key="current.id" class="a-snackbar-panel" :style="{ marginTop: panelOffset === undefined ? undefined : `${panelOffset}px` }"
          @pointerenter="onPointerEnter" @pointerleave="resume('hover')"
          @pointerdown="onPointerDown" @pointerup="resume('touch')" @pointercancel="resume('touch')"
          @focusin="pause('focus')" @focusout="onFocusOut"
        >
          <component :is="icons[current.kind]" class="a-snackbar-icon" aria-hidden="true" />
          <p class="a-snackbar-message">{{ current.message }}</p>
          <button v-if="current.action" type="button" class="a-snackbar-action" :disabled="actionPending" :aria-busy="actionPending || undefined" @click="onAction">{{ current.action.label }}</button>
          <button type="button" class="a-snackbar-dismiss" :aria-label="t('common.dismiss')" @click="dismiss(current.id)"><PhX class="a-snackbar-icon" aria-hidden="true" /></button>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
.a-snackbar-host { position: fixed; inset: 0; height: 100dvh; display: flex; flex-direction: column; align-items: center; gap: calc(var(--spacing) * 2); padding: calc(env(safe-area-inset-top) + var(--spacing) * 4) max(calc(var(--spacing) * 4), env(safe-area-inset-right)) calc(max(var(--bar-bottom, 0px), env(safe-area-inset-bottom)) + var(--spacing) * 4) max(calc(var(--spacing) * 4), env(safe-area-inset-left)); z-index: var(--z-snackbar); pointer-events: none; }
.a-snackbar-host[data-deferred='true'] { visibility: hidden; }
.a-snackbar-panel { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: calc(var(--spacing) * 2); margin-top: auto; min-width: 0; width: 100%; max-width: calc(var(--spacing) * 120); max-height: 100%; overflow-y: auto; overscroll-behavior: contain; padding: calc(var(--spacing) * 3) calc(var(--spacing) * 4); border-radius: var(--radius-md); background: var(--color-text-primary); color: var(--color-background); box-shadow: var(--elevation-floating); font-size: var(--text-body-lg); line-height: var(--text-body-lg--line-height); pointer-events: auto; }
.a-snackbar-message { min-width: 0; overflow-wrap: anywhere; }
.a-snackbar-panel > .a-snackbar-icon { grid-column: 1; grid-row: 1; }
.a-snackbar-dismiss { grid-column: 3; grid-row: 1; }
.a-snackbar-icon { width: var(--icon-md); height: var(--icon-md); flex-shrink: 0; }
.a-snackbar-action, .a-snackbar-dismiss { display: inline-flex; min-width: calc(var(--spacing) * 11); min-height: calc(var(--spacing) * 11); align-items: center; justify-content: center; flex-shrink: 0; border-radius: var(--radius-sm); cursor: pointer; }
.a-snackbar-action { grid-column: 2 / -1; grid-row: 2; justify-self: end; min-width: 0; max-width: 100%; overflow-wrap: anywhere; padding: var(--spacing) calc(var(--spacing) * 2); font-weight: 600; text-decoration: underline; }
.a-snackbar-action:disabled { cursor: progress; }
.a-snackbar-action:focus-visible, .a-snackbar-dismiss:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.a-snackbar-enter-active { transition: opacity var(--duration-base) var(--ease-out), transform var(--duration-base) var(--ease-out); }
.a-snackbar-leave-active { transition: opacity var(--duration-fast) var(--ease-in); }
.a-snackbar-enter-from { opacity: 0; transform: translateY(calc(var(--spacing) * 2)); }
.a-snackbar-leave-to { opacity: 0; }
@media (min-width: 768px) { .a-snackbar-host { padding-bottom: calc(env(safe-area-inset-bottom) + var(--spacing) * 4); } }
.a-snackbar-host[data-keyboard='true'] { padding-bottom: calc(env(safe-area-inset-bottom) + var(--spacing) * 4); }
@media (pointer: coarse), (any-pointer: coarse), (hover: none) { .a-snackbar-action, .a-snackbar-dismiss { min-width: calc(var(--spacing) * 12); min-height: calc(var(--spacing) * 12); } }
@media (prefers-reduced-motion: reduce) { .a-snackbar-enter-active, .a-snackbar-leave-active { transition: opacity var(--duration-fast) var(--ease-out); } .a-snackbar-enter-from { transform: none; } }
</style>
