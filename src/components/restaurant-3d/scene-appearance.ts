import { reactive } from 'vue'

/**
 * Presentation of the one scene on screen. `light` is the dashboard stage: a bright neutral maquette. The default
 * (dark) is what every other host (dev fixture, floor editor) keeps. Module state, like `overlayViewport`, because the
 * floating labels are rendered by drei's Html outside the component tree where `inject` would not reach.
 */
export const sceneAppearance = reactive({ light: false })

/** Canvas background / floor / light constants for the light stage. The accent is the brand orange (tokens-v2 --color-primary). */
export const LIGHT_STAGE = {
  background: '#d9d2c9',
  floorTiles: ['#f7f1e8', '#efe5d6'] as const,
  base: '#c9bcab',
  wall: '#e3d9cc',
  /** Furniture roles (see stage-materials.ts): walnut tables, light-oak chairs, pale counters, grey appliances. */
  furniture: { table: '#5e3b27', chair: '#a9743f', counter: '#ddd2c3', appliance: '#bdb8b1', shelf: '#cdbba2' } as const,
  accent: '#ff7300',
} as const
