<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/** "3D / Plano" selector of the dining-room card: a two-option radio group (roving tabindex, arrow keys). */
const props = defineProps<{ modelValue: 'plan' | '3d'; /** `false` when the build turns the 3D room off: Plan is the only view. */ threeDEnabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': ['plan' | '3d'] }>()
const { t } = useI18n()

const views = computed(() => [
  { id: '3d' as const, label: '3D' },
  { id: 'plan' as const, label: t('operations.board.floor.planView') },
].filter(view => props.threeDEnabled !== false || view.id === 'plan'))

function onKey(event: KeyboardEvent): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const next = event.key === 'ArrowLeft' || event.key === 'Home' ? '3d' : 'plan'
  if (!views.value.some(view => view.id === next)) return
  emit('update:modelValue', next)
  const group = event.currentTarget as HTMLElement
  requestAnimationFrame(() => group.querySelector<HTMLElement>(`[data-view="${next}"]`)?.focus())
}
</script>

<template>
  <div v-if="views.length > 1" class="flex gap-1 rounded-saloa-md bg-surface-subtle p-1" role="radiogroup" :aria-label="t('operations.board.floor.viewLabel')" @keydown="onKey">
    <button
      v-for="view in views"
      :key="view.id"
      type="button"
      role="radio"
      :data-view="view.id"
      :aria-checked="modelValue === view.id"
      :tabindex="modelValue === view.id ? 0 : -1"
      class="min-h-11 min-w-14 rounded-saloa-sm px-3 text-label-lg font-medium transition-colors duration-fast ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      :class="modelValue === view.id ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg'"
      @click="emit('update:modelValue', view.id)"
    >{{ view.label }}</button>
  </div>
</template>
