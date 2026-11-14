<script setup lang="ts">
import { onBeforeUnmount, onMounted, watchEffect } from 'vue'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Box3, BufferGeometry, Group, InstancedMesh, Material, Matrix4, Mesh, Object3D, Vector3 } from 'three'
import type { RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'
import { chairWorldTransform } from './characters/customer-placement'
import { getChairPlacements } from './table-geometry'
import { loadKayKitModel } from './kaykit-asset-cache'
import { sceneAppearance } from './scene-appearance'
import { stageMaterial } from './stage-materials'
import { createUltimateMaterials, skinFurniture, type UltimateFinish } from './ultimate-materials'
import { CHAIR_SIZE, ULTIMATE_FURNITURE } from './ultimate-furniture'

/** One KayKit chair glTF, instanced across all operational seats. */
const props = withDefaults(defineProps<{
  tables: readonly RestaurantTableConfig[]
  hidden: Record<string, readonly number[] | undefined>
  /** `ultimate` = Ultimate Pack chair (LICENSE_UNVERIFIED, local demo); the default stays KayKit. */
  furniture?: 'kaykit' | 'ultimate'
  finish?: UltimateFinish
}>(), { furniture: 'kaykit', finish: 'final' })
const ultimateMaterials = props.furniture === 'ultimate' ? createUltimateMaterials(props.finish) : null

const group = new Group()
group.name = 'kaykit-chairs'
const scratch = new Object3D()
const zero = new Matrix4().makeScale(0, 0, 0)
const url = '/assets/restaurant-3d/models/kaykit-furniture/chair_A.gltf'
let mesh: InstancedMesh | null = null
let sourceGeometry: BufferGeometry | null = null
let alive = true

function update(): void {
  if (!mesh) return
  const tables = props.tables.map(table => ({ table, chairs: getChairPlacements(table) }))
  const total = tables.reduce((sum, current) => sum + current.chairs.length, 0)
  if (total > mesh.instanceMatrix.count) {
    const next = new InstancedMesh(mesh.geometry, mesh.material as Material, Math.max(total, mesh.instanceMatrix.count * 2))
    next.name = mesh.name
    next.castShadow = true
    next.receiveShadow = true
    next.frustumCulled = false
    next.raycast = () => undefined
    group.remove(mesh)
    mesh.dispose()
    mesh = next
    group.add(mesh)
  }
  let index = 0
  for (const { table, chairs } of tables) {
    const hidden = props.hidden[table.id]
    chairs.forEach((chair, chairIndex) => {
      if (hidden?.includes(chairIndex)) mesh!.setMatrixAt(index++, zero)
      else {
        const world = chairWorldTransform(table, chair)
        scratch.position.set(world.x, 0, world.z)
        scratch.rotation.set(0, world.yaw, 0)
        scratch.updateMatrix()
        mesh!.setMatrixAt(index++, scratch.matrix)
      }
    })
  }
  mesh.count = total
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
}

watchEffect(() => {
  for (const table of props.tables) void [table.position.x, table.position.z, table.rotation, table.seats, table.shape]
  void Object.values(props.hidden).map(list => list?.length)
  update()
})

onMounted(async () => {
  try {
    const model = await loadKayKitModel(props.furniture === 'ultimate' ? ULTIMATE_FURNITURE.chair : url)
    if (!alive) return
    model.updateMatrixWorld(true)
    const parts: Mesh[] = []
    model.traverse(node => { if (node instanceof Mesh) parts.push(node) })
    if (!parts.length) throw new Error('chair has no mesh')
    // KayKit: a single mesh. Ultimate: one mesh per material, merged into one geometry with a group per material.
    const merged = props.furniture === 'ultimate'
    const sources = merged ? parts : [parts[0]]
    const geometries = sources.map(part => {
      const geometry = part.geometry.clone().applyMatrix4(part.matrixWorld)
      if (merged) for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name)
      return geometry
    })
    sourceGeometry = merged ? mergeGeometries(geometries, true) : geometries[0]
    if (!sourceGeometry) throw new Error('chair geometry could not be merged')
    const chair = { material: merged ? sources.map(part => part.material as Material) : sources[0].material }
    const bounds = new Box3().setFromBufferAttribute(sourceGeometry.getAttribute('position') as never)
    const size = bounds.getSize(new Vector3())
    const target = merged ? CHAIR_SIZE : { x: 0.62, y: 0.88, z: 0.65 }
    const scale = new Vector3(target.x / size.x, target.y / size.y, target.z / size.z)
    sourceGeometry.scale(scale.x, scale.y, scale.z)
    sourceGeometry.translate(-((bounds.min.x + bounds.max.x) / 2) * scale.x, -bounds.min.y * scale.y, -((bounds.min.z + bounds.max.z) / 2) * scale.z)
    if (!merged) sourceGeometry.computeVertexNormals()

    const material = sceneAppearance.light && !ultimateMaterials
      ? stageMaterial('chair')
      : ultimateMaterials
      ? (chair.material as Material[]).map(m => skinFurniture(m.name, 'chair', ultimateMaterials))
      : (chair.material as Material)
    mesh = new InstancedMesh(sourceGeometry, material as Material, Math.max(64, props.tables.reduce((sum, table) => sum + table.seats, 0)))
    mesh.name = 'operational-chair-instances'
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.raycast = () => undefined
    group.add(mesh)
    update()
  } catch (error) {
    console.error('[restaurant-3d] chair model failed to load', error)
  }
})

onBeforeUnmount(() => {
  alive = false
  if (mesh) {
    group.remove(mesh)
    mesh.dispose()
    mesh = null
  }
  sourceGeometry?.dispose()
  sourceGeometry = null
  ultimateMaterials?.all.forEach(m => m.dispose())
})
</script>

<template>
  <primitive :object="group" />
</template>
