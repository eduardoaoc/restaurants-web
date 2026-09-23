<script setup lang="ts">
/**
 * First real `AChip` (docs/design-system.md §16 lists it as "build on
 * demand" — the 14-way allergen selector, Carta 4.2, is that demand). A
 * filter/toggle chip: `role="checkbox"` since it's an independent
 * multi-select control, not a `radio` (several can be active at once).
 *
 * Selection is never color-only (CLAUDE.md §14): the border width/color and
 * background tone change together, AND the caller is expected to swap the
 * leading icon (e.g. to a checkmark) via the `#icon` slot — this component
 * only owns the chip shell, not that swap.
 */
withDefaults(
  defineProps<{
    modelValue: boolean
    label: string
    disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
</script>

<template>
  <button
    type="button"
    role="checkbox"
    :aria-checked="modelValue"
    :aria-label="label"
    :disabled="disabled"
    class="inline-flex min-h-11 items-center gap-1.5 rounded-xs border px-3 py-2 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-[0.38]"
    :class="
      modelValue
        ? 'border-primary bg-primary-container text-on-primary-container'
        : 'border-outline-variant bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
    "
    @click="emit('update:modelValue', !modelValue)"
  >
    <slot name="icon" />
    <span>{{ label }}</span>
  </button>
</template>
