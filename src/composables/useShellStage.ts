import { readonly, ref } from 'vue'

/**
 * Presentation-only switch between a page and the app shell: when a page renders a full-bleed "stage" (the dashboard's
 * 3D room) the shell drops the main-area padding so the stage can reach the edges. No route, permission or domain state.
 */
const stageActive = ref(false)

export function useShellStage() {
  return {
    active: readonly(stageActive),
    set(value: boolean): void { stageActive.value = value },
  }
}

/** Where a page may teleport compact controls into the shell's top bar (see ShellTopbar). */
export const SHELL_TOPBAR_CENTER_ID = 'shell-topbar-center'
export const SHELL_TOPBAR_TRAILING_ID = 'shell-topbar-trailing'
