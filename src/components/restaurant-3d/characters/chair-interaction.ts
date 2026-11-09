/**
 * Chair interaction model (Phase 3.1F). Pure TypeScript: no three.js, no Vue, deterministic.
 *
 * WHY THE CHAIR TRAVELS 1.1 m: chairs stand in a row 0.6 m apart with their fronts tucked 0.04 m under the table, so
 * there is no way to step between a chair and the table, or to walk through the chair's lane from behind. Real people
 * pull the chair back out of the row and step into the freed space from the SIDE. We do the same: the chair translates
 * along its own axis until it is clear of the row (back face behind the neighbours' backrests), the customer walks
 * around it through open floor, stands where the tucked chair used to be and sits back onto the pulled-out seat; then
 * the chair (with the customer on it) is scooted back to the table. Nobody ever crosses the chair or the table.
 */

/** How far (m) the chair is pulled out along its own axis, away from the table. */
export const CHAIR_PULL = 1.1
/** Seconds to pull the chair out / to scoot it back in. Eased (smoothstep); 1.1 m in 0.6 s peaks near 2.7 m/s. */
export const PULL_SECONDS = 0.6
export const PUSH_SECONDS = 0.85
/** Lateral distance (m, chair-local) of the customer's walking line beside the chair lane. */
export const SIDE_X = 0.62
/** Chair-local Z of the approach point behind the chair row (open floor). */
export const BEHIND_Z = -1.55
/** Radius (m) of the small pivot the customer makes to face (or leave) the table. */
export const PIVOT_RADIUS = 0.1

export const smoothstep = (t: number) => {
  const c = Math.min(1, Math.max(0, t))
  return c * c * (3 - 2 * c)
}

/**
 * One chair's translation along its axis. `offset` is 0 when tucked in and -CHAIR_PULL when pulled out. It moves between
 * two offsets with smoothstep easing and can be retargeted mid-way from wherever it is (no jumps). An owner token makes
 * sure that only the customer who currently uses the chair can command it (a new customer taking over a seat wins).
 */
export class ChairMotion {
  offset = 0
  private from = 0
  private to = 0
  private elapsed = 0
  private duration = 0
  owner: string | null = null

  get moving() {
    return this.elapsed < this.duration
  }

  get atHome() {
    return this.offset === 0 && !this.moving
  }

  get target() {
    return this.to
  }

  /** The caller becomes the chair's owner (previous owner loses control). */
  claim(owner: string) {
    this.owner = owner
  }

  /** Move to `target` over `seconds`, from the current offset. Ignored unless `owner` is the current owner. */
  moveTo(owner: string, target: number, seconds: number) {
    if (this.owner !== owner) return
    this.from = this.offset
    this.to = target
    this.elapsed = 0
    this.duration = Math.max(1e-6, seconds)
    if (Math.abs(target - this.offset) < 1e-9) {
      this.elapsed = this.duration
      this.offset = target
    }
  }

  /** The owner is done: bring the chair home (if it is not already) and give up ownership. */
  returnHome(owner: string, seconds = PUSH_SECONDS) {
    if (this.owner !== owner) return
    this.moveTo(owner, 0, seconds)
    this.owner = null
  }

  /** Cancellation: jump home immediately (edit mode, table removed). */
  snapHome() {
    this.offset = 0
    this.from = 0
    this.to = 0
    this.elapsed = this.duration = 0
    this.owner = null
  }

  /** @returns true while the chair is moving or is away from home with someone still using it. */
  update(dt: number): boolean {
    if (this.elapsed < this.duration) {
      this.elapsed = Math.min(this.duration, this.elapsed + dt)
      const k = smoothstep(this.elapsed / this.duration)
      this.offset = this.from + (this.to - this.from) * k
      if (this.elapsed >= this.duration) this.offset = this.to
    }
    return this.moving || this.offset !== 0 || this.owner !== null
  }

  /** Settled at home and nobody owns it: the owner of the animation can release the temporary chair. */
  get idle() {
    return this.atHome && this.owner === null
  }
}
