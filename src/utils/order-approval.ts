import type { Order } from '@/types/orders'

/** Mirrors the API's actionable customer order guard; authorization remains server-side. */
export function isPendingCustomerOrder(order: Order, restaurantId: number | null): boolean {
  return restaurantId !== null && order.restaurant.id === restaurantId
    && order.origin === 'customer_qr' && order.status === 'waiting_approval'
}
