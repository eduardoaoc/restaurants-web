import type { ProductMedia, ProductMediaIntent, ProductMediaType } from '@/types/product-media'

/**
 * Frontend-side format/size limits (Carta 4.3 §7/§8) — a fast UX check
 * only, never a substitute for backend validation (§25): the backend
 * remains authoritative and re-checks the real file regardless of what the
 * browser reports here. SVG is deliberately never in the image accept list
 * (§8) — an SVG can carry embedded script, which this app's own upload
 * surface has no reason to ever accept.
 */
export const PRODUCT_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const PRODUCT_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm']
export const PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const PRODUCT_VIDEO_MAX_BYTES = 50 * 1024 * 1024

export function acceptFor(type: ProductMediaType): string {
  return (type === 'image' ? PRODUCT_IMAGE_MIME_TYPES : PRODUCT_VIDEO_MIME_TYPES).join(',')
}

function mimeTypesFor(type: ProductMediaType): string[] {
  return type === 'image' ? PRODUCT_IMAGE_MIME_TYPES : PRODUCT_VIDEO_MIME_TYPES
}

function maxBytesFor(type: ProductMediaType): number {
  return type === 'image' ? PRODUCT_IMAGE_MAX_BYTES : PRODUCT_VIDEO_MAX_BYTES
}

export type ProductMediaValidation = 'ok' | 'invalid_type' | 'too_large'

/** Checked purely from `file.type`/`file.size` (§25) — never reads the binary itself. */
export function validateProductMediaFile(file: File, type: ProductMediaType): ProductMediaValidation {
  if (!mimeTypesFor(type).includes(file.type)) return 'invalid_type'
  if (file.size > maxBytesFor(type)) return 'too_large'
  return 'ok'
}

const MIME_LABELS: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'video/mp4': 'MP4',
  'video/webm': 'WebM',
}

export function mediaFormatLabel(mimeType: string): string {
  return MIME_LABELS[mimeType] ?? mimeType.split('/')[1]?.toUpperCase() ?? mimeType
}

/** e.g. "8,4 MB" (es-ES) — locale-aware decimal separator, same spirit as the money/number formatters in `utils/format.ts`. */
export function formatMediaSize(bytes: number, locale: string): string {
  const megabytes = bytes / (1024 * 1024)
  try {
    return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(megabytes)} MB`
  } catch {
    return `${megabytes.toFixed(1)} MB`
  }
}

/**
 * One slot's purely-local pending state (Carta 4.3 §17/§18/§19) — never
 * sent to the backend as-is, see `resolveProductMediaIntent` below.
 * `markedForRemoval` only ever applies to EXISTING remote media (there's
 * nothing to "remove" about a pending local file that was never uploaded —
 * clearing `pendingFile` back to `null` covers that case instead).
 */
export interface ProductMediaSlotDraft {
  pendingFile: File | null
  markedForRemoval: boolean
}

export function emptyMediaSlotDraft(): ProductMediaSlotDraft {
  return { pendingFile: null, markedForRemoval: false }
}

/**
 * Resolves a slot's draft into the one thing the caller needs to decide
 * what to do at save time: upload this file, delete the existing one, or
 * leave it alone. A pending file always wins over a removal mark (picking
 * a new file after marking "remove" is a replace, not a remove-then-add).
 */
export function resolveProductMediaIntent(existing: ProductMedia | null, draft: ProductMediaSlotDraft): ProductMediaIntent {
  if (draft.pendingFile) return draft.pendingFile
  if (draft.markedForRemoval && existing) return 'remove'
  return null
}
