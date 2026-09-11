import { http } from '@/api/http'
import type { CreateModifierOptionPayload, ModifierOption, UpdateModifierOptionPayload } from '@/types/modifier'

interface ModifierOptionListEnvelope {
  data: {
    modifier_options: ModifierOption[]
  }
}

interface ModifierOptionEnvelope {
  data: {
    modifier_option: ModifierOption
  }
}

/**
 * Thin wrapper around the real restaurants-api contract (Passo 2.5):
 *   GET   /api/v1/modifier-groups/{modifierGroup}/options -> { data: { modifier_options } }
 *   POST  /api/v1/modifier-groups/{modifierGroup}/options -> { message, data: { modifier_option } } | 422
 *   PATCH /api/v1/modifier-options/{modifierOption}       -> { message, data: { modifier_option } } | 422
 */
export const modifierOptionService = {
  async list(modifierGroupId: number, signal?: AbortSignal): Promise<ModifierOption[]> {
    const { data } = await http.get<ModifierOptionListEnvelope>(
      `/api/v1/modifier-groups/${modifierGroupId}/options`,
      { signal },
    )
    return data.data.modifier_options
  },

  async create(modifierGroupId: number, payload: CreateModifierOptionPayload): Promise<ModifierOption> {
    const { data } = await http.post<ModifierOptionEnvelope>(
      `/api/v1/modifier-groups/${modifierGroupId}/options`,
      payload,
    )
    return data.data.modifier_option
  },

  async update(modifierOptionId: number, payload: UpdateModifierOptionPayload): Promise<ModifierOption> {
    const { data } = await http.patch<ModifierOptionEnvelope>(`/api/v1/modifier-options/${modifierOptionId}`, payload)
    return data.data.modifier_option
  },
}
