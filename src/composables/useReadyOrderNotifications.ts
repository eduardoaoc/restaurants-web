import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getEcho } from '@/realtime/echo'
import { usePermissions } from '@/composables/usePermissions'
import { useAuthStore } from '@/stores/auth'
import type { OrderReadyAttentionEvent } from '@/types/kitchen'
import { playNotificationChime } from '@/utils/notification-sound'

const MAX_REMEMBERED_EVENT_IDS = 50

export interface ReadyOrderNotification {
  eventId: string
  orderId: number
  orderReference: string
  tableId: number
  tableName: string
  readyAt: string
}

/**
 * Lives at AppShell level (Carta 7.1B §15) — NEVER inside KitchenView. A
 * waiter who needs this is, by definition, not the kitchen user marking
 * the order ready; they can be anywhere in the app (Mesas, Servicio, ...)
 * when it happens, so the subscription and the visible alert must survive
 * navigating away from Kitchen entirely.
 *
 * Eligibility (§17 — "não criar subscription desnecessária"): gated on
 * `serve_orders` on the CURRENT restaurant, the same real permission the
 * nav rail already uses for Servicio — never a role-name check, and never
 * a bespoke "is this user a waiter" helper invented against nothing
 * (CLAUDE.md §9). The backend independently decides the single recipient
 * per order (the assigned waiter) when it broadcasts on `user.{id}` — this
 * gate only avoids opening a socket for an account with no realistic way
 * to ever receive anything on it (kitchen-only, cashier-only, ...).
 */
export function useReadyOrderNotifications() {
  const authStore = useAuthStore()
  const { can } = usePermissions()

  const notifications = ref<ReadyOrderNotification[]>([])
  const enabled = computed(() => can('serve_orders'))

  let joinedUserId: number | null = null
  const rememberedEventIds: string[] = []
  const rememberedSet = new Set<string>()

  /** Dedup by event_id (§21) — a Reverb reconnect replays the subscribe, never the event itself, but this also protects against any future at-least-once delivery change. Capped so a long shift never grows this unbounded. */
  function remember(eventId: string): boolean {
    if (rememberedSet.has(eventId)) return false
    rememberedSet.add(eventId)
    rememberedEventIds.push(eventId)
    if (rememberedEventIds.length > MAX_REMEMBERED_EVENT_IDS) {
      const oldest = rememberedEventIds.shift()
      if (oldest) rememberedSet.delete(oldest)
    }
    return true
  }

  function handleEvent(payload: OrderReadyAttentionEvent): void {
    if (!remember(payload.event_id)) return
    notifications.value.push({
      eventId: payload.event_id,
      orderId: payload.order.id,
      orderReference: payload.order.reference,
      tableId: payload.table.id,
      tableName: payload.table.name,
      readyAt: payload.ready_at,
    })
    playNotificationChime()
  }

  function dismiss(eventId: string): void {
    notifications.value = notifications.value.filter((notification) => notification.eventId !== eventId)
  }

  function leaveChannel(): void {
    if (joinedUserId === null) return
    getEcho()?.leave(`user.${joinedUserId}`)
    joinedUserId = null
  }

  function subscribeTo(userId: number): void {
    const echo = getEcho()
    if (!echo) return
    joinedUserId = userId
    echo.private(`user.${userId}`).listen('.order.ready.attention', (payload: OrderReadyAttentionEvent) => {
      handleEvent(payload)
    })
  }

  watch(
    () => [authStore.user?.id ?? null, enabled.value] as const,
    ([userId, isEnabled]) => {
      leaveChannel()
      if (userId !== null && isEnabled) subscribeTo(userId)
    },
    { immediate: true },
  )

  onBeforeUnmount(() => leaveChannel())

  return { notifications, dismiss }
}
