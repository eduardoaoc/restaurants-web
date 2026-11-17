import { onBeforeUnmount } from 'vue'
import { Vector3 } from 'three'
import type { Camera, Object3D } from 'three'
import { clampOverlay } from './overlay-metrics'
import { overlayViewport } from './overlay-viewport'
import { resolveOverlayCollisions, type OverlayKind, type OverlayPoint } from './overlay-collision'

/** Below this screen-space shift a label still reads as attached to its table, so no leader is drawn. */
const LEADER_MIN_PX = 24

/** Publishes the vector from a displaced label back to its table anchor as CSS variables, for its leader line. */
function setLeader(element: HTMLElement | null, dx: number, dy: number) {
  if (!element) return
  const length = Math.hypot(dx, dy)
  const style = element.style
  if (length < LEADER_MIN_PX) {
    if (element.hasAttribute('data-leader')) element.removeAttribute('data-leader')
    return
  }
  if (!element.hasAttribute('data-leader')) element.setAttribute('data-leader', '')
  style.setProperty('--leader-len', `${length.toFixed(1)}px`)
  style.setProperty('--leader-angle', `${Math.atan2(dy, dx).toFixed(4)}rad`)
  style.setProperty('--leader-dx', `${dx.toFixed(1)}px`)
  style.setProperty('--leader-dy', `${dy.toFixed(1)}px`)
}

const world = new Vector3()
let counter = 0
const overlayPoints = new Map<string, OverlayPoint>()
const overlayOffsets = new Map<string, { x: number; y: number }>()

/**
 * Position function for cientos' `Html` (`calculate-position`) that keeps an overlay readable at the canvas edge: it is
 * the default projection, nudged inwards by the overlay's own measured size and the canvas' safe-area insets. The
 * overlay is never hidden or dropped; one whose table is really out of view is left where it projects.
 *
 * `Html` renders its slot into a detached Vue root, where template refs are not reliable, so the overlay is found by a
 * unique `data-overlay-id` the caller spreads on its root element. Lookup is lazy (the slot renders after setup) and its
 * size is observed, not read per frame.
 */
export function useEdgeClamp(kind: OverlayKind = 'badge', getRank: () => number = () => 5) {
  const id = `overlay-${++counter}`
  const size = { width: 0, height: 0 }
  let element: HTMLElement | null = null
  let observer: ResizeObserver | undefined

  const measure = () => {
    if (!element) return
    size.width = element.offsetWidth
    size.height = element.offsetHeight
  }
  const find = () => {
    element = document.querySelector<HTMLElement>(`[data-overlay-id="${id}"]`)
    if (!element) return
    measure()
    if (typeof ResizeObserver === 'undefined') return
    observer = new ResizeObserver(measure)
    observer.observe(element)
  }
  onBeforeUnmount(() => {
    observer?.disconnect()
    overlayPoints.delete(id)
    overlayOffsets.delete(id)
  })

  const calculatePosition = (instance: Object3D, camera: Camera, canvas: { width: number; height: number }): [number, number, number] => {
    world.setFromMatrixPosition(instance.matrixWorld).project(camera)
    const x = (Number.isNaN(world.x) ? 0 : world.x) * (canvas.width / 2) + canvas.width / 2
    const y = -(world.y * (canvas.height / 2)) + canvas.height / 2
    if (!element || !element.isConnected) {
      element = null
      find()
    }
    if (!size.width || !size.height) return [x, y, world.z]
    const clamped = clampOverlay({ x, y }, size, canvas, overlayViewport.insets, overlayViewport.edge)
    overlayPoints.set(id, { id, kind, rank: getRank(), position: clamped, size })
    const resolved = resolveOverlayCollisions([...overlayPoints.values()], 5, 96, { width: canvas.width, height: canvas.height, edge: overlayViewport.edge }, overlayOffsets).get(id) ?? clamped
    overlayOffsets.set(id, { x: resolved.x - clamped.x, y: resolved.y - clamped.y })
    if (kind === 'label') setLeader(element, clamped.x - resolved.x, clamped.y - resolved.y)
    return [resolved.x, resolved.y, world.z]
  }
  return { calculatePosition, attrs: { 'data-overlay-id': id, 'data-overlay-kind': kind } }
}
