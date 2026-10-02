<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { KITCHEN_STATUSES, type KitchenStatus } from '@/types/kitchen'

const props = defineProps<{ counts: Record<KitchenStatus, number> }>()
defineEmits<{ select: [KitchenStatus] }>()

const { t } = useI18n()

/** §7 — "se Listos crescer, deixar visualmente evidente": a simple, honest threshold (not a derived diagnosis — CLAUDE.md §9/CARTA §7 "não inventar diagnóstico"), just a visual nudge once the ready queue starts piling up. */
const READY_ATTENTION_THRESHOLD = 3
function isAttention(status: KitchenStatus): boolean {
  return status === 'ready' && props.counts.ready >= READY_ATTENTION_THRESHOLD
}
</script>

<template>
  <ol class="flex flex-wrap items-stretch gap-2" :aria-label="t('kitchen.dashboard.sections.flow')">
    <li v-for="(status, index) in KITCHEN_STATUSES" :key="status" class="flex min-w-[6.5rem] flex-1 items-stretch gap-2">
      <button
        type="button"
        class="flex min-h-12 flex-1 flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :class="isAttention(status) ? 'bg-warning-container text-on-warning-container' : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'"
        @click="$emit('select', status)"
      >
        <span class="text-label-md">{{ t(`kitchen.columns.${status}`) }}</span>
        <span class="text-title-lg font-bold tabular-nums">{{ counts[status] }}</span>
      </button>
      <span v-if="index < KITCHEN_STATUSES.length - 1" aria-hidden="true" class="self-center text-on-surface-variant">→</span>
    </li>
  </ol>
</template>
