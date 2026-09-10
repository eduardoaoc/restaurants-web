import { http } from '@/api/http'
import type { CreateTablePayload, FloorPlanTable } from '@/types/floor-plan'
import type { OpenTablePayload, TableSession } from '@/types/table-sessions'
import type { CreateStaffOrderPayload, Order } from '@/types/orders'

interface TableEnvelope {
  data: { table: FloorPlanTable }
}
interface TableSessionEnvelope {
  data: { session: TableSession }
}
interface OrderEnvelope {
  data: { order: Order }
}

/**
 * Thin wrapper around the real restaurants-api Tables contract:
 *   POST  /api/v1/restaurants/{restaurant}/tables      (create)
 *   PATCH /api/v1/tables/{table}
 *   POST  /api/v1/tables/{table}/open|close
 *   POST  /api/v1/tables/{table}/orders                (staff-created order)
 * There is no DELETE for a table anywhere in this API — never add one here.
 */
export const tablesService = {
  async create(restaurantId: number, payload: CreateTablePayload): Promise<FloorPlanTable> {
    const { data } = await http.post<TableEnvelope>(`/api/v1/restaurants/${restaurantId}/tables`, payload)
    return data.data.table
  },

  async open(tableId: number, payload: OpenTablePayload): Promise<TableSession> {
    const { data } = await http.post<TableSessionEnvelope>(`/api/v1/tables/${tableId}/open`, payload)
    return data.data.session
  },

  async close(tableId: number): Promise<TableSession> {
    const { data } = await http.post<TableSessionEnvelope>(`/api/v1/tables/${tableId}/close`)
    return data.data.session
  },

  async createOrder(tableId: number, payload: CreateStaffOrderPayload): Promise<Order> {
    const { data } = await http.post<OrderEnvelope>(`/api/v1/tables/${tableId}/orders`, payload)
    return data.data.order
  },
}
