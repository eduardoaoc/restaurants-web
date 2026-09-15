import { http } from '@/api/http'
import type {
  AssignWaiterPayload,
  BillReceipt,
  BillReceiptPrintResult,
  RecordPaymentPayload,
  SessionBill,
  TableSession,
  TransferSessionPayload,
  WaiterCall,
} from '@/types/table-sessions'

interface SessionEnvelope {
  data: { session: TableSession }
}
interface BillEnvelope {
  data: SessionBill
}
interface WaiterCallEnvelope {
  data: { waiter_call: WaiterCall }
}
interface ReceiptEnvelope {
  data: BillReceipt
}
interface ReceiptPrintEnvelope {
  data: BillReceiptPrintResult
}

/**
 * Thin wrapper around the real restaurants-api Table Sessions contract:
 *   GET  /api/v1/table-sessions/{tableSession}/bill
 *   POST /api/v1/table-sessions/{tableSession}/payments
 *   GET  /api/v1/table-sessions/{tableSession}/receipt
 *   POST /api/v1/table-sessions/{tableSession}/receipt/print
 *   POST /api/v1/table-sessions/{tableSession}/transfer
 *   PUT/DELETE /api/v1/table-sessions/{tableSession}/waiter
 *   POST /api/v1/table-sessions/{tableSession}/waiter-calls
 * Billing totals (`can_close`, `balance`, ...) are always backend-computed —
 * never re-derive them from raw orders/payments client-side.
 */
export const tableSessionsService = {
  async bill(sessionId: number): Promise<SessionBill> {
    const { data } = await http.get<BillEnvelope>(`/api/v1/table-sessions/${sessionId}/bill`)
    return data.data
  },

  /**
   * Verified live (Passo 3.4): 201 on first record, 200 with the same
   * PaymentRecord shape on an idempotent replay. The caller always refetches
   * `bill()` right after (never trusts a locally-derived balance/can_close),
   * so this intentionally returns void rather than the record.
   */
  async recordPayment(sessionId: number, payload: RecordPaymentPayload): Promise<void> {
    await http.post(`/api/v1/table-sessions/${sessionId}/payments`, payload)
  },

  async receipt(sessionId: number): Promise<BillReceipt> {
    const { data } = await http.get<ReceiptEnvelope>(`/api/v1/table-sessions/${sessionId}/receipt`)
    return data.data
  },

  /** Registers a PrintRecord (repeatable for reprints) — 409 when bill_receipt_printing_enabled is off for the restaurant. */
  async receiptPrint(sessionId: number): Promise<BillReceiptPrintResult> {
    const { data } = await http.post<ReceiptPrintEnvelope>(`/api/v1/table-sessions/${sessionId}/receipt/print`)
    return data.data
  },

  async transfer(sessionId: number, payload: TransferSessionPayload): Promise<TableSession> {
    const { data } = await http.post<SessionEnvelope>(`/api/v1/table-sessions/${sessionId}/transfer`, payload)
    return data.data.session
  },

  async assignWaiter(sessionId: number, payload: AssignWaiterPayload): Promise<TableSession> {
    const { data } = await http.put<SessionEnvelope>(`/api/v1/table-sessions/${sessionId}/waiter`, payload)
    return data.data.session
  },

  async unassignWaiter(sessionId: number): Promise<void> {
    await http.delete(`/api/v1/table-sessions/${sessionId}/waiter`)
  },

  async callWaiter(sessionId: number): Promise<WaiterCall> {
    const { data } = await http.post<WaiterCallEnvelope>(`/api/v1/table-sessions/${sessionId}/waiter-calls`)
    return data.data.waiter_call
  },
}
