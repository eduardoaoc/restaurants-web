import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { publicTableService } from '@/services/public-table.service'
import type { PublicMenu } from '@/types/public-menu'

/**
 * Loads the public menu for one table (Passo 3.1) — re-fetches whenever the
 * caller's `locale` ref changes (the customer's own language switch), since
 * the backend translates content server-side rather than the frontend
 * re-deriving it (CLAUDE.md §8 "Vue I18n translates interface chrome only").
 * `publicToken` is fixed for the composable's lifetime — a different table
 * gets a fresh component instance (see PublicTableView's `:key`), never a
 * silent re-target of the same one.
 */
export function usePublicMenu(publicToken: string, locale: Ref<string | undefined>) {
  const menu = ref<PublicMenu | null>(null)
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
      const result = await publicTableService.getMenu(publicToken, locale.value, signal)
      if (signal.aborted) return
      menu.value = result
    } catch (err) {
      if (signal.aborted) return
      menu.value = null
      error.value = normalizeApiError(err)
    } finally {
      if (!signal.aborted) loading.value = false
    }
  }

  watch(locale, () => void load(), { immediate: true })
  onBeforeUnmount(() => controller?.abort())

  return { menu, loading, error, reload: load }
}
