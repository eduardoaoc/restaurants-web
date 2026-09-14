import { http } from '@/api/http'
import type { KitchenAction, KitchenOrder, KitchenTicket } from '@/types/kitchen'

export const kitchenService = {
  async list(restaurantId: number, signal?: AbortSignal): Promise<KitchenOrder[]> {
    const { data } = await http.get<{ data: { orders: KitchenOrder[] } }>('/api/v1/kitchen/orders', {
      params: { restaurant_id: restaurantId }, signal,
    })
    return data.data.orders
  },
  async transition(orderId: number, action: KitchenAction): Promise<void> {
    // Response projection varies with permissions (Order | KitchenOrder).
    // Always refetch the authoritative kitchen projection after a mutation.
    await http.post(`/api/v1/orders/${orderId}/${action}`)
  },
  async ticket(orderId: number, signal?: AbortSignal): Promise<KitchenTicket> {
    const { data } = await http.get<{ data: KitchenTicket }>(`/api/v1/orders/${orderId}/kitchen-ticket`, { signal })
    return data.data
  },
  async print(orderId: number): Promise<KitchenTicket> {
    const { data } = await http.post<{ data: { document: KitchenTicket; print_record_id: number } }>(
      `/api/v1/orders/${orderId}/kitchen-ticket/print`,
    )
    return data.data.document
  },
}
