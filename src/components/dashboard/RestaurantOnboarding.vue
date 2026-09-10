<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhCheckCircle, PhCircle, PhLockSimple, PhStorefront } from '@phosphor-icons/vue'

import ASurface from '@/components/ui/ASurface.vue'
import AButton from '@/components/ui/AButton.vue'
import { useRestaurantOnboarding } from '@/composables/useRestaurantOnboarding'

const props = defineProps<{ totalTables: number }>()
const emit = defineEmits<{ 'open-floor-editor': [] }>()

const { t } = useI18n()
const { steps, completedCount, totalCount, percent } = useRestaurantOnboarding(() => props.totalTables)

function onStepAction(action: 'open-floor-editor' | undefined): void {
  if (action === 'open-floor-editor') emit('open-floor-editor')
}
</script>

<template>
  <ASurface tone="container" radius="lg" bordered elevated class="p-6">
    <div class="flex items-center gap-3">
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
        <PhStorefront :size="22" aria-hidden="true" />
      </span>
      <div>
        <h3 class="text-title-lg font-semibold text-on-surface">{{ t('onboarding.title') }}</h3>
        <p class="text-body-md text-on-surface-variant">{{ t('onboarding.subtitle') }}</p>
      </div>
    </div>

    <div class="mt-4 flex items-center gap-3">
      <div class="h-2 flex-1 overflow-hidden rounded-full bg-surface-container-high">
        <div class="h-full rounded-full bg-primary transition-[width] duration-300 ease-out" :style="{ width: `${percent}%` }" />
      </div>
      <span class="shrink-0 text-label-lg font-medium text-on-surface-variant">
        {{ t('onboarding.progress', { done: completedCount, total: totalCount }) }}
      </span>
    </div>

    <ul class="mt-5 flex flex-col gap-1">
      <li
        v-for="step in steps"
        :key="step.id"
        class="flex items-center gap-3 rounded-lg px-2 py-2.5"
        :class="step.status === 'available' ? 'hover:bg-surface-container-high' : ''"
      >
        <PhCheckCircle v-if="step.status === 'done'" :size="20" class="shrink-0 text-success" aria-hidden="true" />
        <PhCircle v-else-if="step.status === 'available'" :size="20" class="shrink-0 text-primary" aria-hidden="true" />
        <PhLockSimple v-else :size="20" class="shrink-0 text-on-surface-variant/50" aria-hidden="true" />

        <span
          class="flex-1 text-body-md"
          :class="step.status === 'future' ? 'text-on-surface-variant/60' : 'text-on-surface'"
        >
          {{ t(step.labelKey) }}
          <span v-if="step.status === 'future'" class="ml-1 text-label-md">({{ t('onboarding.comingSoon') }})</span>
        </span>

        <AButton v-if="step.status === 'available'" variant="text" @click="onStepAction(step.action)">
          {{ t('onboarding.configure') }}
        </AButton>
      </li>
    </ul>
  </ASurface>
</template>
