import { inject, onBeforeUnmount, provide, type InjectionKey } from 'vue'
import type { ApiError } from '@/api/errors'

type Read = () => Promise<readonly (ApiError | null)[]>
const catalogReads: InjectionKey<Set<Read>> = Symbol('catalogReads')

/** Children join the screen's existing refresh cycle, including its backoff,
 * authorization, visibility and cleanup. No second socket or polling timer. */
export function provideCatalogRefresh(): Read {
  const reads = new Set<Read>()
  provide(catalogReads, reads)
  return async () => (await Promise.all([...reads].map(read => read()))).flat()
}

export function useCatalogRefresh(read: Read): void {
  const reads = inject(catalogReads, null)
  reads?.add(read)
  onBeforeUnmount(() => reads?.delete(read))
}
