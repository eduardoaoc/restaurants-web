<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { useTres } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import { PerspectiveCamera } from 'three'
import type { FloorPosition, RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'
import { canvasSafeInsets, overlayMetrics, readSafeAreaInsets } from './overlay-metrics'
import { overlayViewport, updateOverlayDensity } from './overlay-viewport'
import { CAMERA_FOV, frameRestaurant, ultimateDirection } from './framing'
import { COMPACT_VIEWPORT_PX } from './overlay-metrics'
import { cameraLimits, clampTarget } from './camera-limits'

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
  /** What is framed: the camera is fitted to these tables (and entrance), plus the floor while editing. */
  tables: readonly RestaurantTableConfig[]
  entrance?: FloorPosition | null
  includeFloor?: boolean
  /** Px kept free on each side of the framed content (the dashboard stage's floating panels). */
  frameInsets?: { top: number; right: number; bottom: number; left: number }
  /** Farthest the camera may sit (m). Defaults to the demo-room range when walls are framed, else the table-only range. */
  maxDistance?: number
  /** Height (m) of the walls to keep in frame when the floor is framed; 0 = ignore. */
  wallHeight?: number
  /** Ground points around the room (street, terrace) kept in view along with the floor. */
  context?: ReadonlyArray<{ x: number; z: number }>
  /** Phone portrait: the points the default / recentered view must contain instead of `context` (room + terrace, no street). */
  compactContext?: ReadonlyArray<{ x: number; z: number }>
  /** Changing it drops the person's manual camera and re-frames (the demo's overview toggle). */
  reframeKey?: number
  /** Px at the bottom of the canvas covered by an overlay (the layout editor's dock on a phone); nothing is framed there. */
  bottomInset?: number
  /** Orbit target of the starting pose (the owner framed the layout before the canvas had a size). */
  initialTarget: [number, number, number]
}>(), { orbitEnabled: true, entrance: null, includeFloor: false, bottomInset: 0, frameInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) })

const DURATION_MS = 300
/** Camera-to-target distance when focused (the default view sits at ~18 m). */
const FOCUS_DISTANCE = 9.5
const FOCUS_HEIGHT = 0.5

const { camera, sizes, renderer } = useTres()
// Exposed refs are unwrapped on a component ref, so `instance` is the controls object itself.
const controls = shallowRef<{ instance: ControlsLike | null } | null>(null)

interface ControlsLike {
  target: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void }
  update: () => void
}

/**
 * Urban scene (the Ultimate demo with its street): the zoom range follows the screen, the orbit cannot drop to the horizon
 * and the target (pan) stays around the restaurant, so the end of the finite world is never in view. Other scenes keep
 * their previous fixed range.
 */
const urbanLimits = computed(() => {
  if (!props.context?.length || !(sizes.width.value > 0) || !(sizes.height.value > 0)) return null
  const overview = frameRestaurant({
    tables: props.tables, entrance: props.entrance, includeFloor: true, context: props.context,
    wallHeight: props.wallHeight || undefined, maxDistance: props.maxDistance ?? 70,
    width: sizes.width.value, height: sizes.height.value, viewportWidth: window.innerWidth,
  })
  return cameraLimits(overview.distance)
})
const minDistance = computed(() => urbanLimits.value?.minDistance ?? 6)
const maxDistance = computed(() => urbanLimits.value?.maxDistance ?? (props.maxDistance ? props.maxDistance + 2 : props.wallHeight ? 72 : 42))
const polarRange = computed<[number, number]>(() => (urbanLimits.value ? [urbanLimits.value.minPolar, urbanLimits.value.maxPolar] : [0, Math.PI / 2.1]))

const azimuthRange = computed<[number, number]>(() => (urbanLimits.value ? [urbanLimits.value.minAzimuth, urbanLimits.value.maxAzimuth] : [-Infinity, Infinity]))

/** Keeps the orbit target inside the bounds (panning); the camera moves by the same amount so the view just slides. */
function constrainTarget(ctl: ControlsLike): void {
  const limits = urbanLimits.value
  const cam = perspectiveCamera()
  if (!limits || !cam) return
  const { dx, dy, dz } = clampTarget(ctl.target, limits.target)
  if (!dx && !dy && !dz) return
  ctl.target.set(ctl.target.x + dx, ctl.target.y + dy, ctl.target.z + dz)
  cam.position.set(cam.position.x + dx, cam.position.y + dy, cam.position.z + dz)
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
  updateControls(ctl)
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

// --- Responsive framing -------------------------------------------------------------------------------------------
// The camera is fitted to the restaurant's real bounds — table footprints, labels and the operational pills at their
// on-screen size — inside the canvas minus the device's safe areas (framing.ts). It re-fits when the canvas is resized
// (rotation, window, dock layout) or the editor is entered/left, but only while the person has not moved the camera
// themselves and no table is focused: an intentional view is never reset. Debounced; a no-op when nothing changes.
let userMovedCamera = false
let userGesture = false
let gestureTimer: ReturnType<typeof setTimeout> | undefined
let fitTimer: ReturnType<typeof setTimeout> | undefined
// Damping keeps moving the camera after the fingers lift; those frames still belong to the gesture.
const GESTURE_TAIL_MS = 900
const onUserStart = () => {
  userGesture = true
  clearTimeout(gestureTimer)
}
const onUserEnd = () => {
  clearTimeout(gestureTimer)
  gestureTimer = setTimeout(() => { userGesture = false }, GESTURE_TAIL_MS)
}
// A tap on a table starts and ends a gesture without moving anything: only an actual camera change counts as the person
// taking control (wheel and pinch change the camera without a pointer travel, so travel alone is not the signal).
const onControlsChange = () => {
  if (userGesture && !programmatic) userMovedCamera = true
  const ctl = orbit()
  if (ctl) constrainTarget(ctl)
  syncDensity()
}
// `update()` dispatches `change` synchronously; this rig's own moves (focus, restore, re-fit) are not the person's.
let programmatic = false
function updateControls(ctl: ControlsLike): void {
  programmatic = true
  try { ctl.update() } finally { programmatic = false }
}

/** On-screen scale at the orbit target, which decides how much each table label may say. */
function syncDensity() {
  const cam = perspectiveCamera()
  const ctl = orbit()
  if (!cam || !ctl || !(sizes.height.value > 0)) return
  const distance = Math.hypot(cam.position.x - ctl.target.x, cam.position.y - ctl.target.y, cam.position.z - ctl.target.z) || 1
  updateOverlayDensity(sizes.height.value / (2 * Math.tan((CAMERA_FOV * Math.PI) / 360) * distance))
}

/** Insets of the canvas against the device's unsafe areas; also published for the overlays' edge clamp. */
function syncViewport() {
  const canvas = renderer.domElement
  const rect = canvas?.getBoundingClientRect()
  const insets = rect
    ? canvasSafeInsets(rect, { width: window.innerWidth, height: window.innerHeight }, readSafeAreaInsets())
    : { left: 0, right: 0, top: 0, bottom: 0 }
  // Overlays keep out of the covered strip; the framing below handles it by shifting the view instead.
  overlayViewport.insets = { ...insets, bottom: insets.bottom + props.bottomInset }
  overlayViewport.edge = overlayMetrics(window.innerWidth).edge
  syncDensity()
  return insets
}

function refit(instant = false): void {
  const cam = perspectiveCamera()
  const ctl = orbit()
  const insets = syncViewport()
  const coverShift = props.bottomInset / 2
  if (!cam || !ctl || userMovedCamera || props.focus || frame !== null) return
  if (!(sizes.width.value > 0) || !(sizes.height.value > 0)) return
  // Keep the viewing direction the camera already has; only the target and the distance follow the content. The fit
  // must be computed for that same direction, or the distance would belong to a different view.
  const dir: Vec3 = [cam.position.x - ctl.target.x, cam.position.y - ctl.target.y, cam.position.z - ctl.target.z]
  const length = Math.hypot(...dir) || 1
  // The urban scene re-fits with its own direction while the person has not moved the camera (a phone turned from
  // landscape to portrait gets the portrait view); other scenes keep the direction the camera already has.
  const unit: Vec3 = urbanDirection() ?? [dir[0] / length, dir[1] / length, dir[2] / length]
  const turned = 1 - (unit[0] * dir[0] + unit[1] * dir[1] + unit[2] * dir[2]) / length > 1e-4
  const framed = frameRestaurant({
    direction: unit,
    tables: props.tables,
    entrance: props.entrance,
    includeFloor: props.includeFloor,
    context: framingContext(),
    wallHeight: props.wallHeight || undefined,
    maxDistance: props.maxDistance ?? (props.wallHeight ? 70 : undefined),
    width: sizes.width.value,
    height: sizes.height.value,
    viewportWidth: window.innerWidth,
    // The view is shifted up by half the covered strip so the content centre lands in the free area; in the unshifted
    // frame that is the same as keeping `half` px free at both the top and the bottom.
    insets: { left: insets.left + props.frameInsets.left, right: insets.right + props.frameInsets.right, top: insets.top + coverShift + props.frameInsets.top, bottom: insets.bottom + coverShift + props.frameInsets.bottom },
  })
  const shiftNow = cam.view?.enabled ? cam.view.offsetY : 0
  const moved = turned || Math.abs(framed.distance - length) / length > 0.01
    || Math.hypot(framed.target[0] - ctl.target.x, framed.target[2] - ctl.target.z) > 0.05
    || Math.abs(shiftNow - coverShift) > 0.5
  if (!moved) return
  const goal: Pose = {
    position: [framed.target[0] + unit[0] * framed.distance, framed.target[1] + unit[1] * framed.distance, framed.target[2] + unit[2] * framed.distance],
    target: framed.target,
    shift: [0, coverShift],
  }
  if (instant) applyPose(goal)
  else moveTo(goal) // eased, so a dock opening or a mode switch does not make the view jump
}

/** The urban scene frames with its own direction (isometric, or the phone's across-the-terrace view) and context. */
const urbanDirection = (): Vec3 | null => (props.context?.length ? ultimateDirection(window.innerWidth) : null)
// A stage (it passes frame insets) on a short screen, like a phone in landscape, also frames the room without the street.
const shortStage = () => window.innerHeight <= 520 && props.frameInsets.top + props.frameInsets.bottom > 0
const framingContext = () => ((window.innerWidth <= COMPACT_VIEWPORT_PX || shortStage()) && props.compactContext?.length ? props.compactContext : props.context)

/**
 * "Centrar vista": eases back to the balanced three-quarter overview of the whole restaurant (floor, terrace and, in the
 * urban scene, the street context) for the CURRENT canvas, whatever the person did before: orbit, zoom, pan or a table
 * focus. Distance and target stay inside the camera limits. Honors reduced motion (moveTo applies the pose at once). It
 * is only ever called by the person; nothing here runs on its own after an interaction.
 */
function recenter(): void {
  const cam = perspectiveCamera()
  const ctl = orbit()
  if (!cam || !ctl || !(sizes.width.value > 0) || !(sizes.height.value > 0)) return
  const insets = syncViewport()
  const coverShift = props.bottomInset / 2
  home = null // a table focus being cleared by the host must not drag the camera back to the pre-focus pose
  const limits = urbanLimits.value
  const framed = frameRestaurant({
    tables: props.tables, entrance: props.entrance, includeFloor: true, context: framingContext(), direction: urbanDirection() ?? undefined,
    wallHeight: props.wallHeight || undefined, maxDistance: props.maxDistance ?? (props.wallHeight ? 70 : undefined),
    width: sizes.width.value, height: sizes.height.value, viewportWidth: window.innerWidth,
    insets: { left: insets.left + props.frameInsets.left, right: insets.right + props.frameInsets.right, top: insets.top + coverShift + props.frameInsets.top, bottom: insets.bottom + coverShift + props.frameInsets.bottom },
  })
  const distance = limits ? Math.min(limits.maxDistance, Math.max(limits.minDistance, framed.distance)) : framed.distance
  const pull = limits ? clampTarget({ x: framed.target[0], y: framed.target[1], z: framed.target[2] }, limits.target) : null
  const target: Vec3 = pull ? [framed.target[0] + pull.dx, framed.target[1], framed.target[2] + pull.dz] : framed.target
  userMovedCamera = false // the view is the fitted one again, so a later resize may re-fit it
  moveTo({
    position: [target[0] + framed.direction[0] * distance, target[1] + framed.direction[1] * distance, target[2] + framed.direction[2] * distance],
    target,
    shift: [0, coverShift],
  })
}
defineExpose({ recenter })

const scheduleRefit = () => {
  clearTimeout(fitTimer)
  fitTimer = setTimeout(refit, 150)
}
watch([sizes.width, sizes.height], scheduleRefit)
watch(() => props.includeFloor, scheduleRefit)
watch(() => props.reframeKey, () => { userMovedCamera = false; scheduleRefit() })
watch(() => props.bottomInset, scheduleRefit)
onMounted(() => {
  // The controls object arrives after mount; attach once it exists.
  const attach = (): void => {
    const target = orbit() as (ControlsLike & { addEventListener?: (type: string, fn: () => void) => void }) | null
    if (target?.addEventListener) {
      target.addEventListener('start', onUserStart)
      target.addEventListener('end', onUserEnd)
      target.addEventListener('change', onControlsChange)
    } else setTimeout(attach, 50)
  }
  attach()
  // DEV only: lets browser validation place the camera (top view, orbit, close-ups). Not part of the product.
  if (import.meta.env.DEV) {
    ;(window as unknown as { __sceneCam?: unknown }).__sceneCam = {
      set: (position: Vec3, target: Vec3) => {
        userMovedCamera = true
        applyPose({ position, target, shift: [0, 0] })
      },
    }
  }
  window.addEventListener('orientationchange', scheduleRefit)
  fitTimer = setTimeout(() => refit(true), 0) // the real canvas size may differ from the estimate made at setup
})

onBeforeUnmount(() => {
  cancelAnimation()
  if (import.meta.env.DEV) delete (window as unknown as { __sceneCam?: unknown }).__sceneCam
  clearTimeout(fitTimer)
  clearTimeout(gestureTimer)
  window.removeEventListener('orientationchange', scheduleRefit)
  const target = orbit() as { removeEventListener?: (type: string, fn: () => void) => void } | null
  target?.removeEventListener?.('start', onUserStart)
  target?.removeEventListener?.('end', onUserEnd)
  target?.removeEventListener?.('change', onControlsChange)
})
</script>

<template>
  <OrbitControls
    ref="controls"
    :enabled="orbitEnabled"
    :enable-damping="true"
    :damping-factor="0.08"
    :target="initialTarget"
    :min-distance="minDistance"
    :max-distance="maxDistance"
    :min-polar-angle="polarRange[0]"
    :max-polar-angle="polarRange[1]"
    :min-azimuth-angle="azimuthRange[0]"
    :max-azimuth-angle="azimuthRange[1]"
    :screen-space-panning="!urbanLimits"
  />
</template>
