/**
 * The two ways the same floor layout is shown. Everything mode-dependent is
 * read from `SCENE_MODE_BEHAVIOR` so components receive plain flags instead of
 * comparing against a mode themselves.
 */
export type RestaurantSceneMode = 'operation' | 'edit'

export interface SceneModeBehavior {
  /** Rings, badges, guests and the occupancy label detail. */
  showOperational: boolean
  /** Click focuses the camera and opens the table detail sheet. */
  operationalSelection: boolean
  /** Click selects, drag moves, toolbar rotates. */
  layoutEditing: boolean
}

export const SCENE_MODE_BEHAVIOR: Record<RestaurantSceneMode, SceneModeBehavior> = {
  operation: { showOperational: true, operationalSelection: true, layoutEditing: false },
  edit: { showOperational: false, operationalSelection: false, layoutEditing: true },
}
