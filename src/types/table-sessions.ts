/**
 * Shapes confirmed against the live backend's OpenAPI contract for
 * table-session actions: open/close (POST /api/v1/tables/{table}/open|close),
 * transfer (POST .../transfer), waiter assign/unassign (PUT/DELETE
 * .../waiter), waiter calls (POST .../waiter-calls), billing (GET .../bill,
 * POST .../payments, GET/.print .../receipt).
 */
export interface TableSessionAssignedWaiter {
  id: number
  name: string
}

/**
 * Shared resource shape returned by open/close/transfer/assign/unassign.
 */
export interface TableSession {
  id: number
  table_id: number
  restaurant_id: number
  guest_count: number
  status: string
  payment_status: string
  opened_at: string
  closed_at: string | null
  paid_at: string | null
  opened_by_user_id: number | null
  closed_by_user_id: number | null
  assigned_waiter: TableSessionAssignedWaiter | null
  created_at: string
  updated_at: string
}

export interface OpenTablePayload {
  guest_count: number
}

export interface TransferSessionPayload {
  target_table_id: number
}

export interface AssignWaiterPayload {
  user_id: number
}

export interface BillPayment {
  id: number
  method: 'cash' | 'card' | 'other'
  amount: string
  currency: string
  reference: string | null
  note: string | null
  recorded_at: string
  recorded_by: { id: number; name: string } | null
}

export interface BillOrderSummary {
  id: number
  status: string
  total: string
  created_at: string
}

export type BillPaymentStatus = 'unpaid' | 'partial' | 'paid'

export interface SessionBill {
  table_session_id: number
  status: string
  payment_status: BillPaymentStatus
  table: { id: number; name: string }
  orders_total: string
  paid_total: string
  balance: string
  /** Backend-computed — never derive "can this session close" client-side. */
  can_close: boolean
  orders: BillOrderSummary[]
  payments: BillPayment[]
}

export interface RecordPaymentPayload {
  method: 'cash' | 'card' | 'other'
  amount: string
  reference?: string
  note?: string
}

export interface WaiterCall {
  id: number
  table_session_id: number
  restaurant_id: number
  status: string
  waiter: { id: number; name: string } | null
  called_by: { id: number; name: string } | null
  created_at: string
  acknowledged_at: string | null
  acknowledged_by: { id: number; name: string } | null
}
