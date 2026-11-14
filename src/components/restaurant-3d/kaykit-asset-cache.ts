import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Mesh, Object3D, Texture } from 'three'

/** Scene-lifetime cache: only explicitly requested KayKit models are parsed, and shared atlas textures stay singletons. */
const loader = new GLTFLoader()
const models = new Map<string, Object3D>()
const modelLoads = new Map<string, Promise<Object3D>>()
const textures = new Map<string, Texture>()
const textureSlots = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'lightMap'] as const

function shareTextures(scene: Object3D): void {
  scene.traverse(node => {
    if (!(node instanceof Mesh)) return
    const materials = Array.isArray(node.material) ? node.material : [node.material]
    for (const material of materials) {
      const slots = material as typeof material & Record<string, unknown>
      for (const slot of textureSlots) {
        const candidate = slots[slot]
        if (!(candidate instanceof Texture)) continue
        const image = candidate.image as { src?: string } | undefined
        const key = image?.src
        if (!key) continue
        const shared = textures.get(key)
        if (shared && shared !== candidate) {
          slots[slot] = shared
          candidate.dispose()
          material.needsUpdate = true
        } else if (!shared) textures.set(key, candidate)
      }
    }
  })
}

export function loadKayKitModel(url: string): Promise<Object3D> {
  const cached = models.get(url)
  if (cached) return Promise.resolve(cached)
  const pending = modelLoads.get(url)
  if (pending) return pending
  const task = new Promise<Object3D>((resolve, reject) => loader.load(url, gltf => {
    shareTextures(gltf.scene)
    models.set(url, gltf.scene)
    resolve(gltf.scene)
  }, undefined, reject))
  modelLoads.set(url, task)
  task.finally(() => modelLoads.delete(url)).catch(() => undefined)
  return task
}
