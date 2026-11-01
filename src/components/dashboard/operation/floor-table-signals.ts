import type { Component } from 'vue'
import { PhBellRinging, PhBellSimple, PhHandPalm, PhPhoneCall, PhReceipt } from '@phosphor-icons/vue'

import type { OperationsTable, TablePrimaryStatus } from '@/types/operations'

/**
 * Backend `flags` that represent an extra service signal on a table (a
 * ready order, a bill or waiter request, a pending approval, a call to the
 * responsible waiter). The primary status already shows one of them; the
 * rest are surfaced as small markers so a table that is "ready" AND has an
 * order waiting for approval never hides the second fact. Unknown flags are
 * ignored here (they stay visible in the table detail), never re-labelled.
 */
const SIGNALS: Record<string, { icon: Component; labelKey: string; primary?: TablePrimaryStatus }> = {
  ready_order: { icon: PhBellSimple, labelKey: 'operations.tableStatus.ready', primary: 'ready' },
  waiting_approval: { icon: PhHandPalm, labelKey: 'operations.tableStatus.waiting_approval', primary: 'waiting_approval' },
  bill_requested: { icon: PhReceipt, labelKey: 'operations.tableStatus.bill_requested', primary: 'bill_requested' },
  waiter_requested: { icon: PhBellRinging, labelKey: 'operations.tableStatus.waiter_requested', primary: 'waiter_requested' },
  responsible_waiter_called: { icon: PhPhoneCall, labelKey: 'operations.alerts.types.responsible_waiter_call_pending' },
}

export interface FloorTableSignal {
  flag: string
  icon: Component
  labelKey: string
}

export function extraTableSignals(table: OperationsTable): FloorTableSignal[] {
  return table.flags.flatMap((flag) => {
    const signal = SIGNALS[flag]
    if (!signal || signal.primary === table.primary_status) return []
    return [{ flag, icon: signal.icon, labelKey: signal.labelKey }]
  })
}
