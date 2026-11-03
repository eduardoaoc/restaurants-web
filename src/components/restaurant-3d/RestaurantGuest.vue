<script setup lang="ts">
import type { OperationalBadgeModel } from '@/types/restaurant-3d/operational-event'
import type { OperationalAnchorData, RestaurantGuestPlacement } from '@/types/restaurant-3d/restaurant-operations'
import OperationalBadge from './OperationalBadge.vue'
import { CHAIR_SEAT_HEIGHT, GUEST_ANCHOR_HEIGHT, SCENE_COLORS } from './table-geometry'

/**
 * Stylized, low-poly seated person (boxes + a sphere). Local +Z is the
 * direction the guest faces, so rotating the group by `rotationY` points them
 * at the table. Placeholder only — no rig, no animation.
 */
const props = defineProps<{
  guest: RestaurantGuestPlacement
  /** Highest-priority event targeting this guest, if any. */
  badge?: OperationalBadgeModel
}>()

const anchorData: OperationalAnchorData = {
  targetType: 'guest',
  targetId: props.guest.id,
}

const seat = CHAIR_SEAT_HEIGHT
</script>

<template>
  <TresGroup
    :position="[guest.x, 0, guest.z]"
    :rotation="[0, guest.rotationY, 0]"
    :name="guest.id"
  >
    <!-- Torso -->
    <TresMesh
      :position="[0, seat + 0.27, -0.05]"
      cast-shadow
    >
      <TresBoxGeometry :args="[0.34, 0.5, 0.2]" />
      <TresMeshStandardMaterial
        :color="SCENE_COLORS.guest"
        :roughness="0.85"
      />
    </TresMesh>

    <!-- Head -->
    <TresMesh
      :position="[0, seat + 0.62, -0.05]"
      cast-shadow
    >
      <TresSphereGeometry :args="[0.1, 16, 12]" />
      <TresMeshStandardMaterial
        :color="SCENE_COLORS.guest"
        :roughness="0.85"
      />
    </TresMesh>

    <!-- Thighs, shins and forearms, mirrored left/right -->
    <template
      v-for="side in [-1, 1]"
      :key="side"
    >
      <TresMesh
        :position="[side * 0.1, seat + 0.07, 0.1]"
        cast-shadow
      >
        <TresBoxGeometry :args="[0.14, 0.12, 0.38]" />
        <TresMeshStandardMaterial
          :color="SCENE_COLORS.guest"
          :roughness="0.85"
        />
      </TresMesh>
      <TresMesh
        :position="[side * 0.1, seat - 0.2, 0.27]"
        cast-shadow
      >
        <TresBoxGeometry :args="[0.12, 0.4, 0.12]" />
        <TresMeshStandardMaterial
          :color="SCENE_COLORS.guest"
          :roughness="0.85"
        />
      </TresMesh>
      <TresMesh
        :position="[side * 0.21, seat + 0.2, 0.0]"
        cast-shadow
      >
        <TresBoxGeometry :args="[0.08, 0.08, 0.3]" />
        <TresMeshStandardMaterial
          :color="SCENE_COLORS.guest"
          :roughness="0.85"
        />
      </TresMesh>
    </template>

    <!-- Anchor above the head: guest-targeted events hang here. -->
    <TresGroup
      :position="[0, GUEST_ANCHOR_HEIGHT, -0.05]"
      :name="`anchor:guest:${guest.id}`"
      :user-data="anchorData"
    >
      <OperationalBadge
        v-if="badge"
        :badge="badge"
      />
    </TresGroup>
  </TresGroup>
</template>
