import type { FloorPosition, RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'
import { FLOOR } from '../floor'
import { CHAIR_SEAT_SIZE, getChairPlacements, getTableDimensions } from '../table-geometry'

/**
 * Lightweight 2D navigation for the restaurant floor (Phase 3.1E). Pure TypeScript, no three.js, no Vue:
 * a uniform grid rasterised from the REAL furniture footprints (table tops, every chair, rotated), A* over
 * 8 neighbours, line-of-sight string pulling, then corner rounding. A heavy navmesh engine is not justified:
 * the floor is a few hundred square metres with convex obstacles.
 */
export interface NavFloor {
  width: number
  depth: number
}

export type NavObstacle =
  | { kind: 'circle'; x: number; z: number; r: number; tableId: string; chairIndex?: undefined }
  | { kind: 'rect'; x: number; z: number; hx: number; hz: number; yaw: number; tableId: string; chairIndex?: number }

export interface NavOptions {
  /** Grid cell size (m). */
  cell: number
  /** Body radius + margin kept from any furniture (m). */
  clearance: number
  /** Distance kept from the floor edges (m). */
  margin: number
}

export const DEFAULT_NAV: NavOptions = { cell: 0.15, clearance: 0.3, margin: 0.4 }

/** Furniture of every table: its top (round -> circle, else rotated rect) and one rect per chair. */
export function obstaclesFromTables(tables: readonly RestaurantTableConfig[]): NavObstacle[] {
  const out: NavObstacle[] = []
  for (const table of tables) {
    const theta = (table.rotation * Math.PI) / 180
    const sin = Math.sin(theta)
    const cos = Math.cos(theta)
    const { width, depth } = getTableDimensions(table.shape, table.seats)
    if (table.shape === 'round') out.push({ kind: 'circle', x: table.position.x, z: table.position.z, r: width / 2, tableId: table.id })
    else out.push({ kind: 'rect', x: table.position.x, z: table.position.z, hx: width / 2, hz: depth / 2, yaw: theta, tableId: table.id })
    for (const [chairIndex, chair] of getChairPlacements(table).entries()) {
      out.push({
        chairIndex,
        kind: 'rect',
        x: table.position.x + chair.x * cos + chair.z * sin,
        z: table.position.z - chair.x * sin + chair.z * cos,
        hx: CHAIR_SEAT_SIZE / 2,
        hz: CHAIR_SEAT_SIZE / 2,
        yaw: theta + chair.rotationY,
        tableId: table.id,
      })
    }
  }
  return out
}

/** Signed "how far inside" test used both by the grid and by validation: > 0 means inside (inflated by `grow`). */
export function insideObstacle(o: NavObstacle, x: number, z: number, grow: number): boolean {
  const dx = x - o.x
  const dz = z - o.z
  if (o.kind === 'circle') return Math.hypot(dx, dz) < o.r + grow
  // Rotation about +Y (three.js): local x = dx cos - dz sin, local z = dx sin + dz cos.
  const c = Math.cos(o.yaw)
  const s = Math.sin(o.yaw)
  const lx = dx * c - dz * s
  const lz = dx * s + dz * c
  return Math.abs(lx) < o.hx + grow && Math.abs(lz) < o.hz + grow
}

export interface Pt {
  x: number
  z: number
}

export class NavGrid {
  readonly cols: number
  readonly rows: number
  readonly options: NavOptions
  private readonly blocked: Uint8Array
  /** Temporary obstacles for ONE findPath query (e.g. a chair that is pulled out right now). */
  private extras: readonly NavObstacle[] = []
  private readonly minX: number
  private readonly minZ: number

  readonly floor: NavFloor
  readonly obstacles: readonly NavObstacle[]

  constructor(floor: NavFloor, obstacles: readonly NavObstacle[], options: Partial<NavOptions> = {}) {
    this.floor = floor
    this.obstacles = obstacles
    this.options = { ...DEFAULT_NAV, ...options }
    this.cols = Math.ceil(floor.width / this.options.cell)
    this.rows = Math.ceil(floor.depth / this.options.cell)
    this.minX = -floor.width / 2
    this.minZ = -floor.depth / 2
    this.blocked = new Uint8Array(this.cols * this.rows)
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        // Conservative: a cell is blocked if ANY of 9 samples (centre, corners, edge midpoints) is not free, so a
        // chord between two free cells cannot clip a thin sliver of inflated furniture.
        const p = this.center(c, r)
        const h = this.options.cell / 2
        let free = true
        for (const dx of [-h, 0, h]) for (const dz of [-h, 0, h]) if (free && !this.pointFree(p.x + dx, p.z + dz)) free = false
        if (!free) this.blocked[r * this.cols + c] = 1
      }
    }
  }

  /**
   * Free-space test for SCRIPTED movement next to a seat (the side approach): body-sized `clearance` and optionally
   * ignoring the customer's own chair (it is pulled out of the way, so its tucked footprint no longer applies).
   */
  pointFreeFor(x: number, z: number, opts: { clearance?: number; ignore?: { tableId: string; chairIndex: number } } = {}): boolean {
    const m = this.options.margin
    if (Math.abs(x) > this.floor.width / 2 - m || Math.abs(z) > this.floor.depth / 2 - m) return false
    const grow = opts.clearance ?? this.options.clearance
    for (const o of this.obstacles) {
      if (opts.ignore && o.tableId === opts.ignore.tableId && o.chairIndex === opts.ignore.chairIndex) continue
      if (insideObstacle(o, x, z, grow)) return false
    }
    return true
  }

  /** Exact (not cell-quantised) free-space test: inside the floor margin and outside inflated furniture. */
  pointFree(x: number, z: number): boolean {
    const m = this.options.margin
    if (Math.abs(x) > this.floor.width / 2 - m || Math.abs(z) > this.floor.depth / 2 - m) return false
    // 0.1 mm of slack so a route can never sit exactly on an obstacle boundary (floating point would make it 'inside').
    for (const o of this.obstacles) if (insideObstacle(o, x, z, this.options.clearance + 1e-4)) return false
    for (const o of this.extras) if (insideObstacle(o, x, z, this.options.clearance + 1e-4)) return false
    return true
  }

  center(c: number, r: number): Pt {
    return { x: this.minX + (c + 0.5) * this.options.cell, z: this.minZ + (r + 0.5) * this.options.cell }
  }

  private cellOf(p: Pt): [number, number] {
    return [
      Math.min(this.cols - 1, Math.max(0, Math.floor((p.x - this.minX) / this.options.cell))),
      Math.min(this.rows - 1, Math.max(0, Math.floor((p.z - this.minZ) / this.options.cell))),
    ]
  }

  private free(c: number, r: number): boolean {
    if (!(c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.blocked[r * this.cols + c] === 0)) return false
    if (this.extras.length) {
      const p = this.center(c, r)
      // Conservative for the cell: grow by the clearance plus the cell's half diagonal.
      for (const o of this.extras) if (insideObstacle(o, p.x, p.z, this.options.clearance + this.options.cell * 0.71)) return false
    }
    return true
  }

  /** Segment is walkable when sampled points (every ~third of a cell) are all free. */
  lineFree(a: Pt, b: Pt): boolean {
    const step = this.options.cell / 3
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const n = Math.max(1, Math.ceil(len / step))
    for (let i = 0; i <= n; i++) {
      const t = i / n
      if (!this.pointFree(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false
    }
    return true
  }

  /** Nearest free cell centre to `p` within `radius` metres, or null. */
  nearestFree(p: Pt, radius: number): Pt | null {
    if (this.pointFree(p.x, p.z)) return p
    const [c0, r0] = this.cellOf(p)
    const maxRing = Math.ceil(radius / this.options.cell)
    let best: Pt | null = null
    let bestD = Infinity
    for (let ring = 1; ring <= maxRing; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue
          if (!this.free(c0 + dc, r0 + dr)) continue
          const q = this.center(c0 + dc, r0 + dr)
          const d = Math.hypot(q.x - p.x, q.z - p.z)
          if (d < bestD) {
            bestD = d
            best = q
          }
        }
      }
      if (best && bestD <= ring * this.options.cell) break
    }
    return best && bestD <= radius ? best : null
  }

  /**
   * Shortest smooth route from `from` to `to`, or null when none exists (never a teleport/straight cheat).
   * Both endpoints must be free; callers choose them via `nearestFree`/`validateEntrance`.
   */
  findPath(from: Pt, to: Pt, hints: { startDir?: Pt; endDir?: Pt; avoid?: readonly NavObstacle[] } = {}): Pt[] | null {
    this.extras = hints.avoid ?? []
    try {
      return this.findPathInner(from, to, hints)
    } finally {
      this.extras = []
    }
  }

  private findPathInner(from: Pt, to: Pt, hints: { startDir?: Pt; endDir?: Pt }): Pt[] | null {
    if (!this.pointFree(from.x, from.z) || !this.pointFree(to.x, to.z)) return null
    // Optional lead-in/lead-out along a direction (unit vector): the route is forced to leave `from` / arrive at `to`
    // along it, and the corner where it joins the A* route is rounded like any other. Skipped when the lead point is
    // not free floor or not reachable in a straight line.
    const LEAD = 0.9
    const lead = (origin: Pt, dir: Pt | undefined, sign: 1 | -1): Pt | null => {
      if (!dir) return null
      for (const len of [LEAD, LEAD / 2]) {
        const w = { x: origin.x + sign * dir.x * len, z: origin.z + sign * dir.z * len }
        if (this.pointFree(w.x, w.z) && this.lineFree(origin, w)) return w
      }
      return null
    }
    const startLead = lead(from, hints.startDir, 1)
    const endLead = lead(to, hints.endDir, -1)
    const a = startLead ?? from
    const b = endLead ?? to
    const core = this.route(a, b)
    if (!core) return null
    const raw: Pt[] = [...(startLead ? [from] : []), ...core, ...(endLead ? [to] : [])]
    const pulled = startLead || endLead ? this.pullKeeping(raw, startLead ? 1 : 0, endLead ? raw.length - 2 : raw.length - 1) : raw
    const rounded = this.round(pulled)
    const result = rounded.every((q) => this.pointFree(q.x, q.z)) ? rounded : this.resample(pulled)
    // Never hand out a route that touches furniture: report "no route" instead.
    return result.every((q) => this.pointFree(q.x, q.z)) ? result : null
  }

  /** Like `pull` but never removes the lead-in / lead-out vertices, so the entry direction is preserved. */
  private pullKeeping(points: Pt[], first: number, last: number): Pt[] {
    const inner = this.pull(points.slice(first, last + 1))
    return [...points.slice(0, first), ...inner, ...points.slice(last + 1)]
  }

  /**
   * The free cell a point connects to. The grid is conservative, so a perfectly free point can sit in a "blocked"
   * cell (e.g. right at a clearance edge): then use the nearest free cell centre that has a clear line to it.
   */
  private anchorCell(p: Pt): [number, number] | null {
    const [c0, r0] = this.cellOf(p)
    if (this.free(c0, r0)) return [c0, r0]
    for (let ring = 1; ring <= 4; ring++) {
      let best: [number, number] | null = null
      let bestD = Infinity
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring || !this.free(c0 + dc, r0 + dr)) continue
          const q = this.center(c0 + dc, r0 + dr)
          const d = Math.hypot(q.x - p.x, q.z - p.z)
          if (d < bestD && this.lineFree(p, q)) {
            bestD = d
            best = [c0 + dc, r0 + dr]
          }
        }
      }
      if (best) return best
    }
    return null
  }

  /** A* + string pulling between two free points (no rounding). */
  private route(from: Pt, to: Pt): Pt[] | null {
    if (this.lineFree(from, to)) return [from, to]
    const start = this.anchorCell(from)
    const goal = this.anchorCell(to)
    if (!start || !goal) return null
    const cells = this.astar(start[0], start[1], goal[0], goal[1])
    if (!cells) return null
    const raw: Pt[] = [from, ...cells.slice(1, -1).map(([c, r]) => this.center(c, r)), to]
    return this.pull(raw)
  }

  private astar(sc: number, sr: number, tc: number, tr: number): [number, number][] | null {
    const W = this.cols
    const size = W * this.rows
    const g = new Float32Array(size).fill(Infinity)
    const parent = new Int32Array(size).fill(-1)
    const closed = new Uint8Array(size)
    const heap: { f: number; i: number }[] = []
    const push = (f: number, i: number) => {
      heap.push({ f, i })
      let k = heap.length - 1
      while (k > 0) {
        const p = (k - 1) >> 1
        if (heap[p].f <= heap[k].f) break
        ;[heap[p], heap[k]] = [heap[k], heap[p]]
        k = p
      }
    }
    const pop = () => {
      const top = heap[0]
      const last = heap.pop()!
      if (heap.length) {
        heap[0] = last
        let k = 0
        for (;;) {
          const l = 2 * k + 1
          const r = l + 1
          let m = k
          if (l < heap.length && heap[l].f < heap[m].f) m = l
          if (r < heap.length && heap[r].f < heap[m].f) m = r
          if (m === k) break
          ;[heap[m], heap[k]] = [heap[k], heap[m]]
          k = m
        }
      }
      return top
    }
    const h = (c: number, r: number) => {
      const dx = Math.abs(c - tc)
      const dz = Math.abs(r - tr)
      return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)
    }
    const start = sr * W + sc
    g[start] = 0
    push(h(sc, sr), start)
    while (heap.length) {
      const { i } = pop()
      if (closed[i]) continue
      closed[i] = 1
      const c = i % W
      const r = (i - c) / W
      if (c === tc && r === tr) {
        const out: [number, number][] = []
        for (let k = i; k !== -1; k = parent[k]) out.push([k % W, Math.floor(k / W)])
        return out.reverse()
      }
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dc && !dr) continue
          const nc = c + dc
          const nr = r + dr
          if (!this.free(nc, nr)) continue
          // No cutting corners between two blocked cells.
          if (dc && dr && (!this.free(c + dc, r) || !this.free(c, r + dr))) continue
          const ni = nr * W + nc
          const cost = g[i] + (dc && dr ? Math.SQRT2 : 1)
          if (cost < g[ni]) {
            g[ni] = cost
            parent[ni] = i
            push(cost + h(nc, nr), ni)
          }
        }
      }
    }
    return null
  }

  /** String pulling: drop every waypoint that has a clear line between its neighbours. */
  private pull(points: Pt[]): Pt[] {
    const out: Pt[] = [points[0]]
    let anchor = 0
    for (let i = 2; i < points.length; i++) {
      if (!this.lineFree(points[anchor], points[i])) {
        out.push(points[i - 1])
        anchor = i - 1
      }
    }
    out.push(points[points.length - 1])
    return out
  }

  /**
   * Rounds corners with quadratic Béziers, then resamples every ~0.1 m. A corner is only rounded when
   * every sample of the curve stays free; otherwise it stays a (sharp but safe) corner.
   */
  private round(points: Pt[]): Pt[] {
    if (points.length < 3) return this.resample(points)
    const out: Pt[] = [points[0]]
    for (let i = 1; i < points.length - 1; i++) {
      const p0 = points[i - 1]
      const p1 = points[i]
      const p2 = points[i + 1]
      const l1 = Math.hypot(p1.x - p0.x, p1.z - p0.z)
      const l2 = Math.hypot(p2.x - p1.x, p2.z - p1.z)
      let radius = Math.min(0.7, l1 / 2, l2 / 2)
      let curve: Pt[] | null = null
      while (radius > 0.05 && !curve) {
        const a = { x: p1.x + ((p0.x - p1.x) / l1) * radius, z: p1.z + ((p0.z - p1.z) / l1) * radius }
        const b = { x: p1.x + ((p2.x - p1.x) / l2) * radius, z: p1.z + ((p2.z - p1.z) / l2) * radius }
        const samples: Pt[] = []
        for (let k = 0; k <= 24; k++) {
          const t = k / 24
          samples.push({
            x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * p1.x + t * t * b.x,
            z: (1 - t) * (1 - t) * a.z + 2 * (1 - t) * t * p1.z + t * t * b.z,
          })
        }
        // Every sample AND every midpoint between samples must be free (a chord can clip a convex corner).
        const dense = samples.flatMap((s, i) => (i ? [{ x: (s.x + samples[i - 1].x) / 2, z: (s.z + samples[i - 1].z) / 2 }, s] : [s]))
        if (dense.every((s) => this.pointFree(s.x, s.z))) curve = samples
        else radius /= 2
      }
      out.push(...(curve ?? [p1]))
    }
    out.push(points[points.length - 1])
    return this.resample(out)
  }

  private resample(points: Pt[]): Pt[] {
    const out: Pt[] = [points[0]]
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]
      const b = points[i]
      // Zero-length segments would give an undefined heading: drop duplicated points.
      if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-6) continue
      const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 0.1))
      for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n })
    }
    return out
  }
}

export function buildNavGrid(tables: readonly RestaurantTableConfig[], options?: Partial<NavOptions>, floor: NavFloor = FLOOR): NavGrid {
  return new NavGrid(floor, obstaclesFromTables(tables), options)
}

export type EntranceIssue = 'outside_floor' | 'blocked_by_furniture'

/** An entrance must be inside the walkable floor (not in the edge margin, not inside furniture clearance). */
export function validateEntrance(grid: NavGrid, entrance: FloorPosition): { ok: true } | { ok: false; reason: EntranceIssue } {
  const half = { x: grid.floor.width / 2, z: grid.floor.depth / 2 }
  if (Math.abs(entrance.x) > half.x - grid.options.margin || Math.abs(entrance.z) > half.z - grid.options.margin) {
    return { ok: false, reason: 'outside_floor' }
  }
  return grid.pointFree(entrance.x, entrance.z) ? { ok: true } : { ok: false, reason: 'blocked_by_furniture' }
}
