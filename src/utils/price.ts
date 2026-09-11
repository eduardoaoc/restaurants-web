/**
 * Parses a free-typed price string into the plain JS number the backend
 * expects on write (`RestaurantProduct.price` is `numeric, min:0` per
 * AttachRestaurantProductRequest/UpdateRestaurantProductRequest) — never
 * sends a formatted/locale string as the payload (CLAUDE.md Passo 2.4 §17).
 * Accepts a comma or a dot as the decimal separator (both are typed in
 * es-ES/ca-ES-valencia), at most 2 decimal places, never negative. Returns
 * null for anything that doesn't cleanly parse, so the caller can show a
 * validation error instead of silently sending garbage.
 */
export function parsePriceInput(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null

  const value = Number(normalized)
  return Number.isFinite(value) && value >= 0 ? value : null
}
