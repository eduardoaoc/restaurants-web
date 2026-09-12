import { computed, reactive, ref } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { usePermissions } from '@/composables/usePermissions'
import { floorPlanService } from '@/services/floor-plan.service'
import { tablesService } from '@/services/tables.service'
import type {
  CreateTablePayload,
  FloorPlan,
  FloorPlanTableLayout,
  LayoutTableUpdate,
  UpdateTablePayload,
} from '@/types/floor-plan'

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
  const { can } = usePermissions()
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

  /**
   * Floor-plan fields (zone_id + every layout_*) additionally require
   * `manage_floor_plan` on the backend — TableController::LAYOUT_FIELDS runs
   * a second authorize() the moment the payload mentions any of them, even
   * on create. Stripping them for a manage_tables-only user is what lets
   * that user still create and rename tables instead of eating a 403 for a
   * default position they never asked for (CLAUDE.md §9 — adapt the request
   * to the capability, never fire one the backend will refuse).
   */
  function stripLayoutFields<T extends UpdateTablePayload | CreateTablePayload>(payload: T): T {
    if (can('manage_floor_plan')) return payload

    const { zone_id, layout_x, layout_y, layout_rotation, layout_shape, layout_width, layout_height, ...rest } =
      payload as UpdateTablePayload
    void zone_id
    void layout_x
    void layout_y
    void layout_rotation
    void layout_shape
    void layout_width
    void layout_height
    return rest as T
  }

  async function createTable(payload: CreateTablePayload): Promise<boolean> {
    const id = restaurantId()
    if (id === null) return false
    saving.value = true
    error.value = null
    try {
      await tablesService.create(id, stripLayoutFields(payload))
      await load()
      return true
    } catch (err) {
      error.value = normalizeApiError(err)
      return false
    } finally {
      saving.value = false
    }
  }

  /** Identity edits (name/number/capacity/status) need only `manage_tables`; see stripLayoutFields. */
  async function updateTable(tableId: number, payload: UpdateTablePayload): Promise<ApiError | null> {
    saving.value = true
    error.value = null
    try {
      await tablesService.update(tableId, stripLayoutFields(payload))
      await load()
      return null
    } catch (err) {
      const normalized = normalizeApiError(err)
      error.value = normalized
      return normalized
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
    updateTable,
    createFloor,
    createZone,
  }
}
