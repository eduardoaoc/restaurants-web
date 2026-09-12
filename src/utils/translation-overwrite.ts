import type { AppLocale } from '@/i18n'
import type { TranslationDraft, TranslationDraftMap } from './translation-draft'

/**
 * Pure decision logic for the auto-translation overwrite guard (CLAUDE.md
 * Passo 2.6 §19/§20). No auto-translation provider exists anywhere in this
 * stack yet — frontend or backend (confirmed, see the Passo 2.6 report
 * §16/§21/§22) — so nothing here is wired to a live "Traducir
 * automáticamente" call. The RULE itself is real business logic, kept as
 * pure/independently-reviewable functions so a future provider integration
 * only has to plug a real fetch into TranslationEditor.vue's disabled
 * button — it never has to re-derive this decision.
 */

/** A target draft counts as "already translated" once it has a non-empty name. */
export function hasExistingTranslation(draft: TranslationDraft): boolean {
  return draft.name.trim().length > 0
}

/**
 * Locales whose target draft already has content — these must never be
 * silently overwritten by an auto-translate run. The caller should offer a
 * clear choice per such locale (or in bulk) — "Mantener actual" / "Reemplazar"
 * / "Cancelar" — before ever sending that locale to the provider.
 */
export function localesNeedingOverwriteConfirmation(draftMap: TranslationDraftMap, targetLocales: AppLocale[]): AppLocale[] {
  return targetLocales.filter((locale) => hasExistingTranslation(draftMap[locale]))
}

/**
 * True once the primary-locale text a translation was originally generated
 * from has since changed. Signals "El texto original ha cambiado" (§20) —
 * never applied automatically; only ever used to decide whether to surface
 * that banner plus an explicit "Actualizar traducciones" action.
 */
export function hasOriginalChanged(translatedFromText: string, currentPrimaryText: string): boolean {
  return translatedFromText.trim() !== currentPrimaryText.trim()
}
