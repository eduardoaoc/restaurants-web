import {
  PhArmchair,
  PhBellRinging,
  PhBellSimple,
  PhCookingPot,
  PhHandPalm,
  PhReceipt,
  PhUsers,
} from '@phosphor-icons/vue'
import type { Component } from 'vue'

import type { TablePrimaryStatus } from '@/types/operations'
import type { StatusBadgeState } from '@/components/ui/AStatusBadge.vue'

export interface ServiceTableStatus {
  state: StatusBadgeState
  labelKey: string
  icon: Component
}

/** Display-only mapper for the existing operations API status vocabulary. */
const PRESENTATION: Record<TablePrimaryStatus, ServiceTableStatus> = {
  free: { state: 'normal', labelKey: 'operations.tableStatus.free', icon: PhArmchair },
  occupied: { state: 'normal', labelKey: 'operations.tableStatus.occupied', icon: PhUsers },
  waiting_approval: { state: 'attention', labelKey: 'operations.tableStatus.waiting_approval', icon: PhHandPalm },
  preparing: { state: 'normal', labelKey: 'operations.tableStatus.preparing', icon: PhCookingPot },
  ready: { state: 'attention', labelKey: 'operations.tableStatus.ready', icon: PhBellSimple },
  waiter_requested: { state: 'attention', labelKey: 'operations.tableStatus.waiter_requested', icon: PhBellRinging },
  bill_requested: { state: 'attention', labelKey: 'operations.tableStatus.bill_requested', icon: PhReceipt },
}

export function serviceTableStatus(status: TablePrimaryStatus): ServiceTableStatus {
  return PRESENTATION[status]
}
