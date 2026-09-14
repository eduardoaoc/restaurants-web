import { http } from '@/api/http'
import type { Organization, UpdateOrganizationPayload } from '@/types/organization'

interface OrganizationEnvelope {
  data: { organization: Organization }
}

/**
 * Thin wrapper around the real restaurants-api Organization contract
 * (verified against the live OpenAPI spec, Passo 2.10):
 *   GET   /api/v1/organization -> { data: { organization } }
 *   PATCH /api/v1/organization -> { message, data: { organization } } | 422
 *
 * Neither route takes an {id} — the backend always resolves "the active
 * organization" from the tenant context, never a caller-supplied id.
 */
export const organizationService = {
  async get(signal?: AbortSignal): Promise<Organization> {
    const { data } = await http.get<OrganizationEnvelope>('/api/v1/organization', { signal })
    return data.data.organization
  },

  async update(payload: UpdateOrganizationPayload): Promise<Organization> {
    const { data } = await http.patch<OrganizationEnvelope>('/api/v1/organization', payload)
    return data.data.organization
  },
}
