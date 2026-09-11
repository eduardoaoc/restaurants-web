import { http } from '@/api/http'
import type { CreateModifierGroupPayload, ModifierGroup, UpdateModifierGroupPayload } from '@/types/modifier'

interface ModifierGroupListEnvelope {
  data: {
    modifier_groups: ModifierGroup[]
  }
}

interface ModifierGroupEnvelope {
  data: {
    modifier_group: ModifierGroup
  }
}

/**
 * Thin wrapper around the real restaurants-api contract (verified against
 * the live OpenAPI spec + FormRequest/Controller source, Passo 2.5):
 *   GET   /api/v1/restaurant-products/{restaurantProduct}/modifier-groups -> { data: { modifier_groups } }
 *   POST  /api/v1/restaurant-products/{restaurantProduct}/modifier-groups -> { message, data: { modifier_group } } | 422
 *   GET   /api/v1/modifier-groups/{modifierGroup}                         -> { data: { modifier_group } }
 *   PATCH /api/v1/modifier-groups/{modifierGroup}                         -> { message, data: { modifier_group } } | 422
 */
export const modifierGroupService = {
  async list(restaurantProductId: number, signal?: AbortSignal): Promise<ModifierGroup[]> {
    const { data } = await http.get<ModifierGroupListEnvelope>(
      `/api/v1/restaurant-products/${restaurantProductId}/modifier-groups`,
      { signal },
    )
    return data.data.modifier_groups
  },

  async create(restaurantProductId: number, payload: CreateModifierGroupPayload): Promise<ModifierGroup> {
    const { data } = await http.post<ModifierGroupEnvelope>(
      `/api/v1/restaurant-products/${restaurantProductId}/modifier-groups`,
      payload,
    )
    return data.data.modifier_group
  },

  async update(modifierGroupId: number, payload: UpdateModifierGroupPayload): Promise<ModifierGroup> {
    const { data } = await http.patch<ModifierGroupEnvelope>(`/api/v1/modifier-groups/${modifierGroupId}`, payload)
    return data.data.modifier_group
  },
}
