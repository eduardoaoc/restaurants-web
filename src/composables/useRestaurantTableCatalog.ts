import { onScopeDispose, readonly, shallowRef, watch, type Ref } from 'vue'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { tablesService } from '@/services/tables.service'
import type { BackendTableOption } from '@/components/restaurant-3d/table-mapping'

export type TableCatalogState = 'idle' | 'loading' | 'ready' | 'error'

/** Loads the current restaurant's real tables only while the authorized editor is available. */
export function useRestaurantTableCatalog(restaurantId: Ref<number | null>, enabled: Ref<boolean>) {
  const state = shallowRef<TableCatalogState>('idle')
  const tables = shallowRef<BackendTableOption[]>([])
  const error = shallowRef<ApiError | null>(null)
  let generation = 0
  let controller: AbortController | undefined

  async function load(id: number | null, active: boolean): Promise<void> {
    const mine = ++generation
    controller?.abort()
    controller = undefined
    tables.value = []
    error.value = null
    if (!active || id === null) {
      state.value = 'idle'
      return
    }

    state.value = 'loading'
    const current = new AbortController()
    controller = current
    try {
      const result = await tablesService.list(id, current.signal)
      if (mine !== generation) return
      tables.value = result
        .filter((table) => table.restaurant_id === id)
        .map(({ id: tableId, restaurant_id, name, number, capacity }) => ({
          id: tableId, restaurant_id, name, number, capacity,
        }))
      state.value = 'ready'
    } catch (cause) {
      if (mine !== generation) return
      error.value = normalizeApiError(cause)
      state.value = 'error'
    }
  }

  watch([restaurantId, enabled], ([id, active]) => void load(id, active), { immediate: true })
  onScopeDispose(() => {
    generation += 1
    controller?.abort()
  })

  return { state: readonly(state), tables: readonly(tables), error: readonly(error), reload: () => load(restaurantId.value, enabled.value) }
}
