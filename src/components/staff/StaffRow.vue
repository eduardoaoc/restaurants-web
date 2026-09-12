<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhClock, PhStorefront, PhWarningCircle } from '@phosphor-icons/vue'

import { staffInitials, staffRoleLabelKey } from '@/utils/staff'
import type { StaffMember, StaffShift } from '@/types/staff'

const props = defineProps<{
  member: StaffMember
  /** The shift this person is currently on, when the viewer may read shifts at all. */
  activeShift: StaffShift | null
  /** False when the viewer lacks `manage_staff_shifts` — the indicator is then omitted entirely rather than implying "off shift". */
  shiftsVisible: boolean
  selected: boolean
}>()

defineEmits<{ select: [] }>()

const { t } = useI18n()

const roleLabel = computed(() =>
  props.member.role ? t(staffRoleLabelKey(props.member.role.slug)) : t('staff.roles.unassigned'),
)

/** Elapsed time on the current shift, from the real `started_at` timestamp. */
const shiftElapsed = computed(() => {
  if (!props.activeShift) return null
  const startedAt = new Date(props.activeShift.started_at).getTime()
  if (Number.isNaN(startedAt)) return null

  const minutes = Math.max(0, Math.floor((Date.now() - startedAt) / 60000))
  const hours = Math.floor(minutes / 60)
  return { hours, minutes: minutes % 60 }
})
</script>

<template>
  <button
    type="button"
    class="flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors duration-200 ease-out hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    :class="selected ? 'bg-surface-container-high ring-2 ring-primary' : ''"
    :aria-pressed="selected"
    @click="$emit('select')"
  >
    <span
      class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary-container text-label-lg font-semibold text-on-secondary-container"
      aria-hidden="true"
    >
      {{ staffInitials(member.name) }}
    </span>

    <span class="flex min-w-0 flex-1 flex-col gap-1">
      <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span class="text-title-md font-medium text-on-surface">{{ member.name }}</span>

        <!-- No role row for this organization: stated in words + icon, never a bare colour. -->
        <span
          v-if="!member.role"
          class="inline-flex items-center gap-1 rounded-full bg-warning-container px-2 py-0.5 text-label-md font-medium text-on-warning-container"
        >
          <PhWarningCircle :size="12" aria-hidden="true" />
          {{ t('staff.roles.unassigned') }}
        </span>
        <span v-else class="text-body-md text-on-surface-variant">{{ roleLabel }}</span>
      </span>

      <!-- Email sits a step below the role in the hierarchy: the owner scans
           for "who does what", and only then for how to contact them. -->
      <span class="truncate text-label-md text-on-surface-variant">{{ member.email }}</span>

      <span class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          v-for="restaurant in member.restaurants"
          :key="restaurant.id"
          class="inline-flex items-center gap-1 text-label-md text-on-surface-variant"
        >
          <PhStorefront :size="14" aria-hidden="true" />
          {{ restaurant.name }}
        </span>
      </span>
    </span>

    <!-- Only rendered when shifts are actually readable: with no permission
         the absence of a badge would otherwise read as "not working now". -->
    <span
      v-if="shiftsVisible && activeShift"
      class="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-container px-2.5 py-1 text-label-md font-medium text-on-success-container"
    >
      <PhClock :size="14" aria-hidden="true" />
      {{
        shiftElapsed
          ? t('staff.shift.onShiftFor', { hours: shiftElapsed.hours, minutes: shiftElapsed.minutes })
          : t('staff.shift.onShift')
      }}
    </span>
  </button>
</template>
