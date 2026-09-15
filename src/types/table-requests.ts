/**
 * Shapes confirmed against the live backend's OpenAPI contract (Passo 3.4,
 * restaurants-api, tag "Table Requests"):
 *   GET  /api/v1/table-requests
 *   GET  /api/v1/table-requests/{tableRequest}
 *   POST /api/v1/table-requests/{tableRequest}/acknowledge  (pending -> acknowledged)
 *   POST /api/v1/table-requests/{tableRequest}/cancel        (pending|acknowledged -> cancelled)
 *   POST /api/v1/table-requests/{tableRequest}/complete      (acknowledged -> completed)
 *
 * A TableRequest is the customer-initiated request created from the public
 * QR surface (POST /public/tables/{token}/requests/bill|call-waiter) — NOT
 * the same entity as a WaiterCall (tableSessionsService.callWaiter, the
 * staff-initiated "call the responsible waiter" action). Both surface as
 * OperationsAlert entries but with distinct `type`s
 * (customer_waiter_request_pending/bill_request_pending vs.
 * responsible_waiter_call_pending) — never conflated here.
 */
export interface TableRequestActor {
  id: number
  name: string
}

/** Open string union — the backend may introduce a new request `type` without a frontend release. */
export type TableRequestType = string
export type TableRequestStatus = 'pending' | 'acknowledged' | 'completed' | 'cancelled' | (string & {})

export interface TableRequest {
  id: number
  type: TableRequestType
  status: TableRequestStatus
  restaurant: { id: number; name: string }
  table: { id: number; name: string; number: number | null }
  note: string | null
  created_at: string
  acknowledged_at: string | null
  acknowledged_by: TableRequestActor | null
  completed_at: string | null
  completed_by: TableRequestActor | null
  cancelled_at: string | null
  cancelled_by: TableRequestActor | null
}

export interface TableRequestsQuery {
  restaurant_id?: number
  status?: TableRequestStatus
  type?: TableRequestType
}
