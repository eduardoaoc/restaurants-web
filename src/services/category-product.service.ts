import { http } from '@/api/http'
import type { AttachCategoryProductPayload, CategoryProduct, UpdateCategoryProductPayload } from '@/types/category-product'

interface CategoryProductListEnvelope {
  data: {
    category_products: CategoryProduct[]
  }
}

interface CategoryProductEnvelope {
  data: {
    category_product: CategoryProduct
  }
}

/**
 * Thin wrapper around the real restaurants-api contract (verified against
 * the live Controller/Request source, Passo 2.6):
 *   GET    /api/v1/categories/{category}/products                          -> { data: { category_products } }
 *   POST   /api/v1/categories/{category}/products                          -> { message, data: { category_product } } | 422
 *   PATCH  /api/v1/categories/{category}/products/{restaurantProduct}      -> { message, data: { category_product } } | 422
 *   DELETE /api/v1/categories/{category}/products/{restaurantProduct}      -> { message }
 *
 * The PATCH/DELETE route param is the RESTAURANT PRODUCT id, never the
 * category_products pivot's own `id` — the controller looks the pivot row
 * up by `restaurant_product_id` under the given category.
 */
export const categoryProductService = {
  async list(categoryId: number, signal?: AbortSignal): Promise<CategoryProduct[]> {
    const { data } = await http.get<CategoryProductListEnvelope>(`/api/v1/categories/${categoryId}/products`, { signal })
    return data.data.category_products
  },

  async attach(categoryId: number, payload: AttachCategoryProductPayload): Promise<CategoryProduct> {
    const { data } = await http.post<CategoryProductEnvelope>(`/api/v1/categories/${categoryId}/products`, payload)
    return data.data.category_product
  },

  async updateSortOrder(
    categoryId: number,
    restaurantProductId: number,
    payload: UpdateCategoryProductPayload,
  ): Promise<CategoryProduct> {
    const { data } = await http.patch<CategoryProductEnvelope>(
      `/api/v1/categories/${categoryId}/products/${restaurantProductId}`,
      payload,
    )
    return data.data.category_product
  },

  async detach(categoryId: number, restaurantProductId: number): Promise<void> {
    await http.delete(`/api/v1/categories/${categoryId}/products/${restaurantProductId}`)
  },
}
