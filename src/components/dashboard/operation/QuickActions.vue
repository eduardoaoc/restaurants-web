<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhArrowsClockwise, PhPencilSimple } from '@phosphor-icons/vue'

defineProps<{ refreshing: boolean; canManageFloorPlan: boolean }>()
const emit = defineEmits<{ 'edit-floor-plan': []; refresh: [] }>()

const { t } = useI18n()
</script>

<template>
  <!-- Only real, already-wired flows the user actually holds the permission for —
       never a CTA with nothing behind it (CLAUDE.md §20) and never one that would
       just 403 (Passo 1.2C, manage_floor_plan). -->
  <div class="flex flex-wrap gap-2" role="group" :aria-label="t('operations.quickActions.title')">
    <button
      v-if="canManageFloorPlan"
      type="button"
      class="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-high px-3.5 py-1.5 text-label-lg font-medium text-on-surface transition-colors duration-200 ease-out hover:bg-surface-container-highest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      @click="emit('edit-floor-plan')"
    >
      <PhPencilSimple :size="16" aria-hidden="true" />
      {{ t('operations.quickActions.editFloorPlan') }}
    </button>
    <button
      type="button"
      :disabled="refreshing"
      class="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-high px-3.5 py-1.5 text-label-lg font-medium text-on-surface transition-colors duration-200 ease-out hover:bg-surface-container-highest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
      @click="emit('refresh')"
    >
      <PhArrowsClockwise :size="16" aria-hidden="true" :class="refreshing ? 'animate-spin' : ''" />
      {{ t('operations.quickActions.refresh') }}
    </button>
  </div>
</template>
