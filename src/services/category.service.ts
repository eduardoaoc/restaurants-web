import { http } from '@/api/http'
import type { Category, CreateCategoryPayload, UpdateCategoryPayload } from '@/types/category'

interface CategoryListEnvelope {
  data: {
    categories: Category[]
  }
}

interface CategoryEnvelope {
  data: {
    category: Category
  }
}

/**
 * Thin wrapper around the real restaurants-api contract (verified against
 * the live OpenAPI spec + FormRequest source, Passo 2.3):
 *   GET   /api/v1/restaurants/{restaurant}/categories -> { data: { categories } }
 *   POST  /api/v1/restaurants/{restaurant}/categories -> { message, data: { category } } | 422
 *   GET   /api/v1/categories/{category}                -> { data: { category } }
 *   PATCH /api/v1/categories/{category}                -> { message, data: { category } } | 422
 */
export const categoryService = {
  async list(restaurantId: number, signal?: AbortSignal): Promise<Category[]> {
    const { data } = await http.get<CategoryListEnvelope>(
      `/api/v1/restaurants/${restaurantId}/categories`,
      { signal },
    )
    return data.data.categories
  },

  async get(categoryId: number, signal?: AbortSignal): Promise<Category> {
    const { data } = await http.get<CategoryEnvelope>(`/api/v1/categories/${categoryId}`, { signal })
    return data.data.category
  },

  async create(restaurantId: number, payload: CreateCategoryPayload): Promise<Category> {
    const { data } = await http.post<CategoryEnvelope>(
      `/api/v1/restaurants/${restaurantId}/categories`,
      payload,
    )
    return data.data.category
  },

  async update(categoryId: number, payload: UpdateCategoryPayload): Promise<Category> {
    const { data } = await http.patch<CategoryEnvelope>(`/api/v1/categories/${categoryId}`, payload)
    return data.data.category
  },
}
