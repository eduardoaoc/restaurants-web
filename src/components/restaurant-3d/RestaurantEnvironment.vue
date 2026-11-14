<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useLoop, useTres } from '@tresjs/core'
import { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry } from 'three'
import { loadKayKitModel } from './kaykit-asset-cache'
import { FLOOR } from './floor'
import { LIGHT_STAGE } from './scene-appearance'
import { skinStage, type StageRole } from './stage-materials'
import { cutawayTarget, easeCutaway, type CutawayWall } from './wall-cutaway'
import {
  BAR_ITEMS, BAR_SHELF, KITCHEN_ITEMS, WALL_CENTER_X, WALL_CENTER_Z, WALL_HEIGHT_SCALE, planWalls,
  type ServiceModel, type WallPiece, type WallSide,
} from './environment-plan'

/**
 * Visual-only room envelope and service areas. Operational tables/IDs remain in RestaurantScene.
 * KayKit assets are loaded on demand and their immutable geometry/materials are shared by clones.
 * Placement comes from `environment-plan.ts` (also the source of the navigation / editor service footprints).
 */
const props = withDefaults(defineProps<{
  /** Light stage: softer terrace tone. */
  light?: boolean
  /** Persisted guest entrance: the entrance doorway is cut into the wall nearest to it. Null = no entrance doorway. */
  entrance?: { x: number; z: number } | null
}>(), { entrance: null, light: false })
const root = ref<Group | null>(null)
const wallRoot = ref<Group | null>(null)
const emit = defineEmits<{ loadError: [asset: string] }>()
const base = '/assets/restaurant-3d/models'
const restaurant = `${base}/kaykit-restaurant`
const furniture = `${base}/kaykit-furniture`
/** Adjustable visual reservation outside the indoor floor; this is not part of the persisted layout contract. */
const TERRACE_RESERVATION = { center: { x: FLOOR.width / 2 + 4, z: 0.75 }, width: 8, depth: 8, connection: 'east doorway' } as const
const urls = {
  wall: `${restaurant}/wall.gltf`,
  window: `${restaurant}/wall_window_open.gltf`,
  doorway: `${restaurant}/wall_doorway.gltf`,
  counter: `${restaurant}/kitchencounter_straight_A.gltf`,
  sink: `${restaurant}/kitchencounter_sink.gltf`,
  stove: `${restaurant}/stove_multi.gltf`,
  fridge: `${restaurant}/fridge_A.gltf`,
  shelf: `${furniture}/shelf_B_large_decorated.gltf`,
} as const

// Walls between the camera and the room are lowered to a knee wall so they never cover tables, guests or their
// indicators, whichever way the person orbits. Purely visual: no wall carries an id or a pointer handler.
const walls: CutawayWall[] = []
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
    wall.object.scale.y = WALL_HEIGHT_SCALE * wall.currentScale
  }
})

let alive = true
let terraceFloor: Mesh<PlaneGeometry, MeshStandardMaterial> | null = null
/** Daylight pane behind each window: without it the open window frames show the dark page background as black holes. */
const daylightGeometry = new PlaneGeometry(2.2, 2.4)
const daylightMaterial = new MeshBasicMaterial({ color: '#e9dfc9', fog: false })
let templates: Record<'wall' | 'window' | 'doorway', Object3D> | null = null
/** Light stage: the teal two-tone KayKit walls become one soft cream maquette tone (shared, so one material for every piece). */
const softWallMaterial = new MeshStandardMaterial({ color: LIGHT_STAGE.wall, roughness: 0.92 })

function place(template: Object3D, position: [number, number, number], rotationY = 0, scale = 1): Object3D {
  const clone = template.clone(true)
  clone.position.set(...position)
  clone.rotation.y = rotationY
  clone.scale.setScalar(scale)
  clone.traverse(node => {
    node.castShadow = true
    node.receiveShadow = true
  })
  return clone
}

const SIDE: Record<WallSide, { rotationY: number; outward: [number, number] }> = {
  north: { rotationY: 0, outward: [0, -1] },
  south: { rotationY: Math.PI, outward: [0, 1] },
  east: { rotationY: -Math.PI / 2, outward: [1, 0] },
  west: { rotationY: Math.PI / 2, outward: [-1, 0] },
}

/** One outer-wall piece; its inner face is the floor edge. `stretch` fits the module to its span. */
function wallPiece(group: Group, piece: WallPiece): void {
  if (!templates) return
  const { rotationY, outward } = SIDE[piece.side]
  const horizontal = piece.side === 'north' || piece.side === 'south'
  const x = horizontal ? piece.along : (piece.side === 'east' ? WALL_CENTER_X : -WALL_CENTER_X)
  const z = horizontal ? (piece.side === 'south' ? WALL_CENTER_Z : -WALL_CENTER_Z) : piece.along
  const object = place(templates[piece.kind], [x, 0, z], rotationY)
  if (props.light) object.traverse(node => { if (node instanceof Mesh) node.material = softWallMaterial })
  object.scale.set(piece.stretch, WALL_HEIGHT_SCALE, 1)
  if (piece.kind === 'window') {
    const daylight = new Mesh(daylightGeometry, daylightMaterial)
    daylight.position.set(0, 2.0, -0.3)
    object.add(daylight)
  }
  group.add(object)
  walls.push({ object, kind: 'wall', outward, x, z, currentScale: 1, targetScale: 1 })
}

/** (Re)builds the perimeter. Cheap (~20 clones sharing cached geometry); runs on mount and when the entrance moves. */
function buildWalls(): void {
  const group = wallRoot.value
  if (!group || !templates) return
  group.clear()
  walls.length = 0
  lastCamera = ''
  for (const piece of planWalls(props.entrance)) wallPiece(group, piece)
}

const entranceKey = computed(() => (props.entrance ? `${props.entrance.x},${props.entrance.z}` : ''))
watch(entranceKey, () => {
  if (alive) buildWalls()
})

onMounted(async () => {
  try {
    const [wall, windowWall, doorway, counter, sink, stove, fridge, shelf] = await Promise.all(Object.values(urls).map(loadKayKitModel))
    if (!alive || !root.value) return
    const scene = root.value
    templates = { wall, window: windowWall, doorway }
    buildWalls()

    // Empty outdoor floor reservation only: no furniture, operational tables or customer routes.
    // Not drawn on the light stage: it is a placeholder, not part of the saved layout, and would read as a grey slab.
    if (!props.light) {
      terraceFloor = new Mesh(
        new PlaneGeometry(TERRACE_RESERVATION.width, TERRACE_RESERVATION.depth),
        new MeshStandardMaterial({ color: '#9d886e', roughness: 0.95 }),
      )
      terraceFloor.name = 'future-terrace-reservation'
      terraceFloor.rotation.x = -Math.PI / 2
      terraceFloor.position.set(TERRACE_RESERVATION.center.x, -0.02, TERRACE_RESERVATION.center.z)
      terraceFloor.receiveShadow = true
      scene.add(terraceFloor)
    }

    // Kitchen (north-west) and service bar (north-east): 2 x 2 m modules in a row with their backs on the north wall
    // and fronts facing the room. The same plan feeds the navigation / editor footprints.
    const models: Record<ServiceModel, Object3D> = { counter, sink, stove, fridge }
    const ROLE: Record<ServiceModel, StageRole> = { counter: 'counter', sink: 'appliance', stove: 'appliance', fridge: 'appliance' }
    for (const item of [...KITCHEN_ITEMS, ...BAR_ITEMS]) {
      const object = place(models[item.model], [item.x, 0, item.z])
      if (props.light) skinStage(object, ROLE[item.model])
      scene.add(object)
    }
    const shelfObject = place(shelf, [BAR_SHELF.x, BAR_SHELF.y, BAR_SHELF.z])
    if (props.light) skinStage(shelfObject, 'shelf')
    scene.add(shelfObject)
  } catch (error) {
    if (alive) {
      const url = error instanceof Error ? error.message : 'restaurant environment asset'
      console.error('[restaurant-3d] environment asset failed to load', error)
      emit('loadError', url)
    }
  }
})

onBeforeUnmount(() => {
  alive = false
  stopCutaway.off()
  walls.length = 0
  templates = null
  daylightGeometry.dispose()
  daylightMaterial.dispose()
  softWallMaterial.dispose()
  // Clones share immutable cached source geometry/materials. Removing the group releases scene references;
  // shared source resources remain cached for a later mount and are not disposed while still referenced.
  wallRoot.value?.clear()
  root.value?.clear()
  if (terraceFloor) {
    terraceFloor.geometry.dispose()
    terraceFloor.material.dispose()
    terraceFloor = null
  }
})
</script>

<template>
  <TresGroup ref="root" name="restaurant-environment">
    <TresGroup ref="wallRoot" name="restaurant-walls" />
  </TresGroup>
</template>
