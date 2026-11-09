import { BoxGeometry, BufferAttribute, type BufferGeometry, Color, Mesh, MeshStandardMaterial } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CHAIR_BACK_HEIGHT, CHAIR_SEAT_HEIGHT, CHAIR_SEAT_SIZE, SCENE_COLORS } from '../table-geometry'
import { chairPoint, type SeatFrame } from '../navigation/route-path'

/**
 * A movable copy of the production chair (same size, colours and shape as the ones RestaurantTable draws).
 * While a customer sits down or stands up, the real chair is hidden and this prop takes its place so it can
 * be pulled out of the way (the table edge is only 0.18 m from the chair centre: nobody can sit down into a
 * tucked-in chair). One shared geometry + material for every prop; a single draw call per visible prop.
 */
let geometry: BufferGeometry | null = null
let material: MeshStandardMaterial | null = null

function chairGeometry(): BufferGeometry {
  if (geometry) return geometry
  const parts: BufferGeometry[] = []
  const add = (w: number, h: number, d: number, y: number, z: number, hex: string) => {
    const g = new BoxGeometry(w, h, d)
    g.translate(0, y, z)
    const color = new Color(hex)
    const n = g.getAttribute('position').count
    const colors = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) colors.set([color.r, color.g, color.b], i * 3)
    g.setAttribute('color', new BufferAttribute(colors, 3))
    parts.push(g)
  }
  add(CHAIR_SEAT_SIZE, 0.05, CHAIR_SEAT_SIZE, CHAIR_SEAT_HEIGHT - 0.025, 0, SCENE_COLORS.chair)
  add(CHAIR_SEAT_SIZE, CHAIR_BACK_HEIGHT, 0.04, CHAIR_SEAT_HEIGHT + CHAIR_BACK_HEIGHT / 2, -(CHAIR_SEAT_SIZE / 2 - 0.02), SCENE_COLORS.chair)
  add(0.06, CHAIR_SEAT_HEIGHT - 0.05, 0.06, (CHAIR_SEAT_HEIGHT - 0.05) / 2, 0, SCENE_COLORS.tableBase)
  geometry = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  return geometry
}

export function createChairProp(): Mesh {
  material ??= new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })
  const mesh = new Mesh(chairGeometry(), material)
  mesh.visible = false
  mesh.name = 'chair-prop'
  return mesh
}

/**
 * Place the prop relative to the TUCKED chair position: `offsetZ` along the chair's forward axis (0 = tucked,
 * negative = pulled out). A pure translation: the prop is never scaled or hidden while it is in use.
 */
export function placeChairProp(mesh: Mesh, seat: SeatFrame, offsetZ: number) {
  const p = chairPoint(seat, 0, offsetZ)
  mesh.position.set(p.x, 0, p.z)
  mesh.rotation.y = seat.yaw
  mesh.visible = true
}

export function disposeChairPropResources() {
  geometry?.dispose()
  material?.dispose()
  geometry = null
  material = null
}
