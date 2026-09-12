import type { RestaurantProduct } from './product'

/**
 * Shape confirmed against the live backend (restaurants-api), Passo 2.6:
 *   - App\Http\Controllers\Api\V1\CategoryProductController
 *   - App\Http\Resources\Api\V1\CategoryProductResource
 *   - App\Http\Requests\Api\V1\CategoryProduct\{Attach,Update}CategoryProductRequest
 *   - App\Policies\CategoryPolicy::update (its own docblock: "Also used to
 *     authorize managing the category's products") — gates store/update/
 *     destroy via `manage_menu`, NOT `manage_products`. But `GET
 *     /restaurants/{restaurant}/products` (the full RestaurantProduct list
 *     the picker searches over) is gated by RestaurantProductPolicy via
 *     `manage_products` — so a manage_menu-only user can view/reorder/
 *     remove products already in a category, but cannot open the "Añadir
 *     productos" picker (CLAUDE.md Passo 2.6 §27 — see the frontend gate in
 *     CategoryList.vue/CategoryRow.vue, split into two separate booleans).
 *
 * The category never receives the global Product — only a RestaurantProduct
 * (CLAUDE.md Passo 2.6 §4): `category_products` is a pure ordering/placement
 * pivot on top of the restaurant-scoped RestaurantProduct, which already
 * carries the product/price/availability for THIS restaurant. The same
 * RestaurantProduct can appear in multiple categories at once (§7) — the
 * backend only enforces uniqueness per (category_id, restaurant_product_id)
 * pair (`Rule::unique('category_products','restaurant_product_id')->where('category_id', ...)`),
 * never a single-category-only constraint.
 */
export interface CategoryProduct {
  id: number
  category_id: number
  restaurant_product_id: number
  sort_order: number
  restaurant_product: RestaurantProduct | null
  created_at: string
  updated_at: string
}

/** POST /categories/{category}/products body. */
export interface AttachCategoryProductPayload {
  restaurant_product_id: number
  sort_order?: number
}

/** PATCH /categories/{category}/products/{restaurantProduct} body. */
export interface UpdateCategoryProductPayload {
  sort_order: number
}
