import type { OrderOrigin, OrderStatus } from './orders'

/** KitchenController / KitchenOrderResource, audited against restaurants-api. */
export const KITCHEN_STATUSES = ['confirmed', 'accepted', 'preparing', 'ready'] as const
export type KitchenStatus = (typeof KITCHEN_STATUSES)[number]
export type KitchenAction = 'accept' | 'preparing' | 'ready'
export const KITCHEN_ACTIONS: Partial<Record<KitchenStatus, KitchenAction>> = {
  confirmed: 'accept', accepted: 'preparing', preparing: 'ready',
}

export interface KitchenItem {
  id: number
  name: string
  quantity: number
  note: string | null
  modifiers: { group_name: string; name: string }[]
}

export interface KitchenOrder {
  id: number
  order_number: string
  status: KitchenStatus
  origin: OrderOrigin
  restaurant: { id: number; name: string }
  table: { id: number; name: string; number: number | null }
  order_note: string | null
  created_at: string
  elapsed_seconds: number
  items: KitchenItem[]
}

/** KitchenTicketResource — preview and print return this same document. */
export interface KitchenTicket {
  document_type: 'kitchen_ticket'
  restaurant: KitchenOrder['restaurant']
  table: KitchenOrder['table']
  order: { id: number; order_number: string; status: OrderStatus; origin: OrderOrigin; created_at: string }
  order_note: string | null
  items: KitchenItem[]
  generated_at: string
}
