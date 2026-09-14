<script setup lang="ts">
import { useId } from 'vue'

withDefaults(
  defineProps<{
    modelValue: boolean
    label: string
    description?: string
    disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const inputId = useId()

function onChange(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <label
    :for="inputId"
    class="flex min-h-11 cursor-pointer items-start justify-between gap-4 py-1.5"
    :class="disabled ? 'cursor-not-allowed opacity-[0.38]' : ''"
  >
    <span class="flex flex-col">
      <span class="text-body-lg text-on-surface">{{ label }}</span>
      <span v-if="description" class="text-label-md text-on-surface-variant">{{ description }}</span>
    </span>

    <span class="relative inline-flex h-6 w-11 shrink-0 items-center">
      <input
        :id="inputId"
        type="checkbox"
        role="switch"
        :checked="modelValue"
        :disabled="disabled"
        class="peer sr-only"
        @change="onChange"
      />
      <span
        aria-hidden="true"
        class="absolute inset-0 rounded-full transition-colors duration-200 ease-out"
        :class="modelValue ? 'bg-primary' : 'bg-surface-container-highest border border-outline'"
      />
      <span
        aria-hidden="true"
        class="absolute left-0.5 h-5 w-5 rounded-full bg-surface shadow-sm transition-transform duration-200 ease-out"
        :class="modelValue ? 'translate-x-5' : 'translate-x-0'"
      />
      <span
        aria-hidden="true"
        class="pointer-events-none absolute -inset-1 rounded-full peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
      />
    </span>
  </label>
</template>
