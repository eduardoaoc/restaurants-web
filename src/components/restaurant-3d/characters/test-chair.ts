import { BoxGeometry, BufferAttribute, type BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Isolated lightweight test chair for the laboratory (production tables are untouched).
 * Chair-local frame: origin = centre of the seat on the floor, the chair faces +Z.
 * Dimensions are configurable through a ChairSpec; a character is aligned to the chair
 * (pelvis height / depth) from the spec, never by editing the animation assets.
 */
export interface ChairSpec {
  /** Seat top above the floor, metres. */
  seatHeight: number
  seatDepth: number
  seatWidth: number
  /** Yaw of the whole chair+customer assembly around the chair centre, degrees. */
  orientationDeg: number
  /** Backrest shift along +Z from the rear edge of the seat, metres (0 = flush with the rear edge). */
  backrestOffset: number
  backrestHeight: number
  /** Pelvis distance in front of the backrest face; defaults to PELVIS_FROM_BACKREST. Larger = sits further forward. */
  pelvisClearance?: number
}

/** One standardised chair used for every character (typical restaurant chair). */
export const STANDARD_CHAIR: ChairSpec = {
  seatHeight: 0.45,
  seatDepth: 0.46,
  seatWidth: 0.46,
  orientationDeg: 0,
  backrestOffset: 0,
  backrestHeight: 0.46,
}

export const SEAT_THICKNESS = 0.04
const BACK_THICKNESS = 0.04
const LEG = 0.04
/** Pelvis joint sits this far above the seat surface (calibrated visually: thighs rest on the seat). */
export const PELVIS_ABOVE_SEAT = 0.04
/** Pelvis joint distance in front of the backrest's front face (calibrated: spine touches the backrest). */
export const PELVIS_FROM_BACKREST = 0.19

/** Pelvis position targeted by a spec, in chair-local metres. */
export function seatedPelvisTarget(spec: ChairSpec): { y: number; z: number } {
  const backFront = -spec.seatDepth / 2 + spec.backrestOffset + BACK_THICKNESS
  return { y: spec.seatHeight + PELVIS_ABOVE_SEAT, z: backFront + (spec.pelvisClearance ?? PELVIS_FROM_BACKREST) }
}

const mergedMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82 })
const woodMaterial = new MeshStandardMaterial({ color: '#8b5a32', roughness: 0.8 })
const darkMaterial = new MeshStandardMaterial({ color: '#3b2a1c', roughness: 0.85 })

interface BoxPart {
  w: number
  h: number
  d: number
  x: number
  y: number
  z: number
  dark: boolean
}

/** Seat, backrest and four legs as plain boxes (chair-local metres). */
function boxParts(spec: ChairSpec): BoxPart[] {
  const legH = spec.seatHeight - SEAT_THICKNESS
  const parts: BoxPart[] = [
    { w: spec.seatWidth, h: SEAT_THICKNESS, d: spec.seatDepth, x: 0, y: spec.seatHeight - SEAT_THICKNESS / 2, z: 0, dark: false },
    {
      w: spec.seatWidth, h: spec.backrestHeight, d: BACK_THICKNESS, x: 0,
      y: spec.seatHeight + spec.backrestHeight / 2,
      z: -spec.seatDepth / 2 + spec.backrestOffset + BACK_THICKNESS / 2, dark: false,
    },
  ]
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push({ w: LEG, h: legH, d: LEG, x: sx * (spec.seatWidth / 2 - 0.03), y: legH / 2, z: sz * (spec.seatDepth / 2 - 0.03), dark: true })
    }
  }
  return parts
}

const geometryCache = new Map<string, BufferGeometry>()
const specKey = (spec: ChairSpec) =>
  JSON.stringify([spec.seatHeight, spec.seatDepth, spec.seatWidth, spec.backrestOffset, spec.backrestHeight])

/** Whole chair merged into ONE geometry with vertex colours: a single draw call, cached per spec. */
export function createChairGeometry(spec: ChairSpec): BufferGeometry {
  const key = specKey(spec)
  const cached = geometryCache.get(key)
  if (cached) return cached
  const pieces = boxParts(spec).map((p) => {
    const g = new BoxGeometry(p.w, p.h, p.d)
    g.translate(p.x, p.y, p.z)
    const n = g.getAttribute('position').count
    const colors = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) colors.set(p.dark ? [0.045, 0.024, 0.012] : [0.26, 0.1, 0.03], i * 3)
    g.setAttribute('color', new BufferAttribute(colors, 3))
    return g
  })
  const merged = mergeGeometries(pieces, false)
  pieces.forEach((g) => g.dispose())
  geometryCache.set(key, merged)
  return merged
}

export function createMergedChairMesh(spec: ChairSpec) {
  return new Mesh(createChairGeometry(spec), mergedMaterial)
}

/** Phase 3.1B baseline: six separate meshes (6 draw calls) per chair, kept for the A/B benchmark. */
export function createTestChair(spec: ChairSpec): Group {
  const chair = new Group()
  for (const p of boxParts(spec)) {
    const mesh = new Mesh(new BoxGeometry(p.w, p.h, p.d), p.dark ? darkMaterial : woodMaterial)
    mesh.position.set(p.x, p.y, p.z)
    chair.add(mesh)
  }
  return chair
}

/** Frees per-chair baseline boxes; cached merged geometries are shared and freed by disposeChairResources. */
export function disposeChair(chair: Group) {
  const shared = new Set(geometryCache.values())
  chair.traverse((o) => {
    const mesh = o as Mesh
    if (mesh.isMesh && !shared.has(mesh.geometry)) mesh.geometry.dispose()
  })
}

export function disposeChairResources() {
  geometryCache.forEach((g) => g.dispose())
  geometryCache.clear()
}
