import type { RestaurantTableShape } from '@/types/restaurant-3d/restaurant-layout'
import type { TableDraft } from './editor-validation'
import { CAPACITY_PRESETS } from './table-defaults'

/** Raw form values: strings, because that is what inputs hold. Parsing is here, rules are in editor-validation. */
export type SeatsChoice = `${(typeof CAPACITY_PRESETS)[number]}` | 'custom'

export interface TableFormState {
  number: string
  shape: RestaurantTableShape
  seatsChoice: SeatsChoice
  customSeats: string
}

export function formFromTable(table: TableDraft): TableFormState {
  const preset = (CAPACITY_PRESETS as readonly number[]).includes(table.seats)
  return {
    number: String(table.number),
    shape: table.shape,
    seatsChoice: preset ? (String(table.seats) as SeatsChoice) : 'custom',
    customSeats: String(table.seats),
  }
}

// `v-model` on a number input hands back a number once typed in, so coerce through String.
const toNumber = (raw: string) => (String(raw).trim() === '' ? Number.NaN : Number(raw))

export function seatsFromForm(form: TableFormState): number {
  return form.seatsChoice === 'custom' ? toNumber(form.customSeats) : Number(form.seatsChoice)
}

/** NaN where a field is empty or not a number; the validator rejects those. */
export function draftFromForm(form: TableFormState): TableDraft {
  return { number: toNumber(form.number), shape: form.shape, seats: seatsFromForm(form) }
}
