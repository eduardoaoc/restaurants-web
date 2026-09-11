import { AVAILABLE_LOCALES, type AppLocale } from '@/i18n'

/**
 * Local, UI-only editing state for one locale's translation of a
 * catalog entity — never sent as-is, see each Form's submit assembly.
 * Shared by Category (Passo 2.3) and Product (Passo 2.4) forms, since both
 * translate through the exact same backend `Translation` shape
 * (`{locale, name, description}`).
 */
export interface TranslationDraft {
  name: string
  description: string
}

export type TranslationDraftMap = Record<AppLocale, TranslationDraft>

export function emptyTranslationDraftMap(): TranslationDraftMap {
  return {
    'es-ES': { name: '', description: '' },
    'ca-ES-valencia': { name: '', description: '' },
    'en-GB': { name: '', description: '' },
  }
}

function baseLanguage(locale: string): string {
  return locale.split('-')[0]?.toLowerCase() ?? locale.toLowerCase()
}

/**
 * Populates a draft map from an entity's real `translations` array.
 * Prefers an exact tag match (`es-ES`) but falls back to the first
 * AppLocale bucket sharing the same base language (mirrors the backend's
 * own App\Support\Locale\LocaleResolver base-language fallback) — some
 * pre-existing/legacy rows store a bare code like `"es"` instead of the
 * full `"es-ES"` tag this UI otherwise always writes (confirmed live
 * against real seed data, Passo 2.4). Without this fallback, an existing
 * translation would silently disappear from the edit form (empty field)
 * even though the read-only row still resolves and displays it correctly.
 *
 * Exact matches are resolved in a first pass and always win over a
 * base-language fallback, regardless of array order — a product can end
 * up with BOTH a legacy `"es"` row and a newer `"es-ES"` row (the latter
 * created by a previous edit through this same UI, since the backend
 * upserts translations by exact locale string — see PENDÊNCIA BACKEND in
 * the Passo 2.4 report), and the more complete/authoritative one is
 * always the exact tag, never whichever happened to come first.
 */
export function populateTranslationDraftMap(
  translations: { locale: string; name: string; description?: string | null }[],
): TranslationDraftMap {
  const draft = emptyTranslationDraftMap()
  const filledByExact = new Set<AppLocale>()

  for (const translation of translations) {
    if (!(AVAILABLE_LOCALES as readonly string[]).includes(translation.locale)) continue
    const bucket = translation.locale as AppLocale
    draft[bucket] = { name: translation.name, description: translation.description ?? '' }
    filledByExact.add(bucket)
  }

  for (const translation of translations) {
    if ((AVAILABLE_LOCALES as readonly string[]).includes(translation.locale)) continue
    const bucket = AVAILABLE_LOCALES.find(
      (locale) => !filledByExact.has(locale) && !draft[locale].name && baseLanguage(locale) === baseLanguage(translation.locale),
    )
    if (bucket) {
      draft[bucket] = { name: translation.name, description: translation.description ?? '' }
    }
  }

  return draft
}
