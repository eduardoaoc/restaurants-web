/**
 * Contract-frozen shape (Carta 4.3) for a Product's optional image/video —
 * shared verbatim between the admin `Product` type and the customer-facing
 * `PublicProduct` type (types/product.ts / types/public-menu.ts import
 * these, never redeclare them) since both read the exact same media
 * object off the same underlying resource.
 *
 * A `Product` always has BOTH slots (`image`/`video`), independently
 * nullable — neither is required, both can coexist. The future Carta/Reels
 * experience prioritizes `video` over `image` when both exist (Carta 4.3
 * §objetivo) — that consumption logic is NOT built here, only the data
 * shape it will read.
 */
export type ProductMediaType = 'image' | 'video'

export interface ProductMedia {
  id: number
  type: ProductMediaType
  url: string
  mime_type: string
  size_bytes: number
}

export interface ProductMediaSet {
  image: ProductMedia | null
  video: ProductMedia | null
}

/**
 * One slot's pending, purely-local edit intent (Carta 4.3 §13/§17/§18) —
 * never sent to the backend directly. `null` means "no change" (existing
 * remote media, if any, is left exactly as-is); a `File` means "upload
 * this — POST to the same `type`, replacing whatever's already there, no
 * DELETE first" (§17); `'remove'` means "the owner explicitly asked to
 * delete this slot's existing remote media" (only ever produced when
 * there WAS existing remote media — see `resolveProductMediaIntent` in
 * `utils/product-media.ts`).
 */
export type ProductMediaIntent = File | 'remove' | null

export interface ProductMediaIntentSet {
  image: ProductMediaIntent
  video: ProductMediaIntent
}
