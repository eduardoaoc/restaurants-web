/**
 * Shape confirmed against the live backend (restaurants-api,
 * App\Http\Resources\Api\V1\RestaurantDashboardResource) — GET
 * /api/v1/restaurants/{restaurant}/dashboard returns exactly this shape.
 * Money fields (`total`, `average_ticket`, `amount`) are decimal strings,
 * not numbers — format with src/utils/format.ts, never coerce/display raw.
 * `sessions_with_payments` is the real field name; do NOT rename it to
 * something like "paid_sessions" — that is not what it means (a session
 * can have partial payments and still count here).
 */
export interface RestaurantDashboard {
  restaurant: {
    id: number
    name: string
  }
  period: {
    from: string
    to: string
  }
  sales: {
    total: string
    average_ticket: string
    sessions_with_payments: number
  }
  orders: {
    created: number
    served: number
    cancelled: number
    customer_qr: number
    staff_created: number
  }
  tables: {
    sessions_opened: number
    sessions_closed: number
    current_active: number
  }
  payments: {
    total_records: number
    by_method: Record<string, { count: number; amount: string }>
  }
  requests: {
    call_waiter: number
    request_bill: number
    completed: number
  }
  staff: {
    top_by_orders_served: Array<{
      staff: { id: number; name: string }
      orders_served: number
    }>
  }
}
