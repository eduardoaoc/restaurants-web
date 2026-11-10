<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useLoop } from '@tresjs/core'
import { Html } from '@tresjs/cientos'
import type { Group, Mesh } from 'three'

/**
 * Edit-mode entrance marker: a flat ring with an inward arrow lying on the floor, so it never rises into the scene
 * or covers a table. Only the invisible hit disc is raycast (picked by `TableEditController` by the name `entrance-marker`); the visible parts ignore the pointer. Selection, hover and invalid states are colour +
 * size, with a very slight pulse that is skipped under `prefers-reduced-motion`.
 */
const props = defineProps<{
  x: number
  z: number
  label: string
  selected?: boolean
  hovered?: boolean
  /** False when the position is unusable (furniture, navigation): drawn red and labelled by the panel. */
  valid?: boolean
}>()

/**
 * Visible parts must never be picked. TresJS treats a function-valued prop as a call on the existing method
 * (`mesh.raycast(value)`), not an assignment, so the override is set on the Three object itself once it exists.
 */
const inert = (mesh: unknown): void => {
  if (mesh) (mesh as Mesh).raycast = () => {}
}
const group = ref<Group | null>(null)
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
// Forward (sin yaw, cos yaw) points from the entrance toward the floor centre: "inward".
const yaw = computed(() => (props.x === 0 && props.z === 0 ? 0 : Math.atan2(-props.x, -props.z)))
const color = computed(() => (props.valid === false ? '#ef4444' : props.selected ? '#7dd3fc' : '#f8fafc'))
const baseScale = computed(() => (props.selected ? 1.18 : props.hovered ? 1.1 : 1))

const { onBeforeRender } = useLoop()
const stop = onBeforeRender(({ elapsed }) => {
  const g = group.value
  if (!g) return
  const pulse = props.selected && !reduced.matches ? 1 + Math.sin(elapsed * 3) * 0.04 : 1
  g.scale.setScalar(baseScale.value * pulse)
})
onBeforeUnmount(() => stop.off())
</script>

<template>
  <TresGroup :position="[x, 0, z]">
    <!-- Invisible, generous touch target (the only raycast surface). -->
    <TresMesh
      name="entrance-marker"
      :position="[0, 0.05, 0]"
      :rotation="[-Math.PI / 2, 0, 0]"
    >
      <TresCircleGeometry :args="[0.7, 24]" />
      <TresMeshBasicMaterial
        :transparent="true"
        :opacity="0"
        :depth-write="false"
      />
    </TresMesh>

    <TresGroup ref="group">
      <TresMesh
        :position="[0, 0.04, 0]"
        :rotation="[-Math.PI / 2, 0, 0]"
        :render-order="3"
        :ref="inert"
      >
        <TresRingGeometry :args="[0.3, 0.4, 40]" />
        <TresMeshBasicMaterial
          :color="color"
          :transparent="true"
          :opacity="0.95"
          :side="2"
          :depth-write="false"
        />
      </TresMesh>
      <TresMesh
        :position="[0, 0.04, 0]"
        :rotation="[-Math.PI / 2, 0, 0]"
        :render-order="2"
        :ref="inert"
      >
        <TresCircleGeometry :args="[0.3, 32]" />
        <TresMeshBasicMaterial
          color="#0f172a"
          :transparent="true"
          :opacity="0.55"
          :depth-write="false"
        />
      </TresMesh>
      <TresGroup :rotation="[0, yaw, 0]">
        <TresMesh
          :position="[0, 0.05, 0.02]"
          :rotation="[Math.PI / 2, 0, 0]"
          :render-order="4"
          :ref="inert"
        >
          <TresConeGeometry :args="[0.14, 0.3, 3]" />
          <TresMeshBasicMaterial
            :color="color"
            :depth-write="false"
          />
        </TresMesh>
      </TresGroup>
    </TresGroup>

    <TresGroup :position="[0, 0.1, 0]">
      <Html
        center
        :pointer-events="'none'"
        :z-index-range="[10, 0]"
        :position="[0, 0, 0.75]"
      >
        <div
          class="entrance-label"
          :class="{ 'entrance-label--selected': selected, 'entrance-label--invalid': valid === false }"
        >{{ label }}</div>
      </Html>
    </TresGroup>
  </TresGroup>
</template>

<style scoped>
.entrance-label {
  padding: 3px 10px;
  border-radius: 999px;
  background: rgb(15 23 42 / 0.82);
  color: #f8fafc;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  border: 1px solid rgb(248 250 252 / 0.35);
  transition: background-color 160ms ease, border-color 160ms ease;
}
.entrance-label--selected { border-color: #7dd3fc; background: rgb(12 74 110 / 0.9); }
.entrance-label--invalid { border-color: #fca5a5; background: rgb(127 29 29 / 0.92); }
@media (prefers-reduced-motion: reduce) { .entrance-label { transition: none; } }
</style>
