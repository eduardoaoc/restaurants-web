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
  size?: 'sm' | 'md'
  modal?: boolean
}>(), { open: true, dismissible: true, closeOnScrim: true, closeOnEscape: true, size: 'md', modal: true })
const emit = defineEmits<{ close: []; 'update:open': [boolean]; 'close-error': [unknown] }>()
const { t } = useI18n()
const titleId = useId()
const root = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const body = ref<HTMLElement | null>(null)
const { viewport, style: viewportStyle } = useVisualViewport()
const rootStyle = computed(() => ({ ...viewportStyle.value, ...(viewport.value.height > 0 ? { '--overlay-visible-height': `${viewport.value.height}px` } : {}) }))
const fillHeight = computed(() => viewport.value.keyboard || viewport.value.height > 0 && viewport.value.height <= 32 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16))
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
const expandedMedia = typeof window !== 'undefined' ? window.matchMedia?.('(min-width: 768px)') : undefined
const reducedMedia = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined
const expanded = ref(expandedMedia?.matches ?? false)
const reduced = ref(reducedMedia?.matches ?? false)
const updateMedia = () => { expanded.value = expandedMedia?.matches ?? false; reduced.value = reducedMedia?.matches ?? false }
onMounted(() => { expandedMedia?.addEventListener('change', updateMedia); reducedMedia?.addEventListener('change', updateMedia) })
onBeforeUnmount(() => { expandedMedia?.removeEventListener('change', updateMedia); reducedMedia?.removeEventListener('change', updateMedia) })
function durationMs(name: 'fast' | 'base' | 'slow'): number {
  if (typeof document === 'undefined') return 0
  const value = getComputedStyle(document.documentElement).getPropertyValue?.(`--duration-${name}`).trim() ?? ''
  return (parseFloat(value) || 0) * (value.endsWith('ms') ? 1 : 1000)
}
// The animated elements are children of Transition's root. Explicit duration
// keeps them mounted (and the modal locked) until their own transitions end.
const transitionDuration = computed(() => ({
  enter: durationMs(reduced.value ? 'fast' : props.kind === 'dialog' && expanded.value ? 'base' : 'slow'),
  leave: durationMs(reduced.value ? 'fast' : 'base'),
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
      <div v-if="visible" ref="root" class="a-overlay-root" :style="rootStyle" :data-full-height="fillHeight || undefined" :data-kind="kind" :data-modal="modal">
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
.a-overlay-root { position: fixed; inset: 0; height: 100dvh; display: flex; align-items: flex-end; justify-content: center; z-index: var(--z-sheet); }
.a-overlay-root[data-kind='dialog'] { z-index: var(--z-dialog); }
.a-overlay-root[data-modal='false'] { pointer-events: none; }
.a-overlay-scrim { position: absolute; inset: 0; background: var(--color-scrim); }
.a-overlay-panel { position: relative; display: flex; flex-direction: column; width: 100%; min-width: 0; max-width: 100%; max-height: 92%; overflow: hidden; overflow-wrap: anywhere; border-radius: var(--radius-lg) var(--radius-lg) 0 0; background: var(--color-surface-elevated); color: var(--color-text-primary); box-shadow: var(--elevation-modal); pointer-events: auto; }
.a-overlay-panel:focus { outline: none; }
.a-overlay-panel [data-overlay-title]:focus { outline: none; }
.a-overlay-body, .a-overlay-footer { padding-bottom: max(calc(var(--spacing) * 4), env(safe-area-inset-bottom)); }
.a-overlay-header, .a-overlay-body, .a-overlay-footer { padding-left: max(calc(var(--spacing) * 5), env(safe-area-inset-left)); padding-right: max(calc(var(--spacing) * 5), env(safe-area-inset-right)); }
.a-overlay-header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; padding-top: max(calc(var(--spacing) * 4), env(safe-area-inset-top)); max-height: calc(var(--overlay-visible-height, 100dvh) * .4); overflow-y: auto; }
.a-overlay-header h2 { min-width: 0; }
.a-overlay-header :deep(.a-control) { position: sticky; top: 0; }
.a-overlay-body { min-width: 0; overscroll-behavior: contain; scroll-padding-block: calc(var(--spacing) * 4); }
.a-overlay-body :deep(form), .a-overlay-body :deep(fieldset) { min-width: 0; max-width: 100%; }
.a-overlay-body :deep(input), .a-overlay-body :deep(select), .a-overlay-body :deep(textarea) { max-width: 100%; }
.a-overlay-footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: calc(var(--spacing) * 2); max-height: calc(var(--overlay-visible-height, 100dvh) * .4); overflow-y: auto; overscroll-behavior: contain; }
.a-overlay-footer > :deep(*) { max-width: 100%; flex-wrap: wrap; }
.a-overlay-footer > :deep(:not(.a-control)) { min-width: 0; }
.a-overlay-footer :deep(.a-control) { max-width: 100%; }
.a-overlay-root[data-kind='side'] { justify-content: flex-end; align-items: stretch; }
.a-overlay-root[data-kind='side'] .a-overlay-panel { width: min(100%, var(--pane-detail)); max-height: 100%; border-radius: var(--radius-lg) 0 0 var(--radius-lg); }
.a-overlay-root[data-kind='side'] .a-overlay-panel[data-size='md'] { width: min(100%, var(--dialog-md)); }
.a-overlay-root[data-kind='bottom'] .a-overlay-panel::before { content: ''; width: calc(var(--spacing) * 9); height: var(--spacing); margin: calc(var(--spacing) * 2) auto 0; background: var(--color-border-strong); border-radius: var(--radius-full); flex-shrink: 0; }
.a-overlay-enter-active .a-overlay-scrim { transition: opacity var(--duration-base) var(--ease-out); }
.a-overlay-leave-active .a-overlay-scrim { transition: opacity var(--duration-base) var(--ease-in); }
.a-overlay-enter-active .a-overlay-panel { transition: transform var(--duration-slow) var(--ease-out), opacity var(--duration-slow) var(--ease-out); }
.a-overlay-leave-active .a-overlay-panel { transition: transform var(--duration-base) var(--ease-in), opacity var(--duration-base) var(--ease-in); }
.a-overlay-enter-from .a-overlay-scrim, .a-overlay-leave-to .a-overlay-scrim { opacity: 0; }
.a-overlay-enter-from .a-overlay-panel, .a-overlay-leave-to .a-overlay-panel { transform: translateY(100%); opacity: 0; }
.a-overlay-root[data-kind='side']:is(.a-overlay-enter-from, .a-overlay-leave-to) .a-overlay-panel { transform: translateX(100%); }
@media (min-width: 768px) {
  .a-overlay-root[data-kind='dialog'] { align-items: center; padding: calc(var(--spacing) * 6); }
  .a-overlay-root[data-kind='dialog'] .a-overlay-panel { max-width: var(--dialog-md); max-height: 85%; border-radius: var(--radius-lg); }
  .a-overlay-root[data-kind='dialog'] .a-overlay-panel[data-size='sm'] { max-width: var(--dialog-sm); }
  .a-overlay-root[data-kind='dialog'].a-overlay-enter-active .a-overlay-panel { transition-duration: var(--duration-base); }
  .a-overlay-root[data-kind='dialog'].a-overlay-leave-active .a-overlay-panel { transition-duration: var(--duration-fast); }
  .a-overlay-root[data-kind='dialog']:is(.a-overlay-enter-from, .a-overlay-leave-to) .a-overlay-panel { transform: scale(.98); }
}
@media (max-width: 767px) {
  .a-overlay-root[data-kind='side'] { align-items: flex-end; justify-content: center; }
  .a-overlay-root[data-kind='side'] .a-overlay-panel[data-size] { width: 100%; height: auto; max-height: 92%; border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
  .a-overlay-root[data-kind='side']:is(.a-overlay-enter-from, .a-overlay-leave-to) .a-overlay-panel { transform: translateY(100%); }
  .a-overlay-footer > :deep(.flex) { flex-direction: column; }
  .a-overlay-footer :deep(.a-control) { width: 100%; }
  .a-overlay-body :deep(input:not([type='checkbox']):not([type='radio'])), .a-overlay-body :deep(select), .a-overlay-body :deep(textarea) { font-size: max(1rem, 16px); }
}
.a-overlay-root[data-full-height='true'] .a-overlay-panel[data-size] { height: 100%; max-height: 100%; }
@media (max-width: 767px), (max-height: 32rem) {
  .a-overlay-root[data-full-height='true'] { padding: 0; }
  .a-overlay-root[data-full-height='true'] .a-overlay-panel { border-radius: 0; }
}
/* An inset hairline adds no extra geometry to the elevation in Dark. */
@media (prefers-color-scheme: dark) {
  :global(:root:not([data-theme='light'])) .a-overlay-panel { border: 1px solid var(--color-border); }
}
:global(:root[data-theme='dark']) .a-overlay-panel { border: 1px solid var(--color-border); }
@media (prefers-reduced-motion: reduce) {
  .a-overlay-root[data-kind]:is(.a-overlay-enter-from, .a-overlay-leave-to) .a-overlay-panel { transform: none; }
  .a-overlay-root .a-overlay-panel, .a-overlay-root .a-overlay-scrim { transition: opacity var(--duration-fast) var(--ease-out); }
}
</style>
