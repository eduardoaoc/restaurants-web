import { createI18n } from 'vue-i18n'

import caESValencia from './locales/ca-ES-valencia'
import enGB from './locales/en-GB'
import esES from './locales/es-ES'
import { applyDocumentLocale, getPersistedLocale, persistLocale, type AppLocale } from './locale'

const initialLocale = getPersistedLocale()

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'es-ES',
  messages: {
    'es-ES': esES,
    'ca-ES-valencia': caESValencia,
    'en-GB': enGB,
  },
})

applyDocumentLocale(initialLocale)

export function changeLocale(locale: AppLocale): void {
  persistLocale(i18n, locale)
}

export { AVAILABLE_LOCALES, DEFAULT_LOCALE, LOCALE_CODE, LOCALE_LABEL } from './locale'
export type { AppLocale } from './locale'
