/**
 * Shape confirmed against the live backend (restaurants-api,
 * App\Http\Resources\Api\V1\RestaurantResource) — GET /api/v1/restaurants
 * and GET /api/v1/restaurants/{restaurant} both return exactly these
 * fields. `status` is a free-form string on the backend (no enum surfaced
 * in the resource) — treated as opaque here, not matched against a
 * hardcoded value list.
 */
export interface Restaurant {
  id: number
  organization_id: number
  name: string
  slug: string
  status: string
  created_at: string
  updated_at: string
}

/**
 * Shape confirmed against App\Http\Resources\Api\V1\RestaurantSettingsResource
 * (GET /api/v1/restaurants/{restaurant}/settings). Viewing settings requires
 * the `manage_restaurants` permission — a user with only `view_reports` (can
 * see the Dashboard) gets 403 here. Callers must treat this as best-effort
 * and fall back to the platform defaults (see src/utils/format.ts) rather
 * than failing the whole screen — see CLAUDE.md §9 for the permission gap.
 */
export interface RestaurantSettings {
  default_locale: string
  enabled_locales: string[]
  currency: string
  timezone: string
  customer_ordering_enabled: boolean
  customer_order_requires_approval: boolean
  waiter_call_enabled: boolean
  bill_request_enabled: boolean
  kitchen_ticket_printing_enabled: boolean
  bill_receipt_printing_enabled: boolean
  updated_at: string
}

/**
 * App\Models\RestaurantSettings::SUPPORTED_LOCALES — the exact closed list
 * the backend validates `default_locale`/`enabled_locales` against
 * (Passo 2.10). It happens to be identically `src/i18n`'s own
 * `AVAILABLE_LOCALES` (same 3 tags, same order) — reused directly from
 * there rather than duplicated here, even though the two are a DIFFERENT
 * concept: this is the restaurant's customer-facing content locale set
 * (menu/QR), never the signed-in user's personal interface language.
 * `SUPPORTED_CURRENCIES` has no existing app-wide equivalent, so it's a
 * real constant here.
 */
export const RESTAURANT_SETTINGS_SUPPORTED_CURRENCIES = ['EUR'] as const

/**
 * PATCH /api/v1/restaurants/{restaurant}/settings — every field `sometimes`
 * (App\Http\Requests\Api\V1\Restaurant\UpdateRestaurantSettingsRequest).
 * The backend validates the FINAL merged state, not just what's sent: if
 * `enabled_locales` is sent, the restaurant's (possibly unsent)
 * `default_locale` must still be inside it, or the request 422s on
 * `default_locale` — see UpdateRestaurantSettingsRequest::withValidator.
 */
export interface UpdateRestaurantSettingsPayload {
  default_locale?: string
  enabled_locales?: string[]
  currency?: string
  timezone?: string
  customer_ordering_enabled?: boolean
  customer_order_requires_approval?: boolean
  waiter_call_enabled?: boolean
  bill_request_enabled?: boolean
  kitchen_ticket_printing_enabled?: boolean
  bill_receipt_printing_enabled?: boolean
}

/**
 * PATCH /api/v1/restaurants/{restaurant} — every field `sometimes`
 * (App\Http\Requests\Api\V1\Restaurant\UpdateRestaurantRequest). `slug`/
 * `status` are real and accepted (status additionally can never
 * self-unsuspend — RestaurantController::update), but this MVP's Settings
 * UI only ever sends `name` — same "supported by the contract, not by the
 * UI's scope" note as UpdateOrganizationPayload.
 */
export interface UpdateRestaurantPayload {
  name?: string
  slug?: string
  status?: string
}
