/**
 * Canonical allergen codes (Carta 4.2, frozen contract) — the 14 EU
 * FIC-aligned codes the backend accepts/returns verbatim, both on
 * `Product.allergens` (admin) and `PublicProduct.allergens` (customer QR
 * menu). Defined ONCE here and imported everywhere instead of a manually
 * repeated union — never redeclare this list in another file.
 *
 * Labels are never derived from the code itself (e.g. no
 * `capitalize(code)`) — always go through i18n
 * (`menu.products.allergens.codes.<code>`), since the Owner never sees the
 * raw technical code (Carta 4.2 §5/§6).
 */
export const ALLERGEN_CODES = [
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'peanuts',
  'soybeans',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
] as const

export type AllergenCode = (typeof ALLERGEN_CODES)[number]

export function isAllergenCode(value: string): value is AllergenCode {
  return (ALLERGEN_CODES as readonly string[]).includes(value)
}
