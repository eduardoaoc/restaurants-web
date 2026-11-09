import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  type Object3D,
} from 'three'

/**
 * Reusable customer animation state machine: one AnimationMixer per character.
 *
 *   idle <-> walking
 *   idle -> sitting_down -(auto)-> seated -> standing_up -(auto)-> idle
 *
 * Only the legal edges above exist. One-shots (sit down / stand up) clamp on
 * their last frame and chain automatically through the mixer's `finished`
 * event; loops (idle, walk, seated) never reset when re-entered by a blend.
 * Everything here is plain objects: no Vue reactivity, nothing allocates per frame.
 */
export type CustomerState = 'idle' | 'walking' | 'sitting_down' | 'seated' | 'standing_up'

export type CustomerClipNames = Record<CustomerState, string>

/** Real clip names: Idle_Neutral/Walk come from the Quaternius files, the others from the retargeted KayKit set. */
export const DEFAULT_CLIP_NAMES: CustomerClipNames = {
  idle: 'Idle_Neutral',
  walking: 'Walk',
  sitting_down: 'Sit_Down',
  seated: 'Sit_Idle',
  standing_up: 'Stand_Up',
}

const EDGES: Record<CustomerState, CustomerState[]> = {
  idle: ['walking', 'sitting_down'],
  walking: ['idle'],
  sitting_down: ['seated'],
  seated: ['standing_up'],
  standing_up: ['idle'],
}

/** Cross-fade seconds per destination. Short for matching poses, longer when poses differ. */
const FADE: Record<CustomerState, number> = {
  idle: 0.3,
  walking: 0.25,
  sitting_down: 0.3,
  seated: 0.1,
  standing_up: 0.2,
}

const ONE_SHOT: ReadonlySet<CustomerState> = new Set(['sitting_down', 'standing_up'])
const NEXT_AUTO: Partial<Record<CustomerState, CustomerState>> = {
  sitting_down: 'seated',
  standing_up: 'idle',
}

export interface TransitionOptions {
  /** Override the default cross-fade (seconds). */
  fade?: number
  /** Start a looping clip at this fraction of its length (de-synchronises crowds). */
  phase?: number
}

export class CustomerAnimationController {
  state: CustomerState | null = null
  onStateChange: ((state: CustomerState) => void) | null = null

  private readonly mixer: AnimationMixer
  private readonly actions = new Map<CustomerState, AnimationAction>()
  private readonly retiring: { action: AnimationAction; left: number }[] = []
  private current: AnimationAction | null = null
  private paused = false
  private cachedWalkSpeed: number | null = null
  /** Time that elapsed while the mixer was skipped (throttling / off-screen); applied on the next update. */
  private pending = 0

  private readonly root: Object3D

  constructor(
    root: Object3D,
    clips: AnimationClip[],
    names: CustomerClipNames = DEFAULT_CLIP_NAMES,
  ) {
    this.root = root
    this.mixer = new AnimationMixer(root)
    for (const state of Object.keys(names) as CustomerState[]) {
      const clip = clips.find((c) => c.name === names[state])
      if (!clip) continue
      const action = this.mixer.clipAction(clip)
      action.setLoop(ONE_SHOT.has(state) ? LoopOnce : LoopRepeat, ONE_SHOT.has(state) ? 1 : Infinity)
      action.clampWhenFinished = true
      this.actions.set(state, action)
    }
    this.mixer.addEventListener('finished', (event) => {
      if (event.action !== this.current || !this.state) return
      const next = NEXT_AUTO[this.state]
      if (next) this.transitionTo(next)
    })
  }

  /** Whether the clip needed for `state` exists (e.g. seating clips failed to load). */
  supports(state: CustomerState) {
    return this.actions.has(state)
  }

  /**
   * Natural ground speed (m/s) of the walk clip: the median backward speed of the stance foot
   * (Foot bones are root-space targets, so a planted foot moves at exactly the ground speed).
   * Measured, not estimated from stride length (that overshoots by ~4%). Cached.
   */
  get walkSpeed(): number {
    if (this.cachedWalkSpeed !== null) return this.cachedWalkSpeed
    const action = this.actions.get('walking')
    const track = action?.getClip().tracks.find((t) => /^Foot[._]?L\.position$/.test(t.name))
    if (!track) return (this.cachedWalkSpeed = 1.2)
    const speeds: number[] = []
    for (let i = 1; i < track.times.length; i++) {
      const v = (track.values[i * 3 + 2] - track.values[(i - 1) * 3 + 2]) / (track.times[i] - track.times[i - 1])
      if (v < -0.3) speeds.push(-v)
    }
    speeds.sort((x, y) => x - y)
    return (this.cachedWalkSpeed = speeds.length ? speeds[Math.floor(speeds.length / 2)] : 1.2)
  }

  /** Enter the first state without a blend. */
  start(state: CustomerState, phase = 0) {
    const action = this.actions.get(state)
    if (!action) return
    this.mixer.stopAllAction()
    this.retiring.length = 0
    action.reset().play()
    if (phase > 0) action.time = phase * action.getClip().duration
    this.current = action
    this.state = state
    this.paused = false
    this.onStateChange?.(state)
  }

  /** @returns false when the edge is illegal or the clip is missing (nothing changes). */
  transitionTo(state: CustomerState, options: TransitionOptions = {}): boolean {
    if (!this.state || !EDGES[this.state].includes(state)) return false
    const next = this.actions.get(state)
    if (!next) return false
    const fade = options.fade ?? FADE[state]
    const previous = this.current
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(fade).play()
    if (options.phase) next.time = options.phase * next.getClip().duration
    if (previous && previous !== next) {
      previous.fadeOut(fade)
      this.retiring.push({ action: previous, left: fade })
    }
    this.current = next
    this.state = state
    this.paused = false
    this.onStateChange?.(state)
    return true
  }

  /**
   * Deterministic pose for inspection/tests: puts the listed states at explicit clip
   * fractions and blend weights, then evaluates the mixer once (no time advance).
   */
  seekBlend(layers: { state: CustomerState; fraction: number; weight: number }[]) {
    this.mixer.stopAllAction()
    this.retiring.length = 0
    for (const layer of layers) {
      const action = this.actions.get(layer.state)
      if (!action) continue
      action.reset().setEffectiveWeight(layer.weight).play()
      action.time = layer.fraction * action.getClip().duration
      action.paused = true
    }
    this.mixer.update(0)
    this.paused = true
  }

  /** Slows/speeds the looping locomotion clip so feet match a ramping path speed. */
  setLocomotionScale(scale: number) {
    this.actions.get('walking')?.setEffectiveTimeScale(scale)
  }

  pause() {
    this.paused = true
  }

  resume() {
    this.paused = false
  }

  get isPaused() {
    return this.paused
  }

  /**
   * @param skip true to defer the (costly) skeleton evaluation: the elapsed time is banked and
   *   applied on the next non-skipped call. One-shot clips are never deferred so their `finished`
   *   event (which drives the sequence) cannot stall while a customer is off-screen.
   * @returns true while the pose can still change (so the caller keeps rendering).
   */
  update(dt: number, skip = false): boolean {
    if (this.paused) return false
    this.pending += dt
    if (!(skip && this.state && !ONE_SHOT.has(this.state))) {
      this.mixerUpdated = true
      this.mixer.update(this.pending)
      this.pending = 0
    } else {
      this.mixerUpdated = false
    }
    // Actions that finished fading out are stopped so the mixer no longer evaluates them.
    for (let i = this.retiring.length - 1; i >= 0; i--) {
      const item = this.retiring[i]
      item.left -= dt
      if (item.left <= 0) {
        if (item.action !== this.current) item.action.stop()
        this.retiring.splice(i, 1)
      }
    }
    return true
  }

  /** Whether the last update() actually evaluated the skeleton (for benchmark counters). */
  mixerUpdated = false

  dispose() {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.root)
    this.actions.clear()
    this.retiring.length = 0
    this.current = null
    this.onStateChange = null
  }
}
