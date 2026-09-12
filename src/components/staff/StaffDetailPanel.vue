<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhChartBar, PhClock, PhPencilSimple, PhStar, PhStorefront, PhWarningCircle } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import { usePermissions } from '@/composables/usePermissions'
import { staffService } from '@/services/staff.service'
import { useRestaurantStore } from '@/stores/restaurant'
import { formatNumber } from '@/utils/format'
import { staffInitials, staffRoleLabelKey } from '@/utils/staff'
import type { StaffMember, StaffPerformance, StaffShift } from '@/types/staff'

const props = defineProps<{
  member: StaffMember
  activeShift: StaffShift | null
  shiftsVisible: boolean
  canEdit: boolean
}>()

defineEmits<{ edit: [] }>()

const { t, locale } = useI18n()
const restaurantStore = useRestaurantStore()
const { can } = usePermissions()

const roleLabel = computed(() =>
  props.member.role ? t(staffRoleLabelKey(props.member.role.slug)) : t('staff.roles.unassigned'),
)

const currentRestaurantAssignment = computed(() =>
  props.member.restaurants.find((restaurant) => restaurant.id === restaurantStore.currentRestaurantId) ?? null,
)

/**
 * Performance is a different permission (`view_reports`) AND is scoped to one
 * explicit restaurant the person actually works at — querying it through a
 * restaurant they have no link to is a 404 by design, so both conditions are
 * checked before any request is made.
 */
const canReadPerformance = computed(() => can('view_reports') && currentRestaurantAssignment.value !== null)

const performance = ref<StaffPerformance | null>(null)
const performanceLoading = ref(false)
let controller: AbortController | null = null

watch(
  () => [props.member.id, restaurantStore.currentRestaurantId, canReadPerformance.value] as const,
  async ([, restaurantId, allowed]) => {
    controller?.abort()
    performance.value = null

    // Resetting the flag here too is what keeps the panel from being stuck
    // on a spinner forever: this early return also runs when a previously
    // in-flight request has just been aborted, and that request's own
    // `finally` deliberately skips the reset because it was aborted.
    if (!allowed || restaurantId === null) {
      performanceLoading.value = false
      return
    }

    const localController = new AbortController()
    controller = localController
    performanceLoading.value = true

    try {
      const result = await staffService.getPerformance(restaurantId, props.member.id, localController.signal)
      if (localController.signal.aborted) return
      performance.value = result
    } catch {
      if (!localController.signal.aborted) performance.value = null
    } finally {
      if (!localController.signal.aborted) performanceLoading.value = false
    }
  },
  { immediate: true },
)

const metricRows = computed(() => {
  const metrics = performance.value?.metrics
  if (!metrics) return []

  return [
    { key: 'tables_served', value: metrics.tables_served },
    { key: 'orders_served', value: metrics.orders_served },
    { key: 'orders_created', value: metrics.orders_created },
    { key: 'table_requests_handled', value: metrics.table_requests_handled },
    { key: 'sessions_closed', value: metrics.sessions_closed },
  ]
})

const shiftElapsed = computed(() => {
  if (!props.activeShift) return null
  const startedAt = new Date(props.activeShift.started_at).getTime()
  if (Number.isNaN(startedAt)) return null

  const minutes = Math.max(0, Math.floor((Date.now() - startedAt) / 60000))
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 }
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <ASurface tone="container" radius="lg" bordered class="p-4">
      <div class="flex items-start gap-3">
        <span
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary-container text-title-md font-semibold text-on-secondary-container"
          aria-hidden="true"
        >
          {{ staffInitials(member.name) }}
        </span>
        <div class="min-w-0 flex-1">
          <h3 class="text-title-lg font-semibold text-on-surface">{{ member.name }}</h3>
          <p class="text-body-md text-on-surface-variant">{{ roleLabel }}</p>
        </div>
      </div>

      <p
        v-if="!member.role"
        class="mt-3 flex items-start gap-2 rounded-lg bg-warning-container px-3 py-2 text-label-lg text-on-warning-container"
        role="status"
      >
        <PhWarningCircle :size="18" class="mt-0.5 shrink-0" aria-hidden="true" />
        {{ t('staff.detail.noRoleNotice') }}
      </p>

      <AButton v-if="canEdit" variant="tonal" class="mt-4" @click="$emit('edit')">
        <template #leading><PhPencilSimple :size="16" /></template>
        {{ t('staff.detail.edit') }}
      </AButton>
    </ASurface>

    <!-- Acceso -->
    <ASurface tone="container" radius="lg" bordered class="p-4">
      <h4 class="text-title-md font-medium text-on-surface">{{ t('staff.detail.accessTitle') }}</h4>
      <dl class="mt-2 flex flex-col gap-2">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <dt class="text-body-md text-on-surface-variant">{{ t('staff.form.emailLabel') }}</dt>
          <dd class="min-w-0 break-all text-body-md text-on-surface">{{ member.email }}</dd>
        </div>
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <dt class="text-body-md text-on-surface-variant">{{ t('staff.detail.passwordLabel') }}</dt>
          <dd class="text-body-md text-on-surface-variant">{{ t('staff.detail.passwordHidden') }}</dd>
        </div>
      </dl>
    </ASurface>

    <!-- Dónde trabaja -->
    <ASurface tone="container" radius="lg" bordered class="p-4">
      <h4 class="text-title-md font-medium text-on-surface">{{ t('staff.detail.restaurantsTitle') }}</h4>
      <ul class="mt-2 flex flex-col gap-2">
        <li
          v-for="restaurant in member.restaurants"
          :key="restaurant.id"
          class="flex flex-wrap items-center justify-between gap-2"
        >
          <span class="inline-flex items-center gap-1.5 text-body-md text-on-surface">
            <PhStorefront :size="16" class="text-on-surface-variant" aria-hidden="true" />
            {{ restaurant.name }}
          </span>
          <span class="text-label-md text-on-surface-variant">
            {{ t('staff.detail.employeeCode', { code: restaurant.sub_id }) }}
          </span>
        </li>
      </ul>
    </ASurface>

    <!-- Actividad -->
    <ASurface v-if="shiftsVisible" tone="container" radius="lg" bordered class="p-4">
      <h4 class="text-title-md font-medium text-on-surface">{{ t('staff.detail.activityTitle') }}</h4>
      <p class="mt-2 inline-flex items-center gap-1.5 text-body-md text-on-surface-variant">
        <PhClock :size="16" aria-hidden="true" />
        {{
          activeShift
            ? shiftElapsed
              ? t('staff.shift.onShiftFor', { hours: shiftElapsed.hours, minutes: shiftElapsed.minutes })
              : t('staff.shift.onShift')
            : t('staff.shift.offShift')
        }}
      </p>
    </ASurface>

    <!-- Rendimiento -->
    <ASurface tone="container" radius="lg" bordered class="p-4">
      <h4 class="flex items-center gap-2 text-title-md font-medium text-on-surface">
        <PhChartBar :size="18" class="text-on-surface-variant" aria-hidden="true" />
        {{ t('staff.detail.performanceTitle') }}
      </h4>

      <!-- Explained rather than silently blank: this is a labelled section the owner expects to find. -->
      <p v-if="!canReadPerformance" class="mt-2 text-body-md text-on-surface-variant">
        {{ t('staff.detail.performanceNoPermission') }}
      </p>

      <div v-else-if="performanceLoading" class="flex justify-center py-4">
        <AProgress size="sm" />
      </div>

      <template v-else-if="performance">
        <p class="mt-1 text-label-md text-on-surface-variant">
          {{ t('staff.detail.performanceScope', { restaurant: performance.staff.restaurant?.name ?? '' }) }}
        </p>

        <dl class="mt-3 grid grid-cols-2 gap-3">
          <div v-for="row in metricRows" :key="row.key">
            <dt class="text-label-md text-on-surface-variant">{{ t(`staff.metrics.${row.key}`) }}</dt>
            <dd class="text-title-md font-semibold tabular-nums text-on-surface">{{ formatNumber(row.value, locale) }}</dd>
          </div>
        </dl>

        <p class="mt-3 inline-flex items-center gap-1.5 text-body-md text-on-surface-variant">
          <PhStar :size="16" aria-hidden="true" />
          {{
            performance.rating.average
              ? t('staff.detail.rating', {
                  average: performance.rating.average,
                  count: performance.rating.review_count,
                })
              : t('staff.detail.ratingEmpty')
          }}
        </p>
      </template>

      <p v-else class="mt-2 text-body-md text-on-surface-variant">{{ t('staff.detail.performanceUnavailable') }}</p>
    </ASurface>
  </div>
</template>
