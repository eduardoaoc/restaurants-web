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

/**
 * Parses a typed cash amount into the canonical decimal STRING the money
 * contracts expect (`^\d{1,8}(\.\d{1,2})?$` on restaurants-api, e.g. the
 * Cierre Diario and the opening float) — never a float. Accepts exactly one
 * decimal separator, comma or dot ("100,5" / "100.50" → "100.50"); refuses
 * negatives, thousands separators, both separators, inner spaces, more than
 * two decimals or more than 8 integer digits. Empty or invalid → null, so an
 * empty field is never silently sent as zero.
 */
export function parseMoneyInput(raw: string): string | null {
  const match = /^(\d{1,8})(?:[.,](\d{1,2}))?$/.exec(raw.trim())
  if (!match) return null
  const whole = match[1].replace(/^0+(?=\d)/, '')
  return `${whole}.${(match[2] ?? '').padEnd(2, '0')}`
}

/** Integer cents of a canonical decimal string ("12.50" → 1250); no float arithmetic. */
export function moneyToCents(canonical: string): number {
  const negative = canonical.startsWith('-')
  const [whole, fraction = ''] = canonical.replace('-', '').split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2))
  return negative ? -cents : cents
}
