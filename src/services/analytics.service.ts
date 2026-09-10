import { http } from '@/api/http'
import type { AnalyticsQuery, RestaurantAnalytics } from '@/types/analytics'

interface AnalyticsEnvelope {
  data: RestaurantAnalytics
}

/**
 * Thin wrapper around the real restaurants-api contract:
 *   GET /api/v1/restaurants/{restaurant}/analytics?from=&to=&granularity= -> { data: {...} }
 * `from`/`to`/`granularity` are all optional — omitted params let the
 * backend apply its own default (current calendar month, day granularity).
 * Never reproduce that default-range logic client-side.
 */
export const analyticsService = {
  async get(restaurantId: number, query: AnalyticsQuery = {}, signal?: AbortSignal): Promise<RestaurantAnalytics> {
    const { data } = await http.get<AnalyticsEnvelope>(`/api/v1/restaurants/${restaurantId}/analytics`, {
      params: query,
      signal,
    })
    return data.data
  },
}
