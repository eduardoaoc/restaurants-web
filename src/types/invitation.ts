/**
 * Shapes confirmed against restaurants-api (onboarding/invitations block):
 *   App\Http\Resources\Api\V1\InvitationResource,
 *   App\Http\Controllers\Api\V1\InvitationController (preview/accept),
 *   App\Http\Controllers\Api\V1\Platform\PlatformOnboardingController.
 *
 * The token itself never appears in any of these shapes: it only exists in
 * the e-mail link fragment (#token=...) and in memory on the accept page.
 */

/** `expired` is derived server-side from a pending invitation past expires_at. */
export type InvitationState = 'pending' | 'expired' | 'accepted' | 'revoked'

/**
 * queued: job created, not yet handed to the mail transport.
 * sent: the transport accepted it — NOT proof that it reached the inbox.
 * failed: last attempt failed; a resend is the recovery path.
 */
export type InvitationDeliveryStatus = 'queued' | 'sent' | 'failed'

export type InvitationType = 'owner' | 'staff'

export interface InvitationDelivery {
  status: InvitationDeliveryStatus
  send_count: number
  last_queued_at: string | null
  last_sent_at: string | null
  failed_at: string | null
  /** When the resend cooldown ends (pending only). */
  resend_available_at: string | null
}

/** What whoever manages the invitation sees (platform admin / manage_users). */
export interface Invitation {
  id: number
  type: InvitationType
  email: string
  name: string | null
  state: InvitationState
  role: string | null
  /** Present on platform responses only. */
  organization?: { id: number; name: string }
  restaurants: { id: number; name: string | null }[]
  delivery: InvitationDelivery
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
  created_at: string | null
}

/** POST /api/v1/invitations/preview — never consumes the invitation. */
export interface InvitationPreview {
  type: InvitationType
  email: string
  name: string | null
  role: string
  organization: { name: string }
  restaurants: { name: string }[]
  expires_at: string
  /** Decides the form: sign in with the existing account vs create a password. */
  account_exists: boolean
}

export interface AcceptInvitationResult {
  user: { id: number; name: string; email: string }
  organization_id: number
}

/** POST /api/v1/staff/invitations — same rules as staff creation, no password. */
export interface CreateStaffInvitationPayload {
  name: string
  email: string
  role: string
  restaurant_assignments: { restaurant_id: number }[]
}

/** POST /api/v1/platform/restaurants — exactly one organization mode. */
export interface OnboardingPayload {
  organization_id?: number
  organization?: { name: string; slug: string }
  restaurant: { name: string; slug: string; timezone?: string; default_locale?: string }
  owner?: { email: string; name?: string }
}

export interface OnboardingResult {
  organization: { id: number; name: string; slug: string; status: string; created: boolean }
  restaurant: { id: number; name: string; slug: string; status: string; timezone: string; currency: string; default_locale: string }
  owner_invitation: Invitation | null
  replayed: boolean
}

/** GET /api/v1/platform/organizations item (subset used for the picker). */
export interface PlatformOrganizationOption {
  id: number
  name: string
  slug: string
  status: string
}
