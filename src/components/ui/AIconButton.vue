<script setup lang="ts">
import { computed } from 'vue'
import AButton from './AButton.vue'
import type { ButtonSize, ButtonVariant, LegacyButtonVariant } from './button'

const props = withDefaults(defineProps<{
  label: string
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
  pressed?: boolean
  size?: ButtonSize
  variant?: ButtonVariant | LegacyButtonVariant | 'default' | 'onMedia'
}>(), { type: 'button', disabled: false, loading: undefined, pressed: undefined, size: 'md', variant: 'default' })
const emit = defineEmits<{ click: [MouseEvent] }>()
// onMedia stays accepted, now on an opaque themed surface for guaranteed contrast.
const variant = computed(() => props.variant === 'default' ? 'ghost' : props.variant === 'onMedia' ? 'secondary' : props.variant)
</script>

<template>
  <AButton
    :type="type" :disabled="disabled" :loading="loading" :size="size" :variant="variant"
    :aria-label="label" :aria-pressed="pressed" icon-only @click="emit('click', $event)"
  ><slot /></AButton>
</template>
