<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { PhCheckCircle, PhCircle, PhLockSimple, PhStorefront } from '@phosphor-icons/vue'

import ASurface from '@/components/ui/ASurface.vue'
import AButton from '@/components/ui/AButton.vue'
import { usePermissions } from '@/composables/usePermissions'
import { useOrganizationStaff } from '@/composables/useOrganizationStaff'
import { useRestaurantMenu } from '@/composables/useRestaurantMenu'
import { useRestaurantOnboarding } from '@/composables/useRestaurantOnboarding'

const props = defineProps<{ totalTables: number; canManageFloorPlan: boolean }>()
const emit = defineEmits<{ 'open-floor-editor': [] }>()

const { t } = useI18n()
const router = useRouter()
const { can } = usePermissions()

const canManageMenu = () => can('manage_menu')
const canManageStaff = () => can('manage_users')
const canManageSettings = () => can('manage_restaurants')

// Only fetched while this card is actually on screen (it only renders
// before the restaurant has any table, see OperationView's `!hasAnyTables`
// gate) — both composables already self-gate on their own permission and
// abort/reset on a restaurant switch, so this is the same one-call-while-
// visible cost as everything else on this card, never a standing fetch.
const menu = useRestaurantMenu(canManageMenu)
const orgStaff = useOrganizationStaff(canManageStaff)

const { steps, completedCount, totalCount, percent } = useRestaurantOnboarding(
  () => props.totalTables,
  () => props.canManageFloorPlan,
  canManageMenu,
  () => menu.menu.value !== null,
  canManageStaff,
  // "Someone besides the owner has been added" — the same done/not-done
  // shape as floor_plan's hasTables, never an invented headcount target.
  () => orgStaff.staff.value.length > 1,
  canManageSettings,
)

function onStepAction(action: 'open-floor-editor' | 'navigate-menu' | 'navigate-staff' | 'navigate-settings' | undefined): void {
  if (action === 'open-floor-editor') emit('open-floor-editor')
  else if (action === 'navigate-menu') void router.push({ name: 'app-menu' })
  else if (action === 'navigate-staff') void router.push({ name: 'app-staff' })
  else if (action === 'navigate-settings') void router.push({ name: 'app-settings' })
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
          :class="step.status === 'future' || step.status === 'restricted' ? 'text-on-surface-variant/60' : 'text-on-surface'"
        >
          {{ t(step.labelKey) }}
          <span v-if="step.status === 'future'" class="ml-1 text-label-md">({{ t('onboarding.comingSoon') }})</span>
          <span v-else-if="step.status === 'restricted'" class="ml-1 text-label-md">({{ t('onboarding.noPermission') }})</span>
        </span>

        <AButton v-if="step.status === 'available'" variant="text" @click="onStepAction(step.action)">
          {{ t('onboarding.configure') }}
        </AButton>
      </li>
    </ul>
  </ASurface>
</template>
