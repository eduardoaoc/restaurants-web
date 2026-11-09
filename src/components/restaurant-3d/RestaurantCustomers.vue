<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { useLoop, useTres } from '@tresjs/core'
import { Group, type Mesh, Vector3 } from 'three'
import type { FloorPosition, RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'
import type { RestaurantOperationalState } from '@/types/restaurant-3d/restaurant-operations'
import { AnimationLod } from './characters/animation-lod'
import { ChairMotion } from './characters/chair-interaction'
import { disposeUnusedCharacters } from './characters/character-loader'
import {
  computeCustomerPlacements,
  customerPhase,
  customerVariant,
  seatFrameOf,
  TABLE_CHAIR_SPEC,
  type CustomerPlacement,
} from './characters/customer-placement'
import { GuestActor } from './characters/guest-actor'
import { createChairProp, disposeChairPropResources, placeChairProp } from './characters/table-chair-prop'
import { buildNavGrid, validateEntrance } from './navigation/floor-nav'
import { EntranceMarker, NavPathOverlay, ObstacleOverlay, type OverlayVisibility, type PathHandle, type PathMarker } from './navigation/path-overlay'
import { planArrival, planDeparture, RoutePath, type SeatFrame } from './navigation/route-path'
import { FLOOR } from './floor'

/**
 * Animated customers for the operational floor (3.1D seated, 3.1E arrival/departure, 3.1F chair interaction).
 *
 * Source of truth is ALWAYS the operational state: this component only mirrors it. A guest that is in the state
 * has an actor (seated, or walking in to its seat); a guest that left the state keeps a purely visual actor until
 * it has walked out, so a departure animation can never delay or alter an operational update. Guests present when
 * the scene is first built are seated immediately: arrivals are never replayed on mount/refresh.
 *
 * Chairs: when a customer needs to sit or stand, the production chair of that seat is swapped for an identical
 * temporary chair (one `ChairMotion` per seat) that is TRANSLATED along its axis (never scaled). The swap is
 * invisible; the temporary chair is released only once it is home and nobody owns it, whatever happened to the actor.
 */
export interface CustomerStats {
  customers: number
  arrivals: number
  departures: number
  navFailures: number
  lastFailure: string
  pathObjects: number
  /** Temporary chairs currently in use (pulled out / moving). */
  chairs: number
  /** One entry per customer that is not simply seated: `id phase (chair offset)`. */
  phases: string[]
  mixers: number
  animMs: number
  /** Mean CPU ms per frame spent moving the temporary chairs (the cost added by chair interaction). */
  chairMs: number
  fps: number
  calls: number
  triangles: number
  geometries: number
  textures: number
}

export interface NavDebugOptions extends OverlayVisibility {
  obstacles: boolean
  /** Simulation speed (1 = real time, 0 = paused, 0.25 = slow motion). Only honoured in dev builds. */
  timeScale?: number
}

const props = defineProps<{
  tables: readonly RestaurantTableConfig[]
  states: RestaurantOperationalState
  /** Operation mode on; false (layout editing) hides every customer and cancels movement. */
  enabled: boolean
  /** Where customers come in and leave. null = no arrival/departure animation (instant, as in 3.1D). */
  entrance?: FloorPosition | null
  /** DEV only: which navigation visuals to draw / how fast to run. Absent in production. */
  debug?: NavDebugOptions
}>()
const emit = defineEmits<{
  stats: [value: CustomerStats]
  failed: [message: string]
  chairsHidden: [value: Record<string, number[]>]
  entrance: [value: { ok: boolean; reason?: string }]
  navFailure: [message: string]
}>()

const { renderer, camera, sizes } = useTres()
const { onBeforeRender } = useLoop()

const root = new Group()
root.name = 'customers'
const overlay = new NavPathOverlay()
const obstacleLines = new ObstacleOverlay()
const marker = new EntranceMarker()
if (import.meta.env.DEV) root.add(overlay.root, obstacleLines.object, marker.object)

interface Mover {
  motion: ChairMotion
  mesh: Mesh
  tableId: string
  seatIndex: number
  seat: SeatFrame
}

const actors = new Map<string, GuestActor>() // guests present in the operational state
const leaving = new Map<string, GuestActor>() // visual-only: guest already removed from the state
const pending = new Set<string>() // queued or loading (never duplicated)
const handles = new Map<string, PathHandle>()
const movers = new Map<string, Mover>() // one temporary chair per seat in use
// Routes planned but not walking yet: the dev path is revealed when movement actually starts.
const pendingPaths = new Map<string, { kind: 'arrival' | 'departure'; points: { x: number; z: number }[]; markers: PathMarker[] }>()
let queue: CustomerPlacement[] = []
let desired = new Map<string, CustomerPlacement>()
let lastSeen = new Map<string, CustomerPlacement>()
let list: GuestActor[] = []
let alive = true
let initialized = false
let reportedFailure = false
let lastEntranceKey = ''
let simMs = 0
let nextSpawnAt = 0
let navFailures = 0
let lastFailure = ''
const STAGGER_MS = 1300
const lod = new AnimationLod()
const APPROACH_COLOR = '#22D3EE'
const STAND_COLOR = '#F59E0B'

const placements = computed(() => computeCustomerPlacements(props.tables, props.states))
// The grid is rebuilt only when the layout (tables) changes; computed caches it otherwise.
const grid = computed(() => buildNavGrid(props.tables))
const entrancePoint = computed(() => props.entrance ?? null)
const entranceOk = computed(() => (entrancePoint.value ? validateEntrance(grid.value, entrancePoint.value) : null))

function refreshList() {
  list = [...actors.values(), ...leaving.values()]
}

const seatOf = (p: CustomerPlacement): SeatFrame => ({
  x: p.x,
  z: p.z,
  yaw: p.yaw,
  ref: { tableId: p.tableId, chairIndex: p.seatIndex },
})

function fail(message: string) {
  navFailures++
  lastFailure = message
  emit('navFailure', message)
  if (import.meta.env.DEV) console.warn(`[restaurant-3d] navigation: ${message}`)
}

// ---- temporary chairs ---------------------------------------------------------------------------------------------

const moverKey = (tableId: string, seatIndex: number) => `${tableId}:${seatIndex}`

function publishChairs() {
  const out: Record<string, number[]> = {}
  for (const m of movers.values()) (out[m.tableId] ??= []).push(m.seatIndex)
  emit('chairsHidden', out)
}

/** The motion of a seat's chair, creating the temporary chair (and hiding the production one) on first use. */
function chairMotion(tableId: string, seatIndex: number): ChairMotion | null {
  const key = moverKey(tableId, seatIndex)
  const existing = movers.get(key)
  if (existing) return existing.motion
  const seat = seatFrameOf(props.tables, tableId, seatIndex)
  // A seat that no longer exists (table deleted): the actor falls back to a detached motion (no visuals).
  if (!seat) return null
  const mover: Mover = { motion: new ChairMotion(), mesh: createChairProp(), tableId, seatIndex, seat }
  placeChairProp(mover.mesh, seat, 0)
  root.add(mover.mesh)
  movers.set(key, mover)
  publishChairs()
  return mover.motion
}

function releaseMover(key: string) {
  const m = movers.get(key)
  if (!m) return
  root.remove(m.mesh)
  m.motion.snapHome()
  movers.delete(key)
  publishChairs()
}

function releaseAllMovers() {
  if (!movers.size) return
  for (const key of [...movers.keys()]) releaseMover(key)
}

function updateMovers(dt: number) {
  for (const [key, m] of movers) {
    m.motion.update(dt)
    placeChairProp(m.mesh, m.seat, m.motion.offset)
    // Home and unowned: hand the seat back to the production chair (identical geometry, invisible swap).
    if (m.motion.idle) releaseMover(key)
  }
}

// ---- actors -------------------------------------------------------------------------------------------------------

function wire(actor: GuestActor) {
  actor.chairProvider = (create) =>
    create ? chairMotion(actor.tableId, actor.seatIndex) : (movers.get(moverKey(actor.tableId, actor.seatIndex))?.motion ?? null)
  actor.onGone = () => retire(actor)
  root.add(actor.group)
}

function retire(actor: GuestActor) {
  handles.get(actor.guestId)?.finish()
  handles.delete(actor.guestId)
  pendingPaths.delete(actor.guestId)
  leaving.delete(actor.guestId)
  actor.dispose() // returns its chair home if it still holds one
  refreshList()
}

async function create(placement: CustomerPlacement): Promise<GuestActor | null> {
  const id = placement.guestId
  try {
    const variant = customerVariant(id)
    const actor = await GuestActor.create({
      guestId: id,
      tableId: placement.tableId,
      seatIndex: placement.seatIndex,
      gender: variant.gender,
      url: variant.url,
      chair: TABLE_CHAIR_SPEC,
      seat: seatOf(placement),
      phase: customerPhase(id),
    })
    if (!alive || !desired.has(id) || actors.has(id)) {
      actor.dispose()
      return null
    }
    wire(actor)
    return actor
  } catch (error) {
    if (!reportedFailure) {
      reportedFailure = true
      emit('failed', error instanceof Error ? error.message : 'customer assets failed to load')
    }
    return null
  }
}

/** Seated immediately (initial load, edit mode, navigation failure): no walking, no animation. */
async function spawnSeated(placement: CustomerPlacement) {
  const id = placement.guestId
  pending.add(id)
  const actor = await create(placement)
  pending.delete(id)
  if (!actor) return
  const want = desired.get(id)
  if (want) actor.setSeat(seatOf(want))
  actors.set(id, actor)
  refreshList()
}

async function spawnArrival(placement: CustomerPlacement) {
  const id = placement.guestId
  const entrance = entrancePoint.value
  const check = entranceOk.value
  // Only animate with a usable entrance and a route; otherwise report and show the guest seated (state is untouched).
  if (!entrance || !check?.ok) {
    if (entrance) fail(`entrance unusable (${check && !check.ok ? check.reason : 'unknown'}) for ${id}`)
    return spawnSeated(placement)
  }
  pending.add(id)
  const actor = await create(placement)
  pending.delete(id)
  if (!actor) return
  const seat = seatOf(placement)
  const plan = planArrival(grid.value, entrance, seat, actor.standLocalZ)
  if (!plan.ok) {
    fail(`arrival ${id}: ${plan.reason}`)
    // The chair cannot be approached safely: no animation through furniture. The guest simply is at its seat.
    actors.set(id, actor)
    refreshList()
    return
  }
  actor.prepareArrival(plan.plan.route, 0)
  actors.set(id, actor)
  pendingPaths.set(id, {
    kind: 'arrival',
    points: plan.plan.overlay,
    markers: [{ point: plan.plan.approach, color: APPROACH_COLOR }, { point: plan.plan.stand, color: STAND_COLOR }],
  })
  refreshList()
}

function seatBusy(p: CustomerPlacement): boolean {
  for (const a of leaving.values()) if (a.tableId === p.tableId && a.seatIndex === p.seatIndex && !a.seatFree) return true
  for (const a of actors.values()) if (a.guestId !== p.guestId && a.tableId === p.tableId && a.seatIndex === p.seatIndex) return true
  return false
}

function depart(id: string, actor: GuestActor, seat: SeatFrame) {
  actors.delete(id)
  const entrance = entrancePoint.value
  const check = entranceOk.value
  if (!props.enabled || !entrance || !check?.ok) {
    actor.cancelTransition()
    actor.dispose()
    refreshList()
    return
  }
  leaving.set(id, actor)
  handles.get(id)?.finish()
  handles.delete(id)
  pendingPaths.delete(id)
  let route: RoutePath | null = null
  let overlayPoints: { x: number; z: number }[] = []
  let markers: PathMarker[] = []
  if (actor.isApproaching) {
    // Still walking in: head back out from where it is.
    const from = grid.value.nearestFree({ x: actor.position.x, z: actor.position.z }, 1.5)
    const nav = from ? grid.value.findPath(from, entrance) : null
    if (nav) {
      route = new RoutePath(nav)
      overlayPoints = nav
    }
  } else {
    // At the chair (seated, sitting, standing...): the departure plan starts at the stand point beside the chair.
    const plan = planDeparture(grid.value, entrance, seat, actor.standLocalZ)
    if (plan.ok) {
      route = plan.plan.route
      overlayPoints = plan.plan.overlay
      markers = [{ point: plan.plan.stand, color: STAND_COLOR }, { point: plan.plan.approach, color: APPROACH_COLOR }]
    } else fail(`departure ${id}: ${plan.reason}`)
  }
  if (!route) fail(`departure ${id}: no route, leaving visually in place`)
  actor.startDeparture(route)
  if (route) pendingPaths.set(id, { kind: 'departure', points: overlayPoints, markers })
  refreshList()
}

// Reconcile by guest.id. A customer is created once per guest and only MOVED afterwards (table dragged/rotated while
// editing); it ends when the guest record goes away. Everything here is event-driven, never per frame.
watch(placements, (next) => {
  const previous = lastSeen
  lastSeen = new Map(next.map((p) => [p.guestId, p]))
  desired = lastSeen
  const first = !initialized
  initialized = true

  // Temporary chairs follow their seats; a chair whose table/seat disappeared is released at once.
  for (const [key, m] of [...movers]) {
    const frame = seatFrameOf(props.tables, m.tableId, m.seatIndex)
    if (!frame) releaseMover(key)
    else m.seat = frame
  }

  for (const [id, actor] of [...actors]) {
    const want = desired.get(id)
    if (want) {
      actor.setSeat(seatOf(want))
    } else {
      depart(id, actor, previous.get(id) ? seatOf(previous.get(id)!) : actor.seatFrame)
    }
  }
  queue = queue.filter((p) => desired.has(p.guestId))
  for (const p of next) {
    if (actors.has(p.guestId) || pending.has(p.guestId)) continue
    if (first || !props.enabled || !entrancePoint.value) void spawnSeated(p)
    else {
      pending.add(p.guestId)
      queue.push(p)
    }
  }
  refreshList()
}, { immediate: true })

watch(() => props.enabled, (on) => {
  root.visible = on
  if (on) return
  // Entering layout editing: cancel movement safely. Arrivals settle at their seat, departures are released,
  // queued arrivals become plain seated guests, every temporary chair snaps home (the production chairs return).
  // The operational records are never touched.
  for (const [id, actor] of [...leaving]) {
    leaving.delete(id)
    handles.get(id)?.finish()
    handles.delete(id)
    pendingPaths.delete(id)
    actor.cancelTransition()
    actor.dispose()
  }
  for (const [id, actor] of actors) {
    if (actor.cancelTransition() === 'dispose') {
      actors.delete(id)
      actor.dispose()
    }
    handles.get(id)?.finish()
    handles.delete(id)
    pendingPaths.delete(id)
  }
  releaseAllMovers()
  // No stale navigation paths: the render loop is idle while editing, so nothing could fade them out.
  overlay.clear()
  handles.clear()
  pendingPaths.clear()
  const queued = queue
  queue = []
  for (const p of queued) {
    pending.delete(p.guestId)
    if (desired.has(p.guestId)) void spawnSeated(p)
  }
  refreshList()
}, { immediate: true })

// Dev overlay inputs (all no-ops outside DEV).
watch([() => props.debug, grid, entrancePoint, entranceOk], () => {
  if (!import.meta.env.DEV) return
  const d = props.debug
  overlay.setVisibility({ paths: d?.paths ?? false, arrivals: d?.arrivals ?? false, departures: d?.departures ?? false, approach: d?.approach ?? false })
  obstacleLines.object.visible = !!d?.obstacles
  if (d?.obstacles) obstacleLines.set(grid.value.obstacles, grid.value.options.clearance, FLOOR, grid.value.options.margin)
  const e = entrancePoint.value
  marker.object.visible = !!e && !!d
  if (e) marker.set(e, entranceOk.value?.ok ?? false)
  if (e) {
    // Only report CHANGES: an identical status must not trigger parent re-renders (that would loop).
    const key = entranceOk.value?.ok ? 'ok' : `bad:${entranceOk.value?.reason}`
    if (key !== lastEntranceKey) {
      lastEntranceKey = key
      emit('entrance', entranceOk.value?.ok ? { ok: true } : { ok: false, reason: entranceOk.value?.reason })
    }
  }
}, { immediate: true, deep: true })

function pumpArrivals() {
  if (!queue.length || simMs < nextSpawnAt) return
  const index = queue.findIndex((p) => !seatBusy(p))
  if (index === -1) return
  const [p] = queue.splice(index, 1)
  nextSpawnAt = simMs + STAGGER_MS
  void spawnArrival(p)
}

let animTotal = 0
let mixerTotal = 0
let chairTotal = 0

/** One simulation step. Used by the render loop and by the dev step API, so captured frames are the real thing. */
function advance(dt: number): number {
  simMs += dt * 1000
  pumpArrivals()
  lod.prepare(camera.value as never)
  let mixers = 0
  for (let i = 0; i < list.length; i++) {
    const actor = list[i]
    actor.update(dt, lod.skip(actor.position, i))
    if (actor.mixerUpdated) mixers++
    let handle = handles.get(actor.guestId)
    if (actor.isWalking) {
      if (!handle) {
        const pendingPath = pendingPaths.get(actor.guestId)
        if (pendingPath) {
          handle = overlay.add(actor.guestId, pendingPath.kind, pendingPath.points, pendingPath.markers) ?? undefined
          if (handle) handles.set(actor.guestId, handle)
          pendingPaths.delete(actor.guestId)
        }
      }
      handle?.setProgress(actor.routeProgress)
    } else if (handle) {
      // Movement ended: the path fades out smoothly and disposes itself.
      handle.finish()
      handles.delete(actor.guestId)
    }
  }
  const c0 = performance.now()
  updateMovers(dt)
  chairTotal += performance.now() - c0
  overlay.update(dt)
  return mixers
}

let frames = 0
let windowStart = performance.now()
const FLUSH_MS = 500

onBeforeRender(({ delta }) => {
  if (!props.enabled) return
  if (list.length === 0 && overlay.count === 0 && movers.size === 0 && queue.length === 0) return
  const scale = import.meta.env.DEV ? (props.debug?.timeScale ?? 1) : 1
  const dt = Math.min(delta, 0.1) * scale
  const t0 = performance.now()
  mixerTotal += advance(dt)
  animTotal += performance.now() - t0
  frames++
  const now = performance.now()
  if (import.meta.env.DEV && now - windowStart >= FLUSH_MS) {
    const info = renderer.info
    emit('stats', {
      customers: actors.size,
      arrivals: [...actors.values()].filter((a) => a.mode === 'arriving').length,
      departures: leaving.size,
      navFailures,
      lastFailure,
      pathObjects: overlay.count,
      chairs: movers.size,
      phases: list.filter((a) => a.phase !== 'seated').map((a) => `${a.guestId} ${a.phase} (${a.chairOffset.toFixed(2)})`),
      mixers: +(mixerTotal / frames).toFixed(1),
      animMs: +(animTotal / frames).toFixed(2),
      chairMs: +(chairTotal / frames).toFixed(3),
      fps: Math.round((frames * 1000) / (now - windowStart)),
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    })
    frames = 0
    animTotal = 0
    mixerTotal = 0
    chairTotal = 0
    windowStart = now
  }
})

// DEV-only inspection aids.
if (import.meta.env.DEV) {
  const world = new Vector3()
  ;(window as unknown as { __floorLab?: unknown }).__floorLab = {
    /** Render a screen region at higher resolution via the camera's view offset (a real crop, not an upscale). */
    zoomTo(screenX: number, screenY: number, zoom: number) {
      const cam = camera.value as unknown as { setViewOffset(a: number, b: number, c: number, d: number, e: number, f: number): void; clearViewOffset(): void } | undefined
      const w = sizes.width.value
      const h = sizes.height.value
      if (!cam) return
      if (zoom <= 1) cam.clearViewOffset()
      else cam.setViewOffset(w, h, screenX - w / (2 * zoom), screenY - h / (2 * zoom), w / zoom, h / zoom)
    },
    /** Canvas-relative pixel of a world point (for zoomTo). */
    project(x: number, z: number, y = 0.8) {
      const cam = camera.value as unknown as { updateMatrixWorld(): void; projectionMatrix: unknown } | undefined
      if (!cam) return null
      world.set(x, y, z).project(cam as never)
      return { x: ((world.x + 1) / 2) * sizes.width.value, y: ((1 - world.y) / 2) * sizes.height.value }
    },
    /** Deterministic stepping: advances the simulation exactly `seconds` in 1/30 s steps (use with timeScale 0). */
    step(seconds: number) {
      const n = Math.max(1, Math.round(seconds * 30))
      for (let i = 0; i < n; i++) advance(1 / 30)
    },
    /** Steps (1/30 s) until `test` holds for some actor, at most `maxSeconds`. Returns the matching phase or null. */
    stepUntil(id: string, phase: string, maxSeconds = 60) {
      for (let i = 0; i < maxSeconds * 30; i++) {
        const a = list.find((x) => x.guestId === id)
        if (a?.phase === phase) return a.phase
        advance(1 / 30)
      }
      return null
    },
    phases: () => list.map((a) => ({ id: a.guestId, phase: a.phase, mode: a.mode, chair: +a.chairOffset.toFixed(3), x: +a.position.x.toFixed(3), z: +a.position.z.toFixed(3) })),
    /** Counters for leak checks. */
    counts: () => ({ actors: actors.size, leaving: leaving.size, paths: overlay.count, pending: pending.size, queued: queue.length, chairs: movers.size }),
  }
}

onBeforeUnmount(() => {
  if (import.meta.env.DEV) delete (window as unknown as { __floorLab?: unknown }).__floorLab
  alive = false
  for (const actor of [...actors.values(), ...leaving.values()]) {
    actor.cancelTransition()
    actor.dispose()
  }
  actors.clear()
  leaving.clear()
  releaseAllMovers()
  list = []
  overlay.dispose()
  obstacleLines.dispose()
  marker.dispose()
  disposeChairPropResources()
  // Only free GLBs nobody else is using; the shared cache keeps working for other scenes.
  disposeUnusedCharacters()
})
</script>

<template>
  <primitive :object="root" />
</template>
