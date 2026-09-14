import { publicHttp } from '@/api/public-http'
import type { PublicMenu, PublicOrderCreateRequest, PublicOrderCreated, PublicTableResolution } from '@/types/public-menu'

/**
 * Thin wrapper around the real, unauthenticated restaurants-api public
 * contract (verified against the LIVE backend by calling each endpoint
 * directly, Passo 3.1):
 *   GET  /api/v1/public/tables/{publicToken}                -> { data: PublicTableResolution }
 *   GET  /api/v1/public/tables/{publicToken}/menu            -> { data: PublicMenu }
 *   POST /api/v1/public/tables/{publicToken}/orders           -> { data: PublicOrderCreated } (201, or 200 on an idempotent replay)
 *
 * The OpenAPI spec's documented response schema for these three omits the
 * `data` envelope (unlike every admin endpoint, which documents it
 * explicitly) — confirmed a real doc gap by curling the live endpoints
 * directly, not assumed. The envelope IS real at runtime, so it's unwrapped
 * here exactly like every other service in this app already does.
 *
 * Deliberately NOT reusing restaurants.service.ts / the admin `http` client
 * — the contract, auth model, and error shape are all different from the
 * admin Restaurant/Settings endpoints (CLAUDE.md Passo 3.1 §5).
 */
export const publicTableService = {
  async resolveTable(publicToken: string, signal?: AbortSignal): Promise<PublicTableResolution> {
    const { data } = await publicHttp.get<{ data: PublicTableResolution }>(`/api/v1/public/tables/${publicToken}`, {
      signal,
    })
    return data.data
  },

  /**
   * `locale` is sent as a query param only when the caller has resolved a
   * real choice — omitting it lets the backend fall back to the
   * restaurant's own `default_locale` (never guessed client-side).
   */
  async getMenu(publicToken: string, locale?: string, signal?: AbortSignal): Promise<PublicMenu> {
    const { data } = await publicHttp.get<{ data: PublicMenu }>(`/api/v1/public/tables/${publicToken}/menu`, {
      params: locale ? { locale } : undefined,
      signal,
    })
    return data.data
  },

  /**
   * `idempotencyKey` is sent as the `Idempotency-Key` header (per the real
   * contract) — generated once per checkout attempt by the caller, so a
   * network retry of the SAME attempt replays the original order (200)
   * instead of risking a duplicate (CLAUDE.md §18 "não enviar pedido
   * acidentalmente").
   */
  async createOrder(
    publicToken: string,
    payload: PublicOrderCreateRequest,
    idempotencyKey: string,
  ): Promise<PublicOrderCreated> {
    const { data } = await publicHttp.post<{ data: PublicOrderCreated }>(
      `/api/v1/public/tables/${publicToken}/orders`,
      payload,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    )
    return data.data
  },
}
