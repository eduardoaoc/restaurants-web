import { http } from '@/api/http'
import type { Restaurant, RestaurantSettings, UpdateRestaurantPayload, UpdateRestaurantSettingsPayload } from '@/types/restaurant'

interface RestaurantListEnvelope {
  data: {
    restaurants: Restaurant[]
  }
}

interface RestaurantEnvelope {
  data: {
    restaurant: Restaurant
  }
}

interface RestaurantSettingsEnvelope {
  data: {
    settings: RestaurantSettings
  }
}

/**
 * Thin wrapper around the real restaurants-api contract (verified against
 * the running backend, see FRONT BLOCO 2 report + Passo 2.10):
 *   GET   /api/v1/restaurants                     -> { data: { restaurants } }
 *   PATCH /api/v1/restaurants/{restaurant}         -> { message, data: { restaurant } } | 422 | 403
 *   GET   /api/v1/restaurants/{restaurant}/settings -> { data: { settings } }
 *   PATCH /api/v1/restaurants/{restaurant}/settings -> { message, data: { settings } } | 422 | 403
 * `update`/`updateSettings` both require `manage_restaurants` on the
 * restaurant's organization (RestaurantPolicy::update /
 * ::manageSettings) — a restaurant outside the caller's RestaurantScope
 * 404s before either Policy ever runs.
 */
export const restaurantsService = {
  async list(): Promise<Restaurant[]> {
    const { data } = await http.get<RestaurantListEnvelope>('/api/v1/restaurants')
    return data.data.restaurants
  },

  async update(restaurantId: number, payload: UpdateRestaurantPayload): Promise<Restaurant> {
    const { data } = await http.patch<RestaurantEnvelope>(`/api/v1/restaurants/${restaurantId}`, payload)
    return data.data.restaurant
  },

  async settings(restaurantId: number): Promise<RestaurantSettings> {
    const { data } = await http.get<RestaurantSettingsEnvelope>(
      `/api/v1/restaurants/${restaurantId}/settings`,
    )
    return data.data.settings
  },

  async updateSettings(restaurantId: number, payload: UpdateRestaurantSettingsPayload): Promise<RestaurantSettings> {
    const { data } = await http.patch<RestaurantSettingsEnvelope>(
      `/api/v1/restaurants/${restaurantId}/settings`,
      payload,
    )
    return data.data.settings
  },
}
