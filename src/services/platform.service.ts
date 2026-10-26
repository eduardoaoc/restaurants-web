import { http } from '@/api/http'
import type { Invitation, OnboardingPayload, OnboardingResult, PlatformOrganizationOption } from '@/types/invitation'

interface InvitationEnvelope {
  data: { invitation: Invitation }
}

/**
 * restaurants-api platform namespace (platform admins only — the backend
 * gates every call with platform permissions; this file decides nothing):
 *   POST /api/v1/platform/restaurants  (Idempotency-Key header)         -> 201 | 200 replay { data: OnboardingResult }
 *   GET  /api/v1/platform/invitations?per_page=&organization_id=&state= -> { data: { invitations }, meta }
 *   POST /api/v1/platform/organizations/{id}/owner-invitations { email, name? } -> 201 { data: { invitation } }
 *   POST /api/v1/platform/invitations/{id}/resend | /revoke            -> { data: { invitation } }
 *   GET  /api/v1/platform/organizations?search=&per_page=               -> { data: { organizations }, meta }
 */
export const platformService = {
  async onboard(payload: OnboardingPayload, idempotencyKey: string): Promise<OnboardingResult> {
    const { data } = await http.post<{ data: OnboardingResult }>('/api/v1/platform/restaurants', payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return data.data
  },

  async listOwnerInvitations(signal?: AbortSignal): Promise<Invitation[]> {
    const { data } = await http.get<{ data: { invitations: Invitation[] } }>('/api/v1/platform/invitations', {
      params: { per_page: 20 },
      signal,
    })
    return data.data.invitations
  },

  async inviteOwner(organizationId: number, email: string, name?: string): Promise<Invitation> {
    const { data } = await http.post<InvitationEnvelope>(`/api/v1/platform/organizations/${organizationId}/owner-invitations`, {
      email,
      ...(name ? { name } : {}),
    })
    return data.data.invitation
  },

  async resendOwnerInvitation(id: number): Promise<Invitation> {
    const { data } = await http.post<InvitationEnvelope>(`/api/v1/platform/invitations/${id}/resend`)
    return data.data.invitation
  },

  async revokeOwnerInvitation(id: number): Promise<Invitation> {
    const { data } = await http.post<InvitationEnvelope>(`/api/v1/platform/invitations/${id}/revoke`)
    return data.data.invitation
  },

  async searchOrganizations(search: string, signal?: AbortSignal): Promise<PlatformOrganizationOption[]> {
    const { data } = await http.get<{ data: { organizations: PlatformOrganizationOption[] } }>('/api/v1/platform/organizations', {
      params: { per_page: 20, ...(search ? { search } : {}) },
      signal,
    })
    return data.data.organizations
  },
}
