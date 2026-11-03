export interface RingMesh {
  positions: Float32Array
  indices: Uint16Array
}

const SEGMENTS_PER_CORNER = 12

/**
 * Flat band (in the XZ plane, y = 0) following a rounded rectangle with the
 * given half sizes and corner radius, between `from` and `to` metres outward.
 * A corner radius equal to the half size gives a circle. Built by hand so the
 * scene needs no direct `three` import.
 */
export function buildRingBand(
  halfWidth: number,
  halfDepth: number,
  cornerRadius: number,
  from: number,
  to: number,
): RingMesh {
  const radius = Math.min(cornerRadius, halfWidth, halfDepth)
  const corners = [
    { cx: halfWidth - radius, cz: halfDepth - radius, start: 0 },
    { cx: -(halfWidth - radius), cz: halfDepth - radius, start: Math.PI / 2 },
    { cx: -(halfWidth - radius), cz: -(halfDepth - radius), start: Math.PI },
    { cx: halfWidth - radius, cz: -(halfDepth - radius), start: (3 * Math.PI) / 2 },
  ]

  const points: [number, number, number][] = []
  for (const { cx, cz, start } of corners) {
    for (let k = 0; k <= SEGMENTS_PER_CORNER; k++) {
      const angle = start + (k / SEGMENTS_PER_CORNER) * (Math.PI / 2)
      points.push([cx, cz, angle])
    }
  }

  const positions = new Float32Array(points.length * 2 * 3)
  points.forEach(([cx, cz, angle], i) => {
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    positions.set([cx + cos * (radius + from), 0, cz + sin * (radius + from)], i * 6)
    positions.set([cx + cos * (radius + to), 0, cz + sin * (radius + to)], i * 6 + 3)
  })

  const indices = new Uint16Array(points.length * 6)
  for (let i = 0; i < points.length; i++) {
    const next = (i + 1) % points.length
    indices.set([i * 2, i * 2 + 1, next * 2, i * 2 + 1, next * 2 + 1, next * 2], i * 6)
  }
  return { positions, indices }
}
