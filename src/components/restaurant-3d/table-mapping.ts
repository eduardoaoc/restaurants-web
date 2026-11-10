import type { FloorPlanTable } from '@/types/floor-plan'
import type { RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'

export type BackendTableOption = Pick<FloorPlanTable, 'id' | 'restaurant_id' | 'name' | 'number' | 'capacity'>
export type TableMappingState = 'unmapped' | 'mapped' | 'missing' | 'conflict'

export interface TableMappingIssue {
  tableId: string
  kind: 'missing' | 'conflict'
}

/** Resolve only explicit IDs. Never infer an association from the visual number. */
export function tableMappingState(
  table: RestaurantTableConfig,
  layoutTables: readonly RestaurantTableConfig[],
  backendTables: readonly BackendTableOption[],
  restaurantId: number,
): TableMappingState {
  const backendTableId = table.backendTableId
  if (backendTableId == null) return 'unmapped'
  if (layoutTables.some((other) => other.id !== table.id && other.backendTableId === backendTableId)) return 'conflict'
  return backendTables.some((candidate) => candidate.id === backendTableId && candidate.restaurant_id === restaurantId)
    ? 'mapped'
    : 'missing'
}

/** Invalid/missing IDs block saving until repaired; capacity is an explicit warning, not an implicit rewrite. */
export function validateTableMappings(
  layoutTables: readonly RestaurantTableConfig[],
  backendTables: readonly BackendTableOption[],
  restaurantId: number,
): TableMappingIssue[] {
  return layoutTables.flatMap((table) => {
    const state = tableMappingState(table, layoutTables, backendTables, restaurantId)
    return state === 'missing' || state === 'conflict' ? [{ tableId: table.id, kind: state }] : []
  })
}

export function hasCapacityMismatch(table: RestaurantTableConfig, backendTable: BackendTableOption): boolean {
  return backendTable.capacity !== null && backendTable.capacity !== table.seats
}

/** Authoritative seated guests per backend table id (only open sessions that report a count). */
export type ActiveGuestCounts = ReadonlyMap<number, number>

/** Smallest visual capacity that still seats the authoritative active guests of the linked table (0 if none/unlinked). */
export function minSeatsForBackendTable(table: RestaurantTableConfig, guestCounts: ActiveGuestCounts): number {
  return table.backendTableId == null ? 0 : guestCounts.get(table.backendTableId) ?? 0
}

/** Visual tables whose capacity is below the active guest count of their linked backend table. Blocks saving; nothing is rewritten. */
export function validateCapacityAgainstOccupancy(
  layoutTables: readonly RestaurantTableConfig[],
  guestCounts: ActiveGuestCounts,
): { tableId: string; seats: number; guests: number }[] {
  return layoutTables.flatMap((table) => {
    const guests = minSeatsForBackendTable(table, guestCounts)
    return guests > table.seats ? [{ tableId: table.id, seats: table.seats, guests }] : []
  })
}
