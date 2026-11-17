import { reactive } from 'vue'

/**
 * One-way commands from a host that draws its own controls around the scene (the Dashboard stage) to the scene.
 * Module state, like `sceneAppearance`: the host and the scene meet here without a ref through the async wrapper.
 * Each command is a counter; the scene reacts to every increment.
 */
export const sceneCommands = reactive({ recenter: 0 })
