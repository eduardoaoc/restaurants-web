<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * Lightweight step indicator for the guided feedback wizard (Carta 5.2) —
 * a thin fill bar plus a "Paso X de Y" line, never a heavy corporate
 * stepper with numbered circles/labels per step (§4 "não transformar em
 * wizard corporativo pesado"). `current`/`total` are both 1-based.
 */
const props = defineProps<{ current: number; total: number }>()

const { t } = useI18n()

const percent = computed(() => Math.round((props.current / props.total) * 100))
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div
      role="progressbar"
      :aria-valuenow="current"
      aria-valuemin="1"
      :aria-valuemax="total"
      :aria-valuetext="t('publicMenu.feedback.wizard.stepProgress', { current, total })"
      class="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high"
    >
      <div class="h-full rounded-full bg-primary transition-[width] duration-300 ease-out" :style="{ width: `${percent}%` }" />
    </div>
    <p class="text-label-md text-on-surface-variant" aria-hidden="true">
      {{ t('publicMenu.feedback.wizard.stepProgress', { current, total }) }}
    </p>
  </div>
</template>
