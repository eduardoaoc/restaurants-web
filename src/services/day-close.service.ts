import { http } from '@/api/http'
import type {
  CreateDayClosePayload,
  DayClose,
  DayCloseAnnotation,
  DayClosePreview,
  DayCloseSummary,
  DayClosesQuery,
} from '@/types/day-close'

interface DayClosePreviewEnvelope {
  data: DayClosePreview
}
interface DayCloseEnvelope {
  data: DayClose
}
interface DayCloseListEnvelope {
  data: { day_closes: DayCloseSummary[] }
  meta: { next_cursor: string | null; prev_cursor: string | null }
}
interface DayCloseAnnotationEnvelope {
  data: DayCloseAnnotation
}

/**
 * Thin wrapper around the real restaurants-api Cierre Diario contract
 * (CARTA 9.1A, verified against the live OpenAPI doc + a real preview
 * response):
 *   GET  /api/v1/restaurants/{restaurant}/day-close/preview?opening_float=
 *   POST /api/v1/restaurants/{restaurant}/day-closes             (Idempotency-Key)
 *   GET  /api/v1/restaurants/{restaurant}/day-closes              (cursor-paginated)
 *   GET  /api/v1/day-closes/{dayClose}                            (numeric id)
 *   POST /api/v1/day-closes/{dayClose}/annotations
 * No WhatsApp — out of scope.
 */
export const dayCloseService = {
  /**
   * `openingFloat` is only meaningful (and only sent) when a previous
   * preview already reported `cash.opening_float_source === 'required'` —
   * sending it otherwise would silently diverge from what the backend
   * itself suggests.
   */
  async preview(restaurantId: number, openingFloat?: string, signal?: AbortSignal): Promise<DayClosePreview> {
    const { data } = await http.get<DayClosePreviewEnvelope>(
      `/api/v1/restaurants/${restaurantId}/day-close/preview`,
      { params: openingFloat !== undefined ? { opening_float: openingFloat } : undefined, signal },
    )
    return data.data
  },

  async create(restaurantId: number, payload: CreateDayClosePayload, idempotencyKey: string): Promise<DayClose> {
    const { data } = await http.post<DayCloseEnvelope>(
      `/api/v1/restaurants/${restaurantId}/day-closes`,
      payload,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    )
    return data.data
  },

  async list(
    restaurantId: number,
    query: DayClosesQuery = {},
    signal?: AbortSignal,
  ): Promise<{ dayCloses: DayCloseSummary[]; nextCursor: string | null }> {
    // Laravel's `boolean` validation rule only accepts 1/0/"1"/"0"/true/false
    // — NOT the strings "true"/"false" that axios's default params
    // serializer produces from a JS boolean in a query string. Verified
    // live: `?has_incidents=true` 422s with "must be true or false.".
    const { has_incidents, ...rest } = query
    const params = { ...rest, ...(has_incidents !== undefined ? { has_incidents: has_incidents ? '1' : '0' } : {}) }
    const { data } = await http.get<DayCloseListEnvelope>(`/api/v1/restaurants/${restaurantId}/day-closes`, {
      params,
      signal,
    })
    return { dayCloses: data.data.day_closes, nextCursor: data.meta.next_cursor }
  },

  async get(dayCloseId: number, signal?: AbortSignal): Promise<DayClose> {
    const { data } = await http.get<DayCloseEnvelope>(`/api/v1/day-closes/${dayCloseId}`, { signal })
    return data.data
  },

  /**
   * Never part of the immutable report/hash — a side note, appended, never
   * edited/removed (the API exposes no such endpoint). Returns only the
   * newly created annotation (verified against the live OpenAPI 201
   * schema) — callers append it to their own local `annotations` list
   * rather than expecting a full `DayClose` back.
   */
  async addAnnotation(dayCloseId: number, body: string): Promise<DayCloseAnnotation> {
    const { data } = await http.post<DayCloseAnnotationEnvelope>(`/api/v1/day-closes/${dayCloseId}/annotations`, { body })
    return data.data
  },

}
