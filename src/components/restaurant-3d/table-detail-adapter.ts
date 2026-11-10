import { mockOrdersByTableNumber } from '@/data/restaurant-3d/mock-table-orders'
import type { OperationsTable, TablePrimaryStatus } from '@/types/operations'
import type { RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'
import type { RestaurantTableState, RestaurantTableStatus } from '@/types/restaurant-3d/restaurant-operations'

/**
 * Adapter between the lab's models and the real `TableDetailsDrawer`, which
 * takes the backend's `OperationsTable` (numeric ids, a `TableActiveSession`,
 * a `TablePrimaryStatus`). The drawer itself is reused untouched.
 *
 * IDs: lab tables/sessions get NEGATIVE numeric ids. A real backend id is
 * always positive, so nothing the drawer does with a lab table can ever touch
 * a real table or session; `lab-api-guard.ts` answers (or rejects) those
 * requests locally.
 */
export const LAB_CURRENCY = 'EUR'

export const labTableId = (table: Pick<RestaurantTableConfig, 'number'>) => -table.number
export const labSessionId = (table: Pick<RestaurantTableConfig, 'number'>) => -(1000 + table.number)

/** Lab statuses expressed in the backend's vocabulary (which has no `eating`/`ordering`). */
const PRIMARY_STATUS: Record<RestaurantTableStatus, TablePrimaryStatus> = {
  available: 'free',
  occupied: 'occupied',
  ordering: 'occupied',
  eating: 'occupied',
  order_pending: 'waiting_approval',
  order_ready: 'ready',
  waiter_requested: 'waiter_requested',
  bill_requested: 'bill_requested',
}

export function toOperationsTable(
  table: RestaurantTableConfig,
  state: RestaurantTableState | undefined,
  now: number,
): OperationsTable {
  const occupiedAt = state?.occupiedAt ?? null
  const session = state && occupiedAt !== null
    ? {
        id: labSessionId(table),
        started_at: occupiedAt,
        elapsed_seconds: Math.max(0, Math.floor((now - Date.parse(occupiedAt)) / 1000)),
        guest_count: state.guests.length,
        guest_count_version: 1,
        assigned_waiter: null,
      }
    : null

  const orders = session ? mockOrdersByTableNumber[table.number] ?? [] : []
  const total = orders.reduce((sum, order) => sum + Number(order.total), 0).toFixed(2)
  const countOf = (status: string) => orders.filter((order) => order.status === status).length

  return {
    id: labTableId(table),
    name: `Mesa ${String(table.number).padStart(2, '0')}`,
    number: table.number,
    capacity: table.seats,
    zone_id: null,
    layout: {
      x: table.position.x,
      y: table.position.z,
      rotation: table.rotation,
      shape: table.shape === 'rectangular' ? 'rectangle' : table.shape,
      width: null,
      height: null,
    },
    primary_status: PRIMARY_STATUS[state?.status ?? 'available'],
    flags: [],
    session,
    orders: {
      open_count: orders.filter((order) => order.status !== 'served').length,
      waiting_approval: countOf('waiting_approval'),
      preparing: countOf('preparing'),
      ready: countOf('ready'),
    },
    billing: orders.length ? { total, paid: '0.00', outstanding: total, status: 'unpaid' } : null,
  }
}
