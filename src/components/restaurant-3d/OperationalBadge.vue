<script setup lang="ts">
import { computed } from 'vue'
import { Html } from '@tresjs/cientos'
import type { OperationalBadgeModel } from '@/types/restaurant-3d/operational-event'
import { VISUAL_PALETTE } from './visual-state'

/**
 * Floating dark pill for one operational event. Must be rendered as a child of
 * an anchor group: `Html` projects that anchor's world position to the screen,
 * so the pill always faces the camera, keeps a constant size and uses real
 * DOM text (crisp, selectable by tooling) instead of 3D geometry.
 *
 * The indicator dot and rim take the semantic colour of the event's visual
 * state (never its priority); the pill itself stays dark.
 */
const props = defineProps<{
  badge: OperationalBadgeModel
}>()

const colorStyle = computed(() => ({ '--operational-color': VISUAL_PALETTE[props.badge.visualState].dot }))
</script>

<template>
  <Html
    center
    :pointer-events="'none'"
    :z-index-range="[40, 20]"
  >
    <div
      class="operational-badge"
      :style="colorStyle"
      :data-event-id="badge.eventId"
      :data-priority="badge.priority"
      :data-visual-state="badge.visualState"
      role="status"
    >
      <span
        class="operational-badge__dot"
        aria-hidden="true"
      />
      <span class="operational-badge__label">{{ badge.label }}</span>
    </div>
  </Html>
</template>

<style scoped>
.operational-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 14px 0 10px;
  border-radius: 999px;
  background: #17181c;
  color: #f2eae3;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  user-select: none;
  /* Dark pill with the thick soft rim and drop shadow of the reference. */
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--operational-color) 55%, transparent),
    0 8px 18px rgb(0 0 0 / 0.45);
}

.operational-badge__dot {
  width: 9px;
  height: 9px;
  flex: none;
  border-radius: 50%;
  background: var(--operational-color);
  box-shadow: 0 0 7px color-mix(in srgb, var(--operational-color) 70%, transparent);
}
</style>
