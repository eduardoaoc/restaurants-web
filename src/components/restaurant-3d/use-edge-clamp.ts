import { onBeforeUnmount } from 'vue'
import { Vector3 } from 'three'
import type { Camera, Object3D } from 'three'
import { clampOverlay } from './overlay-metrics'
import { overlayViewport } from './overlay-viewport'

const world = new Vector3()
let counter = 0

/**
 * Position function for cientos' `Html` (`calculate-position`) that keeps an overlay readable at the canvas edge: it is
 * the default projection, nudged inwards by the overlay's own measured size and the canvas' safe-area insets. The
 * overlay is never hidden or dropped; one whose table is really out of view is left where it projects.
 *
 * `Html` renders its slot into a detached Vue root, where template refs are not reliable, so the overlay is found by a
 * unique `data-overlay-id` the caller spreads on its root element. Lookup is lazy (the slot renders after setup) and its
 * size is observed, not read per frame.
 */
export function useEdgeClamp() {
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
  onBeforeUnmount(() => observer?.disconnect())

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
    return [clamped.x, clamped.y, world.z]
  }
  return { calculatePosition, attrs: { 'data-overlay-id': id } }
}
