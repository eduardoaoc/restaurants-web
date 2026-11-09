import { Group, type Object3D, type SkinnedMesh, Sphere, Vector3 } from 'three'
import type { CustomerState } from './customer-animation-controller'
import type { CharacterGender } from './character-catalog'
import { CustomerAnimationController } from './customer-animation-controller'
import { GroundPath, type PathSample } from './customer-path'
import { acquireAlignedSeating, acquireCharacter, releaseCharacter } from './character-loader'
import { createTestChair, disposeChair, type ChairSpec, seatedPelvisTarget } from './test-chair'

/**
 * One laboratory customer: a single character instance that walks in, sits on a test chair,
 * stands up and walks away. The same skeleton/mesh instance is used for the whole run:
 * movement is path-following on a parent Group, never a respawn.
 * Not navigation or pathfinding: the two routes are predefined in `buildRoutes`.
 */
type Phase =
  | 'delay' | 'idleIn' | 'walkIn' | 'settleIn' | 'sitting' | 'seated'
  | 'standing' | 'settleOut' | 'walkOut' | 'idleOut' | 'done'

export interface ActorOptions {
  gender: CharacterGender
  url: string
  /** Chair centre on the floor (world). */
  chairX: number
  chairZ: number
  /** Standardised chair this customer is aligned to (also gives the slot orientation). */
  chair: ChairSpec
  /** Baseline builds a six-mesh chair per slot; optimized leaves chairs to the scene (instanced). */
  ownChair: boolean
  /** Disable skinned-mesh frustum culling (3.1B baseline) or use the corrected bounds. */
  frustumCull: boolean
  delay: number
  /** 0..1 fraction used to de-synchronise idle/seated loops between characters. */
  phase: number
  loop: boolean
  seatedHold?: number
}

const TURN_RADIUS = 0.55
const SETTLE = 0.45

export class CustomerActor {
  /** World-space parent: position/yaw are driven by the path, the model hangs below it. */
  /** Chair-local frame: origin = seat centre on the floor, rotated by the chair orientation. */
  readonly slot = new Group()
  /** Parent of the model inside the slot; path/yaw are driven here (slot-local coordinates). */
  readonly group = new Group()
  readonly chair: Group | null
  /** Where the customer stands (slot-local Z) so the pelvis lands on the chair after sitting. */
  private readonly standZ: number
  private readonly controller: CustomerAnimationController
  private readonly model: Object3D
  private readonly pathIn: GroundPath
  private readonly pathOut: GroundPath
  private readonly sample: PathSample = { x: 0, z: 0, yaw: 0, speed: 1 }
  private phase: Phase = 'delay'
  private timer: number
  private distance = 0
  private walkTime = 0
  private disposed = false
  /** Mirrors `phase` for the UI; only read on demand, never reactive. */
  state = 'delay'

  private readonly options: ActorOptions

  private constructor(
    options: ActorOptions,
    model: Object3D,
    controller: CustomerAnimationController,
    chair: Group | null,
    standZ: number,
  ) {
    this.options = options
    this.model = model
    this.controller = controller
    this.chair = chair
    this.timer = options.delay
    this.standZ = standZ
    this.slot.position.set(options.chairX, 0, options.chairZ)
    this.slot.rotation.y = (options.chair.orientationDeg * Math.PI) / 180
    if (chair) this.slot.add(chair)
    this.slot.add(this.group)
    // Arrive heading -Z at the chair's front-right, U-turn (semicircle) to end facing +Z in front of the seat.
    this.pathIn = new GroundPath(
      { x: 2 * TURN_RADIUS, z: standZ + 2.2, yaw: Math.PI },
      [{ line: 2.2 }, { arc: Math.PI, radius: TURN_RADIUS, speed: 0.55 }],
    )
    // Leave: gentle right-hand curve away from the chair, then straight.
    this.pathOut = new GroundPath(
      { x: 0, z: standZ, yaw: 0 },
      [{ arc: Math.PI / 2, radius: 1.6, speed: 0.85 }, { line: 2 }],
    )
    this.group.add(model)
    this.placeAtStart()
  }

  static async create(options: ActorOptions): Promise<CustomerActor> {
    const target = seatedPelvisTarget(options.chair)
    const [character, seating] = await Promise.all([
      acquireCharacter(options.url),
      acquireAlignedSeating(options.gender, target.y),
    ])
    // NOTE: skeletons must NOT be shared between a character's primitives: the quantized GLBs carry
    // per-mesh bind compensation, and sharing one skeleton visibly deforms the model.
    for (const mesh of skinned(character.scene)) {
      mesh.frustumCulled = options.frustumCull
      // Three computes a skinned mesh's bounds lazily from whatever pose is first rendered, which would
      // cull sitting/reaching poses wrongly. A fixed, generous sphere (model space) covers every pose
      // of every clip (pelvis moves back to ~0.65 m when seated; arms reach ~0.8 m).
      if (options.frustumCull) mesh.boundingSphere = new Sphere(new Vector3(0, 0.9, -0.1), 1.5)
    }
    const controller = new CustomerAnimationController(character.scene, [...character.clips, ...seating.clips])
    const standZ = target.z - seating.seated.pelvis[2]
    const chair = options.ownChair ? createTestChair(options.chair) : null
    return new CustomerActor(options, character.scene, controller, chair, standZ)
  }

  /** Deterministic pose for inspection: stand position, explicit clip fractions and blend weights. */
  debugPose(layers: { state: CustomerState; fraction: number; weight?: number }[]) {
    this.phase = 'done'
    this.state = 'debug'
    this.group.visible = true
    this.group.position.set(0, 0, this.standZ)
    this.group.rotation.y = 0
    this.controller.seekBlend(layers.map((l) => ({ ...l, weight: l.weight ?? 1 })))
  }

  get canSit() {
    return this.controller.supports('sitting_down') && this.controller.supports('seated') && this.controller.supports('standing_up')
  }

  private placeAtStart() {
    this.pathIn.sample(0, this.sample)
    this.apply()
    this.controller.start('idle', this.options.phase)
    this.controller.pause()
    this.group.visible = false
  }

  private apply() {
    this.group.position.set(this.sample.x, 0, this.sample.z)
    this.group.rotation.y = this.sample.yaw
  }

  restart(delay = this.options.delay) {
    this.phase = 'delay'
    this.state = 'delay'
    this.timer = delay
    this.distance = 0
    this.placeAtStart()
  }

  private go(phase: Phase, timer = 0) {
    this.phase = phase
    this.state = phase
    this.timer = timer
  }

  /** @returns true while something can still change on screen (the caller keeps rendering). */
  update(dt: number, skipMixer = false): boolean {
    if (this.phase === 'done') return false
    const c = this.controller
    switch (this.phase) {
      case 'delay':
        this.timer -= dt
        if (this.timer <= 0) {
          this.group.visible = true
          c.start('idle', this.options.phase)
          this.go('idleIn', 1)
        }
        break
      case 'idleIn':
        this.timer -= dt
        if (this.timer <= 0) {
          c.transitionTo('walking', { phase: this.options.phase })
          this.distance = 0
          this.walkTime = 0
          this.go('walkIn')
        }
        break
      case 'walkIn':
      case 'walkOut':
        this.walkStep(dt)
        break
      case 'settleIn':
        this.timer -= dt
        if (this.timer <= 0) {
          if (!c.transitionTo('sitting_down')) this.go('done')
          else this.go('sitting')
        }
        break
      case 'sitting':
        if (c.state === 'seated') this.go('seated', this.options.seatedHold ?? 3)
        break
      case 'seated':
        this.timer -= dt
        if (this.timer <= 0) {
          c.transitionTo('standing_up')
          this.go('standing')
        }
        break
      case 'standing':
        if (c.state === 'idle') this.go('settleOut', SETTLE)
        break
      case 'settleOut':
        this.timer -= dt
        if (this.timer <= 0) {
          c.transitionTo('walking')
          this.distance = 0
          this.walkTime = 0
          this.go('walkOut')
        }
        break
      case 'idleOut':
        this.timer -= dt
        if (this.timer <= 0) {
          if (this.options.loop) {
            this.group.visible = false
            this.restart(0.5 + this.options.phase * 2)
          } else {
            c.pause()
            this.go('done')
          }
        }
        break
    }
    // While waiting for the start delay the mixer is paused but the clock must keep running.
    if (this.phase === 'delay') return true
    return c.update(dt, skipMixer)
  }

  get mixerUpdated() {
    return this.controller.mixerUpdated
  }

  private walkStep(dt: number) {
    const c = this.controller
    const path = this.phase === 'walkIn' ? this.pathIn : this.pathOut
    this.walkTime += dt
    path.sample(this.distance, this.sample)
    const remaining = path.length - this.distance
    // Ramp up after leaving idle, ease out before the end so feet do not slide at a stop.
    const ramp = Math.min(1, this.walkTime / 0.5)
    const ease = Math.min(1, remaining / 0.7)
    const factor = Math.max(0.35, ramp * this.sample.speed * Math.max(0.4, ease))
    c.setLocomotionScale(factor)
    this.distance += c.walkSpeed * factor * dt
    if (this.distance >= path.length) {
      path.sample(path.length, this.sample)
      c.transitionTo('idle')
      c.setLocomotionScale(1)
      this.go(this.phase === 'walkIn' ? 'settleIn' : 'idleOut', this.phase === 'walkIn' ? SETTLE : 0.8)
    }
    this.apply()
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.controller.dispose()
    for (const mesh of skinned(this.model)) mesh.skeleton.dispose()
    releaseCharacter(this.options.url)
    if (this.chair) disposeChair(this.chair)
    this.slot.removeFromParent()
  }
}

function skinned(root: Object3D): SkinnedMesh[] {
  const out: SkinnedMesh[] = []
  root.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) out.push(o as SkinnedMesh)
  })
  return out
}
