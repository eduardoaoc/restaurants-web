<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhDotsThree } from '@phosphor-icons/vue'
import AButton from '@/components/ui/AButton.vue'
import { groupShellNavigation, type ShellNavItem } from './navigation'

const props = withDefaults(defineProps<{
  items: ShellNavItem[]
  mode?: 'bottom' | 'rail' | 'sidebar' | 'sheet'
  more?: boolean
  moreActive?: boolean
  moreOpen?: boolean
  moreCount?: number
  /** Desktop icon-only presentation: labels stay in the DOM as accessible names. */
  collapsed?: boolean
}>(), { mode: 'bottom', more: false, moreActive: false, moreOpen: false, moreCount: 0, collapsed: false })
defineEmits<{ more: [MouseEvent]; navigate: [] }>()
const { t, n } = useI18n()
const groups = computed(() => groupShellNavigation(props.items, props.mode === 'sidebar'))

// One shared tooltip, teleported to <body>: the nav list scrolls (overflow) and
// the floating sidebar's backdrop-filter would trap a fixed-position child.
const tip = ref<{ label: string; top: number; left: number } | null>(null)
let tipTimer: ReturnType<typeof setTimeout> | undefined
function hideTip(): void { clearTimeout(tipTimer); tip.value = null }
function showTip(event: Event, label: string, immediate = false): void {
  if (!props.collapsed || props.mode !== 'sidebar') return
  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) return
  clearTimeout(tipTimer)
  const place = (): void => {
    const rect = target.getBoundingClientRect()
    const edge = target.closest('aside')?.getBoundingClientRect().right ?? rect.right
    tip.value = { label, top: rect.top + rect.height / 2, left: edge + 8 }
  }
  if (immediate) place(); else tipTimer = setTimeout(place, 350)
}
watch(() => props.collapsed, hideTip)
onBeforeUnmount(hideTip)
</script>

<template>
  <nav class="shell-navigation" :data-mode="mode" :data-collapsed="collapsed || undefined" :aria-label="t('appShell.mainNav')" @keydown.esc="hideTip">
    <div v-for="group in groups" :key="group.id" class="shell-nav-group" :data-group="group.id">
      <p v-if="group.labelKey" class="shell-nav-group-label text-label-md text-fg-muted">{{ t(group.labelKey) }}</p>
      <ul class="shell-nav-list">
        <li v-for="item in group.items" :key="item.id">
          <AButton
            as="RouterLink" :to="{ name: item.routeName }" variant="ghost"
            class="shell-nav-control" :data-destination="item.id" :data-active="item.active || undefined"
            :aria-current="item.active ? 'page' : undefined" @click="$emit('navigate'); hideTip()"
            @pointerenter="showTip($event, t(item.labelKey))" @pointerleave="hideTip" @focus="showTip($event, t(item.labelKey), true)" @blur="hideTip"
          >
            <span class="shell-nav-symbol" aria-hidden="true"><component :is="item.icon" :weight="item.active && mode !== 'sidebar' ? 'fill' : 'regular'" /></span>
            <span class="shell-nav-label">{{ t(item.labelKey) }}</span>
            <span v-if="item.badge" class="shell-nav-badge text-label-md tabular-nums" aria-hidden="true">{{ n(item.badge.count) }}</span>
            <span v-if="item.badge" class="sr-only">{{ t(item.badge.labelKey, { count: item.badge.count }) }}</span>
          </AButton>
        </li>
        <li v-if="more" class="shell-nav-more">
          <AButton
            variant="ghost" class="shell-nav-control" data-shell-more
            :data-active="moreActive || moreOpen || undefined" :aria-expanded="moreOpen"
            aria-haspopup="dialog" aria-controls="shell-more-sheet" @click="$emit('more', $event)"
          >
            <span class="shell-nav-symbol" aria-hidden="true"><PhDotsThree :weight="moreActive || moreOpen ? 'fill' : 'regular'" /></span>
            <span class="shell-nav-label">{{ t('appShell.more') }}</span>
            <span v-if="moreCount" class="shell-nav-badge text-label-md tabular-nums" aria-hidden="true">{{ n(moreCount) }}</span>
            <span v-if="moreCount" class="sr-only">{{ t('appShell.readyCount', { count: moreCount }) }}</span>
          </AButton>
        </li>
      </ul>
    </div>
    <Teleport to="body">
      <Transition name="shell-tip">
        <span v-if="tip" class="shell-nav-tooltip" aria-hidden="true" :style="{ top: `${tip.top}px`, left: `${tip.left}px` }">{{ tip.label }}</span>
      </Transition>
    </Teleport>
  </nav>
</template>

<style scoped>
.shell-navigation { min-width: 0; }
.shell-nav-list { display: flex; gap: calc(var(--spacing) * 2); }
.shell-nav-list > li { min-width: 0; flex: 1 1 0; }
.shell-navigation :deep(.shell-nav-control) { width: 100%; min-width: calc(var(--spacing) * 12); min-height: calc(var(--spacing) * 12); height: 100%; padding: 0 var(--spacing); color: var(--color-text-secondary); border-radius: var(--radius-md); }
.shell-navigation :deep(.a-control-label) { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0; width: 100%; font-size: var(--text-label-md); line-height: var(--text-label-md--line-height); }
.shell-navigation :deep(.shell-nav-control[data-active='true']) { color: var(--color-text-primary); font-weight: 600; }
.shell-nav-symbol { display: inline-flex; align-items: center; justify-content: center; min-width: calc(var(--spacing) * 10); border-radius: var(--radius-md); }
.shell-nav-symbol > svg { width: var(--icon-lg); height: var(--icon-lg); }
.shell-nav-control[data-active='true'] .shell-nav-symbol { background: var(--color-primary-subtle); }
.shell-nav-label { max-width: 100%; overflow-wrap: anywhere; }
.shell-nav-badge { position: absolute; right: 0; top: 0; min-width: calc(var(--spacing) * 4); padding-inline: var(--spacing); border-radius: var(--radius-full); background: var(--color-primary); color: var(--color-on-primary); }
.shell-nav-group-label { padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3); }
/* Rail follows the same ordered items as compact; excess destinations go
   to More. Its list can scroll in tablet landscape, keeping More reachable. */
.shell-navigation[data-mode='rail'] .shell-nav-list { flex-direction: column; }
.shell-navigation[data-mode='rail'] .shell-nav-list > li { flex: none; }
.shell-navigation[data-mode='rail'] :deep(.shell-nav-control) { min-height: calc(var(--spacing) * 16); padding-block: var(--spacing); }
.shell-navigation[data-mode='rail'] .shell-nav-more { position: sticky; bottom: 0; padding-top: calc(var(--spacing) * 2); background: var(--color-background); }
.shell-navigation[data-mode='sidebar'], .shell-navigation[data-mode='sheet'] { display: flex; flex-direction: column; gap: calc(var(--spacing) * 4); }
.shell-navigation[data-mode='sidebar'] .shell-nav-list, .shell-navigation[data-mode='sheet'] .shell-nav-list { flex-direction: column; }
.shell-navigation[data-mode='sidebar'] :deep(.shell-nav-control), .shell-navigation[data-mode='sheet'] :deep(.shell-nav-control) { padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3); }
.shell-navigation[data-mode='sidebar'] :deep(.a-control-label), .shell-navigation[data-mode='sheet'] :deep(.a-control-label) { flex-direction: row; justify-content: flex-start; gap: calc(var(--spacing) * 3); font-size: var(--text-body-md); text-align: left; }
.shell-navigation[data-mode='sidebar'] .shell-nav-symbol, .shell-navigation[data-mode='sheet'] .shell-nav-symbol { min-width: 0; flex-shrink: 0; }
.shell-navigation[data-mode='sidebar'] .shell-nav-symbol > svg, .shell-navigation[data-mode='sheet'] .shell-nav-symbol > svg { width: var(--icon-md); height: var(--icon-md); }
.shell-navigation[data-mode='sidebar'] .shell-nav-label, .shell-navigation[data-mode='sheet'] .shell-nav-label { flex: 1; min-width: 0; }
.shell-navigation[data-mode='sidebar'] :deep(.shell-nav-control[data-active='true']), .shell-navigation[data-mode='sheet'] :deep(.shell-nav-control[data-active='true']) { background: var(--color-primary-subtle); }
.shell-navigation[data-mode='sidebar'] .shell-nav-badge, .shell-navigation[data-mode='sheet'] .shell-nav-badge { position: static; }
.shell-nav-group[data-group='footer'] { border-top: 1px solid var(--color-border); padding-top: calc(var(--spacing) * 4); }

/* ---- Desktop floating sidebar (expanded + icon-only) -------------------- */
.shell-navigation[data-mode='sidebar'] { gap: calc(var(--spacing) * 3); }
.shell-navigation[data-mode='sidebar'] .shell-nav-list { gap: var(--spacing); }
.shell-navigation[data-mode='sidebar'] :deep(.shell-nav-control) {
  position: relative; display: flex; width: 100%; min-width: 0; min-height: var(--nav-item-height); height: var(--nav-item-height); padding: 0;
  justify-content: flex-start; border-radius: var(--nav-item-radius); color: var(--color-text-secondary); font-weight: 500; overflow: hidden;
  transition: background-color var(--nav-duration-hover) var(--ease-out), color var(--nav-duration-hover) var(--ease-out), transform var(--duration-instant) var(--ease-out);
}
.shell-navigation[data-mode='sidebar'] :deep(.a-control-label) { flex-direction: row; justify-content: flex-start; gap: 0; width: 100%; min-width: 0; font-size: var(--text-label-lg); line-height: var(--text-label-lg--line-height); text-align: left; }
.shell-navigation[data-mode='sidebar'] .shell-nav-symbol { flex: none; width: calc(var(--nav-width-collapsed) - var(--spacing) * 6); height: var(--nav-item-height); background: none; transition: transform var(--nav-duration-hover) var(--ease-out); }
.shell-navigation[data-mode='sidebar'] .shell-nav-symbol > svg { width: var(--nav-icon); height: var(--nav-icon); }
.shell-navigation[data-mode='sidebar'] .shell-nav-label { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; overflow-wrap: normal; opacity: 1; transition: opacity var(--nav-duration-hover) var(--ease-out) 60ms; }
.shell-navigation[data-mode='sidebar'] .shell-nav-badge { position: static; flex: none; margin-right: calc(var(--spacing) * 3); }
.shell-navigation[data-mode='sidebar'] :deep(.shell-nav-control[data-active='true']) { background: var(--nav-item-active); color: var(--color-text-primary); font-weight: 600; }
.shell-navigation[data-mode='sidebar'] :deep(.shell-nav-control[data-active='true'] .shell-nav-symbol) { background: none; color: var(--color-primary-text); }
.shell-navigation[data-mode='sidebar'] :deep(.shell-nav-control::before) {
  content: ''; position: absolute; left: 0; top: 50%; width: var(--nav-indicator-width); height: var(--nav-indicator-height); border-radius: var(--radius-full);
  background: var(--color-primary); transform: translateY(-50%) scaleY(0); opacity: 0;
  transition: transform var(--nav-duration-hover) var(--ease-out), opacity var(--nav-duration-hover) var(--ease-out);
}
.shell-navigation[data-mode='sidebar'] :deep(.shell-nav-control[data-active='true']::before) { transform: translateY(-50%) scaleY(1); opacity: 1; }
@media (hover: hover) {
  .shell-navigation[data-mode='sidebar'] :deep(.shell-nav-control:hover:not([data-active='true'])) { background: var(--nav-item-hover); color: var(--color-text-primary); }
  .shell-navigation[data-mode='sidebar'] :deep(.shell-nav-control:hover .shell-nav-symbol) { transform: translateX(2px); }
}
.shell-navigation[data-mode='sidebar'] :deep(.shell-nav-control:active) { transform: scale(.985); }
/* The global dark "tactile" button shadow/border is wrong for flat nav rows. */
.shell-navigation[data-mode='sidebar'][data-mode] :deep(.shell-nav-control.a-control), .shell-navigation[data-mode='sidebar'][data-mode] :deep(.shell-nav-control.a-control:active) { box-shadow: none; border-color: transparent; }
.shell-navigation[data-mode='sidebar'] :deep(.shell-nav-control:focus-visible) { outline: 2px solid var(--color-focus-ring); outline-offset: -2px; }
.shell-navigation[data-mode='sidebar'] .shell-nav-group[data-group='footer'] { border-top: 0; padding-top: 0; }
.shell-navigation[data-mode='sidebar'] .shell-nav-group + .shell-nav-group { border-top: 1px solid var(--nav-border); padding-top: calc(var(--spacing) * 3); }
.shell-navigation[data-mode='sidebar'] .shell-nav-group-label { padding: 0 calc(var(--spacing) * 3) var(--spacing); font-size: var(--text-label-md); letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; overflow: hidden; transition: opacity var(--nav-duration-hover) var(--ease-out); }
/* Icon-only: same geometry, labels fade out in place (never wrap or reflow). */
.shell-navigation[data-mode='sidebar'][data-collapsed] .shell-nav-label { opacity: 0; transition-delay: 0ms; pointer-events: none; }
.shell-navigation[data-mode='sidebar'][data-collapsed] .shell-nav-group-label { opacity: 0; height: 0; padding: 0; }
.shell-navigation[data-mode='sidebar'][data-collapsed] .shell-nav-badge { position: absolute; top: 8px; right: 8px; margin: 0; min-width: 8px; height: 8px; padding: 0; font-size: 0; }
.shell-nav-tooltip {
  position: fixed; z-index: var(--z-snackbar); transform: translateY(-50%); padding: calc(var(--spacing) * 1.5) calc(var(--spacing) * 2.5); border-radius: var(--radius-md);
  background: var(--color-surface-elevated); color: var(--color-text-primary); border: 1px solid var(--color-border); box-shadow: var(--elevation-floating);
  font-size: var(--text-label-md); line-height: var(--text-label-md--line-height); font-weight: 500; white-space: nowrap; pointer-events: none;
}
.shell-tip-enter-active, .shell-tip-leave-active { transition: opacity var(--nav-duration-hover) var(--ease-out); }
.shell-tip-enter-from, .shell-tip-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .shell-navigation[data-mode='sidebar'] :deep(.shell-nav-control), .shell-navigation[data-mode='sidebar'] .shell-nav-symbol, .shell-navigation[data-mode='sidebar'] .shell-nav-label,
  .shell-navigation[data-mode='sidebar'] :deep(.shell-nav-control::before), .shell-tip-enter-active, .shell-tip-leave-active { transition: none; }
  .shell-navigation[data-mode='sidebar'] :deep(.shell-nav-control:hover .shell-nav-symbol), .shell-navigation[data-mode='sidebar'] :deep(.shell-nav-control:active) { transform: none; }
}
</style>
