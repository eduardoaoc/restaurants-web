<script setup lang="ts">
import { onBeforeUnmount, watchEffect } from 'vue'
import type { RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'
import { ChairInstances } from './chair-instances'

/**
 * All chairs of the floor, instanced (see `chair-instances.ts`). Re-reads the layout whenever a table moves, turns,
 * changes capacity or shape, or a chair is handed to an animated prop (`hidden`). Cheap: a few hundred matrices.
 */
const props = defineProps<{
  tables: readonly RestaurantTableConfig[]
  hidden: Record<string, readonly number[] | undefined>
}>()

const chairs = new ChairInstances()
watchEffect(() => {
  // Touch exactly what the layout of a chair depends on so the effect tracks it.
  for (const t of props.tables) void [t.position.x, t.position.z, t.rotation, t.seats, t.shape]
  void Object.values(props.hidden).map((list) => list?.length)
  chairs.update(props.tables, props.hidden)
})
onBeforeUnmount(() => chairs.dispose())
</script>

<template>
  <primitive :object="chairs.group" />
</template>
