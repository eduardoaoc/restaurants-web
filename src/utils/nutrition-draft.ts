import type { ProductNutrition, ProductNutritionInput } from '@/types/product'

/**
 * Local, string-based editing state for the 5 optional nutrition fields
 * (Carta 4.2 §9-12) — mirrors the price field's own pattern
 * (`src/utils/price.ts`): free-typed strings in the UI, parsed to real
 * numbers only at submit time, so an in-progress "12," or an empty field
 * never fights the input while the owner is typing.
 */
export interface NutritionDraft {
  calories_kcal: string
  protein_g: string
  carbohydrates_g: string
  fat_g: string
  salt_g: string
}

export const NUTRITION_FIELDS = ['calories_kcal', 'protein_g', 'carbohydrates_g', 'fat_g', 'salt_g'] as const
export type NutritionField = (typeof NUTRITION_FIELDS)[number]

export function emptyNutritionDraft(): NutritionDraft {
  return { calories_kcal: '', protein_g: '', carbohydrates_g: '', fat_g: '', salt_g: '' }
}

/** `nutrition: null` (never provided) or a real read shape — either way turns into plain strings for the inputs, '' for whatever wasn't set (Carta 4.2 §14 "nutrition null -> campos vazios"). */
export function populateNutritionDraft(nutrition: ProductNutrition | null): NutritionDraft {
  if (!nutrition) return emptyNutritionDraft()
  return {
    calories_kcal: nutrition.calories_kcal !== null ? String(nutrition.calories_kcal) : '',
    protein_g: nutrition.protein_g ?? '',
    carbohydrates_g: nutrition.carbohydrates_g ?? '',
    fat_g: nutrition.fat_g ?? '',
    salt_g: nutrition.salt_g ?? '',
  }
}

export type NutritionDraftErrors = Partial<Record<NutritionField, string>>

/** Same accepted shape as `parsePriceInput` (comma or dot decimal, up to 2 places, never negative) — a blank field is valid (means "not provided"), never coerced to 0. */
function parseNutritionField(raw: string): { value: number | null; invalid: boolean } {
  const trimmed = raw.trim()
  if (!trimmed) return { value: null, invalid: false }

  const normalized = trimmed.replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return { value: null, invalid: true }

  const value = Number(normalized)
  if (!Number.isFinite(value) || value < 0) return { value: null, invalid: true }
  return { value, invalid: false }
}

/**
 * Resolves the draft into either the real payload or a set of per-field
 * errors — never both. Per Carta 4.2 §11/§12:
 *   - every field blank -> `nutrition: null` (never an object of empty
 *     strings/NaNs);
 *   - at least one filled -> a partial `ProductNutritionInput`, blank
 *     fields become `null` (never omitted as `undefined` vs explicit
 *     `null` — kept simple/consistent, easy to flip if the real backend
 *     turns out to want omitted keys instead once confirmed live);
 *   - any invalid (non-numeric or negative) field blocks the whole thing,
 *     surfaced back per-field so the caller can show it right next to that
 *     input (CLAUDE.md §13 "erro perto do campo").
 */
export function resolveNutritionPayload(
  draft: NutritionDraft,
  invalidMessage: string,
): { nutrition: ProductNutritionInput | null; errors: NutritionDraftErrors } {
  const errors: NutritionDraftErrors = {}
  const values: Record<NutritionField, number | null> = {
    calories_kcal: null,
    protein_g: null,
    carbohydrates_g: null,
    fat_g: null,
    salt_g: null,
  }
  let anyFilled = false

  for (const field of NUTRITION_FIELDS) {
    const { value, invalid } = parseNutritionField(draft[field])
    if (invalid) {
      errors[field] = invalidMessage
      continue
    }
    values[field] = value
    if (value !== null) anyFilled = true
  }

  if (Object.keys(errors).length > 0) return { nutrition: null, errors }
  if (!anyFilled) return { nutrition: null, errors: {} }
  return { nutrition: values, errors: {} }
}
