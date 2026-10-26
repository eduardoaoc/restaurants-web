export interface PlacementRect { top: number; bottom: number; left: number; right: number }

/** Find room for the whole message between visible actions, without covering
 * a CTA or focused control. null means wait for room, keeping the queue paused.
 */
export function findSnackbarTop(
  bounds: PlacementRect, height: number, obstacles: PlacementRect[], gap: number,
): number | null {
  if (height > bounds.bottom - bounds.top) return null
  const occupied = obstacles.filter(rect => rect.right > bounds.left && rect.left < bounds.right && rect.bottom > bounds.top && rect.top < bounds.bottom)
    .map(rect => ({ top: Math.max(bounds.top, rect.top - gap), bottom: Math.min(bounds.bottom, rect.bottom + gap) }))
    .sort((a, b) => a.top - b.top)
  const gaps: { top: number; bottom: number }[] = []
  let start = bounds.top
  for (const rect of occupied) {
    if (rect.top > start) gaps.push({ top: start, bottom: rect.top })
    start = Math.max(start, rect.bottom)
  }
  if (start < bounds.bottom) gaps.push({ top: start, bottom: bounds.bottom })
  // Prefer the bottom slot (above navigation), then the next free slot up.
  const slot = gaps.reverse().find(region => region.bottom - region.top >= height)
  return slot ? slot.bottom - height : null
}
