<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    type?: 'button' | 'submit'
    disabled?: boolean
    pressed?: boolean
  }>(),
  { type: 'button', disabled: false, pressed: undefined },
)

const emit = defineEmits<{ click: [MouseEvent] }>()
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :aria-label="label"
    :aria-pressed="pressed"
    class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors duration-200 ease-out hover:bg-surface-container-high active:bg-surface-container-highest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-[0.38]"
    @click="emit('click', $event)"
  >
    <slot />
  </button>
</template>
