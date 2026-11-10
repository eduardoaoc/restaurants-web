<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { useTres } from '@tresjs/core'
import { Plane, Raycaster, Vector2, Vector3, type Object3D } from 'three'
import type { RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'

/**
 * Pointer handling for layout editing, inside the TresCanvas (it needs the
 * camera and scene). Renders nothing.
 *
 * It listens on the canvas' parent in the CAPTURE phase, so it sees a press
 * before OrbitControls does:
 *  - press on a table → select it, stop the event (the camera never starts
 *    orbiting) and drag it across the floor plane (y = 0) until release;
 *  - press on anything else → a click (little pointer travel) clears selection,
 *    a drag falls through to OrbitControls as usual.
 * Where a table may end up (grid, floor bounds) is decided by the layout, not here.
 */
const props = defineProps<{
  enabled: boolean
  tables: RestaurantTableConfig[]
  /** The draft entrance (null = none). Its marker is draggable like a table. */
  entrance?: { x: number; z: number } | null
  /** Tap-to-place: the next floor tap (not an orbit drag) puts the entrance there. */
  placingEntrance?: boolean
}>()

const emit = defineEmits<{
  select: [tableId: string | null]
  move: [tableId: string, position: { x: number; z: number }]
  /** True from the press on a table until its release. */
  dragging: [active: boolean]
  selectEntrance: []
  entranceDragging: [active: boolean]
  moveEntrance: [position: { x: number; z: number }]
  /** The entrance press ended: validate the final position. */
  dropEntrance: []
  hoverEntrance: [hovered: boolean]
  hoverTable: [tableId: string | null]
}>()

const CLICK_MOVE_TOLERANCE_PX = 6
/** A press on a table is a SELECTION until the pointer travels this far (fingers are less steady than a mouse). */
const DRAG_START_PX = { mouse: 5, pen: 6, touch: 10 } as const
const { camera, scene, renderer } = useTres()

const raycaster = new Raycaster()
const pointer = new Vector2()
const floor = new Plane(new Vector3(0, 1, 0), 0)
const hit = new Vector3()

function aim(event: PointerEvent): void {
  const dom = renderer.domElement
  const rect = dom.getBoundingClientRect()
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
  if (camera.value) raycaster.setFromCamera(pointer, camera.value)
}

const ENTRANCE_NAME = 'entrance-marker'

/** The nearest thing a ray from the pointer hits: a table (group named after its id) or the entrance hit disc. */
function pickTarget(event: PointerEvent): { kind: 'table'; id: string } | { kind: 'entrance' } | null {
  aim(event)
  if (!scene.value) return null
  for (const { object } of raycaster.intersectObjects(scene.value.children, true)) {
    for (let node: Object3D | null = object; node; node = node.parent) {
      if (node.name === ENTRANCE_NAME) return props.entrance ? { kind: 'entrance' } : null
      const name = node.name
      if (props.tables.some((table) => table.id === name)) return { kind: 'table', id: name }
    }
  }
  return null
}

let hovering = false
let hoveredTable: string | null = null
let hoverFrame = 0
let lastHover: PointerEvent | null = null
/** Hover raycasts the whole scene: at most once per frame, never while a gesture is running, never for touch. */
function onHover(event: PointerEvent): void {
  if (!props.enabled || stopGesture || event.pointerType === 'touch') return
  lastHover = event
  if (hoverFrame) return
  hoverFrame = requestAnimationFrame(() => {
    hoverFrame = 0
    const e = lastHover
    if (!e || !props.enabled || stopGesture) return
    const target = pickTarget(e)
    const over = target?.kind === 'entrance'
    if (over !== hovering) {
      hovering = over
      emit('hoverEntrance', over)
    }
    const table = target?.kind === 'table' ? target.id : null
    if (table !== hoveredTable) {
      hoveredTable = table
      emit('hoverTable', table)
    }
  })
}

/** Where the pointer's ray meets the floor plane, or null (ray parallel / behind). */
function floorPoint(event: PointerEvent): { x: number; z: number } | null {
  aim(event)
  return raycaster.ray.intersectPlane(floor, hit) ? { x: hit.x, z: hit.z } : null
}

let stopGesture: (() => void) | null = null

function onPointerDown(event: PointerEvent): void {
  if (!props.enabled || event.button !== 0) return
  // Editor controls sit inside the same host as the canvas: their presses are not floor clicks.
  if (event.target instanceof Element && event.target.closest('[data-editor-ui]')) return
  const target = pickTarget(event)
  const table = target?.kind === 'table' ? props.tables.find((candidate) => candidate.id === target.id) : undefined
  const start = floorPoint(event)

  if (stopGesture) {
    stopGesture()
    emit('dragging', false)
    emit('entranceDragging', false)
  }
  if (target?.kind === 'entrance' && props.entrance && start) {
    // Same grab-offset rule as a table: no jump under the finger. Placement is validated on release, not per move.
    const offset = { x: props.entrance.x - start.x, z: props.entrance.z - start.z }
    event.stopPropagation()
    emit('selectEntrance')
    emit('entranceDragging', true)
    const onMove = (move: PointerEvent) => {
      const point = floorPoint(move)
      if (point) emit('moveEntrance', { x: point.x + offset.x, z: point.z + offset.z })
    }
    listen(onMove, () => {
      emit('entranceDragging', false)
      emit('dropEntrance')
    })
  } else if (table && start) {
    // The press selects (and keeps the camera still). The table only follows the pointer after a deliberate drag, and
    // the grab offset is taken at that moment, so it never jumps and a shaky tap never moves it.
    const pressed = { x: event.clientX, y: event.clientY }
    const threshold = DRAG_START_PX[event.pointerType === 'touch' ? 'touch' : event.pointerType === 'pen' ? 'pen' : 'mouse']
    let offset: { x: number; z: number } | null = null
    event.stopPropagation()
    emit('select', table.id)
    const onMove = (move: PointerEvent) => {
      const point = floorPoint(move)
      if (!point) return
      if (!offset) {
        if (Math.hypot(move.clientX - pressed.x, move.clientY - pressed.y) < threshold) return
        offset = { x: table.position.x - point.x, z: table.position.z - point.z }
        emit('dragging', true)
        return
      }
      emit('move', table.id, { x: point.x + offset.x, z: point.z + offset.z })
    }
    listen(onMove, () => { if (offset) emit('dragging', false) })
  } else {
    const pressed = { x: event.clientX, y: event.clientY }
    listen(undefined, (up) => {
      if (Math.hypot(up.clientX - pressed.x, up.clientY - pressed.y) > CLICK_MOVE_TOLERANCE_PX) return
      const where = props.placingEntrance ? floorPoint(up) : null
      if (where) {
        emit('moveEntrance', where)
        emit('dropEntrance')
      } else emit('select', null)
    })
  }
}

function listen(onMove: ((event: PointerEvent) => void) | undefined, onEnd: (event: PointerEvent) => void): void {
  const end = (event: PointerEvent) => {
    stop()
    onEnd(event)
  }
  const stop = () => {
    if (onMove) window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    stopGesture = null
  }
  if (onMove) window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
  stopGesture = stop
}

let host: HTMLElement | null = null
function attach(): void {
  detach()
  const target = renderer.domElement.parentElement ?? renderer.domElement
  target.addEventListener('pointerdown', onPointerDown, true)
  target.addEventListener('pointermove', onHover)
  host = target
}
function detach(): void {
  host?.removeEventListener('pointerdown', onPointerDown, true)
  host?.removeEventListener('pointermove', onHover)
  if (hoverFrame) { cancelAnimationFrame(hoverFrame); hoverFrame = 0 }
  if (hovering) { hovering = false; emit('hoverEntrance', false) }
  if (hoveredTable !== null) { hoveredTable = null; emit('hoverTable', null) }
  host = null
}

watch(
  () => props.enabled,
  (enabled) => {
    if (enabled) {
      attach()
    } else {
      detach()
      if (stopGesture) {
        stopGesture()
        emit('dragging', false)
        emit('entranceDragging', false)
      }
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  detach()
  stopGesture?.()
})
</script>

<template>
  <TresGroup name="table-edit-controller" />
</template>
