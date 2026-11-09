<script setup lang="ts">
import { computed } from 'vue'
import type { RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'
import type { OperationalEvent } from '@/types/restaurant-3d/operational-event'
import type { OperationalAnchorData, RestaurantTableState } from '@/types/restaurant-3d/restaurant-operations'
import OperationalBadge from './OperationalBadge.vue'
import RestaurantGuest from './RestaurantGuest.vue'
import TableInfoLabel from './TableInfoLabel.vue'
import TableStatusRing from './TableStatusRing.vue'
import { targetKey, toBadge } from './operational-events'
import { RING_MARGIN } from './ring-style'
import { tableVisualState } from './visual-state'
import {
  CHAIR_BACK_HEIGHT,
  CHAIR_SEAT_HEIGHT,
  CHAIR_SEAT_SIZE,
  SCENE_COLORS,
  TABLE_ANCHOR_HEIGHT,
  TABLE_HEIGHT,
  TABLE_TOP_THICKNESS,
  getChairPlacements,
  getGuestPlacements,
  getTableDimensions,
} from './table-geometry'

const props = withDefaults(defineProps<{
  table: RestaurantTableConfig
  /** Operational state; a table without one renders empty. */
  state?: RestaurantTableState
  /** Top event per target (`targetKey`), already reduced by priority. */
  events?: Map<string, OperationalEvent>
  /** Reference time (ms) for relative labels such as "Espera 18 min". */
  now?: number
  /** This table is the one currently open in the detail sheet (or picked in the editor). */
  selected?: boolean
  /**
   * Operational layer (status ring, badges, guests, occupancy line). Off in
   * layout editing: presentation only, the state itself is untouched.
   */
  showOperational?: boolean
  /** Draw placeholder guest bodies (off when animated customers are drawn by the scene). */
  guestBodies?: boolean
  /** Chair indexes drawn by an animated prop instead (customer sitting down / standing up): hide the static one. */
  hiddenChairs?: readonly number[]
}>(), { showOperational: true, guestBodies: true, hiddenChairs: () => [] })

const emit = defineEmits<{
  /** A click anywhere on the table: top, base, chairs or its hit area. */
  select: [tableId: string, release: { x: number; y: number }]
}>()

interface TablePointerEvent {
  clientX: number
  clientY: number
  button: number
  stopPropagation: () => void
}

/**
 * The table only reports a release on itself. Whether that release was a click
 * or the end of an orbit drag is decided by the scene, which tracks the press
 * on the canvas wrapper (OrbitControls swallows the table's own pointerdown).
 */
function onPointerUp(event: TablePointerEvent): void {
  if (event.button !== 0) return
  emit('select', props.table.id, { x: event.clientX, y: event.clientY })
  event.stopPropagation()
}

// Invisible footprint (table + chairs) so selection doesn't depend on hitting thin legs.
const HIT_PADDING = 0.9
const HIT_HEIGHT = 1.1
/** Seated customers reach ~1.35 m, so the hit area covers them and clicking one selects its table. */
const HIT_HEIGHT_WITH_CUSTOMERS = 1.5

const dimensions = computed(() => getTableDimensions(props.table.shape, props.table.seats))
const chairs = computed(() => getChairPlacements(props.table))
const guests = computed(() => getGuestPlacements(props.table, props.state?.guests ?? []))
const hitHeight = computed(() => (props.showOperational && !props.guestBodies && guests.value.length ? HIT_HEIGHT_WITH_CUSTOMERS : HIT_HEIGHT))

function badgeFor(targetType: 'table' | 'guest', targetId: string) {
  const event = props.events?.get(targetKey(targetType, targetId))
  return event ? toBadge(event, props.now ?? Date.now()) : undefined
}
const tableBadge = computed(() => (props.showOperational ? badgeFor('table', props.table.id) : undefined))
// Ring colour = what the badge shows (top table event), else the status.
const visualState = computed(() => props.showOperational
  ? tableVisualState(props.state?.status, props.events?.get(targetKey('table', props.table.id)))
  : 'neutral',
)

// The info label rests on the floor in front of the table (world +z, towards
// the default camera), clear of the guests and of the badge anchor above. The
// table group is rotated, so the world-space offset is converted to local space.
const LABEL_CLEARANCE = 0.55
const labelPosition = computed<[number, number, number]>(() => {
  const theta = (props.table.rotation * Math.PI) / 180
  const { width, depth } = dimensions.value
  const extentZ = (Math.abs(Math.cos(theta)) * depth + Math.abs(Math.sin(theta)) * width) / 2
  const distance = extentZ + RING_MARGIN + LABEL_CLEARANCE
  return [-distance * Math.sin(theta), 0.02, distance * Math.cos(theta)]
})

const anchorData: OperationalAnchorData = { targetType: 'table', targetId: props.table.id }
const rotationY = computed(() => (props.table.rotation * Math.PI) / 180)

const topY = TABLE_HEIGHT - TABLE_TOP_THICKNESS / 2
const legHeight = TABLE_HEIGHT - TABLE_TOP_THICKNESS
const LEG_SIZE = 0.06
const legInset = 0.1

const legPositions = computed<[number, number, number][]>(() => {
  const x = dimensions.value.width / 2 - legInset
  const z = dimensions.value.depth / 2 - legInset
  return [[x, legHeight / 2, z], [-x, legHeight / 2, z], [x, legHeight / 2, -z], [-x, legHeight / 2, -z]]
})

const backY = CHAIR_SEAT_HEIGHT + CHAIR_BACK_HEIGHT / 2
</script>

<template>
  <TresGroup
    :position="[table.position.x, 0, table.position.z]"
    :rotation="[0, rotationY, 0]"
    :name="table.id"
    @pointerup="onPointerUp"
  >
    <!-- Hit area: fully transparent, never drawn, only raycast -->
    <TresMesh :position="[0, hitHeight / 2, 0]">
      <TresBoxGeometry
        :key="`hit-${dimensions.width}-${dimensions.depth}-${hitHeight}`"
        :args="[dimensions.width + HIT_PADDING, hitHeight, dimensions.depth + HIT_PADDING]"
      />
      <TresMeshBasicMaterial
        transparent
        :opacity="0"
        :depth-write="false"
      />
    </TresMesh>

    <!-- Ring on the floor around the table; none while it is neutral (available) -->
    <TableStatusRing
      v-if="visualState !== 'neutral' || selected"
      :selection-style="showOperational ? 'operation' : 'editor'"
      :width="dimensions.width"
      :depth="dimensions.depth"
      :round="table.shape === 'round'"
      :visual-state="visualState"
      :selected="selected"
    />

    <!-- Table top -->
    <TresMesh
      :position="[0, topY, 0]"
      cast-shadow
      receive-shadow
    >
      <TresCylinderGeometry
        v-if="table.shape === 'round'"
        :key="`top-round-${dimensions.width}`"
        :args="[dimensions.width / 2, dimensions.width / 2, TABLE_TOP_THICKNESS, 48]"
      />
      <TresBoxGeometry
        v-else
        :key="`top-box-${dimensions.width}-${dimensions.depth}`"
        :args="[dimensions.width, TABLE_TOP_THICKNESS, dimensions.depth]"
      />
      <TresMeshStandardMaterial
        :color="SCENE_COLORS.tableTop"
        :roughness="0.6"
      />
    </TresMesh>

    <!-- Base: central pedestal for round tables, four legs otherwise -->
    <TresMesh
      v-if="table.shape === 'round'"
      :position="[0, legHeight / 2, 0]"
      cast-shadow
    >
      <TresCylinderGeometry :args="[0.07, 0.07, legHeight, 16]" />
      <TresMeshStandardMaterial :color="SCENE_COLORS.tableBase" />
    </TresMesh>
    <template v-else>
      <TresMesh
        v-for="(leg, index) in legPositions"
        :key="index"
        :position="leg"
        cast-shadow
      >
        <TresBoxGeometry :args="[LEG_SIZE, legHeight, LEG_SIZE]" />
        <TresMeshStandardMaterial :color="SCENE_COLORS.tableBase" />
      </TresMesh>
    </template>

    <!-- Chairs: one per seat, facing the table -->
    <TresGroup
      v-for="(chair, index) in chairs"
      :key="index"
      :position="[chair.x, 0, chair.z]"
      :rotation="[0, chair.rotationY, 0]"
      :visible="!hiddenChairs.includes(index)"
    >
      <TresMesh
        :position="[0, CHAIR_SEAT_HEIGHT - 0.025, 0]"
        cast-shadow
        receive-shadow
      >
        <TresBoxGeometry :args="[CHAIR_SEAT_SIZE, 0.05, CHAIR_SEAT_SIZE]" />
        <TresMeshStandardMaterial
          :color="SCENE_COLORS.chair"
          :roughness="0.7"
        />
      </TresMesh>
      <TresMesh
        :position="[0, backY, -(CHAIR_SEAT_SIZE / 2 - 0.02)]"
        cast-shadow
      >
        <TresBoxGeometry :args="[CHAIR_SEAT_SIZE, CHAIR_BACK_HEIGHT, 0.04]" />
        <TresMeshStandardMaterial
          :color="SCENE_COLORS.chair"
          :roughness="0.7"
        />
      </TresMesh>
      <TresMesh
        :position="[0, (CHAIR_SEAT_HEIGHT - 0.05) / 2, 0]"
        cast-shadow
      >
        <TresBoxGeometry :args="[0.06, CHAIR_SEAT_HEIGHT - 0.05, 0.06]" />
        <TresMeshStandardMaterial :color="SCENE_COLORS.tableBase" />
      </TresMesh>
    </TresGroup>

    <!-- Seated guests, one per occupied seat -->
    <RestaurantGuest
      v-for="guest in (showOperational ? guests : [])"
      :key="guest.id"
      :guest="guest"
      :body="guestBodies"
      :badge="badgeFor('guest', guest.id)"
    />

    <!-- Label anchor: persistent identity/occupancy, separate from the badge anchor. -->
    <TresGroup
      :position="labelPosition"
      :name="`anchor:label:${table.id}`"
    >
      <TableInfoLabel
        :table-number="table.number"
        :guest-count="state?.guests.length ?? 0"
        :occupied-at="state?.occupiedAt ?? null"
        :now="now ?? Date.now()"
        :identity-only="!showOperational"
      />
    </TresGroup>

    <!-- Anchor above the table centre: table-targeted events hang here. -->
    <TresGroup
      :position="[0, TABLE_ANCHOR_HEIGHT, 0]"
      :name="`anchor:table:${table.id}`"
      :user-data="anchorData"
    >
      <OperationalBadge
        v-if="tableBadge"
        :badge="tableBadge"
      />
    </TresGroup>
  </TresGroup>
</template>
