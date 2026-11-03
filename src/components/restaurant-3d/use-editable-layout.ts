import { computed, ref } from 'vue'
import type {
  FloorPosition,
  RestaurantLayout,
  RestaurantLayoutDocument,
  RestaurantTableConfig,
} from '@/types/restaurant-3d/restaurant-layout'
import { FLOOR, GRID_STEP, ROTATION_STEP } from './floor'
import { type EditorIssue, type TableDraft, noFreeSpaceIssue, validateTableDraft, validateTablePlacement } from './editor-validation'
import { normalizeRotation, snapAndClampToFloor } from './layout-editing'
import { createTableId, findFreePosition, suggestTableNumber } from './table-defaults'

export type EditResult =
  | { ok: true; table: RestaurantTableConfig }
  | { ok: false; issues: EditorIssue[] }

export interface EditableLayoutOptions {
  /** Smallest capacity that still seats everyone currently at the table (0 if empty). */
  minSeatsFor?: (tableId: string) => number
}

const fail = (issues: EditorIssue[]): EditResult => ({ ok: false, issues })

const cloneTable = (table: RestaurantTableConfig): RestaurantTableConfig => ({ ...table, position: { ...table.position } })

/** Order-independent fingerprint of a layout, for the dirty check. */
const signature = (tables: RestaurantTableConfig[]) =>
  JSON.stringify(
    tables
      .map((t) => [t.id, t.number, t.seats, t.shape, t.position.x, t.position.z, t.rotation])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  )

/**
 * In-memory, editable copy of a layout. The source layout is never mutated;
 * this composable persists nothing itself — `toDocument()` is what gets sent,
 * and `markSaved()` rebases the dirty baseline once the server confirmed it.
 * Every structural edit (add / duplicate / update) is validated by
 * `editor-validation` and reports `{ ok: false, issues }` instead of applying.
 */
export function useEditableLayout(source: RestaurantLayout, options: EditableLayoutOptions = {}) {
  const baselineSignature = ref(signature(source.tables))
  const tables = ref<RestaurantTableConfig[]>(source.tables.map(cloneTable))

  const tableById = (id: string) => tables.value.find((table) => table.id === id)
  const othersOf = (id: string) => tables.value.filter((table) => table.id !== id)

  const isDirty = computed(() => signature(tables.value) !== baselineSignature.value)

  function moveTable(id: string, wanted: FloorPosition): void {
    const table = tableById(id)
    if (!table) return
    const next = snapAndClampToFloor(table, wanted)
    if (next.x !== table.position.x || next.z !== table.position.z) table.position = next
  }

  function rotateTable(id: string, direction: 1 | -1): void {
    const table = tableById(id)
    if (!table) return
    table.rotation = normalizeRotation(table.rotation + direction * ROTATION_STEP)
    // A turned table has a different footprint: keep it on the floor.
    table.position = snapAndClampToFloor(table, table.position)
  }

  /** Builds, places and validates a new table; nothing changes unless it all fits. */
  function place(draft: TableDraft, rotation: number, near: FloorPosition | undefined, id: string): EditResult {
    const issues = validateTableDraft(draft, tables.value)
    if (issues.length) return fail(issues)
    const position = findFreePosition({ shape: draft.shape, seats: draft.seats, rotation }, tables.value, near)
    if (!position) return fail([noFreeSpaceIssue()])
    const table: RestaurantTableConfig = { id, number: draft.number, seats: draft.seats, shape: draft.shape, position, rotation }
    tables.value.push(table)
    return { ok: true, table: tables.value[tables.value.length - 1] }
  }

  const addTable = (draft: TableDraft): EditResult => place(draft, 0, undefined, createTableId())

  /** Same shape, capacity and rotation; next free number; nearest free spot. Nothing operational is copied. */
  function duplicateTable(id: string): EditResult {
    const source = tableById(id)
    if (!source) return fail([])
    return place(
      { number: suggestTableNumber(tables.value), shape: source.shape, seats: source.seats },
      source.rotation,
      source.position,
      createTableId(),
    )
  }

  function removeTable(id: string): void {
    tables.value = tables.value.filter((table) => table.id !== id)
  }

  /** Changes number / shape / capacity. Re-clamps to the floor; rejects if it would collide. */
  function updateTable(id: string, patch: Partial<TableDraft>): EditResult {
    const table = tableById(id)
    if (!table) return fail([])
    const draft: TableDraft = { number: patch.number ?? table.number, shape: patch.shape ?? table.shape, seats: patch.seats ?? table.seats }
    const others = othersOf(id)
    const issues = validateTableDraft(draft, others, options.minSeatsFor?.(id) ?? 0)
    if (issues.length) return fail(issues)

    const candidate = { ...cloneTable(table), ...draft }
    candidate.position = snapAndClampToFloor(candidate, candidate.position)
    const placement = validateTablePlacement(candidate, others)
    if (placement.length) return fail(placement)

    table.number = candidate.number
    table.shape = candidate.shape
    table.seats = candidate.seats
    table.position = candidate.position
    return { ok: true, table }
  }

  const toDocument = (): RestaurantLayoutDocument => ({
    version: 1,
    floor: { width: FLOOR.width, depth: FLOOR.depth, gridStep: GRID_STEP },
    tables: tables.value.map(cloneTable),
  })

  /**
   * The server accepted `sent` and returned `canonical`. The saved document
   * becomes the new clean baseline. Edits made while the request was in
   * flight are never discarded: the working copy is only replaced by the
   * canonical one if it still equals what was sent; otherwise it stays as is
   * and remains dirty relative to the new baseline.
   */
  function markSaved(canonical: RestaurantTableConfig[], sent: RestaurantTableConfig[]): void {
    baselineSignature.value = signature(canonical)
    if (signature(tables.value) === signature(sent)) tables.value = canonical.map(cloneTable)
  }

  return { tables, isDirty, markSaved, tableById, moveTable, rotateTable, addTable, duplicateTable, removeTable, updateTable, toDocument }
}
