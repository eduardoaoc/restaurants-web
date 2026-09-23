import { onBeforeUnmount, ref } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { publicTableService } from '@/services/public-table.service'
import type { PublicTableResolution } from '@/types/public-menu'

/**
 * Resolves the table/restaurant/session/capabilities via
 * `GET /public/tables/{publicToken}` (Carta Cliente 4.1 final fix) —
 * deliberately separate from `usePublicMenu`'s own `GET .../menu` call.
 *
 * WHY this exists: the menu endpoint 404s whenever the table exists but the
 * carta isn't published yet, which used to take the whole QR entry
 * experience down with it (no intro, no gateway, no waiter call — see the
 * bug report this composable fixes). `resolveTable` has no such dependency
 * on the menu being ready: it's the one contract that answers "does this
 * QR/table exist at all" on its own, and now the intro/gateway are built on
 * top of THIS response, never the menu's. `usePublicMenu` still runs in
 * parallel (unchanged) and remains authoritative for actual carta content
 * (categories/products/locale) once the visitor asks to see it.
 *
 * No `locale` param exists on this endpoint (unlike `getMenu`) and the
 * response never changes per visitor language, so this fetches exactly
 * once per mount — no reactive input to re-run on.
 */
export function usePublicTableResolution(publicToken: string) {
  const resolution = ref<PublicTableResolution | null>(null)
  const loading = ref(true)
  const error = ref<ApiError | null>(null)

  let controller: AbortController | null = null

  async function load(): Promise<void> {
    controller?.abort()
    controller = new AbortController()
    const { signal } = controller
    loading.value = true
    error.value = null

    try {
      const result = await publicTableService.resolveTable(publicToken, signal)
      if (signal.aborted) return
      resolution.value = result
    } catch (err) {
      if (signal.aborted) return
      resolution.value = null
      error.value = normalizeApiError(err)
    } finally {
      if (!signal.aborted) loading.value = false
    }
  }

  void load()
  onBeforeUnmount(() => controller?.abort())

  return { resolution, loading, error, reload: load }
}
