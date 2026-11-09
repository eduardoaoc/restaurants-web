import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
} from 'three'
import type { NavObstacle, Pt } from './floor-nav'

/**
 * DEV-only navigation visuals. They draw the ACTUAL routes the actors walk (same points), never decoration.
 *
 *  - arrival  = green #22C55E, departure = red #EF4444
 *  - a thin ribbon hugging the floor plus small chevrons every ~0.9 m pointing in the walking direction
 *  - revealed when movement starts, trimmed as it is walked (the traversed part disappears), faded out at the end
 *
 * Geometry is built ONCE per path (reveal/trim only moves the draw range), materials are per path so each can fade,
 * and everything is disposed when the path finishes or the overlay is torn down.
 */
export const ARRIVAL_COLOR = '#22C55E'
export const DEPARTURE_COLOR = '#EF4444'
const Y = 0.035
const HALF_WIDTH = 0.035
const ARROW_EVERY = 0.9
const FADE_SECONDS = 0.6

export type PathKind = 'arrival' | 'departure'

export interface PathHandle {
  readonly id: string
  readonly kind: PathKind
  /** 0..1 fraction of the route already walked; the walked part is trimmed away. */
  setProgress(fraction: number): void
  /** Start the fade-out; the handle disposes itself afterwards. */
  finish(): void
}

interface Entry {
  handle: PathHandle
  group: Group
  ribbon: Mesh
  arrows: Mesh
  material: MeshBasicMaterial
  segments: number
  arrowCount: number
  arrowFractions: number[]
  fade: number | null
  markers: Mesh[]
}

export interface OverlayVisibility {
  paths: boolean
  arrivals: boolean
  departures: boolean
  /** Approach point (cyan) and stand point (amber) of each active route. */
  approach?: boolean
}

export interface PathMarker {
  point: Pt
  color: string
}

export class NavPathOverlay {
  readonly root = new Group()
  private readonly entries = new Map<string, Entry>()
  private visibility: OverlayVisibility = { paths: true, arrivals: true, departures: true, approach: false }
  private readonly markerGeometry = new RingGeometry(0.12, 0.2, 24)
  private readonly markerMaterials = new Map<string, MeshBasicMaterial>()

  constructor() {
    this.root.name = 'nav-paths'
  }

  /** Live path objects (for leak checks in the dev stats). */
  get count() {
    return this.entries.size
  }

  setVisibility(v: OverlayVisibility) {
    this.visibility = v
    for (const e of this.entries.values()) {
      e.group.visible = this.shown(e.handle.kind)
      for (const m of e.markers) m.visible = e.group.visible && !!v.approach
    }
  }

  private shown(kind: PathKind) {
    return this.visibility.paths && (kind === 'arrival' ? this.visibility.arrivals : this.visibility.departures)
  }

  /** Adds a path (replacing any previous one with the same id). Returns null for an unusable route. */
  add(id: string, kind: PathKind, points: readonly Pt[], markers: readonly PathMarker[] = []): PathHandle | null {
    if (points.length < 2) return null
    this.remove(id)
    const { ribbon, arrows, segments, arrowCount, arrowFractions } = build(points)
    const material = new MeshBasicMaterial({
      color: kind === 'arrival' ? ARRIVAL_COLOR : DEPARTURE_COLOR,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    const ribbonMesh = new Mesh(ribbon, material)
    const arrowMesh = new Mesh(arrows, material)
    for (const m of [ribbonMesh, arrowMesh]) {
      m.renderOrder = 2
      m.frustumCulled = false
      // Never a pointer target: paths must not affect table selection.
      m.raycast = () => {}
    }
    const group = new Group()
    group.name = `nav-path:${id}`
    group.add(ribbonMesh, arrowMesh)
    group.visible = this.shown(kind)
    const markerMeshes = markers.map((marker) => {
      let material = this.markerMaterials.get(marker.color)
      if (!material) {
        material = new MeshBasicMaterial({ color: marker.color, transparent: true, opacity: 0.9, side: DoubleSide, depthWrite: false })
        this.markerMaterials.set(marker.color, material)
      }
      const mesh = new Mesh(this.markerGeometry, material)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.set(marker.point.x, 0.045, marker.point.z)
      mesh.renderOrder = 3
      mesh.raycast = () => {}
      mesh.visible = group.visible && !!this.visibility.approach
      group.add(mesh)
      return mesh
    })
    this.root.add(group)
    const entry: Entry = {
      handle: undefined as unknown as PathHandle,
      group, ribbon: ribbonMesh, arrows: arrowMesh, material, segments, arrowCount, arrowFractions, fade: null, markers: markerMeshes,
    }
    entry.handle = {
      id,
      kind,
      setProgress: (fraction) => this.progress(entry, fraction),
      finish: () => {
        if (entry.fade === null) entry.fade = 0
      },
    }
    this.entries.set(id, entry)
    return entry.handle
  }

  private progress(e: Entry, fraction: number) {
    const f = Math.min(1, Math.max(0, fraction))
    const seg = Math.min(e.segments - 1, Math.floor(f * e.segments))
    e.ribbon.geometry.setDrawRange(seg * 6, (e.segments - seg) * 6)
    const passed = e.arrowFractions.findIndex((a) => a >= f)
    const first = passed === -1 ? e.arrowCount : passed
    e.arrows.geometry.setDrawRange(first * 3, (e.arrowCount - first) * 3 + 0)
  }

  /** Per-frame: only advances fades of finished paths (no geometry work). */
  update(dt: number): boolean {
    let active = false
    for (const e of [...this.entries.values()]) {
      if (e.fade === null) continue
      e.fade += dt
      e.material.opacity = 0.7 * (1 - Math.min(1, e.fade / FADE_SECONDS))
      if (e.fade >= FADE_SECONDS) this.remove(e.handle.id)
      else active = true
    }
    return active || [...this.entries.values()].some((e) => e.fade !== null)
  }

  /** Remove every path at once (no fade): used when movement is cancelled, e.g. entering layout editing. */
  clear() {
    for (const id of [...this.entries.keys()]) this.remove(id)
  }

  remove(id: string) {
    const e = this.entries.get(id)
    if (!e) return
    this.entries.delete(id)
    this.root.remove(e.group)
    e.ribbon.geometry.dispose()
    e.arrows.geometry.dispose()
    e.material.dispose()
  }

  dispose() {
    for (const id of [...this.entries.keys()]) this.remove(id)
    this.markerGeometry.dispose()
    this.markerMaterials.forEach((m) => m.dispose())
    this.markerMaterials.clear()
  }
}

function build(points: readonly Pt[]) {
  const n = points.length
  // Normals per point from the neighbouring segments (averaged), so corners stay a continuous ribbon.
  const dir: [number, number][] = []
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x
    const dz = points[i + 1].z - points[i].z
    const l = Math.hypot(dx, dz) || 1
    dir.push([dx / l, dz / l])
  }
  const positions: number[] = []
  const cum = [0]
  for (let i = 0; i < n; i++) {
    const a = dir[Math.max(0, i - 1)]
    const b = dir[Math.min(n - 2, i)]
    let nx = -(a[1] + b[1])
    let nz = a[0] + b[0]
    const l = Math.hypot(nx, nz) || 1
    nx /= l
    nz /= l
    positions.push(points[i].x + nx * HALF_WIDTH, Y, points[i].z + nz * HALF_WIDTH, points[i].x - nx * HALF_WIDTH, Y, points[i].z - nz * HALF_WIDTH)
    if (i) cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z))
  }
  const index: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const a = 2 * i
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const ribbon = new BufferGeometry()
  ribbon.setAttribute('position', new Float32BufferAttribute(positions, 3))
  ribbon.setIndex(index)

  // Chevrons: one triangle each, ordered along the route so a draw-range start can drop the walked ones.
  const total = cum[n - 1]
  const arrowPositions: number[] = []
  const arrowFractions: number[] = []
  let at = ARROW_EVERY / 2
  let seg = 0
  while (at < total - 0.2) {
    while (seg < n - 2 && cum[seg + 1] < at) seg++
    const t = (at - cum[seg]) / ((cum[seg + 1] - cum[seg]) || 1)
    const [dx, dz] = dir[seg]
    const x = points[seg].x + (points[seg + 1].x - points[seg].x) * t
    const z = points[seg].z + (points[seg + 1].z - points[seg].z) * t
    const nx = -dz
    const nz = dx
    arrowPositions.push(
      x + dx * 0.12, Y + 0.002, z + dz * 0.12,
      x - dx * 0.06 + nx * 0.09, Y + 0.002, z - dz * 0.06 + nz * 0.09,
      x - dx * 0.06 - nx * 0.09, Y + 0.002, z - dz * 0.06 - nz * 0.09,
    )
    arrowFractions.push(at / total)
    at += ARROW_EVERY
  }
  const arrows = new BufferGeometry()
  arrows.setAttribute('position', new Float32BufferAttribute(arrowPositions, 3))
  return { ribbon, arrows, segments: n - 1, arrowCount: arrowFractions.length, arrowFractions }
}

/** Inflated obstacle outlines (what the planner treats as blocked) as ONE line-segment draw call. */
export class ObstacleOverlay {
  readonly object = new LineSegments()
  private material = new LineBasicMaterial({ color: '#F59E0B', transparent: true, opacity: 0.65, depthWrite: false })

  constructor() {
    this.object.material = this.material
    this.object.name = 'nav-obstacles'
    this.object.frustumCulled = false
    this.object.raycast = () => {}
  }

  set(obstacles: readonly NavObstacle[], grow: number, floor: { width: number; depth: number }, margin: number) {
    const v: number[] = []
    const seg = (a: [number, number], b: [number, number]) => v.push(a[0], 0.02, a[1], b[0], 0.02, b[1])
    for (const o of obstacles) {
      if (o.kind === 'circle') {
        const r = o.r + grow
        for (let i = 0; i < 40; i++) {
          const a0 = (i / 40) * Math.PI * 2
          const a1 = ((i + 1) / 40) * Math.PI * 2
          seg([o.x + Math.cos(a0) * r, o.z + Math.sin(a0) * r], [o.x + Math.cos(a1) * r, o.z + Math.sin(a1) * r])
        }
      } else {
        const hx = o.hx + grow
        const hz = o.hz + grow
        const c = Math.cos(o.yaw)
        const s = Math.sin(o.yaw)
        // local -> world for rotation about +Y: x = lx cos + lz sin, z = -lx sin + lz cos
        const w = (lx: number, lz: number): [number, number] => [o.x + lx * c + lz * s, o.z - lx * s + lz * c]
        const corners = [w(-hx, -hz), w(hx, -hz), w(hx, hz), w(-hx, hz)]
        for (let i = 0; i < 4; i++) seg(corners[i], corners[(i + 1) % 4])
      }
    }
    // Walkable-floor boundary (floor edge minus margin).
    const hx = floor.width / 2 - margin
    const hz = floor.depth / 2 - margin
    const b: [number, number][] = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]]
    for (let i = 0; i < 4; i++) seg(b[i], b[(i + 1) % 4])
    this.object.geometry.dispose()
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(v, 3))
    this.object.geometry = geometry
  }

  dispose() {
    this.object.geometry.dispose()
    this.material.dispose()
  }
}

/** Flat ring + inward arrow marking the configured entrance. Colour: white (dev marker, not part of the paths). */
export class EntranceMarker {
  readonly object = new Group()
  private readonly geometry = new RingGeometry(0.28, 0.36, 32)
  private readonly material = new MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.85, side: DoubleSide, depthWrite: false })
  private readonly dot = new Mesh(new RingGeometry(0, 0.1, 24), this.material)

  constructor() {
    const ring = new Mesh(this.geometry, this.material)
    for (const m of [ring, this.dot]) {
      m.rotation.x = -Math.PI / 2
      m.position.y = 0.04
      m.renderOrder = 3
      m.raycast = () => {}
    }
    this.object.add(ring, this.dot)
    this.object.name = 'nav-entrance'
  }

  set(position: Pt, valid: boolean) {
    this.object.position.set(position.x, 0, position.z)
    // Same marker, different tint when the entrance is not usable.
    this.material.color.set(valid ? '#FFFFFF' : '#EF4444')
  }

  dispose() {
    this.geometry.dispose()
    this.dot.geometry.dispose()
    this.material.dispose()
  }
}
