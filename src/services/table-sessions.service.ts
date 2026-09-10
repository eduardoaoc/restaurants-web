import { http } from '@/api/http'
import type {
  AssignWaiterPayload,
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

/**
 * Thin wrapper around the real restaurants-api Table Sessions contract:
 *   GET  /api/v1/table-sessions/{tableSession}/bill
 *   POST /api/v1/table-sessions/{tableSession}/payments
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

  async recordPayment(sessionId: number, payload: RecordPaymentPayload): Promise<void> {
    await http.post(`/api/v1/table-sessions/${sessionId}/payments`, payload)
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
