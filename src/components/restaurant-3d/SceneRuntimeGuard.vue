<script setup lang="ts">
import { onBeforeUnmount, onErrorCaptured, onMounted, provide, ref } from 'vue'
import { CONTEXT_RESTORE_GRACE_MS, SCENE_FAILURE_KEY, type SceneFailureReason } from './scene-runtime-guard'

/**
 * Wraps the 3D scene so a failure at run time never leaves a blank canvas: an error thrown while it initialises or
 * renders (caught here), a WebGL context that cannot be created, or one that is lost and not restored within the
 * grace period is reported once through `failed`. The host decides what to show (the Dashboard offers the plan).
 * The context events do not bubble, so they are listened for in the capture phase on the wrapper.
 * Not covered: TresJS renders the 3D children with its own renderer, outside this component's parent chain, so an
 * exception thrown inside that subtree (or in the animation-frame callback) never reaches `onErrorCaptured`; it is
 * logged and the scene may freeze or render partially. The scene's own setup/render errors and the canvas `error` event are covered.
 */
const emit = defineEmits<{ failed: [reason: SceneFailureReason] }>()
const root = ref<HTMLElement | null>(null)
let reported = false
let restoreTimer: ReturnType<typeof setTimeout> | null = null

function fail(reason: SceneFailureReason): void {
  if (reported) return
  reported = true
  clearRestoreTimer()
  emit('failed', reason)
}
provide(SCENE_FAILURE_KEY, fail)
function clearRestoreTimer(): void {
  if (restoreTimer) clearTimeout(restoreTimer)
  restoreTimer = null
}
const onLost = (): void => {
  clearRestoreTimer()
  restoreTimer = setTimeout(() => fail('context-lost'), CONTEXT_RESTORE_GRACE_MS)
}
const onRestored = (): void => clearRestoreTimer()
const onCreationError = (): void => fail('context-creation')

onErrorCaptured((error) => {
  console.error('[restaurant-3d] the scene failed', error)
  fail('error')
  return false
})
onMounted(() => {
  const element = root.value
  if (!element) return
  element.addEventListener('webglcontextlost', onLost, true)
  element.addEventListener('webglcontextrestored', onRestored, true)
  element.addEventListener('webglcontextcreationerror', onCreationError, true)
})
onBeforeUnmount(() => {
  clearRestoreTimer()
  const element = root.value
  if (!element) return
  element.removeEventListener('webglcontextlost', onLost, true)
  element.removeEventListener('webglcontextrestored', onRestored, true)
  element.removeEventListener('webglcontextcreationerror', onCreationError, true)
})
</script>

<template>
  <div ref="root" class="scene-runtime-guard"><slot /></div>
</template>

<style scoped>
.scene-runtime-guard { display: contents; }
</style>
