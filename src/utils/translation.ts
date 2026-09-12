/**
 * Simplified client-side mirror of the backend's own
 * App\Support\Locale\LocaleResolver::pickTranslation (exact locale -> next
 * preferred locale -> first available) — used to decide which translation
 * to show for a piece of catalog content (category today; products/
 * modifiers will reuse this in Passo 2.4/2.5) when multiple `locale`-tagged
 * translations exist. Not full parity with the backend's base-language
 * matching (e.g. "en" falling back to "en-GB") since this app only ever
 * deals with the 3 full AppLocale tags — this is a display convenience,
 * never an authoritative resolution.
 */
export interface Translatable {
  locale: string
  name: string
}

export interface TranslatableWithDescription extends Translatable {
  description?: string | null
}

function resolveTranslation<T extends Translatable>(translations: T[], preferredLocales: string[]): T | undefined {
  for (const locale of preferredLocales) {
    const match = translations.find((translation) => translation.locale === locale)
    if (match) return match
  }

  return translations[0]
}

export function resolveTranslatedName<T extends Translatable>(
  translations: T[],
  preferredLocales: string[],
  fallback: string,
): string {
  return resolveTranslation(translations, preferredLocales)?.name ?? fallback
}

/** Sibling to resolveTranslatedName, for callers that also need the description (e.g. MenuPreview, Passo 2.6). */
export function resolveTranslatedDescription<T extends TranslatableWithDescription>(
  translations: T[],
  preferredLocales: string[],
): string | null {
  return resolveTranslation(translations, preferredLocales)?.description ?? null
}
