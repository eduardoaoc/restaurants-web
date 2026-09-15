import { http } from '@/api/http'
import type { Order, OrdersQuery } from '@/types/orders'

interface OrdersListEnvelope {
  data: { orders: Order[] }
}
interface OrderEnvelope {
  data: { order: Order }
}

/**
 * Thin wrapper around the real restaurants-api Orders contract:
 *   GET  /api/v1/orders?table_session_id=&table_id=&restaurant_id=&status=
 *   GET  /api/v1/orders/{order}
 *   POST /api/v1/orders/{order}/approve   (waiting_approval -> confirmed, no body)
 *   POST /api/v1/orders/{order}/reject    (waiting_approval -> rejected, no body)
 *   POST /api/v1/orders/{order}/served
 * `table_session_id` is the exact filter for "Ver pedidos" — the current
 * session only, never the table's full history when a session is what's
 * being viewed. `approve`/`reject` deliberately send no request body — the
 * real OpenAPI contract for both defines none (Passo 3.2 §11 — never
 * invent a `reason` field the backend doesn't ask for).
 */
export const ordersService = {
  async list(query: OrdersQuery, signal?: AbortSignal): Promise<Order[]> {
    const { data } = await http.get<OrdersListEnvelope>('/api/v1/orders', { params: query, signal })
    return data.data.orders
  },

  async get(orderId: number, signal?: AbortSignal): Promise<Order> {
    const { data } = await http.get<OrderEnvelope>(`/api/v1/orders/${orderId}`, { signal })
    return data.data.order
  },

  async approve(orderId: number): Promise<Order> {
    const { data } = await http.post<OrderEnvelope>(`/api/v1/orders/${orderId}/approve`)
    return data.data.order
  },

  async reject(orderId: number): Promise<Order> {
    const { data } = await http.post<OrderEnvelope>(`/api/v1/orders/${orderId}/reject`)
    return data.data.order
  },

  async markServed(orderId: number): Promise<Order> {
    const { data } = await http.post<OrderEnvelope>(`/api/v1/orders/${orderId}/served`)
    return data.data.order
  },
}
