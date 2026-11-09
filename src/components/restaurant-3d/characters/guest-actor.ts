import { Group, type Object3D, type SkinnedMesh, Sphere, Vector3 } from 'three'
import { customerAsset, type CharacterGender } from './character-catalog'
import { CustomerAnimationController } from './customer-animation-controller'
import { acquireAlignedSeating, acquireCharacter, releaseCharacter } from './character-loader'
import { seatedPelvisTarget, type ChairSpec } from './test-chair'
import { CHAIR_PULL, ChairMotion, PULL_SECONDS, PUSH_SECONDS } from './chair-interaction'
import type { RoutePath, RouteSample, SeatFrame } from '../navigation/route-path'

/**
 * One customer's visual actor (Phase 3.1D seated + 3.1E arrival/departure). Same actor and same skeleton for the
 * whole life of a guest: it is created once, may walk in, sits, may stand and walk out, and is disposed afterwards.
 * It never touches operational data; it only reads the guest's seat and the routes it is given.
 *
 * Frames: while SEATED/SEATING the actor is expressed in the chair frame (group at the chair, model hanging at
 * `standZ + chairOffset`). While WALKING the group follows a world-space route. The hand-offs between the two
 * are exact (same world pose), so there is no teleport.
 */
export type GuestMode = 'seated' | 'arriving' | 'leaving'

export type GuestPhase =
  | 'seated'
  | 'waiting' // created, not started yet (staggered spawn)
  | 'walkIn' // following the arrival route (the chair is pulled out when the approach point is reached)
  | 'settleIn' // at the stand point facing the table, chair pulled out behind
  | 'sitting' // Sit_Down
  | 'scootIn' // seated; chair + customer slide back to the table
  | 'scootOut' // seated; chair + customer slide away from the table
  | 'standing' // Stand_Up
  | 'settleOut' // standing, about to turn toward the exit
  | 'walkOut' // following the departure route (the chair returns once the customer is clear)
  | 'fadeOut' // route finished (or failed): the customer fades away
  | 'gone'

export interface GuestActorOptions {
  guestId: string
  tableId: string
  seatIndex: number
  gender: CharacterGender
  url: string
  chair: ChairSpec
  seat: SeatFrame
  phase: number
}

const MAX_TURN_RATE = 7 // rad/s
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

export class GuestActor {
  readonly group = new Group()
  readonly guestId: string
  readonly tableId: string
  readonly seatIndex: number
  mixerUpdated = false
  /** Reported once when a departing/failed actor has finished and may be disposed. */
  onGone: (() => void) | null = null
  /** Supplies the seat's chair motion (creates the temporary chair on demand, null if the seat no longer exists). */
  chairProvider: ((create: boolean) => ChairMotion | null) | null = null

  private readonly controller: CustomerAnimationController
  private readonly model: Object3D
  private readonly url: string
  private readonly standZ: number
  private seat: SeatFrame
  private current: GuestPhase = 'seated'
  private timer = 0
  private route: RoutePath | null = null
  private distance = 0
  private walkTime = 0
  private pulled = false
  private returned = true
  private leaveWhenSeated: { route: RoutePath | null } | null = null
  /** Used when the seat has no temporary chair (the table vanished): keeps the state machine moving without visuals. */
  private readonly detached = new ChairMotion()
  private disposed = false
  private readonly sample: RouteSample = { x: 0, z: 0, yaw: 0, speed: 1 }

  private constructor(options: GuestActorOptions, model: Object3D, controller: CustomerAnimationController, standZ: number) {
    this.guestId = options.guestId
    this.tableId = options.tableId
    this.seatIndex = options.seatIndex
    this.url = customerAsset(options.url)
    this.model = model
    this.controller = controller
    this.standZ = standZ
    this.seat = options.seat
    this.group.name = `customer:${options.guestId}`
    this.group.add(model)
    this.applyChairFrame(standZ)
  }

  static async create(options: GuestActorOptions): Promise<GuestActor> {
    const target = seatedPelvisTarget(options.chair)
    const url = customerAsset(options.url)
    const [character, seating] = await Promise.all([acquireCharacter(url), acquireAlignedSeating(options.gender, target.y)])
    skinned(character.scene).forEach((mesh) => {
      mesh.frustumCulled = true
      // Lazily computed skinned bounds would freeze at the first pose; use a fixed generous sphere.
      mesh.boundingSphere = new Sphere(new Vector3(0, 0.9, -0.1), 1.5)
    })
    const controller = new CustomerAnimationController(character.scene, [...character.clips, ...seating.clips])
    controller.start('seated', options.phase)
    return new GuestActor(options, character.scene, controller, target.z - seating.seated.pelvis[2])
  }

  // ---- read-only state for the owner / dev tools -------------------------------------------------------------

  get phase(): GuestPhase {
    return this.current
  }

  get mode(): GuestMode {
    if (this.current === 'seated') return 'seated'
    if (['waiting', 'walkIn', 'settleIn', 'sitting', 'scootIn'].includes(this.current)) return 'arriving'
    return 'leaving'
  }

  get isGone() {
    return this.current === 'gone'
  }

  /** Chair-local Z where the customer stands in front of the pulled-out chair (feet). */
  get standLocalZ() {
    return this.standZ - CHAIR_PULL
  }

  /** Current offset (m) of this customer's chair along its axis: 0 tucked, negative pulled out (dev/inspection). */
  get chairOffset() {
    return this.peekChair()?.offset ?? 0
  }

  get seatFrame(): SeatFrame {
    return this.seat
  }

  /** True while following a world route (so a dev path can be shown). */
  get isWalking() {
    return this.current === 'walkIn' || this.current === 'walkOut'
  }

  /** Still outside the chair zone (walking in or waiting): a removal here turns around instead of leaving from the seat. */
  get isApproaching() {
    return this.current === 'walkIn' || this.current === 'waiting'
  }

  /** 0..1 fraction of the current route already walked. */
  get routeProgress() {
    return this.route && this.route.length > 0 ? Math.min(1, this.distance / this.route.length) : 1
  }

  /** The actor is out of the chair area and the seat can be taken by someone else. */
  get seatFree(): boolean {
    return this.mode !== 'leaving' || this.current === 'walkOut' || this.current === 'fadeOut' || this.current === 'gone'
  }

  get position(): Vector3 {
    return this.group.position
  }

  /** Layout changed while seated: follow the chair. */
  setSeat(seat: SeatFrame) {
    this.seat = seat
    if (this.current === 'seated') this.applyChairFrame(this.standZ)
  }

  // ---- chair --------------------------------------------------------------------------------------------------

  /**
   * The seat's CURRENT chair motion. It is looked up every time: a temporary chair is released when it is home and
   * unowned, so a reference kept from an earlier interaction would point at a motion nothing updates any more.
   */
  private chair(): ChairMotion {
    return this.chairProvider?.(true) ?? this.detached
  }

  /** The seat's chair motion if a temporary chair exists; never creates one. */
  private peekChair(): ChairMotion | null {
    return this.chairProvider ? this.chairProvider(false) : this.detached
  }

  private pullChair() {
    this.chair().claim(this.guestId)
    this.chair().moveTo(this.guestId, -CHAIR_PULL, PULL_SECONDS)
    this.pulled = true
    this.returned = false
  }

  private chairHome(seconds = PUSH_SECONDS) {
    this.peekChair()?.returnHome(this.guestId, seconds)
    this.returned = true
  }

  // ---- frames -------------------------------------------------------------------------------------------------

  /** Chair frame: group at the chair, model hanging at `z` (chair-local). */
  private applyChairFrame(z: number) {
    this.group.position.set(this.seat.x, 0, this.seat.z)
    this.group.rotation.y = this.seat.yaw
    this.model.position.set(0, 0, z)
  }

  private placeWorld(x: number, z: number, yaw: number) {
    this.group.position.set(x, 0, z)
    this.group.rotation.y = yaw
    this.model.position.set(0, 0, 0)
  }

  private finishSeated() {
    this.current = 'seated'
    this.route = null
    this.leaveWhenSeated = null
    this.chairHome()
    this.applyChairFrame(this.standZ)
  }

  // ---- arrival ------------------------------------------------------------------------------------------------

  /** Begin hidden at the route start; `update()` makes it appear and walk once `delay` elapsed. */
  prepareArrival(route: RoutePath, delay: number) {
    this.route = route
    this.current = 'waiting'
    this.timer = delay
    this.group.visible = false
    this.controller.start('idle', 0)
    this.controller.pause()
    route.sample(0, this.sample)
    this.placeWorld(this.sample.x, this.sample.z, this.sample.yaw)
    this.distance = 0
    this.pulled = false
  }

  // ---- departure / interruption -------------------------------------------------------------------------------

  /** @param route null = navigation failed: stand up and fade out in place (no ghost, no teleport). */
  startDeparture(route: RoutePath | null) {
    const phase = this.current
    switch (phase) {
      case 'waiting':
        // Never appeared on screen: nothing to animate.
        this.finishGone()
        return
      case 'seated':
        this.route = route
        this.timer = 0
        this.current = 'scootOut'
        this.returned = false
        this.chair().claim(this.guestId)
        this.chair().moveTo(this.guestId, -CHAIR_PULL, PULL_SECONDS)
        return
      case 'walkIn':
        // Still walking in: turn around and walk back out from here. A chair already being pulled goes home now.
        if (this.pulled) this.chairHome()
        this.route = route
        this.walkTimeReset()
        this.current = route ? 'walkOut' : 'fadeOut'
        this.returned = true
        this.timer = 0
        return
      case 'settleIn':
        // At the stand point, chair pulled out: leave from here (the departure route starts at this very point).
        this.route = route
        this.timer = 0
        this.current = 'settleOut'
        return
      case 'sitting':
        // Let the sit finish, then stand straight up (the chair is already pulled out).
        this.leaveWhenSeated = { route }
        return
      case 'scootIn':
        // Reverse the scoot: chair + customer slide back out, then stand up.
        this.route = route
        this.timer = 0
        this.returned = false
        this.chair().moveTo(this.guestId, -CHAIR_PULL, PULL_SECONDS)
        this.current = 'scootOut'
        return
      default:
        return // already leaving
    }
  }

  private walkTimeReset() {
    this.walkTime = 0
    this.distance = 0
  }

  /** Edit mode: stop everything. Arrivals settle at their seat; departures are released. The chair snaps home. */
  cancelTransition(): 'seated' | 'dispose' {
    this.peekChair()?.snapHome()
    this.returned = true
    if (this.mode === 'leaving' || this.leaveWhenSeated) return 'dispose'
    if (this.current !== 'seated') {
      this.controller.start('seated', 0)
      this.group.visible = true
      this.group.scale.setScalar(1)
      this.finishSeated()
    }
    return 'seated'
  }

  // ---- per frame ----------------------------------------------------------------------------------------------

  /** @returns true while something visible can still change. */
  update(dt: number, skip: boolean): boolean {
    const c = this.controller
    // The seat's chair vanished (table removed): nobody else updates the detached motion, so the state machine
    // would wait for it forever. Idle motions are a no-op.
    this.detached.update(dt)
    switch (this.current) {
      case 'seated':
        break
      case 'waiting':
        this.timer -= dt
        if (this.timer <= 0) {
          this.group.visible = true
          c.start('idle', 0)
          c.transitionTo('walking', { fade: 0.2 })
          this.current = 'walkIn'
          this.walkTimeReset()
        }
        this.mixerUpdated = false
        return true
      case 'walkIn':
        this.walk(dt, 'in')
        break
      case 'settleIn':
        this.timer -= dt
        // The customer stands in front of the pulled-out chair; sit once it has settled and the chair stopped.
        if (this.timer <= 0 && !this.chair().moving) {
          c.transitionTo('sitting_down')
          this.current = 'sitting'
        }
        break
      case 'sitting':
        if (c.state === 'seated') {
          if (this.leaveWhenSeated) {
            // Removed while sitting: stand up from the pulled-out chair without sliding in first.
            this.route = this.leaveWhenSeated.route
            this.leaveWhenSeated = null
            c.transitionTo('standing_up')
            this.current = 'standing'
          } else {
            this.chair().moveTo(this.guestId, 0, PUSH_SECONDS)
            this.current = 'scootIn'
          }
        }
        break
      case 'scootIn':
        // Customer and chair are one rigid body: the model follows the chair offset exactly.
        this.model.position.z = this.standZ + this.chair().offset
        if (!this.chair().moving) this.finishSeated()
        break
      case 'scootOut':
        this.model.position.z = this.standZ + this.chair().offset
        if (!this.chair().moving) {
          c.transitionTo('standing_up')
          this.current = 'standing'
        }
        break
      case 'standing':
        if (c.state === 'idle') {
          this.current = 'settleOut'
          this.timer = 0
        }
        break
      case 'settleOut':
        this.timer += dt
        if (this.timer >= 0.25) {
          if (this.route) {
            // Hand off to the world route at exactly the current world pose (the route starts at the stand point).
            this.route.sample(0, this.sample)
            this.placeWorld(this.sample.x, this.sample.z, this.seat.yaw)
            this.walkTimeReset()
            c.transitionTo('walking')
            this.current = 'walkOut'
          } else {
            this.chairHome()
            this.current = 'fadeOut'
            this.timer = 0
          }
        }
        break
      case 'walkOut':
        this.walk(dt, 'out')
        break
      case 'fadeOut': {
        this.timer += dt
        const k = 1 - clamp01(this.timer / 0.4)
        this.group.scale.setScalar(Math.max(k, 0.0001))
        if (this.timer >= 0.4) this.finishGone()
        break
      }
      case 'gone':
        return false
    }
    this.mixerUpdated = false
    const active = c.update(dt, skip && this.current === 'seated')
    this.mixerUpdated = c.mixerUpdated
    return active
  }

  private walk(dt: number, dir: 'in' | 'out') {
    const c = this.controller
    const route = this.route
    if (!route) return
    this.walkTime += dt
    route.sample(this.distance, this.sample)
    const remaining = route.length - this.distance
    const ramp = Math.min(1, this.walkTime / 0.5)
    // Ease out only at the very end of a route so the feet do not slide at a stop.
    const ease = dir === 'in' ? 1 : Math.min(1, remaining / 0.7)
    const factor = Math.max(0.35, ramp * this.sample.speed * Math.max(0.4, ease))
    c.setLocomotionScale(factor)
    this.distance += c.walkSpeed * factor * dt
    // Smooth heading: never snaps to a new tangent, whatever the geometry of the route.
    let diff = this.sample.yaw - this.group.rotation.y
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    const step = MAX_TURN_RATE * dt
    this.group.rotation.y += Math.max(-step, Math.min(step, diff))
    this.group.position.set(this.sample.x, 0, this.sample.z)

    const pullAt = route.markers.pullAt
    if (dir === 'in' && pullAt !== undefined && !this.pulled && this.distance >= pullAt) this.pullChair()
    const returnAt = route.markers.returnAt
    if (dir === 'out' && returnAt !== undefined && !this.returned && this.distance >= returnAt) this.chairHome()

    if (this.distance >= route.length) {
      c.setLocomotionScale(1)
      c.transitionTo('idle')
      if (dir === 'in') {
        // Hand-off to the chair frame at the same world pose: the stand point in front of the pulled-out chair.
        if (!this.pulled) this.pullChair()
        this.applyChairFrame(this.standLocalZ)
        this.current = 'settleIn'
        this.timer = 0.3
      } else {
        this.chairHome()
        this.current = 'fadeOut'
        this.timer = 0
      }
    }
  }

  private finishGone() {
    this.current = 'gone'
    this.group.visible = false
    this.chairHome()
    this.onGone?.()
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.controller.dispose()
    // Geometry/material belong to the shared cache; only this instance's bone texture is ours.
    skinned(this.model).forEach((mesh) => mesh.skeleton.dispose())
    releaseCharacter(this.url)
    // However the actor ends (interrupted, removed, scene closed) its chair must not stay pulled out.
    this.chairHome(PULL_SECONDS)
    this.group.removeFromParent()
    this.onGone = null
    this.chairProvider = null
  }
}

function skinned(root: Object3D): SkinnedMesh[] {
  const out: SkinnedMesh[] = []
  root.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) out.push(o as SkinnedMesh)
  })
  return out
}
