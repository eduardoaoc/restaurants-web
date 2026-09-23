/**
 * Shape confirmed against the live backend (restaurants-api): OpenAPI
 * schemas `Product`/`RestaurantProduct` (L5 Swagger) + the real source —
 * App\Http\Requests\Api\V1\Product\{Store,Update}ProductRequest,
 * App\Http\Requests\Api\V1\RestaurantProduct\{Attach,Update}RestaurantProductRequest,
 * App\Actions\Catalog\{Create,Update}ProductAction /
 * AttachProductToRestaurantAction, App\Http\Controllers\Api\V1\
 * {Product,RestaurantProduct}Controller.
 *
 * Two separate backend entities, on purpose (CLAUDE.md Passo 2.4 §4/§5):
 *   - `Product` = the organization-wide catalog entry (internal_name, sku,
 *     status, translations) — reusable across every restaurant in the org.
 *   - `RestaurantProduct` = the join: which restaurant carries a Product,
 *     at what price, and whether it's available right now. `available`
 *     is NEVER the same axis as `Product.status` — see UpdateRestaurantProductPayload.
 */
import type { AllergenCode } from './allergen'

export type ProductStatus = 'active' | 'inactive'

export interface ProductTranslation {
  locale: string
  name: string
  /**
   * Nullable on READ only — some existing rows predate the Carta 4.2 rule
   * that description is mandatory (never backfilled retroactively). Never
   * treat a null read value as "fine to leave blank" when writing: see
   * `ProductTranslationInput.description` below, which has no such escape
   * hatch.
   */
  description: string | null
}

/**
 * Contract-frozen shape (Carta 4.2) for `Product.allergens` /
 * `Product.nutrition` — see `src/types/allergen.ts` for the full code list
 * and the null-vs-[] semantics these two fields share:
 *   - `allergens: null` -> never declared yet (new/legacy product, NOT the
 *     same as "contains none" — CLAUDE.md Carta 4.2 §7/§8).
 *   - `allergens: []` -> explicitly declared "none of the 14 listed".
 *   - `nutrition: null` -> no nutrition info provided at all.
 *
 * The admin READ shape for `nutrition` was NOT shown by the frozen
 * contract (which only documented the numeric WRITE shape below) — this
 * was inferred from the confirmed `PublicProduct.nutrition` shape in
 * `public-menu.ts` (same underlying DB columns) and then CONFIRMED LIVE
 * against the real backend (Carta 4.2, `PATCH /products/{id}` response):
 * `basis`/`calories_kcal` come back exactly as guessed (an integer column,
 * plain number), and the other four ARE decimal-cast strings, same
 * precedent as `RestaurantProduct.price` elsewhere in this app.
 */
export interface ProductNutrition {
  basis: 'per_serving'
  calories_kcal: number | null
  protein_g: string | null
  carbohydrates_g: string | null
  fat_g: string | null
  salt_g: string | null
}

export interface Product {
  id: number
  organization_id: number
  sku: string | null
  internal_name: string
  status: ProductStatus
  translations: ProductTranslation[]
  allergens: AllergenCode[] | null
  nutrition: ProductNutrition | null
  created_at: string
  updated_at: string
}

/** `description` is required on write (Carta 4.2 §3) — unlike the read shape above, there is no null escape hatch here; the form itself blocks submit on a blank/whitespace-only description before this is ever built. */
export interface ProductTranslationInput {
  locale: string
  name: string
  description: string
}

/**
 * The frozen contract's WRITE shape for `nutrition` — plain numbers (e.g.
 * `calories_kcal: 720`), never the decimal-as-string shape `ProductNutrition`
 * (the read shape) uses for 4 of these 5 fields. A field left blank in the
 * form becomes `null` here (never omitted, never `NaN`/empty string) — see
 * `src/utils/nutrition-draft.ts` for how the draft resolves to this.
 */
export interface ProductNutritionInput {
  calories_kcal?: number | null
  protein_g?: number | null
  carbohydrates_g?: number | null
  fat_g?: number | null
  salt_g?: number | null
}

/**
 * POST /products body. `allergens` is required (never omitted, never
 * `null`) — a brand-new product must always leave this create call with an
 * explicit declaration, `[]` included (Carta 4.2 §7). `nutrition` stays
 * optional/nullable since it's opt-in either way.
 */
export interface CreateProductPayload {
  sku?: string | null
  internal_name: string
  status?: ProductStatus
  translations: ProductTranslationInput[]
  allergens: AllergenCode[]
  nutrition?: ProductNutritionInput | null
}

/** PATCH /products/{product} body — only real, confirmed fields. */
export interface UpdateProductPayload {
  sku?: string | null
  internal_name?: string
  status?: ProductStatus
  translations?: ProductTranslationInput[]
  allergens?: AllergenCode[]
  nutrition?: ProductNutritionInput | null
}

/**
 * `price` comes back from the API as a decimal STRING (e.g. "12.90"), same
 * shape already handled elsewhere in this app (RestaurantSettings-adjacent
 * money values) via `formatMoney(amount: string, locale, currency)` — never
 * reformatted or re-stored as a number on read.
 */
export interface RestaurantProduct {
  id: number
  restaurant_id: number
  product_id: number
  price: string
  available: boolean
  product: Product | null
  created_at: string
  updated_at: string
}

/** POST /restaurants/{restaurant}/products body — `price` is a NUMBER on write (the string shape is read-only, response-side). */
export interface AttachRestaurantProductPayload {
  product_id: number
  price: number
  available?: boolean
}

/** PATCH /restaurant-products/{restaurantProduct} body. */
export interface UpdateRestaurantProductPayload {
  price?: number
  available?: boolean
}
