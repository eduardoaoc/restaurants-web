import { computed, reactive, ref } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { floorPlanService } from '@/services/floor-plan.service'
import { tablesService } from '@/services/tables.service'
import type { FloorPlan, FloorPlanTableLayout, LayoutTableUpdate } from '@/types/floor-plan'

/** A drag/shape edit always produces a definite number — never null, unlike the original (possibly-never-positioned) layout. */
interface LayoutDraft {
  x?: number
  y?: number
  rotation?: number
  shape?: string
  width?: number
  height?: number
}

/**
 * Owns the Floor Plan Editor's draft state: the real floor plan is loaded
 * once, position/shape edits are kept in a local draft (never sent per-table
 * in a loop, see CLAUDE.md §26) until an explicit Save calls the bulk
 * PATCH .../floor-plan/layout endpoint, or Cancel discards the draft and
 * restores the last-loaded snapshot.
 */
export function useFloorPlanEditor(restaurantId: () => number | null) {
  const floorPlan = ref<FloorPlan | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<ApiError | null>(null)
  const draft = reactive<Record<number, LayoutDraft>>({})

  const hasUnsavedChanges = computed(() => Object.keys(draft).length > 0)

  async function load(): Promise<void> {
    const id = restaurantId()
    if (id === null) return
    loading.value = true
    error.value = null
    try {
      floorPlan.value = await floorPlanService.get(id)
    } catch (err) {
      error.value = normalizeApiError(err)
    } finally {
      loading.value = false
    }
  }

  function mergedLayout(tableId: number, base: FloorPlanTableLayout): FloorPlanTableLayout {
    return { ...base, ...draft[tableId] }
  }

  function updateDraft(tableId: number, patch: LayoutDraft): void {
    draft[tableId] = { ...draft[tableId], ...patch }
  }

  function discardDraft(): void {
    for (const key of Object.keys(draft)) delete draft[Number(key)]
  }

  async function save(): Promise<boolean> {
    const id = restaurantId()
    if (id === null || !hasUnsavedChanges.value) return true

    const tables: LayoutTableUpdate[] = Object.entries(draft).map(([tableId, patch]) => ({
      id: Number(tableId),
      ...(patch.x !== undefined ? { layout_x: patch.x } : {}),
      ...(patch.y !== undefined ? { layout_y: patch.y } : {}),
      ...(patch.rotation !== undefined ? { layout_rotation: patch.rotation } : {}),
      ...(patch.shape !== undefined ? { layout_shape: patch.shape } : {}),
      ...(patch.width !== undefined ? { layout_width: patch.width } : {}),
      ...(patch.height !== undefined ? { layout_height: patch.height } : {}),
    }))

    saving.value = true
    error.value = null
    try {
      await floorPlanService.updateLayout(id, tables)
      discardDraft()
      await load()
      return true
    } catch (err) {
      error.value = normalizeApiError(err)
      return false
    } finally {
      saving.value = false
    }
  }

  async function createTable(name: string, zoneId: number | null, capacity?: number): Promise<boolean> {
    const id = restaurantId()
    if (id === null) return false
    saving.value = true
    error.value = null
    try {
      await tablesService.create(id, { name, zone_id: zoneId, capacity, layout_x: 0.5, layout_y: 0.5 })
      await load()
      return true
    } catch (err) {
      error.value = normalizeApiError(err)
      return false
    } finally {
      saving.value = false
    }
  }

  async function createFloor(name: string): Promise<boolean> {
    const id = restaurantId()
    if (id === null) return false
    saving.value = true
    error.value = null
    try {
      await floorPlanService.createFloor(id, { name })
      await load()
      return true
    } catch (err) {
      error.value = normalizeApiError(err)
      return false
    } finally {
      saving.value = false
    }
  }

  async function createZone(name: string, floorId: number): Promise<boolean> {
    const id = restaurantId()
    if (id === null) return false
    saving.value = true
    error.value = null
    try {
      await floorPlanService.createZone(id, { name, floor_id: floorId })
      await load()
      return true
    } catch (err) {
      error.value = normalizeApiError(err)
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    floorPlan,
    loading,
    saving,
    error,
    hasUnsavedChanges,
    load,
    mergedLayout,
    updateDraft,
    discardDraft,
    save,
    createTable,
    createFloor,
    createZone,
  }
}
