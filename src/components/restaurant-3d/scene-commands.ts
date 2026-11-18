import { reactive } from 'vue'

/**
 * One-way commands from a host that draws its own controls around the scene (the Dashboard stage) to the scene.
 * Module state, like `sceneAppearance`: the host and the scene meet here without a ref through the async wrapper.
 * Each command is a counter; the scene reacts to every increment.
 */
export const sceneCommands = reactive({
  /** "Ver salón entero": the whole room (floor, walls, terrace) in view. */
  recenter: 0,
  /** Step zoom for people who cannot (or would rather not) pinch or use the wheel. */
  zoomIn: 0,
  zoomOut: 0,
})
/** Distance factor of one zoom step: in = closer, out = farther. */
export const ZOOM_STEP = 0.78
