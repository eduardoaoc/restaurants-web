import { onBeforeUnmount, reactive, ref, watch } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { modifierGroupService } from '@/services/modifier-group.service'
import { modifierOptionService } from '@/services/modifier-option.service'
import { computeAdjacentSwap, nextSortOrder } from '@/utils/reorder'
import type {
  CreateModifierGroupPayload,
  CreateModifierOptionPayload,
  ModifierGroup,
  ModifierOption,
  UpdateModifierGroupPayload,
  UpdateModifierOptionPayload,
} from '@/types/modifier'

/**
 * Modifier groups (+ their options) for ONE RestaurantProduct — a
 * ModifierGroup belongs to the RestaurantProduct, never the global Product
 * (CLAUDE.md Passo 2.5 §4), so this composable is keyed entirely on
 * `restaurantProductId`, re-fetching cleanly whenever it changes (product
 * switch, CLAUDE.md §28) or goes null (leaving the product's options
 * screen, or a restaurant switch invalidating the whole context, §29) —
 * same abort-on-change shape as useRestaurantCategories/useRestaurantProducts.
 *
 * The group-list endpoint does NOT eager-load options (confirmed live,
 * ModifierGroupController::index only `.with('translations')`) — options
 * are fetched with one GET per group, fired in parallel right after the
 * groups load. Bounded fan-out (a handful of groups per product), not a
 * heavy N+1.
 */
export function useProductModifierGroups(restaurantProductId: () => number | null, enabled: () => boolean = () => true) {
  const groups = ref<ModifierGroup[]>([])
  const loading = ref(false)
  const error = ref<ApiError | null>(null)

  const saving = ref(false)
  const saveError = ref<ApiError | null>(null)
  const reordering = ref(false)
  const reorderError = ref<ApiError | null>(null)

  // Per-group option state — plain reactive objects keyed by group id.
  const optionsByGroup = reactive<Record<number, ModifierOption[]>>({})
  const optionsLoading = reactive<Record<number, boolean>>({})
  const optionsError = reactive<Record<number, ApiError | null>>({})
  const optionSaving = reactive<Record<number, boolean>>({})
  const optionSaveError = reactive<Record<number, ApiError | null>>({})
  const optionReordering = reactive<Record<number, boolean>>({})
  const optionReorderError = reactive<Record<number, ApiError | null>>({})

  let controller: AbortController | null = null
  const optionControllers: Record<number, AbortController> = {}

  function sortByOrder<T extends { sort_order: number }>(list: T[]): T[] {
    return list.slice().sort((a, b) => a.sort_order - b.sort_order)
  }

  function abortOptionController(groupId: number): void {
    optionControllers[groupId]?.abort()
    delete optionControllers[groupId]
  }

  async function fetchOptions(groupId: number): Promise<void> {
    abortOptionController(groupId)
    const localController = new AbortController()
    optionControllers[groupId] = localController
    const { signal } = localController

    optionsLoading[groupId] = true
    optionsError[groupId] = null

    try {
      const result = await modifierOptionService.list(groupId, signal)
      if (signal.aborted) return
      optionsByGroup[groupId] = sortByOrder(result)
    } catch (err) {
      if (signal.aborted) return
      optionsError[groupId] = normalizeApiError(err)
    } finally {
      if (!signal.aborted) optionsLoading[groupId] = false
    }
  }

  async function fetch(rpId: number | null): Promise<void> {
    controller?.abort()
    Object.keys(optionControllers).forEach((id) => abortOptionController(Number(id)))

    groups.value = []
    Object.keys(optionsByGroup).forEach((id) => delete optionsByGroup[Number(id)])
    Object.keys(optionsLoading).forEach((id) => delete optionsLoading[Number(id)])
    Object.keys(optionsError).forEach((id) => delete optionsError[Number(id)])
    error.value = null

    if (rpId === null) return

    controller = new AbortController()
    const { signal } = controller
    loading.value = true

    try {
      const result = await modifierGroupService.list(rpId, signal)
      if (signal.aborted) return
      groups.value = sortByOrder(result)
      // Fan out options for every group in parallel — bounded (a handful
      // of groups per product), never awaited sequentially.
      void Promise.all(groups.value.map((group) => fetchOptions(group.id)))
    } catch (err) {
      if (signal.aborted) return
      error.value = normalizeApiError(err)
    } finally {
      if (!signal.aborted) loading.value = false
    }
  }

  watch(
    () => [restaurantProductId(), enabled()] as const,
    ([id, isEnabled]) => {
      if (!isEnabled) {
        controller?.abort()
        Object.keys(optionControllers).forEach((gid) => abortOptionController(Number(gid)))
        groups.value = []
        error.value = null
        loading.value = false
        return
      }
      void fetch(id)
    },
    { immediate: true },
  )

  async function createGroup(payload: CreateModifierGroupPayload): Promise<ApiError | null> {
    const rpId = restaurantProductId()
    if (rpId === null) return null

    saving.value = true
    saveError.value = null
    try {
      const created = await modifierGroupService.create(rpId, {
        ...payload,
        sort_order: payload.sort_order ?? nextSortOrder(groups.value),
      })
      groups.value = sortByOrder([...groups.value, created])
      optionsByGroup[created.id] = []
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      saveError.value = normalized
      return normalized
    } finally {
      saving.value = false
    }
  }

  async function updateGroup(groupId: number, payload: UpdateModifierGroupPayload): Promise<ApiError | null> {
    saving.value = true
    saveError.value = null
    try {
      const updated = await modifierGroupService.update(groupId, payload)
      groups.value = sortByOrder(groups.value.map((g) => (g.id === groupId ? updated : g)))
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      saveError.value = normalized
      return normalized
    } finally {
      saving.value = false
    }
  }

  async function moveGroup(groupId: number, direction: 'up' | 'down'): Promise<ApiError | null> {
    if (reordering.value) return null

    const swap = computeAdjacentSwap(groups.value, groupId, direction)
    if (!swap) return null

    reordering.value = true
    reorderError.value = null
    groups.value = swap.reordered

    try {
      await modifierGroupService.update(swap.current.id, { sort_order: swap.target.sort_order })
      await modifierGroupService.update(swap.target.id, { sort_order: swap.current.sort_order })
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      reorderError.value = normalized
      await fetch(restaurantProductId())
      return normalized
    } finally {
      reordering.value = false
    }
  }

  async function createOption(groupId: number, payload: CreateModifierOptionPayload): Promise<ApiError | null> {
    optionSaving[groupId] = true
    optionSaveError[groupId] = null
    try {
      const existing = optionsByGroup[groupId] ?? []
      const created = await modifierOptionService.create(groupId, {
        ...payload,
        sort_order: payload.sort_order ?? nextSortOrder(existing),
      })
      optionsByGroup[groupId] = sortByOrder([...existing, created])
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      optionSaveError[groupId] = normalized
      return normalized
    } finally {
      optionSaving[groupId] = false
    }
  }

  async function updateOption(
    groupId: number,
    optionId: number,
    payload: UpdateModifierOptionPayload,
  ): Promise<ApiError | null> {
    optionSaving[groupId] = true
    optionSaveError[groupId] = null
    try {
      const updated = await modifierOptionService.update(optionId, payload)
      optionsByGroup[groupId] = sortByOrder((optionsByGroup[groupId] ?? []).map((o) => (o.id === optionId ? updated : o)))
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      optionSaveError[groupId] = normalized
      return normalized
    } finally {
      optionSaving[groupId] = false
    }
  }

  async function moveOption(groupId: number, optionId: number, direction: 'up' | 'down'): Promise<ApiError | null> {
    if (optionReordering[groupId]) return null

    const list = optionsByGroup[groupId] ?? []
    const swap = computeAdjacentSwap(list, optionId, direction)
    if (!swap) return null

    optionReordering[groupId] = true
    optionReorderError[groupId] = null
    optionsByGroup[groupId] = swap.reordered

    try {
      await modifierOptionService.update(swap.current.id, { sort_order: swap.target.sort_order })
      await modifierOptionService.update(swap.target.id, { sort_order: swap.current.sort_order })
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      optionReorderError[groupId] = normalized
      await fetchOptions(groupId)
      return normalized
    } finally {
      optionReordering[groupId] = false
    }
  }

  onBeforeUnmount(() => {
    controller?.abort()
    Object.keys(optionControllers).forEach((gid) => abortOptionController(Number(gid)))
  })

  return {
    groups,
    loading,
    error,
    saving,
    saveError,
    reordering,
    reorderError,
    optionsByGroup,
    optionsLoading,
    optionsError,
    optionSaving,
    optionSaveError,
    optionReordering,
    optionReorderError,
    createGroup,
    updateGroup,
    moveGroup,
    createOption,
    updateOption,
    moveOption,
  }
}
