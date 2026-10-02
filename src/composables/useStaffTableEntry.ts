import { onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'

import { usePermissions } from '@/composables/usePermissions'
import { tablesService } from '@/services/tables.service'
import { useAuthStore } from '@/stores/auth'
import { SERVICE_ACCESS_PERMISSIONS } from '@/types/auth-context'

/**
 * Carta 8.1B §11-§21, revised — detects a STAFF member scanning a table's
 * own public QR and, only then, routes them into the real operational
 * table context instead of the public customer flow. The QR itself carries
 * no auth signal at all (§12 "o QR NÃO autentica o funcionário"): this
 * fires `GET /tables/resolve/{publicToken}` through the AUTHENTICATED
 * `http` client (never `publicHttp` — see its own docblock on why it never
 * carries the Sanctum cookie) and trusts ONLY that response's outcome.
 *
 *   200 -> a real session with real operational access to this table.
 *          Which admin screen that session actually lands on is decided
 *          below by REAL capability (never `role === 'waiter'`/`'cashier'`
 *          — CLAUDE.md §9), mirroring the router guard's own
 *          app-dashboard/app-service split exactly (SERVICE_ACCESS_PERMISSIONS
 *          is the one shared definition both read).
 *   401 -> no session at all. By far the common case (an anonymous diner's
 *          phone has no AFORO cookie) — silently stay on the public flow,
 *          no error, no visible difference whatsoever.
 *   403/404 -> a real session without sufficient access to THIS table
 *          (Carta 8.1B §12/§20/§21: kitchen, a foreign restaurant's staff,
 *          an invalid token). Never reveal which — identical silent
 *          fallback to the public flow as a 401.
 *   network failure -> fails open to public too (§14: never blocks or
 *          delays the customer over this).
 *
 * Fired in PARALLEL with the public flow's own resolution (never awaited
 * before rendering the public welcome) — §14 forbids adding latency or a
 * flash for the anonymous customer, who is the overwhelming majority of
 * scans. There is no cheap, production-safe client-side signal to decide
 * whether to even attempt this (§13): the admin API and the public SPA are
 * expected to live on different registrable domains in production, so a
 * cookie set by the API is not readable from the SPA's own `document.cookie`
 * — checking for one would read as "logged out" even for a genuinely
 * logged-in waiter. Sending one extra, non-blocking, fire-and-forget
 * request alongside the public resolution is the documented alternative
 * (no added latency, since nothing waits on it).
 */
export function useStaffTableEntry(publicToken: string): void {
  const router = useRouter()
  const authStore = useAuthStore()
  const { canOnRestaurant, canAnyOnRestaurant } = usePermissions()
  const controller = new AbortController()

  async function attempt(): Promise<void> {
    let resolved
    try {
      resolved = await tablesService.resolvePublicToken(publicToken, controller.signal)
    } catch {
      return
    }
    if (controller.signal.aborted) return

    // A 200 above already proves a real, authenticated staff session — this
    // route is `meta.public`, so the router guard never called
    // auth.bootstrap() itself (no reason to for an anonymous diner).
    // bootstrap() is memoized the same way the admin guard's own call is,
    // so a staff member's very first navigation in this tab (a direct QR
    // scan, never having opened /app) still resolves the real permission
    // context exactly once, with no duplicate GET /me for anyone already
    // bootstrapped.
    await authStore.bootstrap()
    if (controller.signal.aborted) return

    const restaurantId = resolved.restaurant.id
    const tableId = resolved.table.id

    // Capability-based destination, never a role check (CLAUDE.md §9): an
    // owner/manager (view_operations) keeps going to the Dashboard exactly
    // as before; a waiter/cashier holding only their own Servicio subset
    // goes to app-service instead — the SAME SERVICE_ACCESS_PERMISSIONS
    // list the router guard enforces, so a staff member can never land
    // somewhere the guard would immediately bounce them out of again.
    const destination = canOnRestaurant(restaurantId, 'view_operations')
      ? 'app-dashboard'
      : canAnyOnRestaurant(restaurantId, SERVICE_ACCESS_PERMISSIONS)
        ? 'app-service'
        : null

    // No operational capability on THIS restaurant at all (shouldn't
    // happen given the 200 above, but never assumed) — stay on the public
    // flow rather than navigate somewhere the guard would just reject.
    if (!destination) return

    void router.replace({
      name: destination,
      query: { table: String(tableId), restaurant: String(restaurantId) },
    })
  }

  void attempt()
  onBeforeUnmount(() => controller.abort())
}
