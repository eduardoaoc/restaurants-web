import { http } from '@/api/http'
import type { DailyOperationState } from '@/types/daily-operation'

/**
 * restaurants-api operational day:
 *   GET  /api/v1/restaurants/{restaurant}/daily-operation
 *   POST /api/v1/restaurants/{restaurant}/daily-operations   (Idempotency-Key)
 * The close is the existing Cierre Diario (day-close.service).
 */
export const dailyOperationService = {
  async get(restaurantId: number, signal?: AbortSignal): Promise<DailyOperationState> {
    const { data } = await http.get<{ data: DailyOperationState }>(`/api/v1/restaurants/${restaurantId}/daily-operation`, { signal })
    return data.data
  },

  async open(restaurantId: number, openingFloat: string, idempotencyKey: string): Promise<DailyOperationState> {
    const { data } = await http.post<{ data: DailyOperationState }>(
      `/api/v1/restaurants/${restaurantId}/daily-operations`,
      { opening_float: openingFloat },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    )
    return data.data
  },
}
