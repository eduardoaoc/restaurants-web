import { Box3, Group, Mesh, Object3D, Vector3, type Material } from 'three'
import { loadKayKitModel } from './kaykit-asset-cache'
import { skinFurniture, type UltimateMaterials, type UltimatePiece } from './ultimate-materials'

/** GLBs converted from the Polyperfect Low Poly Ultimate Pack v8.2 (M variant). LICENSE_UNVERIFIED: local demo only. */
export const ULTIMATE_BASE = '/assets/restaurant-3d/models/ultimate-pack'
export const ULTIMATE_FURNITURE = {
  table: `${ULTIMATE_BASE}/table-dining-small.glb`,
  chair: `${ULTIMATE_BASE}/chair-dining.glb`,
  plate: `${ULTIMATE_BASE}/plate-round.glb`,
  glass: `${ULTIMATE_BASE}/glass-drink.glb`,
  plant: `${ULTIMATE_BASE}/pot-medium-circle-plant.glb`,
} as const

/** Tableware sizes (m). The plate GLB is a 0.59 m charger, scaled down to a dinner plate. */
export const PLATE_DIAMETER = 0.24
export const PLATE_THICKNESS = 0.016
/** Chair target size (m): seat ends up at ~0.45 m so seated guests keep the calibrated KayKit seat height. */
export const CHAIR_SIZE = { x: 0.5, y: 0.88, z: 0.5 } as const

export function loadUltimate(url: string): Promise<Object3D> {
  return loadKayKitModel(url)
}

/** Clone a converted piece with the scene's finish and shadow flags (geometry stays shared with the cache). */
export function skinPiece(template: Object3D, piece: UltimatePiece, materials: UltimateMaterials): Object3D {
  const clone = template.clone(true)
  clone.traverse(node => {
    if (!(node instanceof Mesh)) return
    node.castShadow = true
    node.receiveShadow = true
    node.material = Array.isArray(node.material)
      ? node.material.map((m: Material) => skinFurniture(m.name, piece, materials))
      : skinFurniture((node.material as Material).name, piece, materials)
  })
  return clone
}

/** Scale a piece (origin at its base centre) to explicit target sizes; returns the wrapper. */
export function fitPiece(model: Object3D, size: { x?: number; y?: number; z?: number }): Group {
  const box = new Box3().setFromObject(model)
  const s = box.getSize(new Vector3())
  const sx = size.x ? size.x / s.x : 1
  const sy = size.y ? size.y / s.y : 1
  const sz = size.z ? size.z / s.z : 1
  const holder = new Group()
  model.scale.set(sx, sy, sz)
  holder.add(model)
  return holder
}
