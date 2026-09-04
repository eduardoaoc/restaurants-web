<script setup lang="ts">
import { computed } from 'vue'

type Tone = 'lowest' | 'low' | 'base' | 'container' | 'high' | 'highest'
type Radius = 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full'

const props = withDefaults(
  defineProps<{
    tone?: Tone
    radius?: Radius
    as?: string
    /** 1px outline-variant border — a resting card's subtle edge (docs/design-system.md §21). */
    bordered?: boolean
    /** --shadow-card — a resting card's soft depth. Never combined with a floating menu's shadow-elevated. */
    elevated?: boolean
  }>(),
  {
    tone: 'container',
    radius: 'md',
    as: 'div',
    bordered: false,
    elevated: false,
  },
)

const TONE_CLASS: Record<Tone, string> = {
  lowest: 'bg-surface-container-lowest',
  low: 'bg-surface-container-low',
  base: 'bg-surface',
  container: 'bg-surface-container',
  high: 'bg-surface-container-high',
  highest: 'bg-surface-container-highest',
}

const RADIUS_CLASS: Record<Radius, string> = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  full: 'rounded-full',
}

const classes = computed(() => [
  TONE_CLASS[props.tone],
  RADIUS_CLASS[props.radius],
  'text-on-surface',
  props.bordered ? 'border border-outline-variant' : '',
  props.elevated ? 'shadow-card' : '',
])
</script>

<template>
  <component :is="as" :class="classes">
    <slot />
  </component>
</template>
