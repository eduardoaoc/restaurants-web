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
}>()

const emit = defineEmits<{
  select: [tableId: string | null]
  move: [tableId: string, position: { x: number; z: number }]
  /** True from the press on a table until its release. */
  dragging: [active: boolean]
}>()

const CLICK_MOVE_TOLERANCE_PX = 6
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

/** The table group (named after the table id) a ray from the pointer hits first. */
function pickTableId(event: PointerEvent): string | null {
  aim(event)
  if (!scene.value) return null
  for (const { object } of raycaster.intersectObjects(scene.value.children, true)) {
    for (let node: Object3D | null = object; node; node = node.parent) {
      if (props.tables.some((table) => table.id === node?.name)) return node.name
    }
  }
  return null
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
  const tableId = pickTableId(event)
  const table = props.tables.find((candidate) => candidate.id === tableId)
  const start = floorPoint(event)

  if (stopGesture) {
    stopGesture()
    emit('dragging', false)
  }
  if (table && start) {
    // Keep the grab point: the table follows the pointer without jumping.
    const offset = { x: table.position.x - start.x, z: table.position.z - start.z }
    event.stopPropagation()
    emit('select', table.id)
    emit('dragging', true)
    const onMove = (move: PointerEvent) => {
      const point = floorPoint(move)
      if (point) emit('move', table.id, { x: point.x + offset.x, z: point.z + offset.z })
    }
    listen(onMove, () => emit('dragging', false))
  } else {
    const pressed = { x: event.clientX, y: event.clientY }
    listen(undefined, (up) => {
      if (Math.hypot(up.clientX - pressed.x, up.clientY - pressed.y) <= CLICK_MOVE_TOLERANCE_PX) emit('select', null)
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
  host = target
}
function detach(): void {
  host?.removeEventListener('pointerdown', onPointerDown, true)
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
