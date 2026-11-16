<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  BoxGeometry, CircleGeometry, Color, CylinderGeometry, Group, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, Object3D,
  type BufferGeometry, type Material,
} from 'three'
import { createUrbanMaterials, URBAN_PALETTE } from './urban-materials'
import {
  APRON_TOP, CURB_WIDTH, DECK_TOP, PAVEMENT_TOP, ROAD_TOP, ROAD_WIDTH, SIDEWALK_DEPTH, TREE_SHAPE,
  sideTransform, toLocal, toWorld as toWorldXZ, type BoxPlan, type TreePlan, type UrbanPlan,
} from './urban-plan'

/**
 * Urban exterior of the Ultimate demo (Phase 3.1K-D2A/D2B): continuous sidewalks and curbs on both sides of a long road
 * with centre dashes and edge lines, natural street trees on a shrub bed, streetlights, planters and the terrace deck with
 * its hedges. No neighbouring buildings.
 * Procedural geometry only (no model, no texture, nothing licence-bound), drawn from `plan` so the street always lies on
 * the entrance's wall. Every repeated element is ONE InstancedMesh with per-instance colour, so the whole exterior is
 * about twenty draw calls. Nothing here is operational and nothing moves.
 *
 * The terrace deck, its hedges and the ground are drawn whatever the terrace's operational state: it is scenery.
 */
const props = defineProps<{ plan: UrbanPlan }>()
const root = ref<Group | null>(null)
const materials = createUrbanMaterials()
const disposables: { dispose(): void }[] = []
const key = computed(() => `${props.plan.side}:${props.plan.doorA.toFixed(2)}:${props.plan.hasEntrance}`)

/** Ground disc radius (m): far beyond anything the fog leaves visible. */
const GROUND_RADIUS = 240
/** Pavement slab length (m): the joint pattern only needs to read near the restaurant. */
const SLAB = 2.4
/** Trees within this distance (m) of the room's centre cast shadows (the shadow frustum covers the room only). */
const SHADOW_REACH = 17
const scratch = new Object3D()
const tint = new Color()

interface InstanceSpec {
  x: number
  y: number
  z: number
  sx?: number
  sy?: number
  sz?: number
  ry?: number
  color?: string
}

/** Instanced mesh of one geometry; `specs` give each copy's position, scale, yaw and tint. */
function instanced(geometry: BufferGeometry, material: Material, specs: readonly InstanceSpec[], name: string, shadows: { cast?: boolean; receive?: boolean } = {}): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, Math.max(1, specs.length))
  const m = new Matrix4()
  specs.forEach((s, i) => {
    scratch.position.set(s.x, s.y, s.z)
    scratch.rotation.set(0, s.ry ?? 0, 0)
    scratch.scale.set(s.sx ?? 1, s.sy ?? 1, s.sz ?? 1)
    scratch.updateMatrix()
    m.copy(scratch.matrix)
    mesh.setMatrixAt(i, m)
    if (s.color) mesh.setColorAt(i, tint.set(s.color))
  })
  mesh.count = specs.length
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.name = name
  mesh.castShadow = !!shadows.cast
  mesh.receiveShadow = !!shadows.receive
  mesh.frustumCulled = false
  mesh.raycast = () => undefined
  disposables.push(geometry, mesh)
  return mesh
}

const shade = (hex: string, amount: number): string => `#${new Color(hex).offsetHSL(0, 0, amount).getHexString()}`

/** Local (wall frame) group: x along the wall, z straight out from its outer face. */
function sideGroup(side: UrbanPlan['side'], name: string): Group {
  const g = new Group()
  const t = sideTransform(side)
  g.name = name
  g.position.set(t.x, 0, t.z)
  g.rotation.y = t.rotationY
  return g
}

function shrubs(boxes: readonly BoxPlan[], baseY: number): InstanceSpec[] {
  const out: InstanceSpec[] = []
  boxes.forEach((b, bi) => {
    const long = b.w >= b.depth
    const n = Math.max(1, Math.round((long ? b.w : b.depth) / 0.8))
    for (let i = 0; i < n; i++) {
      const u = ((i + 0.5) / n - 0.5) * (long ? b.w : b.depth) * 0.82
      const r = 0.34 + ((bi * 3 + i * 5) % 4) * 0.035
      out.push({ x: b.a + (long ? u : 0), y: baseY + b.h + r * 0.35, z: b.d + (long ? 0 : u), sx: r * 1.3, sy: r * 0.95, sz: r * 1.3, color: shade(URBAN_PALETTE.shrub, ((bi + i) % 3) * 0.025 - 0.02) })
    }
  })
  return out
}

function build(): void {
  const scene = root.value
  if (!scene) return
  clear()
  const { plan } = props
  const sw = SIDEWALK_DEPTH
  const roadD0 = sw + CURB_WIDTH
  const roadD1 = roadD0 + ROAD_WIDTH
  const far = plan.farSidewalk

  // ---- ground: a very large dark ground (fog dissolves it into the background), the paved apron around the room ---------
  const ground = new Mesh(new CircleGeometry(GROUND_RADIUS, 48), materials.ground)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.24
  ground.receiveShadow = true
  ground.name = 'urban-ground'
  ground.raycast = () => undefined
  disposables.push(ground.geometry)
  scene.add(ground)
  const { minX, maxX, minZ, maxZ } = plan.apron
  const apron = new Mesh(new BoxGeometry(maxX - minX, 0.2, maxZ - minZ), materials.apron)
  apron.position.set((minX + maxX) / 2, APRON_TOP - 0.1, (minZ + maxZ) / 2)
  apron.receiveShadow = true
  apron.name = 'urban-apron'
  apron.raycast = () => undefined
  disposables.push(apron.geometry)
  scene.add(apron)

  // ---- street (wall frame of the entrance side) -----------------------------------------------------------------------
  const street = sideGroup(plan.side, 'urban-street')
  const { a0, a1 } = plan.sidewalk
  const length = a1 - a0
  // Sidewalks (near and far): rows of ~1.5 m slabs with a hairline joint, each a touch lighter or darker. One mesh.
  const slabs: InstanceSpec[] = []
  const paving = (z0: number, depth: number, rows: number, seed: number): void => {
    const cols = Math.ceil(length / SLAB)
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const w = length / cols
        const alt = (c + r) % 2 === 0
        slabs.push({
          x: a0 + (c + 0.5) * w, y: PAVEMENT_TOP - 0.1, z: z0 + ((r + 0.5) * depth) / rows,
          sx: w - 0.04, sz: depth / rows - 0.04,
          color: shade(alt ? URBAN_PALETTE.pavement : URBAN_PALETTE.pavementAlt, (((c + seed) * 7 + r * 3) % 5) * 0.006),
        })
      }
    }
  }
  paving(0, sw, 2, 0)
  paving(far.d0, far.depth, 1, 3)
  street.add(instanced(new BoxGeometry(1, 0.2, 1), materials.tinted, slabs, 'sidewalk-slabs', { receive: true }))
  // Curbs: one long stone on each side of the road, flush with the pavement and one step above the asphalt.
  const curbGeo = new BoxGeometry(length, PAVEMENT_TOP - ROAD_TOP, CURB_WIDTH)
  disposables.push(curbGeo)
  for (const z of [sw + CURB_WIDTH / 2, roadD1 + CURB_WIDTH / 2]) {
    const curb = new Mesh(curbGeo, materials.curb)
    curb.position.set((a0 + a1) / 2, (PAVEMENT_TOP + ROAD_TOP) / 2, z)
    curb.receiveShadow = true
    curb.name = 'curb'
    curb.raycast = () => undefined
    street.add(curb)
  }
  // Road surface; markings: a dashed centre line and a solid, low-contrast edge line on each side (one instanced mesh).
  const road = new Mesh(new BoxGeometry(length, 0.3, ROAD_WIDTH), materials.road)
  road.position.set((a0 + a1) / 2, ROAD_TOP - 0.15, roadD0 + ROAD_WIDTH / 2)
  road.receiveShadow = true
  road.name = 'road'
  road.raycast = () => undefined
  disposables.push(road.geometry)
  street.add(road)
  const marks: InstanceSpec[] = []
  const mid = roadD0 + ROAD_WIDTH / 2
  for (let a = a0 + 2; a < a1 - 4; a += 4) marks.push({ x: a + 1.5, y: ROAD_TOP + 0.004, z: mid, sx: 3, sy: 0.008, sz: 0.14 })
  for (const z of [roadD0 + 0.4, roadD1 - 0.4]) marks.push({ x: (a0 + a1) / 2, y: ROAD_TOP + 0.004, z, sx: length, sy: 0.008, sz: 0.1 })
  street.add(instanced(new BoxGeometry(1, 1, 1), materials.marking, marks, 'road-markings', { receive: true }))

  // Threshold of the entrance: a dark mat on the sidewalk straight out from the doorway (it stays readable when the wall
  // is lowered). Only when an entrance is configured.
  if (plan.hasEntrance) street.add(instanced(new BoxGeometry(1.5, 0.02, 0.9), materials.pit, [{ x: plan.doorA, y: PAVEMENT_TOP + 0.01, z: 0.55 }], 'entrance-mat', { receive: true }))

  // Trees (street, far side and around the lot): one set of instanced parts for all of them. The shapes come from
  // TREE_SHAPE, the same numbers the occlusion maths uses, so a tree hides exactly what it appears to hide.
  const all: TreePlan[] = [
    ...plan.trees, ...plan.farTrees,
    ...plan.lotTrees.map(t => ({ ...toLocal(plan.side, t.x, t.z), scale: t.scale, tone: t.tone })),
  ]
  const T = TREE_SHAPE
  // Shadow-casting trees (near the room, inside the shadow frustum) are separate meshes from the distant ones, so a tree
  // 80 m away is never drawn into the shadow map.
  const parts = () => ({ pits: [] as InstanceSpec[], trunks: [] as InstanceSpec[], crowns: [] as InstanceSpec[], lobes: [] as InstanceSpec[], beds: [] as InstanceSpec[] })
  const lit = parts()
  const plain = parts()
  const origin = plan.side
  for (const t of all) {
    const k = t.scale
    const leaf = URBAN_PALETTE.leaf[t.tone % 3]
    const w = toWorldXZ(origin, t.a, t.d)
    const near = Math.abs(w.x) < SHADOW_REACH && Math.abs(w.z) < SHADOW_REACH
    const set = near ? lit : plain
    // Past 50 m a tree is a small, hazy shape: trunk and crown only (no pit, lobe or shrub bed), fewer triangles.
    const distant = Math.abs(t.a) > 50
    if (!distant) set.pits.push({ x: t.a, y: PAVEMENT_TOP + 0.008, z: t.d, sx: 1.5 * k, sz: 1.5 * k })
    set.trunks.push({ x: t.a, y: PAVEMENT_TOP + (T.trunk.h * k) / 2, z: t.d, sx: k, sy: T.trunk.h * k, sz: k })
    set.crowns.push({ x: t.a, y: PAVEMENT_TOP + T.crown.y * k, z: t.d, sx: T.crown.r * k, sy: T.crown.r * k, sz: T.crown.r * k, ry: t.tone, color: leaf })
    if (distant) continue
    set.lobes.push({ x: t.a + T.lobe.dx * k, y: PAVEMENT_TOP + (T.crown.y + T.lobe.dy) * k, z: t.d + T.lobe.dz * k, sx: T.lobe.r * k, sy: T.lobe.r * k, sz: T.lobe.r * k, ry: 1, color: shade(leaf, -0.04) })
    set.beds.push({ x: t.a, y: PAVEMENT_TOP + T.bed.y * k, z: t.d, sx: T.bed.rx * k, sy: T.bed.ry * k, sz: T.bed.rx * k, ry: t.tone, color: shade(URBAN_PALETTE.shrub, (t.tone - 1) * 0.02) })
  }
  for (const [set, cast, tag] of [[lit, true, 'near'], [plain, false, 'far']] as const) {
    if (!set.trunks.length) continue
    street.add(instanced(new BoxGeometry(1, 0.016, 1), materials.pit, set.pits, `tree-pits-${tag}`, { receive: true }))
    street.add(instanced(new CylinderGeometry(T.trunk.r * 0.72, T.trunk.r, 1, 7), materials.trunk, set.trunks, `tree-trunks-${tag}`, { cast }))
    street.add(instanced(new IcosahedronGeometry(1, 1), materials.tinted, set.crowns, `tree-crowns-${tag}`, { cast }))
    if (set.lobes.length) street.add(instanced(new IcosahedronGeometry(1, 1), materials.tinted, set.lobes, `tree-lobes-${tag}`, { cast }))
    if (set.beds.length) street.add(instanced(new IcosahedronGeometry(1, 1), materials.tinted, set.beds, `tree-beds-${tag}`, { cast }))
  }

  // Far side backdrop: a low clipped hedge behind the far pavement, so the road is never followed by bare ground.
  const hedgeD = far.d0 + far.depth + 0.45
  street.add(instanced(new BoxGeometry(1, 1, 1), materials.hedge, [{ x: (a0 + a1) / 2, y: PAVEMENT_TOP + 0.5, z: hedgeD, sx: length, sy: 1, sz: 0.9 }], 'far-hedge'))

  // Planters against the building (concrete boxes with shrubs). The doorway's 1.4 m corridor stays clear.
  const planterBoxes: InstanceSpec[] = plan.planters.map(p => ({ x: p.a, y: PAVEMENT_TOP + p.h / 2, z: p.d, sx: p.w, sy: p.h, sz: p.depth }))
  street.add(instanced(new BoxGeometry(1, 1, 1), materials.planter, planterBoxes, 'planters', { cast: true, receive: true }))
  street.add(instanced(new IcosahedronGeometry(1, 1), materials.shrub, shrubs(plan.planters, PAVEMENT_TOP), 'planter-shrubs', { cast: true }))

  // Streetlights: a slim pole, an arm over the road and a warm lamp head. Far-side lamps reach back across the road.
  const lampSpecs = (lamps: readonly { a: number; d: number }[], dir: 1 | -1) => ({
    poles: lamps.map((l): InstanceSpec => ({ x: l.a, y: PAVEMENT_TOP + 2.25, z: l.d })),
    arms: lamps.map((l): InstanceSpec => ({ x: l.a, y: PAVEMENT_TOP + 4.45, z: l.d + 0.5 * dir })),
    heads: lamps.map((l): InstanceSpec => ({ x: l.a, y: PAVEMENT_TOP + 4.38, z: l.d + 0.98 * dir })),
  })
  const near = lampSpecs(plan.lamps, 1)
  const away = lampSpecs(plan.farLamps, -1)
  street.add(instanced(new CylinderGeometry(0.05, 0.07, 4.5, 8), materials.pole, [...near.poles, ...away.poles], 'lamp-poles'))
  street.add(instanced(new BoxGeometry(0.06, 0.06, 1.1), materials.pole, [...near.arms, ...away.arms], 'lamp-arms'))
  street.add(instanced(new BoxGeometry(0.3, 0.08, 0.5), materials.lampGlow, [...near.heads, ...away.heads], 'lamp-heads'))
  scene.add(street)

  // ---- terrace (wall frame of the terrace side): one timber deck over the whole wall, low hedges around it ---------------
  const terrace = sideGroup(plan.terrace.side, 'urban-terrace')
  const { deck } = plan.terrace
  const planks: InstanceSpec[] = []
  const plankPitch = 0.25
  for (let i = 0; i < Math.floor(deck.depth / plankPitch); i++) {
    planks.push({ x: (deck.a0 + deck.a1) / 2, y: DECK_TOP - 0.045, z: (i + 0.5) * plankPitch, sx: deck.a1 - deck.a0, sz: plankPitch - 0.018, color: shade(URBAN_PALETTE.deck, ((i * 5) % 7) * 0.008 - 0.02) })
  }
  terrace.add(instanced(new BoxGeometry(1, 0.09, 1), materials.tinted, planks, 'terrace-deck', { receive: true }))
  const hedgeBoxes: InstanceSpec[] = plan.terrace.hedges.map(h => ({ x: h.a, y: DECK_TOP + h.h / 2, z: h.d, sx: h.w, sy: h.h, sz: h.depth }))
  terrace.add(instanced(new BoxGeometry(1, 1, 1), materials.planter, hedgeBoxes, 'terrace-planters', { cast: true, receive: true }))
  terrace.add(instanced(new IcosahedronGeometry(1, 1), materials.shrub, shrubs(plan.terrace.hedges, DECK_TOP), 'terrace-shrubs', { cast: true }))
  scene.add(terrace)
}

function clear(): void {
  root.value?.clear()
  for (const d of disposables) d.dispose()
  disposables.length = 0
}

onMounted(build)
watch(key, build)
onBeforeUnmount(() => {
  clear()
  for (const m of materials.all) m.dispose()
})
</script>

<template>
  <TresGroup
    ref="root"
    name="urban-exterior"
  />
</template>
