<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import CustomerScene, { type SceneStats } from './CustomerScene.vue'
import type { CharacterGender } from './character-catalog'
import type { ChairSpec } from './test-chair'

defineProps<{
  count: number
  gender: CharacterGender | 'mixed'
  variantUrl: string
  loop: boolean
  runId: number
  view: 'default' | 'side' | 'top'
  chair: ChairSpec
  optimized: boolean
}>()
const emit = defineEmits<{
  loading: [value: boolean]
  error: [message: string]
  stats: [value: SceneStats]
  phase: [value: string]
}>()
</script>

<template>
  <!-- Same Phase 3.1A canvas policy: on-demand rendering, DPR capped, no shadow maps. -->
  <TresCanvas
    clear-color="#151515"
    render-mode="on-demand"
    :dpr="[1, 1.5]"
    power-preference="high-performance"
  >
    <TresPerspectiveCamera
      :position="[1.5, 3, 9]"
      :fov="35"
      :near="0.1"
      :far="200"
    />
    <TresHemisphereLight :args="['#fff4e6', '#5a4632', 1.4]" />
    <TresDirectionalLight
      :position="[3, 6, 5]"
      :intensity="2.2"
      color="#fff0d8"
    />
    <TresDirectionalLight
      :position="[-4, 3, -3]"
      :intensity="0.8"
      color="#ff9a4d"
    />
    <TresMesh
      :rotation="[-Math.PI / 2, 0, 0]"
      :position="[0, -0.004, 0]"
    >
      <TresPlaneGeometry :args="[80, 80]" />
      <TresMeshStandardMaterial
        color="#222020"
        :roughness="0.95"
      />
    </TresMesh>
    <CustomerScene
      :count="count"
      :gender="gender"
      :variant-url="variantUrl"
      :loop="loop"
      :run-id="runId"
      :view="view"
      :chair="chair"
      :optimized="optimized"
      @loading="emit('loading', $event)"
      @error="emit('error', $event)"
      @stats="emit('stats', $event)"
      @phase="emit('phase', $event)"
    />
  </TresCanvas>
</template>
