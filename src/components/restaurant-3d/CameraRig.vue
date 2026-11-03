<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { useTres } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import { PerspectiveCamera } from 'three'

/**
 * OrbitControls plus the "focus a table" camera move. Lives inside the
 * TresCanvas so it can reach the active camera.
 *
 * - `focus` set  → remember where the camera was (first time only), then ease
 *   to a closer pose on the same viewing direction (three-quarter view kept).
 * - `focus` null → ease back to the remembered pose.
 * One requestAnimationFrame chain at most: a new move cancels the running one.
 */
type Vec3 = [number, number, number]
interface Pose {
  position: Vec3
  target: Vec3
  /** Screen-space shift of the whole view, in px: [right, down]. Moves content left/up. */
  shift: [number, number]
}

const props = withDefaults(defineProps<{
  focus: { x: number; z: number } | null
  /** Off while a table is being dragged in the editor, so the camera doesn't orbit. */
  orbitEnabled?: boolean
}>(), { orbitEnabled: true })

const DURATION_MS = 300
/** Camera-to-target distance when focused (the default view sits at ~18 m). */
const FOCUS_DISTANCE = 9.5
const FOCUS_HEIGHT = 0.5

const { camera, sizes } = useTres()
// Exposed refs are unwrapped on a component ref, so `instance` is the controls object itself.
const controls = shallowRef<{ instance: ControlsLike | null } | null>(null)

interface ControlsLike {
  target: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void }
  update: () => void
}

/**
 * The table sheet is a centred modal (side panel on wide screens, bottom
 * sheet on phones). While focused, the view is nudged with a projection
 * offset so the table sits in the free area instead of behind the sheet. It
 * only shifts the framing — OrbitControls' target stays the table centre.
 */
const SHEET_BREAKPOINT_PX = 768
function framingShift(): [number, number] {
  const wide = window.innerWidth >= SHEET_BREAKPOINT_PX
  return wide ? [sizes.width.value * 0.25, 0] : [0, sizes.height.value * 0.2]
}

/** The active camera when it is the lab's perspective camera (the only one with a view offset). */
function perspectiveCamera(): PerspectiveCamera | null {
  return camera.value instanceof PerspectiveCamera ? camera.value : null
}

function applyShift([dx, dy]: [number, number]): void {
  const cam = perspectiveCamera()
  if (!cam) return
  const w = sizes.width.value
  const h = sizes.height.value
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) cam.clearViewOffset()
  else cam.setViewOffset(w, h, dx, dy, w, h)
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpVec = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

let home: Pose | null = null
let frame: number | null = null

function orbit(): ControlsLike | null {
  return controls.value?.instance ?? null
}

function currentPose(): Pose | null {
  const cam = perspectiveCamera()
  const ctl = orbit()
  if (!cam || !ctl) return null
  return {
    position: [cam.position.x, cam.position.y, cam.position.z],
    target: [ctl.target.x, ctl.target.y, ctl.target.z],
    shift: cam.view?.enabled ? [cam.view.offsetX, cam.view.offsetY] : [0, 0],
  }
}

function applyPose(pose: Pose): void {
  const cam = perspectiveCamera()
  const ctl = orbit()
  if (!cam || !ctl) return
  cam.position.set(...pose.position)
  ctl.target.set(...pose.target)
  applyShift(pose.shift)
  ctl.update()
}

function cancelAnimation(): void {
  if (frame !== null) {
    cancelAnimationFrame(frame)
    frame = null
  }
}

function moveTo(goal: Pose): void {
  cancelAnimation()
  const start = currentPose()
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!start || reduceMotion) {
    applyPose(goal)
    return
  }
  const startedAt = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - startedAt) / DURATION_MS)
    const eased = easeOutCubic(t)
    applyPose({
      position: lerpVec(start.position, goal.position, eased),
      target: lerpVec(start.target, goal.target, eased),
      shift: [lerp(start.shift[0], goal.shift[0], eased), lerp(start.shift[1], goal.shift[1], eased)],
    })
    frame = t < 1 ? requestAnimationFrame(step) : null
  }
  frame = requestAnimationFrame(step)
}

function focusPose(from: Pose, focus: { x: number; z: number }): Pose {
  // Keep the viewing direction (so the three-quarter angle survives) and only
  // move closer; if the user already zoomed in past the focus distance, keep that.
  const offset: Vec3 = [from.position[0] - from.target[0], from.position[1] - from.target[1], from.position[2] - from.target[2]]
  const length = Math.hypot(...offset) || 1
  const distance = Math.min(length, FOCUS_DISTANCE)
  const target: Vec3 = [focus.x, FOCUS_HEIGHT, focus.z]
  return {
    target,
    shift: framingShift(),
    position: [target[0] + (offset[0] / length) * distance, target[1] + (offset[1] / length) * distance, target[2] + (offset[2] / length) * distance],
  }
}

watch(
  () => props.focus,
  (focus) => {
    if (focus) {
      const from = currentPose()
      if (!from) return
      home ??= from
      moveTo(focusPose(from, focus))
    } else if (home) {
      const restore = home
      home = null
      moveTo(restore)
    }
  },
)

onBeforeUnmount(cancelAnimation)
</script>

<template>
  <OrbitControls
    ref="controls"
    :enabled="orbitEnabled"
    :enable-damping="true"
    :damping-factor="0.08"
    :target="[0.8, 0.4, 0]"
    :min-distance="6"
    :max-distance="30"
    :max-polar-angle="Math.PI / 2.1"
  />
</template>
