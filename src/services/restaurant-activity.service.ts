import { http } from '@/api/http'
import type {
  RestaurantActivityEvent,
  RestaurantActivityListParams,
  RestaurantActivityMeta,
  RestaurantActivityReadState,
} from '@/types/activity'

interface RestaurantActivityIndexEnvelope {
  data: { activity: RestaurantActivityEvent[] }
  meta: RestaurantActivityMeta
}

interface RestaurantActivityReadStateEnvelope {
  data: RestaurantActivityReadState
}

/**
 * Thin wrapper around the real restaurants-api activity feed contract
 * (Carta 6.1A/6.1B, verified against the live backend):
 *   GET  /api/v1/restaurants/{restaurant}/activity
 *   GET  /api/v1/restaurants/{restaurant}/activity/unread-count
 *   POST /api/v1/restaurants/{restaurant}/activity/read
 * Every call requires `view_activity` on the restaurant — a 403 here is
 * the backend's own authority, never pre-empted by a frontend guess (the
 * caller already gates on `can('view_activity')` before ever reaching
 * this service, same pattern as every other permission-gated resource).
 */
export const restaurantActivityService = {
  async list(
    restaurantId: number,
    params: RestaurantActivityListParams = {},
    signal?: AbortSignal,
  ): Promise<{ activity: RestaurantActivityEvent[]; meta: RestaurantActivityMeta }> {
    const { data } = await http.get<RestaurantActivityIndexEnvelope>(`/api/v1/restaurants/${restaurantId}/activity`, {
      params,
      signal,
    })
    return { activity: data.data.activity, meta: data.meta }
  },

  async unreadCount(restaurantId: number, signal?: AbortSignal): Promise<RestaurantActivityReadState> {
    const { data } = await http.get<RestaurantActivityReadStateEnvelope>(
      `/api/v1/restaurants/${restaurantId}/activity/unread-count`,
      { signal },
    )
    return data.data
  },

  /** `lastEventId` omitted marks the restaurant's own latest event as read (backend default). */
  async markRead(restaurantId: number, lastEventId?: number): Promise<RestaurantActivityReadState> {
    const { data } = await http.post<RestaurantActivityReadStateEnvelope>(
      `/api/v1/restaurants/${restaurantId}/activity/read`,
      lastEventId === undefined ? {} : { last_event_id: lastEventId },
    )
    return data.data
  },
}
