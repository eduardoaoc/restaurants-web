<script setup lang="ts">
import { computed, type Component } from 'vue'
import { PhBellRinging, PhCheckCircle, PhClock, PhInfo, PhProhibit, PhWarningOctagon } from '@phosphor-icons/vue'

export type StatusBadgeState = 'normal' | 'attention' | 'warning' | 'critical' | 'success' | 'disabled'
const props = withDefaults(defineProps<{ state?: StatusBadgeState; label: string; icon?: Component }>(), { state: 'normal' })
const states = {
  normal: { tone: 'bg-surface text-fg-muted font-normal', icon: PhInfo, weight: 'regular' },
  attention: { tone: 'bg-primary-subtle text-accent font-semibold', icon: PhBellRinging, weight: 'fill' },
  warning: { tone: 'bg-warning-subtle text-warning font-semibold', icon: PhClock, weight: 'fill' },
  critical: { tone: 'bg-danger-subtle text-danger font-bold', icon: PhWarningOctagon, weight: 'fill' },
  success: { tone: 'bg-success-subtle text-success font-medium', icon: PhCheckCircle, weight: 'fill' },
  disabled: { tone: 'bg-surface-subtle text-fg-subtle font-normal', icon: PhProhibit, weight: 'regular' },
} as const
const style = computed(() => states[props.state])
</script>

<template>
  <span :data-state="state" :class="style.tone" class="a-status-badge inline-flex items-center gap-1 rounded-saloa-sm px-2 text-label-lg">
    <component :is="icon ?? style.icon" :weight="style.weight" class="a-status-icon" aria-hidden="true" />
    <span>{{ label }}</span>
  </span>
</template>

<style scoped>
.a-status-badge { min-height: calc(var(--spacing) * 6); min-width: 0; max-width: 100%; }
.a-status-badge > span { min-width: 0; overflow-wrap: anywhere; white-space: normal; }
.a-status-icon { width: var(--icon-sm); height: var(--icon-sm); flex-shrink: 0; }
</style>
