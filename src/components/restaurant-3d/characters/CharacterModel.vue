<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { useLoop, useTres } from '@tresjs/core'
import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Box3,
  type Object3D,
  type SkinnedMesh,
  Vector3,
} from 'three'
import { acquireCharacter, releaseCharacter } from './character-loader'

/**
 * One character instance inside the TresCanvas.
 *
 * Performance notes: the mixer/FPS counters are plain (non-reactive) fields;
 * the only Vue reactivity is on user-driven props. While paused nothing is
 * invalidated, so the on-demand canvas stops rendering entirely.
 */
export interface CharacterInfo {
  clips: string[]
  parts: string[]
  height: number
}
export interface RenderStats {
  fps: number
  triangles: number
  drawCalls: number
  geometries: number
  textures: number
}

const props = defineProps<{
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

const { renderer, invalidate } = useTres()
const { onBeforeRender } = useLoop()

const model = shallowRef<Object3D | null>(null)
let mixer: AnimationMixer | null = null
let clips: AnimationClip[] = []
let action: AnimationAction | null = null
let currentUrl: string | null = null
let requestToken = 0

// Non-reactive frame counters, flushed to the parent at 2 Hz.
let frames = 0
let windowStart = performance.now()
const FLUSH_MS = 500

onBeforeRender(({ delta }) => {
  if (mixer && props.playing) mixer.update(delta)
  // Keep rendering only while an animation is actually advancing.
  if (props.playing && action) invalidate()

  // Orbit-driven renders while paused must not masquerade as animation FPS.
  if (!props.playing) return
  frames++
  const now = performance.now()
  if (now - windowStart >= FLUSH_MS) {
    const info = renderer.info
    emit('stats', {
      fps: Math.round((frames * 1000) / (now - windowStart)),
      triangles: info.render.triangles,
      drawCalls: info.render.calls,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    })
    frames = 0
    windowStart = now
  }
})

function skinnedMeshes(root: Object3D): SkinnedMesh[] {
  const found: SkinnedMesh[] = []
  root.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) found.push(o as SkinnedMesh)
  })
  return found
}

/**
 * A "part" is the named glTF node that owns the mesh (`Casual2_Legs` -> `Legs`).
 * Multi-material meshes are split into several SkinnedMesh children, so we walk
 * up to that node instead of using the mesh's own (`Cube.010`) name.
 */
const PART_NODE = /^(?!Cube)[A-Za-z0-9]+_([A-Za-z]+)$/
function partOf(mesh: Object3D): { name: string; node: Object3D } {
  for (let o: Object3D | null = mesh; o; o = o.parent) {
    const match = PART_NODE.exec(o.name)
    if (match) return { name: match[1], node: o }
  }
  return { name: mesh.name, node: mesh }
}
const partName = (mesh: Object3D) => partOf(mesh).name

function teardown() {
  mixer?.stopAllAction()
  if (mixer && model.value) mixer.uncacheRoot(model.value)
  action = null
  mixer = null
  if (model.value) {
    // Geometry/materials are shared with the cache; only the per-instance bone textures are ours.
    for (const mesh of skinnedMeshes(model.value)) mesh.skeleton.dispose()
  }
  if (currentUrl) releaseCharacter(currentUrl)
  currentUrl = null
  model.value = null
}

async function load(url: string) {
  const token = ++requestToken
  emit('loading', true)
  teardown()
  try {
    const result = await acquireCharacter(url)
    if (token !== requestToken) {
      // Superseded while loading: give the reference back.
      releaseCharacter(url)
      return
    }
    currentUrl = url
    const root = result.scene
    // Skinned meshes are posed by bones; static bounds would cull them wrongly while animating.
    for (const mesh of skinnedMeshes(root)) mesh.frustumCulled = false
    const box = new Box3().setFromObject(root)
    const size = box.getSize(new Vector3())
    clips = result.clips
    mixer = new AnimationMixer(root)
    model.value = root
    applyVisibility()
    emit('loaded', {
      clips: clips.map((c) => c.name),
      parts: [...new Set(skinnedMeshes(root).map(partName))],
      height: size.y,
    })
    playClip(props.animation, false)
    invalidate()
  } catch (error) {
    if (token === requestToken) {
      emit('error', error instanceof Error ? error.message : 'Failed to load model')
    }
  } finally {
    if (token === requestToken) emit('loading', false)
  }
}

function playClip(name: string | null, fade = true) {
  if (!mixer) return
  const clip = clips.find((c) => c.name === name)
  if (!clip) return
  const next = mixer.clipAction(clip)
  if (next === action) return
  next.reset().setEffectiveTimeScale(props.speed).play()
  if (action && fade) action.crossFadeTo(next, 0.25, false)
  else if (action) action.stop()
  action = next
  invalidate()
}

function applyVisibility() {
  if (!model.value) return
  for (const mesh of skinnedMeshes(model.value)) {
    const { name, node } = partOf(mesh)
    node.visible = !props.hiddenParts.includes(name)
  }
  invalidate()
}

watch(() => props.url, (url) => void load(url), { immediate: true })
watch(() => props.animation, (name) => playClip(name))
watch(() => props.hiddenParts, applyVisibility)
watch(() => props.speed, (speed) => {
  action?.setEffectiveTimeScale(speed)
})
watch(() => props.playing, (playing) => {
  if (!playing) {
    // Rendering stops while paused, so report it instead of leaving a stale FPS.
    const info = renderer.info
    emit('stats', {
      fps: 0,
      triangles: info.render.triangles,
      drawCalls: info.render.calls,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    })
  } else {
    frames = 0
    windowStart = performance.now()
  }
  invalidate()
})

onBeforeUnmount(() => {
  requestToken++
  teardown()
})
</script>

<template>
  <primitive
    v-if="model"
    :object="model"
  />
</template>
