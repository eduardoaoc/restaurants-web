export type OverlayKind = 'badge' | 'label'

export interface OverlayPoint {
  id: string
  kind: OverlayKind
  rank: number
  position: { x: number; y: number }
  size: { width: number; height: number }
}
export interface OverlayBounds { width: number; height: number; edge?: number }

interface Rect { left: number; right: number; top: number; bottom: number }

const intersects = (a: Rect, b: Rect, gap: number) =>
  a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top

export interface OverlayLayout {
  positions: Map<string, { x: number; y: number }>
  /**
   * Overlays that found no free slot within `maxShift`, so they still overlap something: they are drawn at their own
   * anchor and should switch to their compact form (a lower-ranked one yields to the one that was placed first).
   */
  crowded: Set<string>
}

/** Places badges first and shifts nearby overlays by the smallest bounded screen-space offset. */
export function resolveOverlayCollisions(
  points: readonly OverlayPoint[],
  gap = 5,
  maxShift = 96,
  bounds?: OverlayBounds,
  previous?: ReadonlyMap<string, { x: number; y: number }>,
  stickiness = 32,
): Map<string, { x: number; y: number }> {
  return resolveOverlayLayout(points, gap, maxShift, bounds, previous, stickiness).positions
}

/**
 * Same placement as `resolveOverlayCollisions`, plus the set of overlays that could not be separated. Order of
 * precedence: kind (badges before labels), then `rank` (lower wins; the selected table uses 0), then id.
 */
export function resolveOverlayLayout(
  points: readonly OverlayPoint[],
  gap = 5,
  maxShift = 96,
  bounds?: OverlayBounds,
  previous?: ReadonlyMap<string, { x: number; y: number }>,
  stickiness = 32,
): OverlayLayout {
  const offsets = [{ x: 0, y: 0 }]
  for (let distance = 16; distance <= maxShift; distance += 16) {
    offsets.push({ x: 0, y: -distance }, { x: 0, y: distance }, { x: -distance, y: 0 }, { x: distance, y: 0 })
    for (const x of [-distance, distance]) for (const y of [-distance, distance]) offsets.push({ x, y })
  }
  const placed: Rect[] = []
  const result = new Map<string, { x: number; y: number }>()
  const crowded = new Set<string>()
  const ordered = [...points].sort((a, b) => (a.kind === b.kind ? a.rank - b.rank || a.id.localeCompare(b.id) : a.kind === 'badge' ? -1 : 1))
  for (const point of ordered) {
    const halfW = point.size.width / 2
    const halfH = point.size.height / 2
    const isFree = (offset: { x: number; y: number }) => {
      if (Math.hypot(offset.x, offset.y) > maxShift) return false
      const x = point.position.x + offset.x
      const y = point.position.y + offset.y
      const edge = bounds?.edge ?? 0
      if (bounds && (x - halfW < edge || x + halfW > bounds.width - edge || y - halfH < edge || y + halfH > bounds.height - edge)) return false
      const rect = { left: x - halfW, right: x + halfW, top: y - halfH, bottom: y + halfH }
      return !placed.some(other => intersects(rect, other, gap))
    }
    const freeSlot = offsets.find(isFree)
    if (!freeSlot) crowded.add(point.id)
    const best = freeSlot ?? offsets[0]
    // Hysteresis: a previously chosen slot that is still free is kept unless the best slot is much closer, so a
    // small camera movement does not make a label hop between slots frame after frame.
    const prior = previous?.get(point.id)
    const chosen = prior && isFree(prior) && Math.hypot(prior.x, prior.y) <= Math.hypot(best.x, best.y) + stickiness ? prior : best
    const x = point.position.x + chosen.x
    const y = point.position.y + chosen.y
    result.set(point.id, { x, y })
    placed.push({ left: x - halfW, right: x + halfW, top: y - halfH, bottom: y + halfH })
  }
  return { positions: result, crowded }
}
