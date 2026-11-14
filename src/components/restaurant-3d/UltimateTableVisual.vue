<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Group } from 'three'
import type { RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'
import { getChairPlacements, getTableDimensions, TABLE_HEIGHT } from './table-geometry'
import { createUltimateMaterials, type UltimateFinish } from './ultimate-materials'
import { fitPiece, loadUltimate, PLATE_DIAMETER, PLATE_THICKNESS, skinPiece, ULTIMATE_FURNITURE } from './ultimate-furniture'

/**
 * Ultimate Pack dining table with its place settings (plates, glasses). Footprint and height come from
 * getTableDimensions/TABLE_HEIGHT, the same contract as the KayKit table, so chairs, guests, rings and navigation
 * obstacles are unaffected. LICENSE_UNVERIFIED: local demo only.
 */
const props = withDefaults(defineProps<{ table: RestaurantTableConfig; finish?: UltimateFinish }>(), { finish: 'final' })
const emit = defineEmits<{ ready: []; failed: [] }>()
const root = ref<Group | null>(null)
const materials = createUltimateMaterials(props.finish)
let alive = true
let generation = 0

async function install(): Promise<void> {
  const current = ++generation
  try {
    const [table, plate, glass] = await Promise.all([ULTIMATE_FURNITURE.table, ULTIMATE_FURNITURE.plate, ULTIMATE_FURNITURE.glass].map(loadUltimate))
    if (!alive || current !== generation || !root.value) return
    const target = getTableDimensions(props.table.shape, props.table.seats)
    const group = new Group()
    group.add(fitPiece(skinPiece(table, 'table', materials), { x: target.width, y: TABLE_HEIGHT, z: target.depth }))
    // One place setting per chair: plate between the diner and the table centre, glass to its right-hand side.
    for (const chair of getChairPlacements(props.table)) {
      const inward = Math.hypot(chair.x, chair.z) || 1
      const dx = -chair.x / inward
      const dz = -chair.z / inward
      const place = new Group()
      place.position.set(chair.x + dx * (inward - 0.2), TABLE_HEIGHT, chair.z + dz * (inward - 0.2))
      const plateModel = fitPiece(skinPiece(plate, 'plate', materials), { x: PLATE_DIAMETER, y: PLATE_THICKNESS, z: PLATE_DIAMETER })
      place.add(plateModel)
      const glassModel = skinPiece(glass, 'glass', materials)
      glassModel.position.set(-dz * 0.2, 0, dx * 0.2) // 20 cm to the side, along the table edge
      place.add(glassModel)
      group.add(place)
    }
    root.value.clear()
    root.value.add(group)
    emit('ready')
  } catch (error) {
    console.error('[restaurant-3d] ultimate table failed to load', error)
    emit('failed')
  }
}

onMounted(() => void install())
watch(() => [props.table.shape, props.table.seats] as const, () => { if (root.value) void install() })
onBeforeUnmount(() => {
  alive = false
  generation++
  root.value?.clear()
  for (const m of materials.all) m.dispose()
})
</script>

<template>
  <TresGroup ref="root" name="ultimate-operational-table" />
</template>
