/**
 * Shape confirmed against the live backend (restaurants-api,
 * App\Http\Resources\Api\V1\OrganizationResource) — GET /api/v1/organization
 * and PATCH /api/v1/organization both return exactly these fields. There is
 * no {organization} route param: the backend always resolves "the active
 * organization" from the tenant context (App\Http\Controllers\Api\V1\
 * OrganizationController::activeOrganization), the same organization
 * usePermissions().currentOrganizationContext already describes.
 */
export interface Organization {
  id: number
  name: string
  slug: string
  status: string
  created_at: string
  updated_at: string
}

/**
 * PATCH /api/v1/organization — every field `sometimes`
 * (App\Http\Requests\Api\V1\Organization\UpdateOrganizationRequest).
 * `slug`/`status` are real and accepted by the backend, but deliberately
 * not exposed by this MVP's Settings UI (Passo 2.10 §9/§31): `slug` feeds
 * public QR URLs elsewhere in this domain and `status` is a suspension-like
 * control, neither is "the minimal setting an Owner needs to operate" —
 * kept in the type because the contract itself supports it, not because
 * the UI sends it.
 */
export interface UpdateOrganizationPayload {
  name?: string
  slug?: string
  status?: string
}
