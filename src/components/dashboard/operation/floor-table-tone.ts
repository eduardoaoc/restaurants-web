import type { TablePrimaryStatus } from '@/types/operations'
import { serviceTableStatus } from '@/utils/service-table-status'

/**
 * Surface treatment for a table object on the Dashboard room map (SALOA §21.2):
 * free is an outline with no fill, the other normal states are a raised
 * surface, and only attention states take `primary-subtle` + `primary-text`.
 * Display-only — the state itself still comes from the shared mapper.
 */
export function floorTableTone(status: TablePrimaryStatus): string {
  if (status === 'free') return 'border-control bg-transparent text-fg-muted'
  if (serviceTableStatus(status).state === 'attention') return 'border-transparent bg-primary-subtle text-accent shadow-raised'
  return 'border-hairline bg-surface text-fg shadow-raised'
}

export function floorTableIconTone(status: TablePrimaryStatus): string {
  return serviceTableStatus(status).state === 'attention' ? 'text-accent' : 'text-fg-muted'
}
