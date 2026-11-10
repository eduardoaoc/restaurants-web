/**
 * How far back (relative to the desktop pose) the camera sits so the 20 x 16 m floor stays readable in a scene of the
 * given aspect ratio. 1 on wide scenes; grows on narrow/portrait ones, capped so the floor never shrinks to a speck.
 */
export function cameraFit(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return 1
  return Math.min(2.1, Math.max(1, 1 + (1.6 - aspect) * 0.7))
}
