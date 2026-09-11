import { http } from '@/api/http'
import type { CreateMenuPayload, Menu, UpdateMenuPayload } from '@/types/menu'

interface MenuEnvelope {
  data: {
    menu: Menu
  }
}

/**
 * Thin wrapper around the real restaurants-api contract (verified against
 * the live OpenAPI spec, Passo 2.2):
 *   GET   /api/v1/restaurants/{restaurant}/menu -> { data: { menu } } | 404 (no menu yet)
 *   POST  /api/v1/restaurants/{restaurant}/menu -> { message, data: { menu } } | 409 (already has one)
 *   PATCH /api/v1/restaurants/{restaurant}/menu -> { message, data: { menu } }
 */
export const menuService = {
  async get(restaurantId: number, signal?: AbortSignal): Promise<Menu> {
    const { data } = await http.get<MenuEnvelope>(`/api/v1/restaurants/${restaurantId}/menu`, { signal })
    return data.data.menu
  },

  async create(restaurantId: number, payload: CreateMenuPayload): Promise<Menu> {
    const { data } = await http.post<MenuEnvelope>(`/api/v1/restaurants/${restaurantId}/menu`, payload)
    return data.data.menu
  },

  async update(restaurantId: number, payload: UpdateMenuPayload): Promise<Menu> {
    const { data } = await http.patch<MenuEnvelope>(`/api/v1/restaurants/${restaurantId}/menu`, payload)
    return data.data.menu
  },
}
