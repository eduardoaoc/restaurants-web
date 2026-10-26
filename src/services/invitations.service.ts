import { http } from '@/api/http'
import type {
  AcceptInvitationResult,
  CreateStaffInvitationPayload,
  Invitation,
  InvitationPreview,
} from '@/types/invitation'

interface InvitationEnvelope {
  data: { invitation: Invitation }
}

/**
 * restaurants-api invitation contract:
 *   POST /api/v1/invitations/preview          { token }                         -> { data: { invitation: InvitationPreview } }
 *   POST /api/v1/invitations/accept           { token, name, password, password_confirmation } -> { data: { user, organization_id } }
 *   POST /api/v1/invitations/accept-existing  { token, password }               -> { data: { user, organization_id } }
 *   GET  /api/v1/staff/invitations                                              -> { data: { invitations: [] } }
 *   POST /api/v1/staff/invitations            CreateStaffInvitationPayload      -> 201 { data: { invitation } }
 *   POST /api/v1/staff/invitations/{id}/resend | /revoke                        -> { data: { invitation } }
 *
 * The token only ever travels in a JSON body — never in a URL/query string.
 */
export const invitationsService = {
  async preview(token: string): Promise<InvitationPreview> {
    const { data } = await http.post<{ data: { invitation: InvitationPreview } }>('/api/v1/invitations/preview', { token })
    return data.data.invitation
  },

  async acceptNew(token: string, name: string, password: string, passwordConfirmation: string): Promise<AcceptInvitationResult> {
    const { data } = await http.post<{ data: AcceptInvitationResult }>('/api/v1/invitations/accept', {
      token,
      name,
      password,
      password_confirmation: passwordConfirmation,
    })
    return data.data
  },

  async acceptExisting(token: string, password: string): Promise<AcceptInvitationResult> {
    const { data } = await http.post<{ data: AcceptInvitationResult }>('/api/v1/invitations/accept-existing', { token, password })
    return data.data
  },

  async listStaff(signal?: AbortSignal): Promise<Invitation[]> {
    const { data } = await http.get<{ data: { invitations: Invitation[] } }>('/api/v1/staff/invitations', { signal })
    return data.data.invitations
  },

  async inviteStaff(payload: CreateStaffInvitationPayload): Promise<Invitation> {
    const { data } = await http.post<InvitationEnvelope>('/api/v1/staff/invitations', payload)
    return data.data.invitation
  },

  async resendStaff(id: number): Promise<Invitation> {
    const { data } = await http.post<InvitationEnvelope>(`/api/v1/staff/invitations/${id}/resend`)
    return data.data.invitation
  },

  async revokeStaff(id: number): Promise<Invitation> {
    const { data } = await http.post<InvitationEnvelope>(`/api/v1/staff/invitations/${id}/revoke`)
    return data.data.invitation
  },
}
