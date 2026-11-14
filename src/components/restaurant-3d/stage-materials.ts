import { Mesh, MeshStandardMaterial, type Object3D } from 'three'
import { LIGHT_STAGE } from './scene-appearance'

/**
 * Light-stage furniture: one flat, soft material per role instead of KayKit's saturated texture atlas, so the room reads
 * as a quiet maquette and the numbered pins and status rings carry the colour. One shared instance per role (the
 * renderer re-uploads uniforms on every material switch, and these are tiny), created on first use.
 */
export type StageRole = 'table' | 'chair' | 'counter' | 'appliance' | 'shelf'

const materials = new Map<StageRole, MeshStandardMaterial>()

export function stageMaterial(role: StageRole): MeshStandardMaterial {
  let material = materials.get(role)
  if (!material) {
    material = new MeshStandardMaterial({ color: LIGHT_STAGE.furniture[role], roughness: 0.85, metalness: 0 })
    materials.set(role, material)
  }
  return material
}

/** Replaces every mesh material under `root` with the role's shared one. */
export function skinStage(root: Object3D, role: StageRole): void {
  root.traverse(node => { if (node instanceof Mesh) node.material = stageMaterial(role) })
}
