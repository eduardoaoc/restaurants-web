export interface Sortable {
  id: number
  sort_order: number
}

/**
 * Pure computation of an adjacent-swap reorder: swaps `sort_order` between
 * the item `id` and its immediate neighbor in `direction`, returning the
 * full list with the swap applied (sorted) plus the two items whose
 * `sort_order` actually changed. Returns null when there's no neighbor to
 * swap with (already first/last) or the id isn't found.
 *
 * Extracted from useRestaurantCategories (Passo 2.3) so Categories,
 * Modifier Groups and Modifier Options (Passo 2.5) all reorder through the
 * exact same, once-reviewed algorithm — this is the fiddly, off-by-one-prone
 * part; only the fetch/state wiring differs per composable. The caller is
 * responsible for the actual PATCH calls and for re-fetching on failure
 * (never hand-computing a rollback — see each composable's own `move`).
 */
export function computeAdjacentSwap<T extends Sortable>(
  items: T[],
  id: number,
  direction: 'up' | 'down',
): { reordered: T[]; current: T; target: T } | null {
  const index = items.findIndex((item) => item.id === id)
  if (index === -1) return null

  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= items.length) return null

  const current = items[index]
  const target = items[targetIndex]

  const swapped = items.slice()
  swapped[index] = { ...current, sort_order: target.sort_order }
  swapped[targetIndex] = { ...target, sort_order: current.sort_order }

  return { reordered: swapped.slice().sort((a, b) => a.sort_order - b.sort_order), current, target }
}

/** Next append position for a newly created sortable item — the backend defaults a missing sort_order to 0, which would collide with every other unpositioned item, so callers always compute and send this explicitly. */
export function nextSortOrder(items: Sortable[]): number {
  return items.reduce((max, item) => Math.max(max, item.sort_order), -1) + 1
}
