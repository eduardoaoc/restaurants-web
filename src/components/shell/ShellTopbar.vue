<script setup lang="ts">
withDefaults(defineProps<{ restaurantVisible?: boolean; userVisible?: boolean }>(), { restaurantVisible: true, userVisible: true })
</script>

<template>
  <header class="shell-topbar">
    <div v-if="restaurantVisible" class="shell-restaurant"><slot name="restaurant" /></div>
    <div class="shell-global-actions">
      <div class="shell-secondary-actions"><slot name="language" /><slot name="theme" /></div>
      <slot name="activity" />
      <div v-if="userVisible" class="shell-user"><slot name="user" /></div>
    </div>
  </header>
</template>

<style scoped>
.shell-topbar { position: sticky; top: 0; display: flex; flex-wrap: wrap; align-items: center; gap: calc(var(--spacing) * 2); min-width: 0; min-height: calc(var(--spacing) * 13 + env(safe-area-inset-top)); padding: env(safe-area-inset-top) max(calc(var(--spacing) * 4), env(safe-area-inset-right)) 0 max(calc(var(--spacing) * 4), env(safe-area-inset-left)); border-bottom: 1px solid var(--color-border); background: var(--color-surface); z-index: var(--z-nav); }
.shell-restaurant { min-width: 0; flex: 1 1 12rem; }
.shell-global-actions { display: flex; align-items: center; gap: calc(var(--spacing) * 2); margin-left: auto; }
.shell-secondary-actions { display: none; }
.shell-user { min-width: 0; }
.shell-user :deep(button > span:not([aria-hidden])) { display: none; }
.shell-restaurant :deep(p), .shell-restaurant :deep(button) { width: 100%; max-width: 100%; }
.shell-topbar :deep(button) { min-width: calc(var(--spacing) * 12); min-height: calc(var(--spacing) * 12); height: auto; border-radius: var(--radius-md); }
.shell-restaurant :deep([role='menu']) { max-width: calc(100vw - var(--spacing) * 8); max-height: 60dvh; overflow-y: auto; z-index: var(--z-menu); }
.shell-topbar :deep([role='menu'] button), .shell-topbar :deep([role='menu'] a) { min-height: calc(var(--spacing) * 12); white-space: normal; overflow-wrap: anywhere; }
@media (min-width: 768px) {
  .shell-topbar { min-height: calc(var(--spacing) * 14 + env(safe-area-inset-top)); padding-inline: max(calc(var(--spacing) * 6), env(safe-area-inset-left)); }
  .shell-secondary-actions { display: flex; align-items: center; gap: calc(var(--spacing) * 2); }
}
@media (prefers-reduced-transparency: no-preference) {
  @supports (backdrop-filter: blur(20px)) { .shell-topbar { background: color-mix(in srgb, var(--color-surface) 82%, transparent); backdrop-filter: blur(20px) saturate(160%); } }
}
@media (prefers-contrast: more), (prefers-reduced-transparency: reduce) { .shell-topbar { background: var(--color-surface); backdrop-filter: none; } }
</style>
