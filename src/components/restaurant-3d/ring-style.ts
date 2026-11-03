import type { OperationalVisualState } from '@/types/restaurant-3d/operational-event'
import { VISUAL_PALETTE } from './visual-state'

/**
 * A ring is a stack of bands: a thin bright core plus wider, fainter halo
 * bands that fake bloom (real bloom needs a post-processing pass the lab
 * doesn't ship). Offsets are metres outward from the ring's base outline.
 * Colour comes from the semantic palette; strength (width and opacity) grows
 * with how loud the state is, so it never relies on colour alone.
 */
export interface RingBand {
  from: number
  to: number
  color: string
  opacity: number
}

type Strength = 'none' | 'subtle' | 'medium' | 'strong'

const RING_STRENGTH: Record<OperationalVisualState, Strength> = {
  neutral: 'none',
  active: 'subtle',
  attention: 'medium',
  checkout: 'medium',
  urgent: 'strong',
}

export function getRingBands(state: OperationalVisualState): RingBand[] {
  const { core, glow, outer } = VISUAL_PALETTE[state]
  switch (RING_STRENGTH[state]) {
    case 'none':
      return []
    case 'subtle':
      return [
        { from: 0, to: 0.04, color: core, opacity: 0.95 },
        { from: 0.04, to: 0.15, color: glow, opacity: 0.42 },
      ]
    case 'medium':
      return [
        { from: 0, to: 0.05, color: core, opacity: 0.95 },
        { from: 0.05, to: 0.16, color: glow, opacity: 0.4 },
        { from: 0.16, to: 0.34, color: outer, opacity: 0.2 },
      ]
    case 'strong':
      return [
        { from: 0, to: 0.07, color: core, opacity: 1 },
        { from: 0.07, to: 0.2, color: glow, opacity: 0.6 },
        { from: 0.2, to: 0.42, color: outer, opacity: 0.32 },
      ]
  }
}

/** Clear floor (m) between a table's chairs and the ring's base outline. */
export const RING_MARGIN = 0.65

/**
 * Selection is a thin neutral line just inside the status ring. It never
 * recolours the ring, so the operational meaning stays readable.
 */
/**
 * Editor selection: a neutral off-white outline with a faint halo, clearly
 * visible on its own (the editor shows no status rings) and never one of the
 * operational colours.
 */
export const EDITOR_SELECTION_BANDS: RingBand[] = [
  { from: 0, to: 0.05, color: '#f2eae3', opacity: 0.95 },
  { from: 0.05, to: 0.16, color: '#f2eae3', opacity: 0.22 },
]

export const SELECTION_BAND: RingBand = { from: -0.17, to: -0.13, color: '#f2eae3', opacity: 0.7 }
