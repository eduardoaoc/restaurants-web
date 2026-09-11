/**
 * Shape confirmed against the live backend (restaurants-api):
 *   - OpenAPI schemas `Category`/`Translation` (L5 Swagger, /docs?api-docs.json)
 *   - App\Http\Requests\Api\V1\Category\{Store,Update}CategoryRequest (the
 *     real validation rules — status is a genuine `Rule::in(['active',
 *     'inactive'])` here, unlike Menu.status which has no confirmed enum)
 *   - App\Actions\Catalog\{Create,Update}CategoryAction (confirms
 *     sort_order/status default to 0/'active' when omitted on create, and
 *     that PATCH upserts translations per-locale — a locale not present in
 *     the payload is left untouched, never cleared)
 *
 * `locale` on a translation is one of the same 3 tags the interface itself
 * uses (AppLocale, src/i18n/locale.ts) — confirmed against
 * App\Support\Locale\LocaleResolver::PATTERN and RestaurantSettings.
 * default_locale/enabled_locales — but it names the CONTENT's language,
 * never the admin UI's language; the two are independent (CLAUDE.md Passo
 * 2.3 §4).
 */
export type CategoryStatus = 'active' | 'inactive'

export interface CategoryTranslation {
  locale: string
  name: string
  description: string | null
}

export interface Category {
  id: number
  menu_id: number
  slug: string
  sort_order: number
  status: CategoryStatus
  translations: CategoryTranslation[]
  created_at: string
  updated_at: string
}

export interface CategoryTranslationInput {
  locale: string
  name: string
  description?: string | null
}

/** POST body — `sort_order` is filled in by useRestaurantCategories (CLAUDE.md §9: never rely on the backend's default 0 for a newly appended category, or every category with no explicit order would collide at 0). */
export interface CreateCategoryPayload {
  slug: string
  sort_order?: number
  status?: CategoryStatus
  translations: CategoryTranslationInput[]
}

/** PATCH body — only real, confirmed fields (no image/description-only-at-category-level/other invented properties). */
export interface UpdateCategoryPayload {
  slug?: string
  sort_order?: number
  status?: CategoryStatus
  translations?: CategoryTranslationInput[]
}
