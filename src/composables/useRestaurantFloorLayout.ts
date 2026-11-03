import { onScopeDispose, readonly, ref, shallowRef, watch, type Ref } from 'vue'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { floorLayoutService, UnsupportedFloorLayoutError } from '@/services/floor-layout.service'
import type { RestaurantLayout } from '@/types/restaurant-3d/restaurant-layout'

export type FloorLayoutLoadState = 'idle' | 'loading' | 'ready' | 'error'

/** Shown for a restaurant that has never saved a layout: explicitly empty, never the dev mock. */
const emptyLayout = (): RestaurantLayout => ({ tables: [] })

/**
 * Loads the saved 3D floor layout of the given restaurant (reloading when it
 * changes). A failed request leaves `state === 'error'` — it is never turned
 * into an empty layout. Only the latest request may write state, so a slow
 * response for a previous restaurant is discarded.
 */
export function useRestaurantFloorLayout(restaurantId: Ref<number | null>) {
  const state = ref<FloorLayoutLoadState>('idle')
  const layout = shallowRef<RestaurantLayout | null>(null)
  const error = ref<ApiError | null>(null)
  /** Bumped on every successful load, so consumers can re-initialise from the new data. */
  const revision = ref(0)
  let generation = 0
  let controller: AbortController | undefined

  async function load(): Promise<void> {
    const id = restaurantId.value
    const mine = ++generation
    controller?.abort()
    controller = undefined
    layout.value = null
    error.value = null

    if (id === null) {
      state.value = 'idle'
      return
    }

    state.value = 'loading'
    const current = new AbortController()
    controller = current
    try {
      const document = await floorLayoutService.get(id, current.signal)
      if (mine !== generation) return
      layout.value = document ? { tables: document.tables } : emptyLayout()
      revision.value += 1
      state.value = 'ready'
    } catch (cause) {
      if (mine !== generation) return
      error.value = cause instanceof UnsupportedFloorLayoutError ? { kind: 'unknown' } : normalizeApiError(cause)
      state.value = 'error'
    }
  }

  watch(restaurantId, () => void load(), { immediate: true })
  onScopeDispose(() => {
    generation += 1
    controller?.abort()
  })

  return { state: readonly(state), layout, error, revision: readonly(revision), reload: load }
}
