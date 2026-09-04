import { http } from '@/api/http'
import type { RestaurantDashboard } from '@/types/dashboard'

interface DashboardEnvelope {
  data: {
    dashboard: RestaurantDashboard
  }
}

/**
 * Thin wrapper around the real restaurants-api contract (verified against
 * the running backend, see FRONT BLOCO 2 report):
 *   GET /api/v1/restaurants/{restaurant}/dashboard?from=&to= -> { data: { dashboard } }
 * `from`/`to` are optional (YYYY-MM-DD) — omitted here since this block
 * only needs the backend's default period (current calendar month).
 */
export const dashboardService = {
  async get(restaurantId: number): Promise<RestaurantDashboard> {
    const { data } = await http.get<DashboardEnvelope>(
      `/api/v1/restaurants/${restaurantId}/dashboard`,
    )
    return data.data.dashboard
  },
}
