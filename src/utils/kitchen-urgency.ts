/**
 * Presentation-only wait classification for kitchen tickets. Provisional
 * frontend visual config: it never affects ordering, status or backend rules.
 */
export const KITCHEN_WAIT_THRESHOLDS = { midSeconds: 5 * 60, longSeconds: 10 * 60 } as const

export type KitchenUrgency = 'fresh' | 'mid' | 'long' | 'unknown'

/** Classify an absolute elapsed time in seconds (never relative to other orders). */
export function kitchenUrgency(elapsedSeconds: number | null | undefined): KitchenUrgency {
  if (typeof elapsedSeconds !== 'number' || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) return 'unknown'
  if (elapsedSeconds >= KITCHEN_WAIT_THRESHOLDS.longSeconds) return 'long'
  if (elapsedSeconds >= KITCHEN_WAIT_THRESHOLDS.midSeconds) return 'mid'
  return 'fresh'
}
