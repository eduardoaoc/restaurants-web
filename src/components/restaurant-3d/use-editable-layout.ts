import { computed, ref } from 'vue'
import type {
  FloorPosition,
  RestaurantLayout,
  RestaurantLayoutDocument,
  RestaurantTableConfig,
} from '@/types/restaurant-3d/restaurant-layout'
import { FLOOR, GRID_STEP, ROTATION_STEP } from './floor'
import { clampEntrance } from './entrance-validation'
import { type EditorIssue, type TableDraft, noFreeSpaceIssue, validateTableDraft, validateTablePlacement } from './editor-validation'
import { normalizeRotation, snapAndClampToFloor, snapToGrid } from './layout-editing'
import { createTableId, findFreePosition, suggestTableNumber } from './table-defaults'

export type EditResult =
  | { ok: true; table: RestaurantTableConfig }
  | { ok: false; issues: EditorIssue[] }

export interface EditableLayoutOptions {
  /** Smallest capacity that still seats everyone currently at the table (0 if empty). */
  minSeatsFor?: (tableId: string) => number
}

const fail = (issues: EditorIssue[]): EditResult => ({ ok: false, issues })

const cloneEntrance = (entrance: FloorPosition | null | undefined): FloorPosition | null => (entrance ? { x: entrance.x, z: entrance.z } : null)
const entranceKey = (entrance: FloorPosition | null): string => (entrance ? `${entrance.x},${entrance.z}` : '')

const cloneTable = (table: RestaurantTableConfig): RestaurantTableConfig => ({ ...table, position: { ...table.position } })

/** Order-independent fingerprint of a layout, for the dirty check. */
const signature = (tables: RestaurantTableConfig[]) =>
  JSON.stringify(
    tables
      .map((t) => [t.id, t.backendTableId ?? null, t.number, t.seats, t.shape, t.position.x, t.position.z, t.rotation])
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
  const baselineTables = ref(source.tables.map(cloneTable))
  const savedTables = computed(() => baselineTables.value.map(cloneTable))
  const tables = ref<RestaurantTableConfig[]>(source.tables.map(cloneTable))
  // The entrance lives in the same draft as the tables: one dirty flag, one baseline, one discard.
  const baselineEntrance = ref<FloorPosition | null>(cloneEntrance(source.entrance))
  const entrance = ref<FloorPosition | null>(cloneEntrance(source.entrance))

  const tableById = (id: string) => tables.value.find((table) => table.id === id)
  const othersOf = (id: string) => tables.value.filter((table) => table.id !== id)

  const isDirty = computed(() =>
    signature(tables.value) !== baselineSignature.value || entranceKey(entrance.value) !== entranceKey(baselineEntrance.value))

  /**
   * Drag target. Snapped to the grid and kept on the floor; a spot that would overlap another table is REFUSED (the
   * table stays at its last valid position, nothing is pushed or teleported) and the issue is returned for feedback.
   */
  function moveTable(id: string, wanted: FloorPosition): EditResult {
    const table = tableById(id)
    if (!table) return fail([])
    const next = snapAndClampToFloor(table, wanted)
    if (next.x === table.position.x && next.z === table.position.z) return { ok: true, table }
    const issues = validateTablePlacement({ ...cloneTable(table), position: next }, othersOf(id))
    if (issues.length) return fail(issues)
    table.position = next
    return { ok: true, table }
  }

  /** Typed X/Z: snapped to the grid like a drag, but a spot off the floor or overlapping another table is rejected, never moved. */
  function setTablePosition(id: string, wanted: FloorPosition): EditResult {
    const table = tableById(id)
    if (!table) return fail([])
    if (!Number.isFinite(wanted.x) || !Number.isFinite(wanted.z)) return fail([{ code: 'out_of_floor', message: 'Introduce coordenadas numéricas válidas.' } as EditorIssue])
    const next = { x: snapToGrid(wanted.x), z: snapToGrid(wanted.z) }
    const issues = validateTablePlacement({ ...cloneTable(table), position: next }, othersOf(id))
    if (issues.length) return fail(issues)
    table.position = next
    return { ok: true, table }
  }

  /** Quarter-turn style step. A turned table has another footprint: it is kept on the floor, and refused if it would overlap. */
  function rotateTable(id: string, direction: 1 | -1): EditResult {
    const table = tableById(id)
    if (!table) return fail([])
    const candidate = { ...cloneTable(table), rotation: normalizeRotation(table.rotation + direction * ROTATION_STEP) }
    candidate.position = snapAndClampToFloor(candidate, candidate.position)
    const issues = validateTablePlacement(candidate, othersOf(id))
    if (issues.length) return fail(issues)
    table.rotation = candidate.rotation
    table.position = candidate.position
    return { ok: true, table }
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

  /** Explicit mapping only. A backend table may belong to at most one visual table. */
  function setBackendTable(id: string, backendTableId: number | null): boolean {
    const table = tableById(id)
    if (!table) return false
    if (backendTableId !== null && tables.value.some((other) => other.id !== id && other.backendTableId === backendTableId)) return false
    table.backendTableId = backendTableId ?? undefined
    return true
  }

  /**
   * Sets (or, with null, removes) the entrance. The wanted point is snapped to the grid and kept inside the
   * walkable floor; whether it is usable (furniture, navigation) is validated by `entrance-validation`, never fixed up here.
   */
  function setEntrance(wanted: FloorPosition | null): FloorPosition | null {
    entrance.value = wanted ? clampEntrance(wanted) : null
    return entrance.value
  }

  /** Restore the last loaded/saved document (tables and entrance) while preserving the source object. */
  function discard(): void {
    tables.value = baselineTables.value.map(cloneTable)
    entrance.value = cloneEntrance(baselineEntrance.value)
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
    // Sent whenever the draft has one, or when a configured one was removed / the layout always carried the key.
    ...(entrance.value === null && baselineEntrance.value === null && source.entrance === undefined ? {} : { entrance: cloneEntrance(entrance.value) }),
    tables: tables.value.map(cloneTable),
  })

  /**
   * The server accepted `sent` and returned `canonical`. The saved document
   * becomes the new clean baseline. Edits made while the request was in
   * flight are never discarded: the working copy is only replaced by the
   * canonical one if it still equals what was sent; otherwise it stays as is
   * and remains dirty relative to the new baseline.
   */
  function markSaved(
    canonical: RestaurantTableConfig[],
    sent: RestaurantTableConfig[],
    entrances: { canonical: FloorPosition | null | undefined; sent: FloorPosition | null | undefined } = { canonical: entrance.value, sent: entrance.value },
  ): void {
    const sameTables = signature(tables.value) === signature(sent)
    const sameEntrance = entranceKey(entrance.value) === entranceKey(cloneEntrance(entrances.sent))
    baselineSignature.value = signature(canonical)
    baselineTables.value = canonical.map(cloneTable)
    baselineEntrance.value = cloneEntrance(entrances.canonical)
    if (sameTables) tables.value = canonical.map(cloneTable)
    if (sameEntrance) entrance.value = cloneEntrance(entrances.canonical)
  }

  return { tables, entrance, savedEntrance: computed(() => cloneEntrance(baselineEntrance.value)), setEntrance, savedTables, isDirty, markSaved, discard, tableById, moveTable, rotateTable, addTable, duplicateTable, removeTable, updateTable, setTablePosition, setBackendTable, toDocument }
}
