import type { InjectionKey } from 'vue'

export type SceneFailureReason = 'error' | 'context-lost' | 'context-creation'

/** Lets the scene report a failure it detects itself (e.g. the canvas could not create its renderer) to the host's guard. */
export const SCENE_FAILURE_KEY: InjectionKey<(reason: SceneFailureReason) => void> = Symbol('scene-failure')

/** How long a lost WebGL context may take to come back (a backgrounded phone tab does this) before the scene is given up. */
export const CONTEXT_RESTORE_GRACE_MS = 2500

/** True when this browser can create a WebGL context at all; never throws. */
export function supportsWebGL(doc: Pick<Document, 'createElement'> = document): boolean {
  try {
    const canvas = doc.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}
