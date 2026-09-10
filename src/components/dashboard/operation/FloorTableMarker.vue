<script setup lang="ts">
import { computed } from 'vue'
import { PhUserCircleMinus } from '@phosphor-icons/vue'

import { getTableStatusStyle } from '@/composables/useTableStatusStyle'
import type { OperationsTable } from '@/types/operations'
import { formatDuration } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    table: OperationsTable
    label: string
    selected?: boolean
  }>(),
  { selected: false },
)

defineEmits<{ select: [] }>()

const style = computed(() => getTableStatusStyle(props.table.primary_status))

const shapeClass = computed(() => {
  switch (props.table.layout.shape) {
    case 'round':
      return 'rounded-full'
    case 'rectangle':
      return 'rounded-lg'
    default:
      return 'rounded-xl'
  }
})

const positionStyle = computed(() => ({
  left: `${(props.table.layout.x ?? 0.5) * 100}%`,
  top: `${(props.table.layout.y ?? 0.5) * 100}%`,
  width: `${props.table.layout.width ?? 84}px`,
  height: `${props.table.layout.height ?? 64}px`,
  transform: `translate(-50%, -50%) rotate(${props.table.layout.rotation ?? 0}deg)`,
}))

const hasUnassignedFlag = computed(() => props.table.flags.includes('unassigned'))
</script>

<template>
  <button
    type="button"
    class="absolute flex flex-col items-center justify-center gap-0.5 shadow-card transition-transform duration-200 ease-out hover:z-10 hover:scale-105 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    :class="[shapeClass, style.tone, selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : '']"
    :style="positionStyle"
    :aria-label="label"
    @click="$emit('select')"
  >
    <component :is="style.icon" :size="16" aria-hidden="true" />
    <span class="text-label-md font-semibold leading-none">{{ table.name }}</span>
    <span v-if="table.session" class="text-[10px] leading-none opacity-80">
      {{ table.session.guest_count }} · {{ formatDuration(table.session.elapsed_seconds) }}
    </span>
    <PhUserCircleMinus
      v-if="hasUnassignedFlag"
      :size="14"
      class="absolute -right-1 -top-1 rounded-full bg-critical text-on-critical"
      aria-hidden="true"
    />
  </button>
</template>
