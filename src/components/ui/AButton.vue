<script setup lang="ts">
import { computed } from 'vue'

import AProgress from './AProgress.vue'

type Variant = 'filled' | 'tonal' | 'outlined' | 'text'

const props = withDefaults(
  defineProps<{
    variant?: Variant
    type?: 'button' | 'submit'
    disabled?: boolean
    loading?: boolean
    fullWidth?: boolean
  }>(),
  {
    variant: 'filled',
    type: 'button',
    disabled: false,
    loading: false,
    fullWidth: false,
  },
)

const emit = defineEmits<{ click: [MouseEvent] }>()

const VARIANT_CLASS: Record<Variant, string> = {
  filled: 'bg-primary text-on-primary hover:brightness-95 active:brightness-90',
  tonal:
    'bg-secondary-container text-on-secondary-container hover:brightness-95 active:brightness-90',
  outlined: 'border border-outline bg-transparent text-primary hover:bg-primary-container/40',
  text: 'bg-transparent text-primary hover:bg-primary-container/30',
}

const isDisabled = computed(() => props.disabled || props.loading)

function onClick(event: MouseEvent): void {
  if (isDisabled.value) return
  emit('click', event)
}
</script>

<template>
  <button
    :type="type"
    :disabled="isDisabled"
    :aria-busy="loading || undefined"
    :class="[
      'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-6 text-label-lg font-medium',
      'transition-colors duration-200 ease-out',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
      'disabled:cursor-not-allowed disabled:opacity-[0.38] disabled:hover:brightness-100',
      fullWidth ? 'w-full' : '',
      VARIANT_CLASS[variant],
    ]"
    @click="onClick"
  >
    <AProgress v-if="loading" size="sm" />
    <slot v-else name="leading" />
    <slot />
    <slot v-if="!loading" name="trailing" />
  </button>
</template>
