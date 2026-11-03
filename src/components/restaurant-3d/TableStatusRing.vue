<script setup lang="ts">
import { computed } from 'vue'
import type { OperationalVisualState } from '@/types/restaurant-3d/operational-event'
import { buildRingBand } from './ring-geometry'
import { EDITOR_SELECTION_BANDS, RING_MARGIN, SELECTION_BAND, getRingBands } from './ring-style'

/**
 * Glowing floor ring around an active table, in the table's local space (so it
 * turns with the table). Not animated.
 */
const props = defineProps<{
  /** Table footprint (m). */
  width: number
  depth: number
  round: boolean
  visualState: OperationalVisualState
  /** Adds a thin neutral line inside the ring; the status colour is untouched. */
  selected?: boolean
  /** `editor`: a plain, clearly visible outline instead of the thin operational line. */
  selectionStyle?: 'operation' | 'editor'
}>()

const BLENDING_NORMAL = 1
const DOUBLE_SIDE = 2
const FLOOR_LIFT = 0.012

const bands = computed(() => {
  const halfWidth = props.width / 2 + RING_MARGIN
  const halfDepth = props.depth / 2 + RING_MARGIN
  const cornerRadius = props.round ? halfWidth : 0.6
  const selection = props.selectionStyle === 'editor' ? EDITOR_SELECTION_BANDS : [SELECTION_BAND]
  const all = props.selected ? [...getRingBands(props.visualState), ...selection] : getRingBands(props.visualState)
  return all.map((band, index) => ({
    ...band,
    key: `${props.visualState}-${index}-${halfWidth}-${halfDepth}-${cornerRadius}`,
    // Stacked a hair apart so overlapping bands never z-fight.
    y: FLOOR_LIFT + index * 0.001,
    mesh: buildRingBand(halfWidth, halfDepth, cornerRadius, band.from, band.to),
  }))
})
</script>

<template>
  <TresGroup name="status-ring">
    <TresMesh
      v-for="band in bands"
      :key="band.key"
      :position="[0, band.y, 0]"
      :render-order="2"
    >
      <TresBufferGeometry>
        <TresBufferAttribute
          attach="attributes-position"
          :args="[band.mesh.positions, 3]"
        />
        <TresBufferAttribute
          attach="index"
          :args="[band.mesh.indices, 1]"
        />
      </TresBufferGeometry>
      <TresMeshBasicMaterial
        :color="band.color"
        :opacity="band.opacity"
        :blending="BLENDING_NORMAL"
        :side="DOUBLE_SIDE"
        :tone-mapped="false"
        :depth-write="false"
        transparent
      />
    </TresMesh>
  </TresGroup>
</template>
