import { ref, watch } from 'vue'
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'

import { useRestaurantStore } from '@/stores/restaurant'

/**
 * Carta 8.1B — the shared `?restaurant=&table=` deep-link consumption used
 * by every operational screen a staff member's QR scan (useStaffTableEntry)
 * or a bookmarked URL can land on (today: DashboardView for
 * `view_operations`, ServiceView for a waiter/cashier's own Servicio
 * subset). This composable owns only the generic plumbing — validate the
 * ids, gate on the caller's own real capability, switch restaurant when
 * asked to, and clear the query once consumed (valid or not, so it never
 * dangles) — never which permission is required (that's `canEnter`,
 * supplied by the caller) and never how a specific table list is searched
 * or a drawer opened (that stays in each view, since OperationsLiveSnapshot
 * and the cashier's fallback table list don't share a shape).
 *
 * Race safety (§12): a `route.query` passed here is reactive — some caller
 * component re-renders on a query change without unmounting (e.g. a second
 * QR scan replacing `?table=` while the first deep-link's restaurant switch
 * is still resolving). `consume()` is re-entrant-safe via a monotonically
 * increasing sequence number: if a newer call starts while an older one is
 * still awaiting `restaurantStore.load()`/`selectRestaurant()`, the older
 * one notices it's been superseded and drops out before ever setting
 * `pendingTableId` — the last deep-link always wins, and no stale table id
 * from an abandoned one can leak into the view.
 */
export function useOperationalTableDeepLink(
  route: RouteLocationNormalizedLoaded,
  router: Router,
  canEnter: () => boolean,
) {
  const restaurantStore = useRestaurantStore()
  const pendingTableId = ref<number | null>(null)
  const pendingSessionId = ref<number | null>(null)
  let sequence = 0

  function clearDeepLinkQuery(): void {
    if (route.query.table === undefined && route.query.restaurant === undefined && route.query.session === undefined) return
    const { table: _table, restaurant: _restaurant, session: _session, ...rest } = route.query
    void router.replace({ query: rest })
  }

  async function consume(): Promise<void> {
    const tableParam = route.query.table
    if (typeof tableParam !== 'string') return

    const mySequence = ++sequence
    const tableId = Number(tableParam)
    if (!Number.isInteger(tableId)) {
      clearDeepLinkQuery()
      return
    }

    if (!canEnter()) {
      // Resolved fine, but this account can't use this screen's table
      // source at all — never surface an error over a deep-link, just drop
      // it quietly.
      clearDeepLinkQuery()
      return
    }

    const restaurantParam = route.query.restaurant
    const targetRestaurantId = typeof restaurantParam === 'string' ? Number(restaurantParam) : null
    if (targetRestaurantId !== null && Number.isInteger(targetRestaurantId)) {
      await restaurantStore.load()
      if (mySequence !== sequence) return // superseded by a newer deep-link while awaiting
      if (targetRestaurantId !== restaurantStore.currentRestaurantId) {
        // No-ops safely if this account isn't actually eligible for that
        // restaurant — selectedTableId simply won't match anything in
        // whatever snapshot ends up loading, handled by the caller.
        await restaurantStore.selectRestaurant(targetRestaurantId)
        if (mySequence !== sequence) return
      }
    }

    const sessionId = Number(route.query.session)
    pendingSessionId.value = Number.isSafeInteger(sessionId) && sessionId > 0 ? sessionId : null
    pendingTableId.value = tableId
  }

  function onPendingTableConsumed(): void {
    pendingTableId.value = null
    pendingSessionId.value = null
    clearDeepLinkQuery()
  }

  // Watches (never a one-shot onMounted): a staff member's QR scan always
  // mounts the target view fresh (coming from PublicTableView), but a
  // second deep-link while already on this screen — e.g. scanning another
  // table's QR without leaving the tab — only changes `route.query`, it
  // doesn't remount. `immediate` covers the normal fresh-mount case too.
  watch(() => [route.query.table, route.query.restaurant, route.query.session] as const, () => void consume(), { immediate: true })

  return { pendingTableId, pendingSessionId, onPendingTableConsumed }
}
