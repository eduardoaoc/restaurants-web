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
export type ProductStatus = 'active' | 'inactive'

export interface ProductTranslation {
  locale: string
  name: string
  description: string | null
}

export interface Product {
  id: number
  organization_id: number
  sku: string | null
  internal_name: string
  status: ProductStatus
  translations: ProductTranslation[]
  created_at: string
  updated_at: string
}

export interface ProductTranslationInput {
  locale: string
  name: string
  description?: string | null
}

/** POST /products body. */
export interface CreateProductPayload {
  sku?: string | null
  internal_name: string
  status?: ProductStatus
  translations: ProductTranslationInput[]
}

/** PATCH /products/{product} body — only real, confirmed fields. */
export interface UpdateProductPayload {
  sku?: string | null
  internal_name?: string
  status?: ProductStatus
  translations?: ProductTranslationInput[]
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
