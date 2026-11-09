<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import CharacterModel, { type CharacterInfo, type RenderStats } from './CharacterModel.vue'

defineProps<{
  url: string
  animation: string | null
  playing: boolean
  speed: number
  hiddenParts: string[]
}>()
const emit = defineEmits<{
  loaded: [info: CharacterInfo]
  error: [message: string]
  loading: [value: boolean]
  stats: [value: RenderStats]
}>()

// The camera frames a ~1.8 m character; OrbitControls then owns it.
const cameraPosition: [number, number, number] = [0, 1.25, 3.6]
const target: [number, number, number] = [0, 0.9, 0]
</script>

<template>
  <!--
    On-demand rendering + capped DPR (mobile-first). No shadow maps: a cheap
    soft disc under the feet stands in for a contact shadow.
  -->
  <TresCanvas
    clear-color="#151515"
    render-mode="on-demand"
    :dpr="[1, 1.5]"
    power-preference="high-performance"
  >
    <TresPerspectiveCamera
      :position="cameraPosition"
      :fov="35"
      :near="0.1"
      :far="50"
    />
    <TresHemisphereLight :args="['#fff4e6', '#5a4632', 1.4]" />
    <TresDirectionalLight
      :position="[3, 5, 4]"
      :intensity="2.2"
      color="#fff0d8"
    />
    <TresDirectionalLight
      :position="[-4, 2, -3]"
      :intensity="0.8"
      color="#ff9a4d"
    />

    <TresMesh
      :rotation="[-Math.PI / 2, 0, 0]"
      :position="[0, -0.005, 0]"
    >
      <TresCircleGeometry :args="[0.6, 48]" />
      <TresMeshBasicMaterial
        color="#000000"
        :transparent="true"
        :opacity="0.28"
        :depth-write="false"
      />
    </TresMesh>

    <CharacterModel
      :url="url"
      :animation="animation"
      :playing="playing"
      :speed="speed"
      :hidden-parts="hiddenParts"
      @loaded="emit('loaded', $event)"
      @error="emit('error', $event)"
      @loading="emit('loading', $event)"
      @stats="emit('stats', $event)"
    />

    <OrbitControls
      :enable-damping="true"
      :damping-factor="0.08"
      :target="target"
      :min-distance="1.4"
      :max-distance="7"
      :max-polar-angle="Math.PI / 2 + 0.05"
      :enable-pan="false"
    />
  </TresCanvas>
</template>
