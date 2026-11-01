<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhClockCounterClockwise, PhUserCircleMinus } from '@phosphor-icons/vue'

import type { OperationsTable } from '@/types/operations'
import { formatDuration } from '@/utils/format'
import { serviceTableStatus } from '@/utils/service-table-status'
import { extraTableSignals } from './floor-table-signals'
import { floorTableIconTone, floorTableTone } from './floor-table-tone'

const props = withDefaults(
  defineProps<{
    table: OperationsTable
    label: string
    selected?: boolean
    /** Session opened before the current operational day — show that, not a multi-day "wait". */
    previousSession?: boolean
  }>(),
  { selected: false, previousSession: false },
)

defineEmits<{ select: [] }>()
const { t } = useI18n()

const style = computed(() => serviceTableStatus(props.table.primary_status))

const shapeClass = computed(() => {
  switch (props.table.layout.shape) {
    case 'round':
      return 'rounded-full'
    case 'rectangle':
      return 'rounded-(--radius-md)'
    default:
      return 'rounded-(--radius-md)'
  }
})

const positionStyle = computed(() => ({
  left: `${(props.table.layout.x ?? 0.5) * 100}%`,
  top: `${(props.table.layout.y ?? 0.5) * 100}%`,
  width: `${Math.max(props.table.layout.width ?? 84, 64)}px`,
  height: `${Math.max(props.table.layout.height ?? 64, 48)}px`,
  transform: `translate(-50%, -50%) rotate(${props.table.layout.rotation ?? 0}deg)`,
}))

const hasUnassignedFlag = computed(() => props.table.flags.includes('unassigned'))
const signals = computed(() => extraTableSignals(props.table))
</script>

<template>
  <button
    type="button"
    class="absolute flex min-w-max flex-col items-center justify-center gap-1 border px-2 transition-colors duration-fast ease-out hover:z-10 hover:border-control focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    :class="[shapeClass, floorTableTone(table.primary_status), selected ? 'z-10 ring-2 ring-accent ring-offset-2 ring-offset-surface-subtle' : '']"
    :style="positionStyle"
    :aria-label="label"
    :aria-pressed="selected"
    @click="$emit('select')"
  >
    <component :is="style.icon" :size="16" :weight="style.state === 'attention' ? 'fill' : 'regular'" :class="floorTableIconTone(table.primary_status)" aria-hidden="true" />
    <span class="whitespace-nowrap text-label-lg font-semibold leading-none">{{ table.name }}</span>
    <span v-if="table.session && previousSession" class="inline-flex items-center gap-0.5 whitespace-nowrap text-label-md leading-none text-fg-muted">
      <PhClockCounterClockwise :size="12" aria-hidden="true" />{{ t('operations.board.floor.previous') }}
    </span>
    <span v-else-if="table.session" class="whitespace-nowrap text-label-md tabular-nums leading-none" :class="style.state === 'attention' ? '' : 'text-fg-muted'">
      {{ table.session.guest_count }} · {{ formatDuration(table.session.elapsed_seconds) }}
    </span>
    <span
      v-if="signals.length || hasUnassignedFlag"
      class="absolute -right-2 -top-2.5 flex items-center gap-0.5 rounded-full border border-hairline bg-surface px-1 py-0.5 shadow-raised"
      aria-hidden="true"
    >
      <component :is="signal.icon" v-for="signal in signals" :key="signal.flag" :size="12" weight="fill" class="text-accent" />
      <PhUserCircleMinus v-if="hasUnassignedFlag" :size="12" weight="fill" class="text-danger" />
    </span>
  </button>
</template>
