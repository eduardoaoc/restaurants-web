import {
  PhCheckCircle,
  PhClockCountdown,
  PhCookingPot,
  PhHandWaving,
  PhReceipt,
  PhUsers,
} from '@phosphor-icons/vue'

import type { TablePrimaryStatus } from '@/types/operations'

export interface TableStatusStyle {
  tone: string
  icon: typeof PhUsers
  labelKey: string
}

/**
 * Single source of truth for how a Table's backend-derived primary_status
 * maps to a Tailwind tone + icon — shared by the read-only Floor Map marker
 * and any compact table chip, so the two never drift. Status colors are
 * never the only signal: every consumer also renders the icon + a text
 * label (see docs/design-system.md §13, "never color alone").
 */
const STATUS_STYLE: Record<TablePrimaryStatus, TableStatusStyle> = {
  free: {
    tone: 'border border-outline-variant bg-surface-container-high text-on-surface-variant',
    icon: PhUsers,
    labelKey: 'operations.tableStatus.free',
  },
  occupied: {
    tone: 'bg-secondary-container text-on-secondary-container',
    icon: PhUsers,
    labelKey: 'operations.tableStatus.occupied',
  },
  waiting_approval: {
    tone: 'bg-warning-container text-on-warning-container',
    icon: PhClockCountdown,
    labelKey: 'operations.tableStatus.waiting_approval',
  },
  preparing: {
    tone: 'bg-warning-container text-on-warning-container',
    icon: PhCookingPot,
    labelKey: 'operations.tableStatus.preparing',
  },
  ready: {
    tone: 'bg-success-container text-on-success-container',
    icon: PhCheckCircle,
    labelKey: 'operations.tableStatus.ready',
  },
  waiter_requested: {
    tone: 'bg-critical-container text-on-critical-container',
    icon: PhHandWaving,
    labelKey: 'operations.tableStatus.waiter_requested',
  },
  bill_requested: {
    tone: 'bg-critical-container text-on-critical-container',
    icon: PhReceipt,
    labelKey: 'operations.tableStatus.bill_requested',
  },
}

export function getTableStatusStyle(status: TablePrimaryStatus): TableStatusStyle {
  return STATUS_STYLE[status] ?? STATUS_STYLE.free
}
