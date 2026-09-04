import { http } from '@/api/http'
import type { Restaurant, RestaurantSettings } from '@/types/restaurant'

interface RestaurantListEnvelope {
  data: {
    restaurants: Restaurant[]
  }
}

interface RestaurantSettingsEnvelope {
  data: {
    settings: RestaurantSettings
  }
}

/**
 * Thin wrapper around the real restaurants-api contract (verified against
 * the running backend, see FRONT BLOCO 2 report):
 *   GET /api/v1/restaurants                     -> { data: { restaurants } }
 *   GET /api/v1/restaurants/{restaurant}/settings -> { data: { settings } }
 */
export const restaurantsService = {
  async list(): Promise<Restaurant[]> {
    const { data } = await http.get<RestaurantListEnvelope>('/api/v1/restaurants')
    return data.data.restaurants
  },

  async settings(restaurantId: number): Promise<RestaurantSettings> {
    const { data } = await http.get<RestaurantSettingsEnvelope>(
      `/api/v1/restaurants/${restaurantId}/settings`,
    )
    return data.data.settings
  },
}
