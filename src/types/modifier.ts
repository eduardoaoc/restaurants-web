/**
 * Shape confirmed against the live backend (restaurants-api): OpenAPI
 * schemas `ModifierGroup`/`ModifierOption` (L5 Swagger) + the real source —
 * App\Http\Requests\Api\V1\ModifierGroup\{Store,Update}ModifierGroupRequest,
 * App\Http\Requests\Api\V1\ModifierOption\{Store,Update}ModifierOptionRequest,
 * App\Http\Requests\Api\V1\Concerns\ValidatesModifierSelection,
 * App\Actions\Catalog\{Create,Update}ModifierGroupAction /
 * {Create,Update}ModifierOptionAction,
 * App\Http\Controllers\Api\V1\{ModifierGroup,ModifierOption}Controller.
 *
 * Domain (CLAUDE.md Passo 2.5 §4): a ModifierGroup belongs to a
 * RestaurantProduct, never to the global Product — the same catalog
 * Product attached to two different restaurants can carry entirely
 * different modifier groups.
 *
 * Two real backend invariants, enforced server-side as 422s
 * (ValidatesModifierSelection) — the UI must never be able to construct
 * either:
 *   - `max_select` must be >= `min_select`.
 *   - `required=true` forces `min_select >= 1`.
 *
 * `ModifierOption.status` ('active'/'inactive', an "archived from the
 * catalog" concept) is a DIFFERENT axis from `available` (boolean, "sold
 * out today at this restaurant") — same distinction already solved for
 * Product in Passo 2.4, never conflated here either.
 */
export type ModifierGroupStatus = 'active' | 'inactive'
export type ModifierOptionStatus = 'active' | 'inactive'

export interface ModifierGroupTranslation {
  locale: string
  name: string
  description: string | null
}

export interface ModifierOptionTranslation {
  locale: string
  name: string
  description: string | null
}

export interface ModifierGroup {
  id: number
  restaurant_product_id: number
  internal_name: string
  min_select: number
  max_select: number
  required: boolean
  sort_order: number
  status: ModifierGroupStatus
  translations: ModifierGroupTranslation[]
  /** Only present when the backend eager-loads it — the list endpoint does NOT (confirmed live, ModifierGroupController::index only `.with('translations')`); this app always fetches options separately per group. */
  options?: ModifierOption[]
  created_at: string
  updated_at: string
}

/**
 * `price_delta` comes back as a decimal STRING (e.g. "1.50"), same
 * read/write shape as RestaurantProduct.price (Passo 2.4) — reused via the
 * same `parsePriceInput` util on write.
 */
export interface ModifierOption {
  id: number
  modifier_group_id: number
  internal_name: string
  price_delta: string
  available: boolean
  sort_order: number
  status: ModifierOptionStatus
  translations: ModifierOptionTranslation[]
  created_at: string
  updated_at: string
}

export interface ModifierTranslationInput {
  locale: string
  name: string
  description?: string | null
}

/** POST /restaurant-products/{restaurantProduct}/modifier-groups body. */
export interface CreateModifierGroupPayload {
  internal_name: string
  min_select?: number
  max_select: number
  required?: boolean
  sort_order?: number
  status?: ModifierGroupStatus
  translations: ModifierTranslationInput[]
}

/** PATCH /modifier-groups/{modifierGroup} body. */
export interface UpdateModifierGroupPayload {
  internal_name?: string
  min_select?: number
  max_select?: number
  required?: boolean
  sort_order?: number
  status?: ModifierGroupStatus
  translations?: ModifierTranslationInput[]
}

/** POST /modifier-groups/{modifierGroup}/options body. */
export interface CreateModifierOptionPayload {
  internal_name: string
  price_delta?: number
  available?: boolean
  sort_order?: number
  status?: ModifierOptionStatus
  translations: ModifierTranslationInput[]
}

/** PATCH /modifier-options/{modifierOption} body. */
export interface UpdateModifierOptionPayload {
  internal_name?: string
  price_delta?: number
  available?: boolean
  sort_order?: number
  status?: ModifierOptionStatus
  translations?: ModifierTranslationInput[]
}
