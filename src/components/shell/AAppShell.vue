<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhSidebarSimple } from '@phosphor-icons/vue'
import AIconButton from '@/components/ui/AIconButton.vue'
import ShellNavigation from './ShellNavigation.vue'
import ShellTopbar from './ShellTopbar.vue'
import ShellMoreSheet from './ShellMoreSheet.vue'
import { partitionShellNavigation, type ShellNavItem } from './navigation'
import { useShellLayout } from '@/composables/useShellLayout'
import aforoSymbol from '@/assets/brand/aforo-symbol.png'

// chromeVisible is the presentation seam for a future immersive route. No
// route enables it in Phase 3; the KDS and domain views remain unchanged.
const props = withDefaults(defineProps<{ items: ShellNavItem[]; routeKey: string; chromeVisible?: boolean }>(), { chromeVisible: true })
const { t } = useI18n()
const topbar = ref<HTMLElement | null>(null)
const bottom = ref<HTMLElement | null>(null)
const main = ref<HTMLElement | null>(null)
const topbarComponent = ref<InstanceType<typeof ShellTopbar> | null>(null)
// The header component's root remains the measured bar, not a second wrapper.
watch(topbarComponent, value => { topbar.value = value?.$el instanceof HTMLElement ? value.$el : null }, { flush: 'post' })
const { compact, desktop, sidebar, collapsed, mode, keyboard } = useShellLayout(topbar, bottom, () => props.chromeVisible)
const navigation = computed(() => partitionShellNavigation(props.items, mode.value))
const moreOpen = ref(false)
let moreTrigger: HTMLElement | null = null
let routeFocusPending = false
const moreShown = ref(false)
function openMore(event: MouseEvent): void {
  moreTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  moreShown.value = true
  moreOpen.value = true
}
function focusMain(): void { main.value?.focus({ preventScroll: true }) }
async function afterMoreClose(): Promise<void> {
  moreShown.value = false
  if (routeFocusPending) { routeFocusPending = false; focusMain(); return }
  await nextTick()
  if (!moreTrigger?.isConnected || !moreTrigger.getClientRects().length) {
    const control = document.querySelector<HTMLElement>('[data-shell-more]')
    if (control?.getClientRects().length) control.focus({ preventScroll: true }); else focusMain()
  }
}
watch(() => props.routeKey, async () => {
  if (moreShown.value) { routeFocusPending = true; moreOpen.value = false; return }
  // Respect page-specific autofocus and existing dialogs. Query/filter changes
  // don't change routeKey and therefore don't steal focus from form controls.
  await nextTick()
  if (document.querySelector('[role="dialog"]')) return
  if (!main.value?.contains(document.activeElement)) focusMain()
})
</script>

<template>
  <div class="a-app-shell" :data-sidebar="sidebar" :data-compact="compact" :data-keyboard="keyboard" :data-chrome="chromeVisible">
    <a href="#main-content" class="shell-skip-link" @click="focusMain">{{ t('appShell.skipToContent') }}</a>

    <!-- Compact comes first: global context, page content, persistent bottom nav. -->
    <ShellTopbar v-if="chromeVisible" ref="topbarComponent" :restaurant-visible="!sidebar" :user-visible="!desktop">
      <template #restaurant><slot name="restaurant" /></template>
      <template #activity><slot name="activity" /></template>
      <template #language><slot name="language" /></template>
      <template #theme><slot name="theme" /></template>
      <template #user><slot name="user" /></template>
    </ShellTopbar>
    <main id="main-content" ref="main" tabindex="-1" class="shell-main"><slot /></main>
    <div v-if="chromeVisible && compact" v-show="!keyboard" ref="bottom" class="shell-bottom">
      <ShellNavigation :items="navigation.primary" mode="bottom" more :more-active="navigation.moreActive" :more-open="moreOpen" :more-count="navigation.moreCount" @more="openMore" />
    </div>
    <ShellMoreSheet :open="moreOpen" :items="navigation.overflow" @update:open="moreOpen = $event" @close="afterMoreClose">
      <template #language><slot name="language-inline" /></template>
      <template #theme><slot name="theme-inline" /></template>
      <template #account><slot name="account-inline" /></template>
    </ShellMoreSheet>

    <!-- Same model and renderer, expanded for tablet and desktop. -->
    <aside v-if="chromeVisible && !compact" class="shell-side" :data-expanded="sidebar">
      <div class="shell-side-context">
        <img :src="aforoSymbol" alt="AFORO" class="shell-brand" />
        <AIconButton v-if="desktop" :label="t(collapsed ? 'appShell.expandSidebar' : 'appShell.collapseSidebar')" :pressed="collapsed" class="shell-collapse" @click="collapsed = !collapsed"><PhSidebarSimple /></AIconButton>
        <Transition name="shell-sidebar-context"><div v-if="sidebar" class="shell-side-restaurant"><slot name="restaurant" /></div></Transition>
      </div>
      <ShellNavigation :items="navigation.primary" :mode="mode === 'sidebar' ? 'sidebar' : 'rail'" :more="!sidebar" :more-active="navigation.moreActive" :more-open="moreOpen" :more-count="navigation.moreCount" class="shell-side-navigation" @more="openMore" />
      <div v-if="desktop" class="shell-side-user" :data-compact="!sidebar"><slot name="user" /></div>
    </aside>
    <slot name="notifications" />
  </div>
</template>

<style scoped>
.a-app-shell { --shell-side-width: 0px; display: grid; grid-template-columns: var(--shell-side-width) minmax(0, 1fr); grid-template-rows: auto 1fr; min-height: 100dvh; min-width: 0; background: var(--color-background); color: var(--color-text-primary); transition: grid-template-columns var(--duration-base) var(--ease-in-out); }
.a-app-shell > :deep(.shell-topbar), .shell-main { grid-column: 2; }
.shell-main { min-width: 0; max-width: 100%; padding: calc(var(--spacing) * 4); padding-left: max(calc(var(--spacing) * 4), env(safe-area-inset-left)); padding-right: max(calc(var(--spacing) * 4), env(safe-area-inset-right)); padding-bottom: calc(max(var(--bar-bottom, 0px), env(safe-area-inset-bottom)) + var(--spacing) * 4); scroll-margin-top: calc(var(--bar-top, 0px) + var(--spacing) * 4); }
.shell-main:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: -2px; }
.shell-main :deep(:focus) { scroll-margin-block: calc(var(--bar-top, 0px) + var(--spacing) * 4) calc(var(--bar-bottom, 0px) + var(--spacing) * 4); }
.shell-bottom { position: fixed; inset: auto 0 0; min-height: calc(var(--spacing) * 14 + env(safe-area-inset-bottom)); padding: var(--spacing) max(calc(var(--spacing) * 4), env(safe-area-inset-right)) calc(var(--spacing) + env(safe-area-inset-bottom)) max(calc(var(--spacing) * 4), env(safe-area-inset-left)); border-top: 1px solid var(--color-border); background: var(--color-surface); z-index: var(--z-nav); }
.shell-side { display: none; }
.shell-skip-link { position: fixed; top: calc(env(safe-area-inset-top) + var(--spacing) * 4); left: calc(env(safe-area-inset-left) + var(--spacing) * 4); width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.shell-skip-link:focus-visible { width: auto; height: auto; clip-path: none; padding: calc(var(--spacing) * 3) calc(var(--spacing) * 4); border-radius: var(--radius-md); background: var(--color-primary); color: var(--color-on-primary); z-index: var(--z-snackbar); outline: 2px solid var(--color-focus-ring); outline-offset: 2px; }
.a-app-shell :deep(.app-shell-ready) { bottom: calc(max(var(--bar-bottom, 0px), env(safe-area-inset-bottom)) + var(--spacing) * 4); max-height: calc(100dvh - var(--bar-top, 0px) - var(--bar-bottom, 0px) - var(--spacing) * 8); overflow-y: auto; z-index: var(--z-menu); overflow-wrap: anywhere; }
@media (min-width: 768px) {
  .a-app-shell { --shell-side-width: calc(var(--rail) + env(safe-area-inset-left)); }
  .shell-bottom { display: none; }
  .shell-main { padding-left: max(calc(var(--spacing) * 6), env(safe-area-inset-left)); padding-right: max(calc(var(--spacing) * 6), env(safe-area-inset-right)); }
  .shell-side { position: fixed; inset: 0 auto 0 0; display: flex; flex-direction: column; gap: calc(var(--spacing) * 4); width: var(--shell-side-width); height: 100dvh; padding: max(calc(var(--spacing) * 4), env(safe-area-inset-top)) var(--spacing) max(calc(var(--spacing) * 4), env(safe-area-inset-bottom)) max(var(--spacing), env(safe-area-inset-left)); border-right: 1px solid var(--color-border); background: var(--color-background); z-index: var(--z-nav); }
  .shell-side-context { display: flex; flex-direction: column; align-items: center; gap: calc(var(--spacing) * 2); min-width: 0; flex-shrink: 0; }
  .shell-brand { width: calc(var(--spacing) * 8); height: calc(var(--spacing) * 8); object-fit: contain; }
  .shell-side-navigation { min-height: 0; overflow-y: auto; flex: 1; scrollbar-width: thin; padding: var(--spacing); }
  .shell-side-user { min-width: 0; padding: var(--spacing); }
  .shell-side-user :deep(button) { max-width: 100%; min-height: calc(var(--spacing) * 12); }
  .shell-side-user[data-compact='true'] :deep(button > span:not([aria-hidden])) { display: none; }
.shell-sidebar-context-enter-active { transition: opacity var(--duration-fast) var(--ease-out); }
.shell-sidebar-context-leave-active { transition: opacity var(--duration-fast) var(--ease-in); }
.shell-sidebar-context-enter-from, .shell-sidebar-context-leave-to { opacity: 0; }
  .shell-side-user :deep([role='menu']) { left: 0; right: auto; bottom: 100%; top: auto; max-height: 70dvh; max-width: calc(100vw - var(--spacing) * 8); overflow-y: auto; z-index: var(--z-menu); }
}
@media (min-width: 1280px) {
  .a-app-shell[data-sidebar='true'] { --shell-side-width: calc(var(--sidebar) + env(safe-area-inset-left)); }
  .shell-main { padding-left: max(calc(var(--spacing) * 8), env(safe-area-inset-left)); padding-right: max(calc(var(--spacing) * 8), env(safe-area-inset-right)); }
  .shell-side[data-expanded='true'] { padding-inline: max(calc(var(--spacing) * 3), env(safe-area-inset-left)) calc(var(--spacing) * 3); }
  .shell-side[data-expanded='true'] .shell-side-context { display: grid; grid-template-columns: minmax(0, 1fr) auto; }
  .shell-side[data-expanded='true'] .shell-brand { margin-left: calc(var(--spacing) * 3); }
  .shell-side-restaurant { grid-column: 1 / -1; min-width: 0; }
  .shell-side-restaurant :deep(p), .shell-side-restaurant :deep(button) { max-width: 100%; width: 100%; min-height: calc(var(--spacing) * 12); }
  .shell-side-restaurant :deep([role='menu']) { max-height: 60dvh; overflow-y: auto; z-index: var(--z-menu); }
}
@media (min-width: 1440px) { .shell-main { padding-left: max(calc(var(--spacing) * 10), env(safe-area-inset-left)); padding-right: max(calc(var(--spacing) * 10), env(safe-area-inset-right)); } }
@media (prefers-reduced-motion: reduce) { .a-app-shell, .shell-sidebar-context-enter-active, .shell-sidebar-context-leave-active { transition: none; } }
.a-app-shell[data-chrome='false'] { --shell-side-width: 0px; grid-template-rows: minmax(0, 1fr); }
@media (prefers-reduced-transparency: no-preference) {
  @supports (backdrop-filter: blur(20px)) { .shell-bottom { background: color-mix(in srgb, var(--color-surface) 82%, transparent); backdrop-filter: blur(20px) saturate(160%); } }
}
@media (prefers-contrast: more), (prefers-reduced-transparency: reduce) { .shell-bottom { background: var(--color-surface); backdrop-filter: none; } }
</style>

<style>
html[data-shell-v2] { scroll-padding-top: calc(var(--bar-top, 0px) + var(--spacing) * 4); scroll-padding-bottom: calc(var(--bar-bottom, 0px) + var(--spacing) * 4); }
</style>
