<script setup lang="ts">
import { computed } from 'vue'
import { Html } from '@tresjs/cientos'

const props = defineProps<{ flags: readonly string[] }>()

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
const selectedFlag = computed(() => PRIORITY.find(value => props.flags.includes(value)) ?? null)
</script>

<template>
  <Html v-if="selectedFlag" center :pointer-events="'none'" :z-index-range="[20, 0]">
    <span class="operations-flag" :class="`operations-flag--${PRESENTATION[selectedFlag].tone}`">
      {{ PRESENTATION[selectedFlag].label }}
    </span>
  </Html>
</template>

<style scoped>
.operations-flag {
  display: inline-block;
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
.operations-flag--urgent { color: #ffc2bd; }
.operations-flag--checkout { color: #c5e2ff; }
</style>
