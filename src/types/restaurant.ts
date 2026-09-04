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
