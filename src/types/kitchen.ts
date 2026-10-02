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

/**
 * GET /api/v1/kitchen/dashboard — verified live against the running backend
 * (Carta 7.1B): logged in as kitchen1@aforo.test and waiter1@aforo.test
 * (both authorized — see KitchenController's Policy, which accepts either
 * update_kitchen_status or serve_orders), inspected the real JSON. Every
 * field below is transcribed from that live response, nothing guessed.
 */
export interface KitchenDashboardRef { id: number; name: string }
export interface KitchenDashboardOrderRef { id: number; reference: string }
export interface KitchenDashboardActor { id: number; name: string }

export interface KitchenQueueSummary {
  counts_by_status: Record<KitchenStatus, number>
  active_orders: number
  oldest_active_order_age_seconds: number
  longest_ready_wait_seconds: number
}

/** `average_seconds` is `null` when `orders` is 0 — never render that as "0 min" (Carta 7.1B §8). */
export interface KitchenTimingMetric {
  average_seconds: number | null
  orders: number
}

export interface KitchenTimings {
  accept: KitchenTimingMetric
  preparation: KitchenTimingMetric
  ready_to_served: KitchenTimingMetric
}

export interface KitchenTopProduct {
  product_id: number
  name: string
  quantity: number
}

export interface KitchenDashboardOrderItemSummary {
  name: string
  quantity: number
}

export interface KitchenRecentAcceptedOrder {
  order: KitchenDashboardOrderRef
  table: KitchenDashboardRef
  status: OrderStatus
  accepted_at: string
  accepted_by: KitchenDashboardActor | null
  items: KitchenDashboardOrderItemSummary[]
}

/** `served_at` is `null` while the order is still sitting in `ready` — render as "waiting for pickup", never as an empty/blank cell (Carta 7.1B §11). */
export interface KitchenRecentReadyOrder {
  order: KitchenDashboardOrderRef
  table: KitchenDashboardRef
  status: OrderStatus
  ready_at: string
  ready_by: KitchenDashboardActor | null
  items: KitchenDashboardOrderItemSummary[]
  served_at: string | null
}

export interface KitchenDashboard {
  restaurant: { id: number; name: string; timezone: string }
  generated_at: string
  period: { from: string; to: string }
  queue: KitchenQueueSummary
  timings: KitchenTimings
  top_products: KitchenTopProduct[]
  recent_accepted: KitchenRecentAcceptedOrder[]
  recent_ready: KitchenRecentReadyOrder[]
}

/**
 * The personal `order.ready.attention` realtime event (Carta 7.1B) —
 * broadcast ONLY on the recipient's own private `user.{id}` channel (never
 * `restaurant.{id}`), verified live via a real browser WebSocket connection
 * (Reverb rejects non-browser Origins on the raw socket, so this could not
 * be confirmed via curl/Node alone). Deliberately a separate catalog from
 * `src/types/realtime.ts`'s `RealtimeEventName`: that type/channel pair is
 * restaurant-wide and permission-gated by `view_operations`-adjacent
 * capabilities; this one is personal and the backend decides the single
 * recipient (the assigned waiter) — the frontend never re-derives who
 * should receive it.
 */
export interface OrderReadyAttentionEvent {
  event_id: string
  schema_version: number
  occurred_at: string
  restaurant_id: number
  order: KitchenDashboardOrderRef
  table: KitchenDashboardRef
  table_session_id: number
  ready_at: string
}
