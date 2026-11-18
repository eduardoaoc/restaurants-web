<script setup lang="ts">
import { computed } from 'vue'
import { Html } from '@tresjs/cientos'
import { PhBellRinging, PhClock, PhReceipt } from '@phosphor-icons/vue'
import { flagTier, tierZRange } from './operational-hierarchy'
import { useEdgeClamp } from './use-edge-clamp'
import { overlayViewport } from './overlay-viewport'

const props = defineProps<{ flags: readonly string[]; /** The open table: its pill always says its full text and is placed before any other. */ selected?: boolean }>()

const PRESENTATION: Record<string, { label: string; tone: 'attention' | 'urgent' | 'checkout' }> = {
  bill_requested: { label: 'Pidió cuenta', tone: 'checkout' },
  waiter_requested: { label: 'Llamó camarero', tone: 'urgent' },
  responsible_waiter_called: { label: 'Camarero llamado', tone: 'urgent' },
  assigned_waiter_suspended: { label: 'Camarero suspendido', tone: 'urgent' },
  assigned_waiter_off_shift: { label: 'Camarero fuera de turno', tone: 'attention' },
  ready_order: { label: 'Pedido listo', tone: 'attention' },
  waiting_approval: { label: 'Pedido pendiente', tone: 'attention' },
  preparing_order: { label: 'Pedido en preparación', tone: 'attention' },
  unassigned: { label: 'Sin camarero', tone: 'attention' },
}
const PRIORITY = Object.keys(PRESENTATION)
// The compact form keeps a glyph per kind of situation (never colour alone).
const TONE_ICON = { urgent: PhBellRinging, attention: PhClock, checkout: PhReceipt } as const
const selectedFlag = computed(() => PRIORITY.find(value => props.flags.includes(value)) ?? null)
const tier = computed(() => selectedFlag.value ? flagTier(PRESENTATION[selectedFlag.value].tone) : 5)
// Everything else going on at the same table collapses into one "+N" instead of a second pill; the table's details list it all.
const shownFlags = computed(() => PRIORITY.filter(value => props.flags.includes(value)))
const extraCount = computed(() => Math.max(0, shownFlags.value.length - 1))
const allLabels = computed(() => shownFlags.value.map(value => PRESENTATION[value].label).join(' · '))
// The selected table, then the most urgent tier, win the screen space.
const { calculatePosition, attrs: overlayAttrs } = useEdgeClamp('badge', () => (props.selected ? 0 : tier.value))
</script>

<template>
  <Html v-if="selectedFlag" center :pointer-events="'none'" :z-index-range="tierZRange(tier)" :calculate-position="calculatePosition">
    <span
      v-bind="overlayAttrs"
      class="operations-flag"
      :class="[`operations-flag--${PRESENTATION[selectedFlag].tone}`, { 'operations-flag--compact': overlayViewport.badgeCompact && !selected }]"
      :data-tier="tier"
      :title="allLabels"
    >
      <span class="operations-flag__dot" aria-hidden="true" />
      <component :is="TONE_ICON[PRESENTATION[selectedFlag].tone]" class="operations-flag__icon" :size="13" weight="fill" aria-hidden="true" />
      <span class="operations-flag__text">{{ PRESENTATION[selectedFlag].label }}</span>
      <span v-if="extraCount" class="operations-flag__count">+{{ extraCount }}</span>
    </span>
  </Html>
</template>

<style scoped>
.operations-flag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 180px;
  overflow: hidden;
  padding: 5px 9px;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: rgb(23 24 28 / 0.94);
  color: #ffe9a0;
  font-size: 11px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.operations-flag__text { overflow: hidden; text-overflow: ellipsis; }
.operations-flag__icon { display: none; flex: none; }
.operations-flag__dot { width: 8px; height: 8px; flex: none; border-radius: 50%; background: currentColor; }
.operations-flag__count { flex: none; padding: 0 5px; border: 1px solid currentColor; border-radius: 999px; font-variant-numeric: tabular-nums; }
/* Compact form (far-out zoom or no free slot): the colour dot and the count; the full text stays in the table details. */
.operations-flag--compact, .operations-flag[data-crowded] { max-width: none; padding: 5px 8px; }
.operations-flag--compact .operations-flag__text, .operations-flag[data-crowded] .operations-flag__text, .operations-flag--compact .operations-flag__dot, .operations-flag[data-crowded] .operations-flag__dot { display: none; }
.operations-flag--compact .operations-flag__icon, .operations-flag[data-crowded] .operations-flag__icon { display: block; }
.operations-flag--urgent { color: #ffc2bd; }
.operations-flag--checkout { color: #c5e2ff; }
@media (max-width: 640px) { .operations-flag { max-width: 132px; padding: 5px 8px; font-size: 11px; } }
</style>
