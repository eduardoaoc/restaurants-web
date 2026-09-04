export const AVAILABLE_LOCALES = ['es-ES', 'ca-ES-valencia', 'en-GB'] as const
export type AppLocale = (typeof AVAILABLE_LOCALES)[number]
export const DEFAULT_LOCALE: AppLocale = 'es-ES'

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
