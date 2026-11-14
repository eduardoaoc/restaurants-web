<script setup lang="ts">
export interface StageStat { id: string; label: string; value: string; context?: string }
defineProps<{ items: StageStat[] }>()
</script>

<template>
  <!-- Four independent compact cards in one row over the room (top-left): small label, big number. -->
  <dl class="stage-stats grid grid-cols-4 gap-1.5 md:gap-2">
    <div v-for="item in items" :key="item.id" class="stage-panel min-w-0 rounded-saloa-md px-2 py-2 md:px-3" :title="item.label">
      <dt class="line-clamp-2 text-label-md leading-4 text-fg-muted md:line-clamp-1">{{ item.label }}</dt>
      <dd class="mt-0.5 truncate text-metric-sm tabular-nums text-fg md:text-metric">{{ item.value }}</dd>
      <dd v-if="item.context" class="truncate text-label-md text-fg-muted">{{ item.context }}</dd>
    </div>
  </dl>
</template>
