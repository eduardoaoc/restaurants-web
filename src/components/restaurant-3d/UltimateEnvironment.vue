<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useLoop, useTres } from '@tresjs/core'
import {
  BoxGeometry, CanvasTexture, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, SRGBColorSpace, Color,
  type Material,
} from 'three'
import { loadKayKitModel } from './kaykit-asset-cache'
import { FLOOR } from './floor'
import { cutawayTarget, easeCutaway, WALL_CUTAWAY_SCALE, type CutawayWall } from './wall-cutaway'
import { createUltimateMaterials, skinForSlot, skinFurniture, ULTIMATE_PALETTE, type UltimateFinish } from './ultimate-materials'
import { CHAIR_SIZE, skinPiece, ULTIMATE_BASE, ULTIMATE_FURNITURE } from './ultimate-furniture'
import { flattenModel, instancePlacements } from './ultimate-instancing'
import { DECK_TOP, planDoors, planUrban, planWallModules, sideTransform, type UrbanPlan } from './urban-plan'

/**
 * Local-demo architecture built on the Polyperfect "Low Poly Ultimate Pack" (M variant, converted to GLB; no KayKit
 * model is used here). LICENSE_UNVERIFIED: demo only, see docs/3d/ULTIMATE_PACK_ENVIRONMENT.md. Pieces with no suitable
 * model (striped floor, long counter, contact shadows) are simple primitives. Operational tables are not touched.
 *
 * Walls follow the existing cutaway contract: a wall between the camera and the room eases down to a knee wall.
 * Frames, glass and the door leaf are children of their wall group, so they move with it, with no extra state.
 */
const props = withDefaults(defineProps<{
  finish?: UltimateFinish
  /** The CONFIGURED entrance: the doorway is built where it is (never a fixed wall). null = no entrance door. */
  entrance?: { x: number; z: number } | null
  /** Urban plan of the exterior (terrace furniture is placed from it); derived from the entrance when absent. */
  plan?: UrbanPlan | null
}>(), { finish: 'final', entrance: null, plan: null })
const urbanPlan = computed(() => props.plan ?? planUrban(props.entrance))
/** Rebuild key: only what changes the architecture (wall modules / terrace). */
const buildKey = computed(() => planDoors(props.entrance).map(d => `${d.side}:${d.along.toFixed(2)}`).join('|'))
const root = ref<Group | null>(null)
const emit = defineEmits<{ loadError: [asset: string] }>()
const base = ULTIMATE_BASE
/** Counter placement (m): centre of its footprint; 8 m long, 0.7 m deep, parallel to the north wall. */
const COUNTER = { length: 8, x: -5, z: -5.2 } as const
const urls = {
  wall: `${base}/house-wall-3x3m.glb`,
  wallDoor: `${base}/house-wall-door-3x3m.glb`,
  corner: `${base}/house-wall-corner.glb`,
  door: `${base}/door-house-simple.glb`,
} as const

const WALL_T = 0.2
const HALF_W = FLOOR.width / 2
const HALF_D = FLOOR.depth / 2

const materials = createUltimateMaterials(props.finish)
const disposables: { dispose(): void }[] = []
/** Cutaway wall plus an optional hook that receives the eased wall scale (1 = full height .. WALL_CUTAWAY_SCALE). */
type UltimateWall = CutawayWall & { apply?: (scale: number) => void }
const walls: UltimateWall[] = []
/** 0 at the knee-wall scale, 1 at full height: how much of the tall detail (frames, glass, door leaf) is still shown. */
const detailLevel = (scale: number): number => Math.min(1, Math.max(0, (scale - WALL_CUTAWAY_SCALE) / (1 - WALL_CUTAWAY_SCALE)))
const { camera } = useTres()
const { onBeforeRender } = useLoop()
let lastCamera = ''
const stopCutaway = onBeforeRender(({ delta }) => {
  const cam = camera.value
  if (!cam || !walls.length) return
  const key = `${cam.position.x.toFixed(2)},${cam.position.z.toFixed(2)}`
  const settling = walls.some(wall => wall.currentScale !== wall.targetScale)
  if (key === lastCamera && !settling) return
  lastCamera = key
  for (const wall of walls) {
    wall.targetScale = cutawayTarget(wall, cam.position.x, cam.position.z)
    wall.currentScale = easeCutaway(wall.currentScale, wall.targetScale, delta)
    if (wall.kind === 'wall') wall.object.scale.y = wall.currentScale
    wall.apply?.(wall.currentScale)
  }
})
let alive = true

/** Clone a converted piece and re-skin each Unity slot with the scene's own finish. Geometry is shared with the cache. */
function skin(template: Object3D): Object3D {
  const clone = template.clone(true)
  clone.traverse(node => {
    if (!(node instanceof Mesh)) return
    node.castShadow = true
    node.receiveShadow = true
    // Remember (before re-skinning) which parts are frame/glass: they are hidden progressively when the wall is lowered.
    node.userData.isFrame = (Array.isArray(node.material) ? node.material : [node.material]).every((m: Material) => FRAME_SLOTS.test(m.name))
    node.material = Array.isArray(node.material)
      ? node.material.map((m: Material) => skinForSlot(m.name, materials))
      : skinForSlot((node.material as Material).name, materials)
  })
  return clone
}

/** Soft gradient used for contact shadows: opaque at the wall edge, fading out into the floor. */
function gradientTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 128
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, 128)
  g.addColorStop(0, 'rgba(40,18,8,0.55)')
  g.addColorStop(0.35, 'rgba(40,18,8,0.2)')
  g.addColorStop(1, 'rgba(40,18,8,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 4, 128)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
function softRectTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  ctx.filter = 'blur(10px)'
  ctx.fillStyle = 'rgba(40,18,8,0.6)'
  ctx.fillRect(28, 28, 72, 72)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

function contactStrip(parent: Group, tex: CanvasTexture, length: number, width: number, x: number, z: number, rotY: number): void {
  const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: true })
  const geo = new PlaneGeometry(length, width)
  disposables.push(mat, geo)
  const strip = new Mesh(geo, mat)
  strip.rotation.set(-Math.PI / 2, 0, 0)
  const holder = new Group()
  holder.add(strip)
  holder.position.set(x, 0.006, z)
  holder.rotation.y = rotY
  parent.add(holder)
}

const windowGeometries: { dispose(): void }[] = []
/**
 * Tall double-pane window (simple primitives, after the reference): thin graphite frame and mullion around two glass
 * panes, standing 1.5 cm proud of the interior face. Origin at the wall's base, so it lowers and hides with the wall.
 */
function buildTallWindow(): Group {
  const g = new Group()
  const W = 1.5
  const H = 2.15
  const Y0 = 0.5
  const T = 0.045
  const z = 0.1 + 0.012
  const box = (w: number, h: number, d: number, mat: Material, x: number, y: number, zz: number): void => {
    const geo = new BoxGeometry(w, h, d)
    windowGeometries.push(geo)
    const m = new Mesh(geo, mat)
    m.position.set(x, y, zz)
    m.castShadow = true
    m.receiveShadow = true
    g.add(m)
  }
  box(W, H, 0.012, materials.glassPane, 0, Y0 + H / 2, z) // glass
  box(W, T, 0.03, materials.graphite, 0, Y0 + T / 2, z + 0.008) // sill
  box(W, T, 0.03, materials.graphite, 0, Y0 + H - T / 2, z + 0.008) // head
  box(T, H, 0.03, materials.graphite, -W / 2 + T / 2, Y0 + H / 2, z + 0.008)
  box(T, H, 0.03, materials.graphite, W / 2 - T / 2, Y0 + H / 2, z + 0.008)
  box(T * 0.8, H, 0.03, materials.graphite, 0, Y0 + H / 2, z + 0.008) // mullion
  return g
}
/** Graphite frames and glass only (note: GREY-WHITE is the wall face and must NOT match). */
const FRAME_SLOTS = /^(\d+\s+)?(WHITE|GLASS)$/

interface Models {
  wall: Object3D
  wallDoor: Object3D
  corner: Object3D
  door: Object3D
  plant: Object3D
  glass: Object3D
  cup: Object3D
  chair: Object3D
  table: Object3D
}
let models: Models | null = null

/** Drop everything a previous build created (geometry, textures, wall bookkeeping); materials are kept. */
function clearBuild(): void {
  walls.length = 0
  root.value?.clear()
  for (const d of disposables) d.dispose()
  disposables.length = 0
  for (const g of windowGeometries) g.dispose()
  windowGeometries.length = 0
}

function build(): void {
  if (!models || !root.value || !alive) return
  clearBuild()
  const scene = root.value
  const { wall, wallDoor, corner, door, plant, glass, cup, chair, table } = models
  const plan = urbanPlan.value

  const addWall = (tpl: Object3D, x: number, z: number, rotY: number, sx: number, outward: [number, number], outward2?: [number, number], window = false): void => {
    const piece = new Group()
    piece.position.set(x, 0, z)
    piece.rotation.y = rotY
    const model = skin(tpl)
    model.scale.x = sx
    piece.add(model)

    // Tall detail that would flatten into a black band when the wall is lowered: frames and glass shrink to the floor,
    // the sky behind the window and an infill of the same paint take over, so the knee wall stays a clean painted wall.
    const frames: Object3D[] = []
    model.traverse(node => {
      if (node instanceof Mesh && node.userData.isFrame) frames.push(node)
    })
    // Tall double-pane window drawn over the solid wall face (the pack's own windows are low and wide).
    let tall: Group | null = null
    if (window) {
      tall = buildTallWindow()
      piece.add(tall)
    }
    const apply = (scale: number): void => {
      const k = detailLevel(scale)
      for (const f of frames) {
        f.scale.y = Math.max(k, 0.0001) / scale
        f.visible = k > 0.02
      }
      if (tall) {
        tall.scale.y = Math.max(k, 0.0001) / scale
        tall.visible = k > 0.02
      }
    }
    scene.add(piece)
    walls.push({ object: piece, kind: 'wall', outward, outward2, x, z, currentScale: 1, targetScale: 1, apply })
  }

  // Wall runs between the four corner posts, from the plan: every door module is centred on its opening, so the entrance
  // doorway sits exactly on the configured entrance coordinates (any wall), and the rest of the run is filled with
  // modules stretched to fit.
  const northZ = -HALF_D - WALL_T / 2
  const southZ = HALF_D + WALL_T / 2
  const westX = -HALF_W - WALL_T / 2
  const eastX = HALF_W + WALL_T / 2
  for (const m of planWallModules(props.entrance)) {
    const tpl = m.kind === 'door' ? wallDoor : wall
    const sx = m.stretch
    if (m.side === 'north') addWall(tpl, m.along, northZ, 0, sx, [0, -1], undefined, m.window)
    else if (m.side === 'south') addWall(tpl, m.along, southZ, Math.PI, sx, [0, 1], undefined, m.window)
    else if (m.side === 'west') addWall(tpl, westX, m.along, Math.PI / 2, sx, [-1, 0], undefined, m.window)
    else addWall(tpl, eastX, m.along, -Math.PI / 2, sx, [1, 0], undefined, m.window)
    // The terrace door carries a closed leaf (it shrinks away with the wall instead of popping out); the entrance is an
    // open doorway: no leaf (the sliding door is a later phase).
    if (m.kind === 'door' && !m.entrance) {
      const horizontal = m.side === 'north' || m.side === 'south'
      const lx = horizontal ? m.along : m.side === 'west' ? westX : eastX
      const lz = horizontal ? (m.side === 'north' ? northZ : southZ) : m.along
      const rot = m.side === 'north' ? 0 : m.side === 'south' ? Math.PI : m.side === 'west' ? Math.PI / 2 : -Math.PI / 2
      const outward: [number, number] = m.side === 'north' ? [0, -1] : m.side === 'south' ? [0, 1] : m.side === 'west' ? [-1, 0] : [1, 0]
      const leaf = new Group()
      leaf.position.set(lx, 0, lz)
      leaf.rotation.y = rot
      leaf.add(skin(door))
      scene.add(leaf)
      walls.push({
        object: leaf, kind: 'door', outward, x: lx, z: lz, currentScale: 1, targetScale: 1,
        apply: scale => {
          const k = detailLevel(scale)
          leaf.scale.y = Math.max(k, 0.0001)
          leaf.visible = k > 0.02
        },
      })
    }
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    addWall(corner, sx * (HALF_W + WALL_T / 2), sz * (HALF_D + WALL_T / 2), 0, 0.55, [sx, 0], [0, sz])
  }

  // Striped floor: 1 m cream / beige boards along the depth with a thin grout line (the base plane shows through).
  const boards = Math.ceil(FLOOR.width)
  const floor = new InstancedMesh(new BoxGeometry(0.97, 0.02, FLOOR.depth), materials.floor, boards)
  disposables.push(floor.geometry, floor)
  floor.name = 'striped-floor'
  floor.receiveShadow = true
  const m = new Matrix4()
  for (let i = 0; i < boards; i++) {
    m.makeTranslation(i - FLOOR.width / 2 + 0.5, -0.005, 0)
    floor.setMatrixAt(i, m)
    floor.setColorAt(i, new Color(i % 2 ? ULTIMATE_PALETTE.floorRose : ULTIMATE_PALETTE.floorCream))
  }
  floor.instanceMatrix.needsUpdate = true
  if (floor.instanceColor) floor.instanceColor.needsUpdate = true
  scene.add(floor)

  // Service counter, parallel to the back (north) wall like the reference: starts near the west wall, leaves an aisle
  // behind it and ends well before the open dining half. 8 m keeps >= 3 m of walking space in front of the tables.
  const counter = new Group()
  counter.name = 'long-counter'
  const L = COUNTER.length
  const part = (w: number, h: number, d: number, mat: Material, x: number, y: number, z: number): Mesh => {
    const geo = new BoxGeometry(w, h, d)
    disposables.push(geo)
    const mesh = new Mesh(geo, mat)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    counter.add(mesh)
    return mesh
  }
  part(L, 0.1, 0.62, materials.graphite, 0, 0.05, 0) // plinth
  part(L, 0.9, 0.7, materials.counterBody, 0, 0.55, 0.0) // body: warm orange, lighter than the walls (as in the reference)
  part(L + 0.12, 0.07, 0.86, materials.woodWarm, 0, 1.035, 0.05) // top, overhanging the customer side
  part(0.06, 0.9, 0.72, materials.woodWarm, L / 2, 0.55, 0) // end caps
  part(0.06, 0.9, 0.72, materials.woodWarm, -L / 2, 0.55, 0)
  for (let i = 1; i < 8; i++) part(0.025, 0.86, 0.02, materials.grout, -L / 2 + (L / 8) * i, 0.55, 0.355) // panel joints
  // A few objects on the counter: lamp, till, two cups, a plate and a glass.
  const topY = 1.07
  const lampBase = part(0.14, 0.16, 0.14, materials.graphite, -L / 2 + 0.6, topY + 0.08, 0.05)
  lampBase.castShadow = false
  part(0.3, 0.32, 0.3, materials.lamp, -L / 2 + 0.6, topY + 0.32, 0.05).castShadow = false
  part(0.42, 0.18, 0.34, materials.till, 0.9, topY + 0.09, 0.02)
  part(0.3, 0.14, 0.26, materials.till, 0.9, topY + 0.25, -0.02)
  part(0.3, 0.012, 0.22, materials.cream, 2.0, topY + 0.006, 0.12) // menu card
  for (const [model, kind, ox, oz] of [[cup, 'glass', 1.5, 0.1], [cup, 'glass', 1.7, 0.18], [glass, 'glass', 2.4, 0.05]] as const) {
    const item = skinPiece(model, kind, materials)
    item.position.set(-L / 2 + 3.1 + ox, topY, oz)
    counter.add(item)
  }
  counter.position.set(COUNTER.x, 0, COUNTER.z)
  scene.add(counter)

  // One planter at each end of the open (south) side, next to the west door and in the south-east corner. A planter that
  // would stand in the entrance's walking corridor or on the reserved reception spot is left out.
  for (const [px, pz] of [[-HALF_W + 0.7, HALF_D - 0.8], [HALF_W - 0.7, HALF_D - 0.8]] as const) {
    if (props.entrance && Math.hypot(px - props.entrance.x, pz - props.entrance.z) < 3) continue
    const pot = skinPiece(plant, 'plant', materials)
    pot.position.set(px, 0, pz)
    scene.add(pot)
  }

  // Terrace: always drawn (deck + hedges live in UrbanExterior); the furniture is decorative only. No table record, no
  // operational state, no badge: it can neither take an order nor look occupied.
  const terrace = new Group()
  terrace.name = 'terrace-furniture'
  const frame = sideTransform(plan.terrace.side)
  terrace.position.set(frame.x, DECK_TOP, frame.z)
  terrace.rotation.y = frame.rotationY
  const tablePiece = flattenModel(table, { x: 0.8, y: 0.75, z: 0.8 }, mat => skinFurniture(mat.name, 'table', materials))
  const chairPiece = flattenModel(chair, CHAIR_SIZE, mat => skinFurniture(mat.name, 'chair', materials))
  const plantPiece = flattenModel(plant, {}, mat => skinFurniture(mat.name, 'plant', materials))
  disposables.push(tablePiece.geometry, chairPiece.geometry, plantPiece.geometry)
  const chairs: Array<{ x: number; z: number; yaw: number }> = []
  for (const t of plan.terrace.tables) {
    chairs.push({ x: t.a - 0.62, z: t.d, yaw: Math.PI / 2 }, { x: t.a + 0.62, z: t.d, yaw: -Math.PI / 2 })
  }
  terrace.add(
    instancePlacements(tablePiece, tablePiece.materials, plan.terrace.tables.map(t => ({ x: t.a, z: t.d, yaw: 0 })), 'terrace-tables'),
    instancePlacements(chairPiece, chairPiece.materials, chairs, 'terrace-chairs'),
    instancePlacements(plantPiece, plantPiece.materials, plan.terrace.plants.map(p => ({ x: p.a, z: p.d, yaw: 0 })), 'terrace-plants'),
  )
  scene.add(terrace)

  if (props.finish === 'raw') return
  // Contact shadows: soft gradient along each wall base and a blurred pad under the counter.
  const edge = gradientTexture()
  const pad = softRectTexture()
  disposables.push(edge, pad)
  contactStrip(scene, edge, FLOOR.width, 0.9, 0, -HALF_D + 0.45, 0)
  contactStrip(scene, edge, FLOOR.depth, 0.9, -HALF_W + 0.45, 0, Math.PI / 2)
  contactStrip(scene, edge, FLOOR.width, 0.9, 0, HALF_D - 0.45, Math.PI)
  contactStrip(scene, edge, FLOOR.depth, 0.9, HALF_W - 0.45, 0, -Math.PI / 2)
  const padMat = new MeshBasicMaterial({ map: pad, transparent: true, depthWrite: false })
  const padGeo = new PlaneGeometry(L + 1.6, 2.6)
  disposables.push(padMat, padGeo)
  const padMesh = new Mesh(padGeo, padMat)
  padMesh.rotation.x = -Math.PI / 2
  padMesh.position.set(COUNTER.x, 0.008, COUNTER.z + 0.2)
  scene.add(padMesh)
}

onMounted(async () => {
  try {
    const [wall, wallDoor, corner, door, plant, glass, cup, chair, table] = await Promise.all(
      [...Object.values(urls), ULTIMATE_FURNITURE.plant, ULTIMATE_FURNITURE.glass, `${ULTIMATE_BASE}/cup-small.glb`, ULTIMATE_FURNITURE.chair, ULTIMATE_FURNITURE.table].map(loadKayKitModel),
    )
    if (!alive) return
    models = { wall, wallDoor, corner, door, plant, glass, cup, chair, table }
    build()
  } catch (error) {
    if (alive) {
      const url = error instanceof Error ? error.message : 'ultimate environment asset'
      console.error('[restaurant-3d] ultimate environment failed to load', error)
      emit('loadError', url)
    }
  }
})

// The entrance moved to another wall / door position (e.g. edited in the fixture): rebuild the architecture around it.
watch(buildKey, () => build())

onBeforeUnmount(() => {
  alive = false
  stopCutaway.off()
  walls.length = 0
  root.value?.clear()
  for (const d of disposables) d.dispose()
  for (const m of materials.all) m.dispose()
  for (const g of windowGeometries) g.dispose()
})
</script>

<template>
  <TresGroup ref="root" name="ultimate-environment" />
</template>
