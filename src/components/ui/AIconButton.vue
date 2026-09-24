<script setup lang="ts">
/**
 * `variant: 'onMedia'` (Carta 4.4) is the one deliberate exception to
 * "consume system-role tokens, never raw color" this component makes —
 * for a control resting directly on arbitrary fullscreen photo/video
 * (the Reel feed's header), `text-on-surface-variant` can land anywhere
 * from illegible to invisible depending on what's playing underneath,
 * regardless of Light/Dark theme. CLAUDE.md §39 carves out exactly this
 * case ("overlays neutros necessários para contraste"). Every other call
 * site keeps the default, fully token-driven look.
 */
withDefaults(
  defineProps<{
    label: string
    type?: 'button' | 'submit'
    disabled?: boolean
    pressed?: boolean
    variant?: 'default' | 'onMedia'
  }>(),
  { type: 'button', disabled: false, pressed: undefined, variant: 'default' },
)

const emit = defineEmits<{ click: [MouseEvent] }>()
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :aria-label="label"
    :aria-pressed="pressed"
    class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-[0.38]"
    :class="
      variant === 'onMedia'
        ? 'text-white hover:bg-white/20 active:bg-white/30'
        : 'text-on-surface-variant hover:bg-surface-container-high active:bg-surface-container-highest'
    "
    @click="emit('click', $event)"
  >
    <slot />
  </button>
</template>
