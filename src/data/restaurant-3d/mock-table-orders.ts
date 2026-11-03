import type { Order, OrderStatus } from '@/types/orders'

/**
 * Minimal mock orders so the REAL order list inside the reused table drawer
 * has something to render. Keyed by lab table number.
 */
const item = (name: string, quantity: number, unit: number) => ({
  name,
  description: null,
  quantity,
  unit_price: unit.toFixed(2),
  note: null,
  modifiers: [],
  line_total: (quantity * unit).toFixed(2),
})

function order(tableNumber: number, status: OrderStatus, items: ReturnType<typeof item>[]): Order {
  const total = items.reduce((sum, i) => sum + Number(i.line_total), 0).toFixed(2)
  const now = new Date().toISOString()
  return {
    id: -(2000 + tableNumber),
    order_number: `LAB-${tableNumber}`,
    origin: 'waiter',
    status,
    restaurant: { id: 0, name: 'Lab' },
    table: { id: -tableNumber, name: `Mesa ${String(tableNumber).padStart(2, '0')}` },
    customer_name: null,
    customer_note: null,
    subtotal: total,
    modifiers_total: '0.00',
    total,
    items,
    created_at: now,
    updated_at: now,
  }
}

export const mockOrdersByTableNumber: Record<number, Order[]> = {
  2: [order(2, 'served', [item('Paella valenciana', 2, 14.5), item('Agua mineral', 2, 2)])],
  3: [order(3, 'waiting_approval', [item('Ensalada de temporada', 2, 9), item('Croquetas', 1, 8.5)])],
  5: [order(5, 'ready', [item('Arroz al horno', 4, 13), item('Sangría', 1, 14)])],
  6: [order(6, 'served', [item('Menú del día', 6, 16.5)])],
  7: [order(7, 'preparing', [item('Fideuà', 3, 15)])],
}
