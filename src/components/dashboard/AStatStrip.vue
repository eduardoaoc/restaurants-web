<script setup lang="ts">
defineProps<{
  items: Array<{ id: string; label: string; value: string; context?: string }>
  /** Tighter cells on phones (the operation board must leave room for the room below it). */
  compact?: boolean
}>()
</script>

<template>
  <dl class="a-stat-strip grid grid-cols-2 rounded-saloa-lg border border-hairline bg-surface px-4 md:px-5" :class="items.length === 3 ? 'grid-cols-2 [&>div:last-child]:col-span-2 md:grid-cols-3 md:[&>div:last-child]:col-span-1' : 'md:grid-cols-4'">
    <div
      v-for="(item, index) in items"
      :key="item.id"
      class="min-w-0 px-3 first:pl-0 last:pr-0 md:py-4"
      :class="[compact ? 'py-2' : 'py-3', index < 2 ? 'a-stat-strip-mobile-first-row' : '']"
    >
      <dt class="break-words text-label-md text-fg-muted">{{ item.label }}</dt>
      <dd class="break-words tabular-nums text-fg" :class="compact ? 'text-title-lg font-semibold md:text-metric md:font-normal md:mt-1' : 'mt-1 text-metric'">{{ item.value }}</dd>
      <dd v-if="item.context" class="break-words text-label-md text-fg-muted md:mt-1" :class="compact ? '' : 'mt-1'">{{ item.context }}</dd>
    </div>
  </dl>
</template>

<style scoped>
.a-stat-strip > div:nth-child(odd) { border-right: 1px solid var(--color-border); padding-left: 0; padding-right: calc(var(--spacing) * 3); }
.a-stat-strip > div:nth-child(even) { padding-left: calc(var(--spacing) * 3); }
.a-stat-strip > div:last-child { border-right: 0; }
.a-stat-strip-mobile-first-row { border-bottom: 1px solid var(--color-border); }
@media (min-width: 768px) {
  .a-stat-strip > div:nth-child(odd), .a-stat-strip > div:nth-child(even) { border-right: 1px solid var(--color-border); padding-right: calc(var(--spacing) * 4); padding-left: calc(var(--spacing) * 4); }
  .a-stat-strip > div:first-child { padding-left: 0; }
  .a-stat-strip > div:last-child { border-right: 0; padding-right: 0; }
  .a-stat-strip-mobile-first-row { border-bottom: 0; }
}
</style>
