import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  type BufferGeometry,
} from 'three'
import type { RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'
import { chairWorldTransform } from './characters/customer-placement'
import {
  CHAIR_BACK_HEIGHT,
  CHAIR_SEAT_HEIGHT,
  CHAIR_SEAT_SIZE,
  SCENE_COLORS,
  getChairPlacements,
} from './table-geometry'

/**
 * Every chair of the floor as three InstancedMeshes (seat, back, leg) instead of three meshes per chair: the same
 * geometry, colours and roughness as before, drawn in 3 calls (plus 3 for the shadow pass) however many chairs exist.
 * Pure Three.js (no Vue) so it can be tested; `ChairInstances.vue` owns one and feeds it the layout.
 */
interface Part {
  geometry: BufferGeometry
  material: MeshStandardMaterial
  /** Chair-local offset of the part (the chair group's own origin is the floor point under the seat). */
  y: number
  z: number
  cast: boolean
  receive: boolean
}

const WOOD = SCENE_COLORS.chair
const BASE = SCENE_COLORS.tableBase

function buildParts(): Part[] {
  const wood = new MeshStandardMaterial({ color: WOOD, roughness: 0.7 })
  const leg = new MeshStandardMaterial({ color: BASE })
  const backZ = -(CHAIR_SEAT_SIZE / 2 - 0.02)
  return [
    { geometry: new BoxGeometry(CHAIR_SEAT_SIZE, 0.05, CHAIR_SEAT_SIZE), material: wood, y: CHAIR_SEAT_HEIGHT - 0.025, z: 0, cast: true, receive: true },
    { geometry: new BoxGeometry(CHAIR_SEAT_SIZE, CHAIR_BACK_HEIGHT, 0.04), material: wood, y: CHAIR_SEAT_HEIGHT + CHAIR_BACK_HEIGHT / 2, z: backZ, cast: true, receive: false },
    { geometry: new BoxGeometry(0.06, CHAIR_SEAT_HEIGHT - 0.05, 0.06), material: leg, y: (CHAIR_SEAT_HEIGHT - 0.05) / 2, z: 0, cast: true, receive: false },
  ]
}

const ZERO = new Matrix4().makeScale(0, 0, 0)

export class ChairInstances {
  readonly group = new Group()
  private parts = buildParts()
  private meshes: InstancedMesh[] = []
  private capacity = 0
  private readonly scratch = new Object3D()
  private readonly local = new Object3D()
  private readonly matrix = new Matrix4()

  constructor() {
    this.group.name = 'chairs'
    this.allocate(64)
  }

  /** Number of chairs currently drawn (hidden ones excluded). Exposed for tests / dev stats. */
  drawn = 0

  private allocate(capacity: number): void {
    for (const mesh of this.meshes) {
      this.group.remove(mesh)
      mesh.dispose()
    }
    this.capacity = capacity
    this.meshes = this.parts.map((part) => {
      const mesh = new InstancedMesh(part.geometry, part.material, capacity)
      mesh.castShadow = part.cast
      mesh.receiveShadow = part.receive
      mesh.frustumCulled = false // instances move; the bounding sphere of instance 0 would cull the rest
      mesh.raycast = () => {} // chairs are never picked; the table's own hit area handles selection
      mesh.count = 0
      return mesh
    })
    this.meshes.forEach((mesh) => this.group.add(mesh))
  }

  /** Rewrites every instance matrix from the layout. `hidden[tableId]` lists chair indexes drawn by an animated prop instead. */
  update(tables: readonly RestaurantTableConfig[], hidden: Record<string, readonly number[] | undefined> = {}): number {
    const placements = tables.map((table) => ({ table, chairs: getChairPlacements(table) }))
    const total = placements.reduce((n, p) => n + p.chairs.length, 0)
    if (total > this.capacity) this.allocate(Math.max(total, this.capacity * 2))

    let index = 0
    for (const { table, chairs } of placements) {
      const hiddenHere = hidden[table.id]
      chairs.forEach((chair, chairIndex) => {
        const world = chairWorldTransform(table, chair)
        this.scratch.position.set(world.x, 0, world.z)
        this.scratch.rotation.set(0, world.yaw, 0)
        this.scratch.updateMatrix()
        const isHidden = hiddenHere?.includes(chairIndex) ?? false
        this.meshes.forEach((mesh, partIndex) => {
          if (isHidden) {
            mesh.setMatrixAt(index, ZERO)
            return
          }
          this.local.position.set(0, this.parts[partIndex].y, this.parts[partIndex].z)
          this.local.updateMatrix()
          this.matrix.multiplyMatrices(this.scratch.matrix, this.local.matrix)
          mesh.setMatrixAt(index, this.matrix)
        })
        index++
      })
    }
    for (const mesh of this.meshes) {
      mesh.count = total
      mesh.instanceMatrix.needsUpdate = true
    }
    this.drawn = total
    return total
  }

  /** Per-part instanced meshes (for tests). */
  get instancedMeshes(): readonly InstancedMesh[] {
    return this.meshes
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      this.group.remove(mesh)
      mesh.dispose()
    }
    this.meshes = []
    for (const part of this.parts) part.geometry.dispose()
    new Set(this.parts.map((p) => p.material)).forEach((m) => m.dispose())
    this.parts = []
  }
}
