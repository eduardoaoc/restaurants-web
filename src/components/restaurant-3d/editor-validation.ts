import type {
  RestaurantLayout,
  RestaurantTableConfig,
  RestaurantTableShape,
} from '@/types/restaurant-3d/restaurant-layout'
import { isInsideFloor, isOnGrid } from './layout-editing'
import { findCollisions } from './table-footprint'

/**
 * Every layout-editing rule lives here; UI components only show the messages.
 * The capacity limit is an editor rule — the renderer works for any seat count.
 */
export const CAPACITY_LIMITS = { min: 1, max: 20 } as const
export const TABLE_SHAPES: readonly RestaurantTableShape[] = ['round', 'square', 'rectangular']

export type EditorIssueCode =
  | 'number_invalid'
  | 'number_taken'
  | 'shape_invalid'
  | 'seats_invalid'
  | 'seats_below_seated'
  | 'off_grid'
  | 'out_of_floor'
  | 'collision'
  | 'no_free_space'

export interface EditorIssue {
  code: EditorIssueCode
  message: string
}

const issue = (code: EditorIssueCode, message: string): EditorIssue => ({ code, message })
const label = (number: number) => `Mesa ${String(number).padStart(2, '0')}`

/** The editable identity of a table. Numbers arrive unchecked (form input), hence `number`, not a refined type. */
export interface TableDraft {
  number: number
  shape: RestaurantTableShape
  seats: number
}

/**
 * Number, shape and capacity. `others` are the other tables of the layout;
 * `minSeats` is the smallest capacity that still holds everyone seated there.
 */
export function validateTableDraft(draft: TableDraft, others: RestaurantTableConfig[], minSeats = 0): EditorIssue[] {
  const issues: EditorIssue[] = []
  if (!Number.isInteger(draft.number) || draft.number < 1) {
    issues.push(issue('number_invalid', 'El número de mesa debe ser un entero positivo.'))
  } else if (others.some((other) => other.number === draft.number)) {
    issues.push(issue('number_taken', `Ya existe la ${label(draft.number)}.`))
  }
  if (!TABLE_SHAPES.includes(draft.shape)) {
    issues.push(issue('shape_invalid', 'Elige una forma válida.'))
  }
  if (!Number.isInteger(draft.seats) || draft.seats < CAPACITY_LIMITS.min || draft.seats > CAPACITY_LIMITS.max) {
    issues.push(issue('seats_invalid', `La capacidad debe ser un entero entre ${CAPACITY_LIMITS.min} y ${CAPACITY_LIMITS.max}.`))
  } else if (draft.seats < minSeats) {
    issues.push(issue('seats_below_seated', `Hay comensales sentados hasta el asiento ${minSeats}: la capacidad no puede ser menor.`))
  }
  return issues
}

/** Position on the grid, inside the floor and clear of the other tables. */
export function validateTablePlacement(table: RestaurantTableConfig, others: RestaurantTableConfig[]): EditorIssue[] {
  const issues: EditorIssue[] = []
  const { x, z } = table.position
  if (!isOnGrid(x) || !isOnGrid(z)) issues.push(issue('off_grid', 'La posición no está alineada a la cuadrícula de 0,25 m.'))
  if (!isInsideFloor(table)) issues.push(issue('out_of_floor', 'La mesa queda fuera del salón.'))
  const [first] = findCollisions(table, others)
  if (first) issues.push(issue('collision', `No hay espacio: choca con la ${label(first.number)}.`))
  return issues
}

export const noFreeSpaceIssue = (): EditorIssue =>
  issue('no_free_space', 'No hay espacio libre en el salón para una mesa de este tamaño.')

/** Whole-layout check (dev warnings): unique numbers, grid, floor. Collisions are not required of a loaded layout. */
export function validateLayout(layout: RestaurantLayout): string[] {
  const problems: string[] = []
  const ids = new Set<string>()
  const numbers = new Set<number>()
  for (const table of layout.tables) {
    if (ids.has(table.id)) problems.push(`duplicate table id ${table.id}`)
    ids.add(table.id)
    if (numbers.has(table.number)) problems.push(`${table.id}: duplicate table number ${table.number}`)
    numbers.add(table.number)
    const others = layout.tables.filter((other) => other.id !== table.id)
    for (const found of [...validateTableDraft(table, others), ...validateTablePlacement(table, [])]) {
      problems.push(`${table.id}: ${found.message}`)
    }
  }
  return problems
}
