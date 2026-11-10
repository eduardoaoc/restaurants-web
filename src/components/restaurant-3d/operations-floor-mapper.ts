import type { OperationsLiveSnapshot, OperationsTable, TablePrimaryStatus } from '@/types/operations'
import type { RestaurantLayout } from '@/types/restaurant-3d/restaurant-layout'
import type { RestaurantOperationalState, RestaurantTableStatus, RestaurantGuestAssignment } from '@/types/restaurant-3d/restaurant-operations'
import { mapOperationalGuests } from './operational-guest-mapper'

export interface OperationsFloorMapping {
  state: RestaurantOperationalState
  tablesByLayoutId: Record<string, OperationsTable>
  flagsByLayoutId: Record<string, string[]>
  invalidLayoutIds: string[]
}

const STATUS_MAP: Record<TablePrimaryStatus, RestaurantTableStatus> = {
  free: 'available',
  occupied: 'occupied',
  waiting_approval: 'order_pending',
  preparing: 'ordering',
  ready: 'order_ready',
  waiter_requested: 'waiter_requested',
  bill_requested: 'bill_requested',
}

function flattenTables(snapshot: OperationsLiveSnapshot): OperationsTable[] {
  const zoned = snapshot.floors.flatMap(floor => floor.zones.flatMap(zone => zone.tables))
  return [...zoned, ...snapshot.unassigned_tables]
}

/**
 * Joins persisted layout UUIDs to Operations Live exclusively by backendTableId.
 * Invalid, ambiguous, cross-restaurant and capacity-invalid mappings never
 * produce guest assignments; the backend table status remains available for
 * a valid unique table association.
 */
export function mapOperationsFloor(
  layout: RestaurantLayout,
  snapshot: OperationsLiveSnapshot,
  restaurantId: number,
): OperationsFloorMapping {
  const state: RestaurantOperationalState = {}
  const tablesByLayoutId: Record<string, OperationsTable> = {}
  const flagsByLayoutId: Record<string, string[]> = {}
  const invalid = new Set<string>()
  if (snapshot.restaurant.id !== restaurantId) {
    return { state, tablesByLayoutId, flagsByLayoutId, invalidLayoutIds: layout.tables.map(table => table.id) }
  }

  const counts = new Map<number, number>()
  for (const table of layout.tables) {
    const id = table.backendTableId
    if (id == null) continue
    if (!Number.isSafeInteger(id) || id < 1) invalid.add(table.id)
    else counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  const operationsById = new Map<number, OperationsTable>()
  const duplicateOperationIds = new Set<number>()
  for (const table of flattenTables(snapshot)) {
    if (operationsById.has(table.id)) duplicateOperationIds.add(table.id)
    else operationsById.set(table.id, table)
  }

  for (const layoutTable of layout.tables) {
    const backendId = layoutTable.backendTableId
    if (backendId == null) continue
    if (invalid.has(layoutTable.id) || counts.get(backendId) !== 1 || duplicateOperationIds.has(backendId)) {
      invalid.add(layoutTable.id)
      continue
    }
    const table = operationsById.get(backendId)
    if (!table || table.id !== backendId) {
      invalid.add(layoutTable.id)
      continue
    }

    const status = STATUS_MAP[table.primary_status]
    if (!status) {
      invalid.add(layoutTable.id)
      continue
    }

    const session = table.session
    const active = session?.status === 'occupied' ? session : null
    if (session && !active) invalid.add(layoutTable.id)
    let guests: RestaurantGuestAssignment[] = []
    if (active) {
      const count = active.guest_count
      const backendCapacity = table.capacity
      const openedAtValid = !Number.isNaN(Date.parse(active.opened_at))
      if (Number.isSafeInteger(count) && count >= 0
        && Number.isSafeInteger(active.id) && active.id > 0
        && openedAtValid
        && table.primary_status !== 'free'
        && count <= layoutTable.seats
        && (backendCapacity === null || (Number.isSafeInteger(backendCapacity) && count <= backendCapacity))) {
        try {
          guests = mapOperationalGuests(layoutTable, { ...table, session: active })
        } catch {
          invalid.add(layoutTable.id)
        }
      } else invalid.add(layoutTable.id)
    } else if (table.primary_status !== 'free') {
      invalid.add(layoutTable.id)
    }
    if (invalid.has(layoutTable.id)) continue

    tablesByLayoutId[layoutTable.id] = table
    flagsByLayoutId[layoutTable.id] = Array.isArray(table.flags) ? table.flags.filter(flag => typeof flag === 'string') : []
    state[layoutTable.id] = {
      tableId: layoutTable.id,
      status,
      guests,
      occupiedAt: active && !invalid.has(layoutTable.id) ? active.opened_at : null,
    }
  }

  return { state, tablesByLayoutId, flagsByLayoutId, invalidLayoutIds: [...invalid] }
}

