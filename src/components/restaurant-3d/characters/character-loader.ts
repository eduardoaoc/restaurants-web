import {
  AnimationClip,
  type BufferGeometry,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
} from 'three'
import { alignSeatedPelvis } from './seating-alignment'
import { CHARACTER_ASSET_ROOT, type CharacterGender } from './character-catalog'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

/**
 * Shared GLB cache. Each file is fetched and parsed once; every on-screen
 * instance is a SkeletonUtils clone that *shares* the cached geometries and
 * materials (only skeleton + transforms are duplicated). GPU resources are
 * freed when an entry is evicted, never while an instance still uses it.
 */
interface Entry {
  promise: Promise<LoadedCharacter>
  source?: Object3D
  clips?: AnimationClip[]
  users: number
  lastUsed: number
}

export interface LoadedCharacter {
  scene: Object3D
  clips: AnimationClip[]
}

const MAX_CACHED = 3
const cache = new Map<string, Entry>()
const loader = new GLTFLoader()

export function acquireCharacter(url: string): Promise<LoadedCharacter> {
  let entry = cache.get(url)
  if (!entry) {
    const created: Entry = {
      users: 0,
      lastUsed: performance.now(),
      promise: loader.loadAsync(url).then((gltf) => {
        created.source = gltf.scene
        created.clips = gltf.animations
        return { scene: gltf.scene, clips: gltf.animations }
      }),
    }
    // A failed load must not poison the cache: the user can retry.
    created.promise.catch(() => cache.delete(url))
    cache.set(url, created)
    entry = created
  }
  entry.users++
  entry.lastUsed = performance.now()
  evictUnused()
  return entry.promise.then(({ scene, clips }) => ({ scene: cloneSkinned(scene), clips }))
}

export function releaseCharacter(url: string) {
  const entry = cache.get(url)
  if (!entry) return
  entry.users = Math.max(0, entry.users - 1)
  entry.lastUsed = performance.now()
  evictUnused()
}

function evictUnused() {
  if (cache.size <= MAX_CACHED) return
  const idle = [...cache.entries()]
    .filter(([, e]) => e.users === 0 && e.source)
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed)
  while (cache.size > MAX_CACHED && idle.length) {
    const [url, entry] = idle.shift()!
    disposeObject(entry.source!)
    cache.delete(url)
  }
}

/** Frees cached models nobody uses (e.g. when the floor scene unmounts), leaving live ones intact. */
export function disposeUnusedCharacters() {
  for (const [url, entry] of cache) {
    if (entry.users === 0 && entry.source) {
      disposeObject(entry.source)
      cache.delete(url)
    }
  }
}

/** Frees every cached model (call when the laboratory unmounts). */
export function disposeCharacterCache() {
  for (const entry of cache.values()) if (entry.source) disposeObject(entry.source)
  cache.clear()
}

export function disposeObject(root: Object3D) {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh) return
    geometries.add(mesh.geometry)
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(m)
  })
  geometries.forEach((g) => g.dispose())
  materials.forEach((m) => {
    for (const value of Object.values(m)) if ((value as Texture | null)?.isTexture) (value as Texture).dispose()
    m.dispose()
  })
}

/**
 * Offline-retargeted Sit_Down / Sit_Idle / Stand_Up clips (see the README next to
 * the JSON files). One fetch per gender; AnimationClip objects hold no GPU state
 * and are shared by every mixer.
 */
export interface SeatingAnimations {
  clips: AnimationClip[]
  /** Solved seated pose in model space (metres): pelvis joint position and knee height. */
  seated: { pelvis: [number, number, number]; kneeY: number }
}

const seatingCache = new Map<CharacterGender, Promise<SeatingAnimations>>()

export function acquireSeatingClips(gender: CharacterGender): Promise<SeatingAnimations> {
  let promise = seatingCache.get(gender)
  if (!promise) {
    promise = fetch(`${CHARACTER_ASSET_ROOT}/animations/${gender}-seating.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Seating animations unavailable (${res.status})`)
        return res.json() as Promise<{
          seated: SeatingAnimations['seated']
          clips: Parameters<typeof AnimationClip.parse>[0][]
        }>
      })
      .then((data) => ({ seated: data.seated, clips: data.clips.map((clip) => AnimationClip.parse(clip)) }))
    promise.catch(() => seatingCache.delete(gender))
    seatingCache.set(gender, promise)
  }
  return promise
}


/** Aligned seating clip sets are cached per (gender, pelvis target) so N customers bake once. */
const alignedCache = new Map<string, Promise<SeatingAnimations>>()

export function acquireAlignedSeating(gender: CharacterGender, targetPelvisY: number): Promise<SeatingAnimations> {
  const key = `${gender}:${targetPelvisY.toFixed(4)}`
  let promise = alignedCache.get(key)
  if (!promise) {
    promise = acquireSeatingClips(gender).then((base) => ({
      seated: { ...base.seated, pelvis: [base.seated.pelvis[0], targetPelvisY, base.seated.pelvis[2]] as [number, number, number] },
      clips: alignSeatedPelvis(base.clips, base.seated.pelvis[1], targetPelvisY),
    }))
    alignedCache.set(key, promise)
  }
  return promise
}
