import { http } from '@/api/http'
import type { AttachRestaurantProductPayload, RestaurantProduct, UpdateRestaurantProductPayload } from '@/types/product'

interface RestaurantProductListEnvelope {
  data: {
    restaurant_products: RestaurantProduct[]
  }
}

interface RestaurantProductEnvelope {
  data: {
    restaurant_product: RestaurantProduct
  }
}

/**
 * Thin wrapper around the restaurant-scoped join contract (Passo 2.4):
 *   GET   /api/v1/restaurants/{restaurant}/products -> { data: { restaurant_products } }
 *   POST  /api/v1/restaurants/{restaurant}/products -> { message, data: { restaurant_product } } | 422 (dup, foreign-org product, validation)
 *   PATCH /api/v1/restaurant-products/{restaurantProduct} -> { message, data: { restaurant_product } } | 422
 */
export const restaurantProductService = {
  async list(restaurantId: number, signal?: AbortSignal): Promise<RestaurantProduct[]> {
    const { data } = await http.get<RestaurantProductListEnvelope>(
      `/api/v1/restaurants/${restaurantId}/products`,
      { signal },
    )
    return data.data.restaurant_products
  },

  async attach(restaurantId: number, payload: AttachRestaurantProductPayload): Promise<RestaurantProduct> {
    const { data } = await http.post<RestaurantProductEnvelope>(
      `/api/v1/restaurants/${restaurantId}/products`,
      payload,
    )
    return data.data.restaurant_product
  },

  async update(restaurantProductId: number, payload: UpdateRestaurantProductPayload): Promise<RestaurantProduct> {
    const { data } = await http.patch<RestaurantProductEnvelope>(
      `/api/v1/restaurant-products/${restaurantProductId}`,
      payload,
    )
    return data.data.restaurant_product
  },
}
