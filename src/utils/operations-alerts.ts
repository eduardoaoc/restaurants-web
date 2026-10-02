/**
 * Shared label-key map for `OperationsAlert.type` / `OperationsBottleneck.type`
 * (src/types/operations.ts) — the bottleneck is always one of the same alert
 * types the backend's OperationsBottleneckResolver picks from, so this is the
 * single source of truth for both AttentionPanel and the Dashboard health
 * bottleneck line. An unknown future type falls back to the raw string
 * rather than being hidden.
 */
export const OPERATIONS_ALERT_TYPE_LABEL_KEYS: Record<string, string> = {
  active_table_unassigned: 'operations.alerts.types.active_table_unassigned',
  assigned_waiter_off_shift: 'operations.alerts.types.assigned_waiter_off_shift',
  assigned_waiter_suspended: 'operations.alerts.types.assigned_waiter_suspended',
  customer_waiter_request_pending: 'operations.alerts.types.customer_waiter_request_pending',
  bill_request_pending: 'operations.alerts.types.bill_request_pending',
  responsible_waiter_call_pending: 'operations.alerts.types.responsible_waiter_call_pending',
  order_waiting_approval: 'operations.alerts.types.order_waiting_approval',
  order_ready: 'operations.alerts.types.order_ready',
}

export function operationsAlertTypeLabelKey(type: string): string | null {
  return OPERATIONS_ALERT_TYPE_LABEL_KEYS[type] ?? null
}
