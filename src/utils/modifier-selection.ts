/**
 * Turns the backend's raw `min_select`/`max_select`/`required` trio into
 * the two decisions the owner actually makes (CLAUDE.md Passo 2.5 §7/§9):
 * obligatorio-vs-opcional, and una-opción-vs-varias-opciones. `min_select`/
 * `max_select` stay hidden whenever the group is single-choice — the exact
 * value is fully implied by `required` in that case (0 or 1).
 */
export type SelectionType = 'single' | 'multiple'

export function selectionTypeOf(maxSelect: number): SelectionType {
  return maxSelect <= 1 ? 'single' : 'multiple'
}

/**
 * Clamps a min/max/required trio to the two real backend invariants
 * (App\Http\Requests\Api\V1\Concerns\ValidatesModifierSelection) so the UI
 * can never submit the forbidden combination in the first place — chosen
 * over a blocking inline error because there's always one unambiguous
 * correct fix (bump the value up), so silently correcting it is friendlier
 * than making the owner solve a puzzle (CLAUDE.md §8/§9).
 */
export function clampSelection(minSelect: number, maxSelect: number, required: boolean): { min: number; max: number } {
  const max = Math.max(1, maxSelect)
  const minFloor = required ? 1 : 0
  const min = Math.max(minFloor, Math.min(minSelect, max))
  return { min, max }
}

/** Short, human summary for a group's collapsed card — e.g. "Obligatorio · una opción", "Opcional · hasta 4 opciones". Never mentions min_select/max_select/required by name. */
export function describeSelection(
  minSelect: number,
  maxSelect: number,
  required: boolean,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  const prefix = required ? t('menu.modifiers.group.requiredOption') : t('menu.modifiers.group.optionalOption')

  let countPart: string
  if (maxSelect <= 1) {
    countPart = t('menu.modifiers.group.summary.one')
  } else if (minSelect >= maxSelect) {
    countPart = t('menu.modifiers.group.summary.exact', { count: maxSelect })
  } else if (minSelect <= 0) {
    countPart = t('menu.modifiers.group.summary.upTo', { max: maxSelect })
  } else {
    countPart = t('menu.modifiers.group.summary.range', { min: minSelect, max: maxSelect })
  }

  return `${prefix} · ${countPart}`
}
