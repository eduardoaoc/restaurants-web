import { http } from '@/api/http'
import type { CreateProductPayload, Product, UpdateProductPayload } from '@/types/product'

interface ProductListEnvelope {
  data: {
    products: Product[]
  }
}

interface ProductEnvelope {
  data: {
    product: Product
  }
}

/**
 * Thin wrapper around the organization-wide catalog contract (verified
 * against the live OpenAPI spec + FormRequest/Controller source, Passo 2.4):
 *   GET   /api/v1/products          -> { data: { products } } (whole organization catalog)
 *   POST  /api/v1/products          -> { message, data: { product } } | 422
 *   GET   /api/v1/products/{id}     -> { data: { product } }
 *   PATCH /api/v1/products/{id}     -> { message, data: { product } } | 422
 */
export const productService = {
  async list(signal?: AbortSignal): Promise<Product[]> {
    const { data } = await http.get<ProductListEnvelope>('/api/v1/products', { signal })
    return data.data.products
  },

  async get(productId: number, signal?: AbortSignal): Promise<Product> {
    const { data } = await http.get<ProductEnvelope>(`/api/v1/products/${productId}`, { signal })
    return data.data.product
  },

  async create(payload: CreateProductPayload): Promise<Product> {
    const { data } = await http.post<ProductEnvelope>('/api/v1/products', payload)
    return data.data.product
  },

  async update(productId: number, payload: UpdateProductPayload): Promise<Product> {
    const { data } = await http.patch<ProductEnvelope>(`/api/v1/products/${productId}`, payload)
    return data.data.product
  },
}
