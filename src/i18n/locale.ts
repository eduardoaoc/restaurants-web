export const AVAILABLE_LOCALES = ['es-ES', 'ca-ES-valencia', 'en-GB'] as const
export type AppLocale = (typeof AVAILABLE_LOCALES)[number]
export const DEFAULT_LOCALE: AppLocale = 'es-ES'

/**
 * A language's own name is conventionally shown in that language, not
 * translated per the active UI locale — so these are plain constants, not
 * i18n keys. Shared by LanguageSwitcher (interface language) and, from
 * Passo 2.3, the Carta's per-locale content-translation tabs (a completely
 * different axis — see CategoryTranslationEditor.vue) so both pickers name
 * the same 3 tags identically.
 */
export const LOCALE_LABEL: Record<AppLocale, string> = {
  'es-ES': 'Castellano',
  'ca-ES-valencia': 'Valencià',
  'en-GB': 'English',
}

export const LOCALE_CODE: Record<AppLocale, string> = {
  'es-ES': 'ES',
  'ca-ES-valencia': 'VAL',
  'en-GB': 'EN',
}

const STORAGE_KEY = 'aforo-locale'

function isAppLocale(value: string): value is AppLocale {
  return (AVAILABLE_LOCALES as readonly string[]).includes(value)
}

export function getPersistedLocale(): AppLocale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && isAppLocale(stored)) {
      return stored
    }
  } catch {
    // localStorage unavailable — fall back to the default silently.
  }

  return DEFAULT_LOCALE
}

/**
 * `ca-ES-valencia` isn't a real BCP-47 tag, so it has no exact
 * `document.documentElement.lang` equivalent — `ca-valencia` is the closest
 * valid approximation for assistive tech / SEO tooling.
 */
export function applyDocumentLocale(locale: AppLocale): void {
  document.documentElement.lang = locale === 'ca-ES-valencia' ? 'ca-valencia' : locale
}

interface I18nGlobalLike {
  global: { locale: { value: string } }
}

export function persistLocale(i18n: I18nGlobalLike, locale: AppLocale): void {
  i18n.global.locale.value = locale
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // Preference just won't survive a reload — not fatal.
  }
  applyDocumentLocale(locale)
}
