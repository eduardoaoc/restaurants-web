<script setup lang="ts">
import { nextTick, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useLoop, useTres } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import { Frustum, Group, InstancedMesh, Matrix4, Sphere, Vector3 } from 'three'
import { CHARACTER_CATALOG, customerAsset, type CharacterGender } from './character-catalog'
import { CustomerActor } from './customer-actor'
import type { CustomerState } from './customer-animation-controller'
import {
  type ChairSpec,
  createChairGeometry,
  createMergedChairMesh,
  disposeChairResources,
} from './test-chair'
import type { RenderStats } from './CharacterModel.vue'

/**
 * Customer-sequence scene (inside the TresCanvas). N independent actors, each with its own
 * skeleton + mixer, sharing the cached GLB geometry/materials and the seating clips.
 * One render-loop callback updates every actor; the canvas is on-demand, so once all actors
 * are done nothing is rendered or invalidated.
 *
 * `optimized` switches the Phase 3.1C rendering path on/off so both can be benchmarked in one
 * session: single-draw-call customer GLBs, instanced chairs, correct culling bounds, and
 * distance/frustum-aware animation throttling. Off = the Phase 3.1B baseline.
 */
export interface SceneStats extends RenderStats {
  actors: number
  heapMb: number | null
  /** Mean CPU ms per frame spent updating every actor's mixer and path. */
  updateMs: number | null
  /** Mean CPU ms per frame from before-render to after-render (updates + render submission). */
  frameMs: number | null
  /** Mean skeleton evaluations per frame (mixers actually updated). */
  mixers: number
  gpu: string
}

const props = defineProps<{
  count: number
  gender: CharacterGender | 'mixed'
  variantUrl: string
  loop: boolean
  /** Bump to restart every actor from the beginning. */
  runId: number
  view: 'default' | 'side' | 'top'
  chair: ChairSpec
  optimized: boolean
}>()
const emit = defineEmits<{
  loading: [value: boolean]
  error: [message: string]
  stats: [value: SceneStats]
  phase: [value: string]
}>()

const { renderer, camera, sizes, invalidate } = useTres()
const { onBeforeRender, onRender: onAfterRender } = useLoop()
const controls = shallowRef<{ instance: { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null } | null>(null)

const root = new Group()
const actors = shallowRef<CustomerActor[]>([])
let chairs: InstancedMesh | null = null
let buildToken = 0
let frames = 0
let windowStart = performance.now()
let anyActive = false
let wasActive = false
let updateTotal = 0
let frameStart = 0
let frameTotal = 0
let mixerTotal = 0
let frameCounter = 0
let gpuLabel: string | null = null
const FLUSH_MS = 500
const COLS = 5
const SPACING_X = 3.6
const SPACING_Z = 4.2
/** Bounding radius of a customer (arms, pose range, sitting back 0.65 m) used for culling/LOD. */
const CULL_RADIUS = 1.5
/** Camera distance (m) beyond which the skeleton is evaluated every 2nd / 3rd frame. */
const LOD_NEAR = 12
const LOD_FAR = 24

const frustum = new Frustum()
const projection = new Matrix4()
const sphere = new Sphere()
const tmp = new Vector3()

function crowdPool() {
  const pool: { gender: CharacterGender; url: string }[] = []
  for (const gender of ['men', 'women'] as const) {
    for (const v of CHARACTER_CATALOG[gender].variants) pool.push({ gender, url: v.url })
  }
  return pool
}

// Deterministic pseudo-random so runs are repeatable but not synchronised.
function rand(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

interface Spec {
  gender: CharacterGender
  url: string
}

function specs(count: number): Spec[] {
  const pool = crowdPool()
  return Array.from({ length: count }, (_, i) => {
    if (props.gender === 'mixed') return pool[(i * 5) % pool.length]
    return { gender: props.gender, url: props.variantUrl }
  })
}

function gridPosition(i: number, count: number) {
  const col = i % COLS
  const row = Math.floor(i / COLS)
  return {
    x: col * SPACING_X - ((Math.min(count, COLS) - 1) * SPACING_X) / 2,
    z: row * SPACING_Z,
  }
}

function placeChairs(list: CustomerActor[]) {
  if (!props.optimized) return
  // One InstancedMesh = one draw call for every chair (all share the standardised spec).
  chairs = new InstancedMesh(createChairGeometry(props.chair), createMergedChairMesh(props.chair).material, list.length)
  root.updateMatrixWorld(true)
  list.forEach((actor, i) => {
    actor.slot.updateMatrixWorld(true)
    chairs!.setMatrixAt(i, actor.slot.matrixWorld)
  })
  chairs.instanceMatrix.needsUpdate = true
  chairs.computeBoundingSphere()
  root.add(chairs)
}

async function build(
  list: Spec[],
  options: { positions?: (i: number) => { x: number; z: number }; chair?: ChairSpec; delay?: (i: number) => number; phase?: (i: number) => number } = {},
) {
  const chairSpec = options.chair ?? props.chair
  return Promise.all(
    list.map((spec, i) => {
      const at = (options.positions ?? ((n: number) => gridPosition(n, list.length)))(i)
      return CustomerActor.create({
        gender: spec.gender,
        url: props.optimized ? customerAsset(spec.url) : spec.url,
        chairX: at.x,
        chairZ: at.z,
        chair: chairSpec,
        ownChair: !props.optimized,
        frustumCull: props.optimized,
        delay: options.delay ? options.delay(i) : props.count === 1 ? 0.2 : rand(i, 1) * 3,
        phase: options.phase ? options.phase(i) : props.count === 1 ? 0 : rand(i, 2),
        loop: props.loop,
      })
    }),
  )
}

function mount(created: CustomerActor[]) {
  for (const actor of created) root.add(actor.slot)
  placeChairs(created)
  actors.value = created
}

async function rebuild() {
  const token = ++buildToken
  emit('loading', true)
  teardown()
  try {
    const created = await build(specs(props.count))
    if (token !== buildToken) {
      created.forEach((a) => a.dispose())
      return
    }
    mount(created)
    anyActive = true
    invalidate()
  } catch (error) {
    if (token === buildToken) emit('error', error instanceof Error ? error.message : 'Failed to load characters')
  } finally {
    if (token === buildToken) emit('loading', false)
  }
}

function teardown() {
  for (const actor of actors.value) actor.dispose()
  actors.value = []
  if (chairs) {
    root.remove(chairs)
    chairs.dispose()
    chairs = null
  }
}

function lodSkip(actor: CustomerActor, index: number): boolean {
  // World position of the customer (slot origin + slot-local group offset); chairs never move.
  tmp.copy(actor.group.position).applyQuaternion(actor.slot.quaternion).add(actor.slot.position)
  tmp.y += 0.9
  sphere.set(tmp, CULL_RADIUS)
  if (!frustum.intersectsSphere(sphere)) return true
  const cam = camera.value
  if (!cam) return false
  const d = tmp.distanceTo(cam.position)
  const every = d > LOD_FAR ? 3 : d > LOD_NEAR ? 2 : 1
  // Staggered by index so throttled customers never all update on the same frame.
  return every > 1 && (frameCounter + index) % every !== 0
}

onBeforeRender(({ delta }) => {
  frameStart = performance.now()
  const list = actors.value
  anyActive = false
  const dt = Math.min(delta, 0.1)
  frameCounter++
  if (props.optimized && camera.value) {
    camera.value.updateMatrixWorld()
    projection.multiplyMatrices(camera.value.projectionMatrix, camera.value.matrixWorldInverse)
    frustum.setFromProjectionMatrix(projection)
  }
  let updated = 0
  const t0 = performance.now()
  for (let i = 0; i < list.length; i++) {
    const skip = props.optimized ? lodSkip(list[i], i) : false
    if (list[i].update(dt, skip)) anyActive = true
    if (list[i].mixerUpdated) updated++
  }
  updateTotal += performance.now() - t0
  mixerTotal += updated
  if (anyActive) invalidate()
})

onAfterRender(() => {
  if (!anyActive) return
  frameTotal += performance.now() - frameStart
  const list = actors.value
  frames++
  const now = performance.now()
  if (now - windowStart < FLUSH_MS) return
  const info = renderer.info
  const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
  emit('stats', {
    fps: Math.round((frames * 1000) / (now - windowStart)),
    triangles: info.render.triangles,
    drawCalls: info.render.calls,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    actors: list.length,
    heapMb: heap ? Math.round(heap.usedJSHeapSize / 1048576) : null,
    updateMs: +(updateTotal / frames).toFixed(2),
    frameMs: +(frameTotal / frames).toFixed(2),
    mixers: +(mixerTotal / frames).toFixed(1),
    gpu: gpuName(),
  })
  emit('phase', list[0]?.state ?? '')
  frames = 0
  updateTotal = frameTotal = mixerTotal = 0
  windowStart = now
})

// Reports finished sequences once: rendering stops, so show 0 instead of a stale FPS.
onBeforeRender(() => {
  if (anyActive) wasActive = true
  else if (wasActive) {
    wasActive = false
    const info = renderer.info
    emit('stats', {
      fps: 0, triangles: info.render.triangles, drawCalls: info.render.calls, geometries: info.memory.geometries,
      textures: info.memory.textures, actors: actors.value.length, heapMb: null, updateMs: null, frameMs: null, mixers: 0, gpu: gpuName(),
    })
    emit('phase', actors.value[0]?.state ?? '')
  }
})

function gpuName(): string {
  if (gpuLabel) return gpuLabel
  const gl = renderer.getContext() as WebGL2RenderingContext
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  gpuLabel = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown'
  return gpuLabel
}

/** Camera framing computed from the crowd grid (chairs, arrival and exit routes). */
function applyView() {
  const cols = Math.min(props.count, COLS)
  const rows = Math.ceil(props.count / COLS)
  const firstX = -((cols - 1) * SPACING_X) / 2
  const minX = firstX - 0.5
  const maxX = firstX + (cols - 1) * SPACING_X + 3.9
  const maxZ = (rows - 1) * SPACING_Z + 3
  const cx = (minX + maxX) / 2
  const cz = (maxZ - 0.5) / 2
  const size = Math.max(maxX - minX, maxZ + 0.5, 4)
  // Portrait canvases see less horizontally: back the camera up so the whole route still fits.
  const aspect = sizes.width.value / Math.max(1, sizes.height.value)
  const d = Math.max(size * 1.0 + 2, (size * 1.1) / (0.63 * aspect))
  let pos: [number, number, number] = [cx, d * 0.45, cz + d * 0.9]
  let target: [number, number, number] = [cx, 0.8, cz]
  if (props.view === 'top') {
    pos = [cx, d * 1.1, cz + 0.01]
    target = [cx, 0, cz]
  } else if (props.view === 'side' && props.count === 1) {
    // Profile of the seated pose: camera on +X looking at the chair.
    pos = [4.2, 0.8, 0.3]
    target = [0, 0.65, 0.3]
  }
  setCamera(pos, target)
}

function setCamera(pos: [number, number, number], target: [number, number, number]) {
  camera.value?.position.set(...pos)
  const orbit = controls.value?.instance
  orbit?.target.set(...target)
  orbit?.update()
  invalidate()
}

watch(() => [props.count, props.gender, props.variantUrl, props.loop, props.optimized, JSON.stringify(props.chair)], () => {
  void rebuild()
}, { immediate: true })
watch(() => [props.count, props.view], () => void nextTick(applyView), { immediate: true })
watch(() => props.runId, () => {
  actors.value.forEach((actor, i) => actor.restart(props.count === 1 ? 0.2 : rand(i, 1) * 3))
  anyActive = true
  invalidate()
})

/**
 * DEV-only deterministic inspection API (window.__charLab). A "filmstrip" poses one customer per
 * frame at explicit clip fractions / blend weights side by side, so exact timestamps can be
 * captured with a screenshot instead of racing the real-time sequence.
 */
export interface FilmstripFrame {
  label: string
  layers: { state: CustomerState; fraction: number; weight?: number }[]
}
export interface Filmstrip {
  gender: CharacterGender
  variantIndex?: number
  frames: FilmstripFrame[]
  spacing?: number
  chair?: Partial<ChairSpec>
  camera?: { position: [number, number, number]; target: [number, number, number] }
}

async function filmstrip(spec: Filmstrip) {
  const token = ++buildToken
  teardown()
  const url = CHARACTER_CATALOG[spec.gender].variants[spec.variantIndex ?? 0].url
  const spacing = spec.spacing ?? 1.7
  const chair = { ...props.chair, ...spec.chair }
  const list = spec.frames.map(() => ({ gender: spec.gender, url }))
  const created = await build(list, { positions: (i) => ({ x: i * spacing, z: 0 }), chair, delay: () => 0, phase: () => 0 })
  if (token !== buildToken) {
    created.forEach((a) => a.dispose())
    return
  }
  mount(created)
  created.forEach((actor, i) => actor.debugPose(spec.frames[i].layers))
  anyActive = false
  const cx = ((spec.frames.length - 1) * spacing) / 2
  setCamera(spec.camera?.position ?? [cx, 0.9, 7], spec.camera?.target ?? [cx, 0.8, 0])
}

if (import.meta.env.DEV) {
  ;(window as unknown as { __charLab?: unknown }).__charLab = {
    filmstrip,
    camera: setCamera,
    info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
  }
}

onBeforeUnmount(() => {
  buildToken++
  teardown()
  disposeChairResources()
  if (import.meta.env.DEV) delete (window as unknown as { __charLab?: unknown }).__charLab
})
</script>

<template>
  <primitive :object="root" />
  <OrbitControls
    ref="controls"
    :enable-damping="true"
    :damping-factor="0.08"
    :min-distance="1.2"
    :max-distance="60"
    :max-polar-angle="Math.PI / 2 + 0.05"
  />
</template>
