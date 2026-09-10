/**
 * Shapes confirmed against the live backend's OpenAPI contract:
 * GET /api/v1/orders (filters: restaurant_id, table_id, table_session_id,
 * status — `table_session_id` is the exact filter needed for "Ver pedidos"
 * on the current session, narrower than `table_id`), GET /api/v1/orders/{order},
 * POST /api/v1/tables/{table}/orders (staff-created order).
 *
 * Status lifecycle (inferred from the lifecycle-action 409 guards + Live
 * snapshot kitchen.counts_by_status — never re-implemented, only displayed):
 * waiting_approval -> confirmed -> accepted -> preparing -> ready -> served.
 * Customer (QR) orders start at waiting_approval and need an explicit
 * approve; staff/waiter-created orders start already confirmed.
 */
export type OrderOrigin = 'customer_qr' | 'waiter' | 'manager' | 'cashier'
export type OrderStatus =
  | 'waiting_approval'
  | 'confirmed'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'rejected'
  | 'cancelled'

export interface OrderModifier {
  name: string
  price_delta: string
}

export interface OrderItem {
  name: string
  quantity: number
  unit_price: string
  modifiers: OrderModifier[]
  line_total: string
}

export interface Order {
  id: number
  order_number: string
  origin: OrderOrigin
  status: OrderStatus
  restaurant: { id: number; name: string }
  table: { id: number; name: string }
  customer_name: string | null
  customer_note: string | null
  subtotal: string
  modifiers_total: string
  total: string
  items: OrderItem[]
  created_at: string
}

export interface OrdersQuery {
  restaurant_id?: number
  table_id?: number
  table_session_id?: number
  status?: OrderStatus
}

export interface CreateStaffOrderItemPayload {
  restaurant_product_id: number
  quantity: number
  modifier_option_ids?: number[]
  note?: string
}

export interface CreateStaffOrderPayload {
  items: CreateStaffOrderItemPayload[]
  customer_note?: string
}
