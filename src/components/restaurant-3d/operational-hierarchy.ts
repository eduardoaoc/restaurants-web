import type { OperationalPriority, OperationalVisualState } from '@/types/restaurant-3d/operational-event'

/**
 * Presentation order of the 3D overlays — which one wins when two compete for the same pixels. It ranks what the
 * backend already says; it adds no status, metric or meaning.
 *
 *   1 critical alerts (priority `critical`)
 *   2 waiter requests and excessive waiting (`urgent`)
 *   3 orders ready / needing attention (`attention`)
 *   4 bill requests (`checkout`)
 *   5 occupancy and normal activity (`active`, `neutral`, the table label)
 *   (decoration never draws above any of these: it is not a DOM overlay)
 */
export type OperationalTier = 1 | 2 | 3 | 4 | 5

export function eventTier(priority: OperationalPriority, visualState: OperationalVisualState): OperationalTier {
  if (priority === 'critical') return 1
  switch (visualState) {
    case 'urgent': return 2
    case 'attention': return 3
    case 'checkout': return 4
    default: return 5
  }
}

/** Backend Operations Live flags carry a presentation tone; it maps onto the same tiers. */
export function flagTier(tone: 'urgent' | 'attention' | 'checkout'): OperationalTier {
  return tone === 'urgent' ? 2 : tone === 'attention' ? 3 : 4
}

/**
 * `Html` z-index range per tier, `[nearest, farthest]`. The ranges are disjoint, so a higher tier is always drawn over a
 * lower one wherever they overlap, whatever their distance to the camera. Table labels (tier 5, no event) sit at 10..0.
 */
export function tierZRange(tier: OperationalTier): [number, number] {
  const top = 100 - (tier - 1) * 15
  return [top, top - 12]
}

export const LABEL_Z_RANGE: [number, number] = [10, 0]

/** Rim thickness (px): the louder the tier, the thicker the ring around its pill. */
export function tierRimPx(tier: OperationalTier): number {
  return tier <= 2 ? 4 : tier <= 4 ? 3 : 2
}
