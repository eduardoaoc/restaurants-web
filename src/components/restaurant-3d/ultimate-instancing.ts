import { Box3, BufferGeometry, InstancedMesh, Matrix4, Mesh, Object3D, Vector3, type Material } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * A converted GLB flattened to ONE geometry (a draw group per material) so any number of copies is a single
 * `InstancedMesh`. Position and normal only (the pack's materials are re-skinned), scaled to `size` and re-based so the
 * origin is the centre of its footprint at y = 0. Used for the decorative terrace furniture (no operational record).
 */
export interface FlatPiece {
  geometry: BufferGeometry
  /** One finished material per draw group: parts that share a finish are merged into a single group (one draw call). */
  materials: Material[]
}

export function flattenModel(model: Object3D, size: { x?: number; y?: number; z?: number }, finish: (original: Material) => Material): FlatPiece {
  model.updateMatrixWorld(true)
  const parts: Mesh[] = []
  model.traverse(node => { if (node instanceof Mesh) parts.push(node) })
  if (!parts.length) throw new Error('model has no mesh')
  // Parts that end up with the same finish share one draw group.
  const byFinish = new Map<Material, BufferGeometry[]>()
  for (const part of parts) {
    const geometry = part.geometry.clone().applyMatrix4(part.matrixWorld)
    for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name)
    const material = finish(part.material as Material)
    byFinish.set(material, [...(byFinish.get(material) ?? []), geometry])
  }
  const materials = [...byFinish.keys()]
  const groups = [...byFinish.values()].map(list => (list.length === 1 ? list[0] : mergeGeometries(list, false)))
  if (groups.some(g => !g)) throw new Error('model geometry could not be merged')
  const merged = groups.length === 1 ? groups[0]! : mergeGeometries(groups as BufferGeometry[], true)
  if (!merged) throw new Error('model geometry could not be merged')
  const bounds = new Box3().setFromBufferAttribute(merged.getAttribute('position') as never)
  const extent = bounds.getSize(new Vector3())
  const scale = new Vector3(size.x ? size.x / extent.x : 1, size.y ? size.y / extent.y : 1, size.z ? size.z / extent.z : 1)
  merged.scale(scale.x, scale.y, scale.z)
  merged.translate(-((bounds.min.x + bounds.max.x) / 2) * scale.x, -bounds.min.y * scale.y, -((bounds.min.z + bounds.max.z) / 2) * scale.z)
  return { geometry: merged, materials }
}

/** One draw call for every placement; `placements` are local x, z and yaw. Shadows on, no picking. */
export function instancePlacements(
  piece: FlatPiece,
  material: Material | Material[],
  placements: ReadonlyArray<{ x: number; z: number; yaw: number }>,
  name: string,
): InstancedMesh {
  // A single finish has no draw groups: pass the bare material (an array without groups would render nothing).
  const finish = Array.isArray(material) && material.length === 1 ? material[0] : material
  const mesh = new InstancedMesh(piece.geometry, finish, placements.length)
  const m = new Matrix4()
  const o = new Object3D()
  placements.forEach((p, i) => {
    o.position.set(p.x, 0, p.z)
    o.rotation.set(0, p.yaw, 0)
    o.updateMatrix()
    m.copy(o.matrix)
    mesh.setMatrixAt(i, m)
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.name = name
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.raycast = () => undefined
  return mesh
}
