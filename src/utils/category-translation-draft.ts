import type { AppLocale } from '@/i18n'

/** Local, UI-only editing state for one locale's category translation — never sent as-is, see CategoryForm's submit assembly. */
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
