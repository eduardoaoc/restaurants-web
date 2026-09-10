import { http } from '@/api/http'
import type { OperationsLiveSnapshot } from '@/types/operations'

interface OperationsLiveEnvelope {
  data: OperationsLiveSnapshot
}

/**
 * Thin wrapper around the real restaurants-api contract:
 *   GET /api/v1/restaurants/{restaurant}/operations/live -> { data: {...} }
 * This is the canonical read model for the Operations tab — health,
 * bottleneck, table primary_status/flags, alerts are all backend-derived
 * here and never recomputed client-side.
 */
export const operationsService = {
  async live(restaurantId: number, signal?: AbortSignal): Promise<OperationsLiveSnapshot> {
    const { data } = await http.get<OperationsLiveEnvelope>(
      `/api/v1/restaurants/${restaurantId}/operations/live`,
      { signal },
    )
    return data.data
  },
}
