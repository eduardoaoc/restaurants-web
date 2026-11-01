<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhX } from '@phosphor-icons/vue'
import AIconButton from './AIconButton.vue'
import { useOverlayFocus } from '@/composables/useOverlayFocus'
import type { OverlayProps } from './overlay'
import { useVisualViewport } from '@/composables/useVisualViewport'

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<OverlayProps & {
  kind: 'dialog' | 'bottom' | 'side'
  size?: 'sm' | 'md' | 'lg'
  modal?: boolean
  /** Opt-out of the centred presentation for a menu docked to its bottom-bar origin. */
  anchored?: boolean
}>(), { open: true, dismissible: true, closeOnScrim: true, closeOnEscape: true, size: 'md', modal: true, anchored: false })
const emit = defineEmits<{ close: []; 'update:open': [boolean]; 'close-error': [unknown] }>()
const { t } = useI18n()
const titleId = useId()
const root = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const body = ref<HTMLElement | null>(null)
const { viewport, style: viewportStyle } = useVisualViewport()
const rootStyle = computed(() => ({ ...viewportStyle.value, ...(viewport.value.height > 0 ? { '--overlay-visible-height': `${viewport.value.height}px` } : {}) }))
const fillHeight = computed(() => viewport.value.keyboard || viewport.value.height > 0 && viewport.value.height <= 32 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16))
// Every modal is centred in the visible viewport; only an anchored menu or a
// nonmodal side pane keeps its edge placement.
const placement = computed(() => props.anchored ? 'bottom' : props.kind === 'side' && !props.modal ? 'side' : 'center')
watch(viewport, async () => {
  await nextTick()
  const focused = document.activeElement
  if (!body.value || !(focused instanceof HTMLElement) || !body.value.contains(focused)) return
  const field = focused.getBoundingClientRect(), bounds = body.value.getBoundingClientRect()
  if (field.bottom > bounds.bottom) body.value.scrollTop += field.bottom - bounds.bottom
  else if (field.top < bounds.top) body.value.scrollTop -= bounds.top - field.top
}, { flush: 'post' })
const visible = ref(props.open)
const active = ref(props.open)
const checkingClose = ref(false)
const reducedMedia = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined
const reduced = ref(reducedMedia?.matches ?? false)
const updateMedia = () => { reduced.value = reducedMedia?.matches ?? false }
onMounted(() => { reducedMedia?.addEventListener('change', updateMedia) })
onBeforeUnmount(() => { reducedMedia?.removeEventListener('change', updateMedia) })
function durationMs(name: 'fast' | 'base' | 'slow'): number {
  if (typeof document === 'undefined') return 0
  const value = getComputedStyle(document.documentElement).getPropertyValue?.(`--duration-${name}`).trim() ?? ''
  return (parseFloat(value) || 0) * (value.endsWith('ms') ? 1 : 1000)
}
// The animated elements are children of Transition's root. Explicit duration
// keeps them mounted (and the modal locked) until their own transitions end.
const transitionDuration = computed(() => ({
  enter: durationMs(reduced.value ? 'fast' : placement.value === 'center' ? 'base' : 'slow'),
  leave: durationMs(reduced.value || placement.value === 'center' ? 'fast' : 'base'),
}))
let generation = 0
watch(() => props.open, value => {
  generation++
  visible.value = value
  if (value) active.value = true
})
async function requestClose(): Promise<void> {
  if (!props.dismissible || checkingClose.value || !visible.value) return
  const currentGeneration = generation
  checkingClose.value = true
  try {
    if (props.beforeClose && !(await props.beforeClose())) return
    if (currentGeneration !== generation || !visible.value || !props.dismissible) return
    visible.value = false
    emit('update:open', false)
  } catch (error) { emit('close-error', error) }
  finally { checkingClose.value = false }
}
useOverlayFocus(root, panel, active, {
  modal: () => props.modal,
  initialFocus: () => props.initialFocus,
  onEscape: () => { if (props.closeOnEscape) void requestClose() },
})
function afterLeave(): void {
  if (visible.value) return
  active.value = false
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="a-overlay" :duration="transitionDuration" appear @after-leave="afterLeave">
      <div v-if="visible" ref="root" class="a-overlay-root" :style="rootStyle" :data-full-height="fillHeight || undefined" :data-kind="kind" :data-placement="placement" :data-modal="modal">
        <div v-if="modal" class="a-overlay-scrim" aria-hidden="true" @click.self="closeOnScrim && requestClose()" />
        <section
          ref="panel" v-bind="$attrs" class="a-overlay-panel" :data-size="size" role="dialog"
          :aria-modal="modal || undefined" :aria-labelledby="titleId" tabindex="-1"
        >
          <header class="a-overlay-header flex shrink-0 items-center justify-between gap-4 border-b border-hairline px-5 py-4">
            <h2 :id="titleId" data-overlay-title tabindex="-1" class="text-title-lg font-semibold text-fg"><slot name="header">{{ title }}</slot></h2>
            <AIconButton :label="t('common.close')" :disabled="!dismissible || checkingClose" @click="requestClose"><PhX /></AIconButton>
          </header>
          <div ref="body" class="a-overlay-body min-h-0 flex-1 overflow-y-auto px-5 py-4"><slot /></div>
          <footer v-if="$slots.footer" class="a-overlay-footer shrink-0 border-t border-hairline px-5 py-4"><slot name="footer" /></footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* The root is sized to the visual viewport (see rootStyle), so centring stays
 * in the visible area with the page scrolled, pinch-zoomed or under an IME.
 * Its padding is the minimum margin and also clears the safe areas.
 */
.a-overlay-root {
  position: fixed; inset: 0; height: 100dvh; display: flex; align-items: center; justify-content: center; z-index: var(--z-sheet);
  padding: max(calc(var(--spacing) * 4), env(safe-area-inset-top)) max(calc(var(--spacing) * 4), env(safe-area-inset-right)) max(calc(var(--spacing) * 4), env(safe-area-inset-bottom)) max(calc(var(--spacing) * 4), env(safe-area-inset-left));
}
.a-overlay-root[data-kind='dialog'] { z-index: var(--z-dialog); }
.a-overlay-root[data-modal='false'] { pointer-events: none; }
.a-overlay-scrim { position: absolute; inset: 0; background: var(--color-scrim); -webkit-backdrop-filter: blur(var(--scrim-blur)); backdrop-filter: blur(var(--scrim-blur)); }
.a-overlay-panel { position: relative; display: flex; flex-direction: column; width: 100%; min-width: 0; max-width: var(--dialog-md); max-height: 100%; overflow: hidden; overflow-wrap: anywhere; border-radius: var(--radius-lg); background: var(--color-surface-elevated); color: var(--color-text-primary); box-shadow: var(--elevation-modal); pointer-events: auto; }
.a-overlay-panel[data-size='sm'] { max-width: var(--dialog-sm); }
.a-overlay-panel[data-size='lg'] { max-width: var(--dialog-lg); }
.a-overlay-panel:focus { outline: none; }
.a-overlay-panel [data-overlay-title]:focus { outline: none; }
.a-overlay-header, .a-overlay-body, .a-overlay-footer { padding-left: calc(var(--spacing) * 5); padding-right: calc(var(--spacing) * 5); }
.a-overlay-header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; max-height: calc(var(--overlay-visible-height, 100dvh) * .4); overflow-y: auto; }
.a-overlay-header h2 { min-width: 0; }
.a-overlay-header :deep(.a-control) { position: sticky; top: 0; }
.a-overlay-body { min-width: 0; overscroll-behavior: contain; scroll-padding-block: calc(var(--spacing) * 4); }
.a-overlay-body :deep(form), .a-overlay-body :deep(fieldset) { min-width: 0; max-width: 100%; }
.a-overlay-body :deep(input), .a-overlay-body :deep(select), .a-overlay-body :deep(textarea) { max-width: 100%; }
.a-overlay-footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: calc(var(--spacing) * 2); max-height: calc(var(--overlay-visible-height, 100dvh) * .4); overflow-y: auto; overscroll-behavior: contain; }
.a-overlay-footer > :deep(*) { max-width: 100%; flex-wrap: wrap; }
.a-overlay-footer > :deep(:not(.a-control)) { min-width: 0; }
.a-overlay-footer :deep(.a-control) { max-width: 100%; }
/* Anchored menu: docked to the bottom bar it opened from, edge to edge. */
.a-overlay-root[data-placement='bottom'] { align-items: flex-end; padding: max(calc(var(--spacing) * 4), env(safe-area-inset-top)) 0 0; }
.a-overlay-root[data-placement='bottom'] .a-overlay-panel { max-width: 100%; max-height: 92%; border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
.a-overlay-root[data-placement='bottom'] .a-overlay-panel::before { content: ''; width: calc(var(--spacing) * 9); height: var(--spacing); margin: calc(var(--spacing) * 2) auto 0; background: var(--color-border-strong); border-radius: var(--radius-full); flex-shrink: 0; }
.a-overlay-root[data-placement='bottom'] :is(.a-overlay-header, .a-overlay-body, .a-overlay-footer) { padding-left: max(calc(var(--spacing) * 5), env(safe-area-inset-left)); padding-right: max(calc(var(--spacing) * 5), env(safe-area-inset-right)); }
.a-overlay-root[data-placement='bottom'] :is(.a-overlay-body, .a-overlay-footer) { padding-bottom: max(calc(var(--spacing) * 4), env(safe-area-inset-bottom)); }
/* Nonmodal side pane (no current caller): docked to the trailing edge. */
.a-overlay-root[data-placement='side'] { justify-content: flex-end; align-items: stretch; padding: 0; }
.a-overlay-root[data-placement='side'] .a-overlay-panel { width: min(100%, var(--pane-detail)); border-radius: var(--radius-lg) 0 0 var(--radius-lg); }
.a-overlay-enter-active .a-overlay-scrim { transition: opacity var(--duration-base) var(--ease-out); }
.a-overlay-leave-active .a-overlay-scrim { transition: opacity var(--duration-fast) var(--ease-in); }
.a-overlay-enter-active .a-overlay-panel { transition: transform var(--duration-base) var(--ease-out), opacity var(--duration-base) var(--ease-out); }
.a-overlay-leave-active .a-overlay-panel { transition: transform var(--duration-fast) var(--ease-in), opacity var(--duration-fast) var(--ease-in); }
.a-overlay-enter-from .a-overlay-scrim, .a-overlay-leave-to .a-overlay-scrim { opacity: 0; }
.a-overlay-enter-from .a-overlay-panel, .a-overlay-leave-to .a-overlay-panel { transform: scale(.98); opacity: 0; }
.a-overlay-root[data-placement='bottom']:is(.a-overlay-enter-from, .a-overlay-leave-to) .a-overlay-panel { transform: translateY(100%); }
.a-overlay-root[data-placement='side']:is(.a-overlay-enter-from, .a-overlay-leave-to) .a-overlay-panel { transform: translateX(100%); }
.a-overlay-root:not([data-placement='center']).a-overlay-enter-active .a-overlay-panel { transition-duration: var(--duration-slow); }
.a-overlay-root:not([data-placement='center']).a-overlay-leave-active .a-overlay-panel { transition-duration: var(--duration-base); }
@media (max-width: 767px) {
  .a-overlay-footer > :deep(.flex) { flex-direction: column; width: 100%; }
  .a-overlay-footer :deep(.a-control) { width: 100%; }
  .a-overlay-body :deep(input:not([type='checkbox']):not([type='radio'])), .a-overlay-body :deep(select), .a-overlay-body :deep(textarea) { font-size: max(1rem, 16px); }
}
/* Virtual keyboard or a short viewport: use all the visible height (the root
 * padding still keeps the margin), so the focused field and actions fit.
 */
.a-overlay-root[data-full-height='true'] .a-overlay-panel[data-size] { height: 100%; max-height: 100%; }
@media (max-width: 767px), (max-height: 32rem) {
  .a-overlay-root[data-full-height='true'] { padding: max(calc(var(--spacing) * 2), env(safe-area-inset-top)) max(calc(var(--spacing) * 2), env(safe-area-inset-right)) max(calc(var(--spacing) * 2), env(safe-area-inset-bottom)) max(calc(var(--spacing) * 2), env(safe-area-inset-left)); }
}
/* An inset hairline adds no extra geometry to the elevation in Dark. */
@media (prefers-color-scheme: dark) {
  :global(:root:not([data-theme='light'])) .a-overlay-panel { border: 1px solid var(--color-border); }
}
:global(:root[data-theme='dark']) .a-overlay-panel { border: 1px solid var(--color-border); }
@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
  .a-overlay-scrim { -webkit-backdrop-filter: none; backdrop-filter: none; }
}
@media (prefers-reduced-motion: reduce) {
  .a-overlay-root[data-kind]:is(.a-overlay-enter-from, .a-overlay-leave-to) .a-overlay-panel { transform: none; }
  .a-overlay-root[data-kind][data-placement] .a-overlay-panel, .a-overlay-root .a-overlay-scrim { transition: opacity var(--duration-fast) var(--ease-out); }
}
</style>
