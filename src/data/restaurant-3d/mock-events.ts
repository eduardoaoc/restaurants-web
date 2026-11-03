import type { OperationalEvent } from '@/types/restaurant-3d/operational-event'

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

/**
 * Mock events. Tables 3, 5 and 6 each carry two events on purpose, to
 * exercise "highest priority wins; ties go to the newest". Table 2 (eating)
 * has none, so its green ring comes from its status alone.
 */
export const mockEvents: OperationalEvent[] = [
  { id: 'evt-1', type: 'new_order', targetType: 'table', targetId: 'table-3', priority: 'attention', createdAt: minutesAgo(2) },
  // Table 5: info (older) loses to attention.
  { id: 'evt-2', type: 'new_order', targetType: 'table', targetId: 'table-5', priority: 'info', createdAt: minutesAgo(9) },
  { id: 'evt-3', type: 'order_ready', targetType: 'table', targetId: 'table-5', priority: 'attention', createdAt: minutesAgo(1) },
  // Table 6: same priority — the newest (bill) wins over the long wait.
  { id: 'evt-4', type: 'bill_requested', targetType: 'table', targetId: 'table-6', priority: 'attention', createdAt: minutesAgo(3) },
  { id: 'evt-5', type: 'long_wait', targetType: 'table', targetId: 'table-6', priority: 'attention', createdAt: minutesAgo(25) },
  // One specific guest at table 7.
  { id: 'evt-6', type: 'waiter_requested', targetType: 'guest', targetId: 'guest-table-7-2', priority: 'critical', createdAt: minutesAgo(1) },
  // Occupied table 3 has also been waiting a while; the newer new_order wins the badge.
  { id: 'evt-7', type: 'long_wait', targetType: 'table', targetId: 'table-3', priority: 'attention', createdAt: minutesAgo(18) },
]
