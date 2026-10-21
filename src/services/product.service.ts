import { http } from '@/api/http'
import { UPLOAD_TIMEOUT_MS } from '@/api/timeouts'
import type { CreateProductPayload, Product, UpdateProductPayload } from '@/types/product'
import type { ProductMedia, ProductMediaType } from '@/types/product-media'

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

interface ProductMediaEnvelope {
  data: {
    media: ProductMedia
  }
}

/**
 * Thin wrapper around the organization-wide catalog contract (verified
 * against the live OpenAPI spec + FormRequest/Controller source, Passo 2.4):
 *   GET   /api/v1/products          -> { data: { products } } (whole organization catalog)
 *   POST  /api/v1/products          -> { message, data: { product } } | 422
 *   GET   /api/v1/products/{id}     -> { data: { product } }
 *   PATCH /api/v1/products/{id}     -> { message, data: { product } } | 422
 *
 * Carta 4.3 media (frozen contract):
 *   POST   /api/v1/products/{id}/media/{type}   (multipart, field "file") -> { data: { media } } | 422
 *   DELETE /api/v1/products/{id}/media/{type}                             -> 204
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

  /**
   * `file` is appended to a real `FormData` — never build the multipart
   * body/boundary by hand (Carta 4.3 §6). Axios detects the `FormData`
   * instance and lets the browser set `Content-Type` itself; the shared
   * `http` client's own `Accept: application/json` default header doesn't
   * interfere with that.
   */
  async uploadMedia(productId: number, type: ProductMediaType, file: File): Promise<ProductMedia> {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await http.post<ProductMediaEnvelope>(`/api/v1/products/${productId}/media/${type}`, formData, { timeout: UPLOAD_TIMEOUT_MS })
    return data.data.media
  },

  async deleteMedia(productId: number, type: ProductMediaType): Promise<void> {
    await http.delete(`/api/v1/products/${productId}/media/${type}`)
  },
}
