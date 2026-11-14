<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Box3, Group, Vector3 } from 'three'
import type { RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'
import { loadKayKitModel } from './kaykit-asset-cache'
import { getTableDimensions, TABLE_HEIGHT } from './table-geometry'
import { sceneAppearance } from './scene-appearance'
import { skinStage } from './stage-materials'

const props = defineProps<{ table: RestaurantTableConfig }>()
const emit = defineEmits<{ ready: []; failed: [] }>()
const root = ref<Group | null>(null)
const restaurantRoot = '/assets/restaurant-3d/models/kaykit-restaurant'
const furnitureRoot = '/assets/restaurant-3d/models/kaykit-furniture'
const paths = {
  round: `${restaurantRoot}/table_round_A.gltf`,
  square: `${furnitureRoot}/table_medium.gltf`,
  rectangular: `${furnitureRoot}/table_medium_long.gltf`,
} as const
let alive = true
let generation = 0

async function install(): Promise<void> {
  const current = ++generation
  try {
    const [round, square, rectangular] = await Promise.all(Object.values(paths).map(loadKayKitModel))
    if (!alive || current !== generation || !root.value) return
    const source = props.table.shape === 'round' ? round : props.table.shape === 'square' ? square : rectangular
    const model = source.clone(true)
    model.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(model)
    const size = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())
    const target = getTableDimensions(props.table.shape, props.table.seats)
    const scale = new Vector3(target.width / size.x, TABLE_HEIGHT / size.y, target.depth / size.z)
    model.scale.copy(scale)
    model.position.set(-center.x * scale.x, -bounds.min.y * scale.y, -center.z * scale.z)
    model.traverse(node => {
      node.castShadow = true
      node.receiveShadow = true
    })
    if (sceneAppearance.light) skinStage(model, 'table')
    root.value.clear()
    root.value.add(model)
    emit('ready')
  } catch (error) {
    console.error('[restaurant-3d] table model failed to load', error)
    emit('failed')
  }
}

onMounted(() => void install())
watch(() => [props.table.shape, props.table.seats] as const, () => { if (root.value) void install() })

onBeforeUnmount(() => {
  alive = false
  generation++
  root.value?.clear()
})
</script>

<template>
  <TresGroup ref="root" name="kaykit-operational-table" />
</template>
