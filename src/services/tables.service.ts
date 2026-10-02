import { http } from '@/api/http'
import type { CreateTablePayload, FloorPlanTable, TableResolveResult, UpdateTablePayload } from '@/types/floor-plan'
import type { OpenTablePayload, TableSession } from '@/types/table-sessions'
import type { CreateStaffOrderPayload, Order } from '@/types/orders'

interface TableEnvelope {
  data: { table: FloorPlanTable }
}
interface TableListEnvelope {
  data: { tables: FloorPlanTable[] }
}
interface TableSessionEnvelope {
  data: { session: TableSession }
}
interface OrderEnvelope {
  data: { order: Order }
}
interface TableResolveEnvelope {
  data: TableResolveResult
}

/**
 * Thin wrapper around the real restaurants-api Tables contract:
 *   GET   /api/v1/restaurants/{restaurant}/tables       (list)
 *   POST  /api/v1/restaurants/{restaurant}/tables       (create)
 *   GET   /api/v1/tables/{table}                        (single table, incl. public_token — manage_tables only, verified live)
 *   PATCH /api/v1/tables/{table}
 *   POST  /api/v1/tables/{table}/open|close
 *   POST  /api/v1/tables/{table}/orders                (staff-created order)
 *   GET   /api/v1/tables/resolve/{publicToken}          (Carta 8.1B — authenticated staff QR resolution, see TableResolveResult)
 * There is no DELETE for a table anywhere in this API — never add one here.
 */
export const tablesService = {
  /**
   * Verified live (Passo 3.4 §9 navigation audit): unlike GET
   * /operations/live (view_operations only), this flat list is reachable by
   * a cashier-only account (record_payments/close_bill/handle_table_requests,
   * no view_operations at all) — confirmed by calling it with a real
   * cashier session. ServiceView uses this as its fallback table source for
   * exactly that account shape, since the alternative is no coherent way
   * for a cashier to find a table to charge/close at all.
   */
  async list(restaurantId: number, signal?: AbortSignal): Promise<FloorPlanTable[]> {
    const { data } = await http.get<TableListEnvelope>(`/api/v1/restaurants/${restaurantId}/tables`, { signal })
    return data.data.tables
  },

  /** `manage_tables` only (verified live: 403 for an account without it) — the only place `public_token` is ever returned. */
  async get(tableId: number, signal?: AbortSignal): Promise<FloorPlanTable> {
    const { data } = await http.get<TableEnvelope>(`/api/v1/tables/${tableId}`, { signal })
    return data.data.table
  },

  /**
   * Carta 8.1B §15/§16 — resolves a public QR token through the
   * AUTHENTICATED session (unlike publicTableService, which deliberately
   * never carries the Sanctum cookie). Callers must treat any failure
   * (401/403/404/network) identically: silently continue the public flow,
   * never surface a technical error to whoever scanned the code.
   */
  async resolvePublicToken(publicToken: string, signal?: AbortSignal): Promise<TableResolveResult> {
    const { data } = await http.get<TableResolveEnvelope>(`/api/v1/tables/resolve/${publicToken}`, { signal })
    return data.data
  },

  async create(restaurantId: number, payload: CreateTablePayload): Promise<FloorPlanTable> {
    const { data } = await http.post<TableEnvelope>(`/api/v1/restaurants/${restaurantId}/tables`, payload)
    return data.data.table
  },

  async update(tableId: number, payload: UpdateTablePayload): Promise<FloorPlanTable> {
    const { data } = await http.patch<TableEnvelope>(`/api/v1/tables/${tableId}`, payload)
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
