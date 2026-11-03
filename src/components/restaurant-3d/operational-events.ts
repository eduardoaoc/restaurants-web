import type {
  OperationalBadgeModel,
  OperationalEvent,
  OperationalEventType,
  OperationalPriority,
} from '@/types/restaurant-3d/operational-event'
import type { OperationalTargetType } from '@/types/restaurant-3d/restaurant-operations'
import { eventVisualState } from './visual-state'

export const PRIORITY_RANK: Record<OperationalPriority, number> = {
  info: 0,
  attention: 1,
  critical: 2,
}

export const targetKey = (targetType: OperationalTargetType, targetId: string) => `${targetType}:${targetId}`

/** Higher priority first; equal priority → most recent first. */
export function compareEvents(a: OperationalEvent, b: OperationalEvent): number {
  return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]
    || Date.parse(b.createdAt) - Date.parse(a.createdAt)
}

/** Every event per target, sorted most important first — the future "stack". */
export function groupEventsByTarget(events: OperationalEvent[]): Map<string, OperationalEvent[]> {
  const groups = new Map<string, OperationalEvent[]>()
  for (const event of events) {
    const key = targetKey(event.targetType, event.targetId)
    groups.set(key, [...(groups.get(key) ?? []), event])
  }
  for (const stack of groups.values()) stack.sort(compareEvents)
  return groups
}

/**
 * POC rule: one badge per target — its highest-priority event. Swap this for
 * the whole `groupEventsByTarget` stack to render several later.
 */
export function selectTopEventPerTarget(events: OperationalEvent[]): Map<string, OperationalEvent> {
  const top = new Map<string, OperationalEvent>()
  for (const [key, stack] of groupEventsByTarget(events)) top.set(key, stack[0]!)
  return top
}

const EVENT_LABELS: Record<Exclude<OperationalEventType, 'long_wait'>, string> = {
  new_order: 'Nuevo pedido',
  order_ready: 'Pedido listo',
  waiter_requested: 'Llamó camarero',
  bill_requested: 'Pidió cuenta',
}

/**
 * Lab-local Spanish copy. The product rule is i18n for all UI strings; this
 * stays out of the shared locale files while the lab is isolated.
 */
export function toBadge(event: OperationalEvent, now: number): OperationalBadgeModel {
  const label = event.type === 'long_wait'
    ? `Espera ${Math.max(1, Math.round((now - Date.parse(event.createdAt)) / 60_000))} min`
    : EVENT_LABELS[event.type]
  return { eventId: event.id, label, priority: event.priority, visualState: eventVisualState(event) }
}
