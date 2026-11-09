/**
 * Tiny arc-length parameterised ground path (straights + circular arcs) used by the
 * laboratory demo. Not navigation: the route is predefined and has no obstacles logic.
 * Heading follows the tangent and is interpolated between samples, so the character
 * never snaps to a new yaw.
 */
export interface PathSample {
  x: number
  z: number
  /** Yaw in radians; forward = (sin yaw, cos yaw) on the XZ plane (three.js rotation.y). */
  yaw: number
  /** 0..1 multiplier the actor applies to walking speed (slow in tight turns). */
  speed: number
}

export class GroundPath {
  readonly length: number
  private readonly xs: number[] = []
  private readonly zs: number[] = []
  private readonly yaws: number[] = []
  private readonly speeds: number[] = []
  private readonly cum: number[] = []

  constructor(
    start: { x: number; z: number; yaw: number },
    segments: ({ line: number } | { arc: number; radius: number; speed?: number })[],
  ) {
    let { x, z } = start
    let yaw = start.yaw
    let total = 0
    const push = (speed: number) => {
      this.xs.push(x)
      this.zs.push(z)
      this.yaws.push(yaw)
      this.speeds.push(speed)
      this.cum.push(total)
    }
    push(1)
    for (const seg of segments) {
      if ('line' in seg) {
        x += Math.sin(yaw) * seg.line
        z += Math.cos(yaw) * seg.line
        total += Math.abs(seg.line)
        push(1)
      } else {
        const step = Math.PI / 36 // 5 degrees
        const steps = Math.max(1, Math.round(Math.abs(seg.arc) / step))
        const dYaw = seg.arc / steps
        const len = Math.abs(dYaw) * seg.radius
        for (let i = 0; i < steps; i++) {
          // Midpoint integration keeps the arc closed to the analytic circle.
          const mid = yaw + dYaw / 2
          x += Math.sin(mid) * len
          z += Math.cos(mid) * len
          yaw += dYaw
          total += len
          push(seg.speed ?? 0.6)
        }
      }
    }
    this.length = total
  }

  sample(distance: number, out: PathSample): PathSample {
    const d = Math.min(Math.max(distance, 0), this.length)
    let i = 1
    while (i < this.cum.length - 1 && this.cum[i] < d) i++
    const span = this.cum[i] - this.cum[i - 1] || 1
    const t = (d - this.cum[i - 1]) / span
    out.x = this.xs[i - 1] + (this.xs[i] - this.xs[i - 1]) * t
    out.z = this.zs[i - 1] + (this.zs[i] - this.zs[i - 1]) * t
    out.yaw = this.yaws[i - 1] + (this.yaws[i] - this.yaws[i - 1]) * t
    out.speed = this.speeds[i - 1] + (this.speeds[i] - this.speeds[i - 1]) * t
    return out
  }
}
