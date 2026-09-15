<script setup lang="ts">
import { useId } from 'vue'
import { PhStar } from '@phosphor-icons/vue'

/**
 * Reusable 1-5 star rating input (Passo 3.5 §6) — the only rating control
 * in this app so far, built once here rather than inline per field.
 *
 * Accessibility: a real `<fieldset>`/`<legend>` names the group, and each
 * star is a native `<input type="radio">` (visually hidden, `sr-only`) with
 * its own `aria-label` ("1 de 5", ...) — same-name radios give arrow-key
 * roving and Tab/Space selection for free from the browser, no custom
 * keyboard handling to get wrong. The filled-vs-outline star icon (a shape
 * change, not just a color change) plus the "n / 5" text below the row
 * both carry the selected value without relying on color alone. Every
 * label is a 44×44px tap target (mobile stars must never feel cramped).
 */
const props = withDefaults(
  defineProps<{
    modelValue: number
    label: string
    error?: boolean
  }>(),
  { error: false },
)

const emit = defineEmits<{ 'update:modelValue': [number] }>()

const groupId = useId()
</script>

<template>
  <fieldset class="flex flex-col gap-1.5 border-0 p-0 m-0">
    <legend class="text-label-lg font-medium text-on-surface-variant">
      {{ label }}<span aria-hidden="true" class="text-error"> *</span>
    </legend>
    <div class="flex items-center gap-0.5" :class="error ? 'rounded-lg outline outline-2 outline-error/60 -m-1 p-1' : ''">
      <span v-for="n in 5" :key="n" class="relative flex h-11 w-11 items-center justify-center">
        <input
          :id="`${groupId}-${n}`"
          type="radio"
          :name="groupId"
          class="peer sr-only"
          :checked="modelValue === n"
          :aria-label="`${n} / 5`"
          @change="emit('update:modelValue', n)"
        />
        <label
          :for="`${groupId}-${n}`"
          class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
        >
          <PhStar
            :size="26"
            :weight="n <= modelValue ? 'fill' : 'regular'"
            :class="n <= modelValue ? 'text-primary' : 'text-outline'"
            aria-hidden="true"
          />
        </label>
      </span>
      <span class="ml-1 min-w-8 text-label-lg font-medium tabular-nums text-on-surface-variant">
        {{ modelValue > 0 ? `${modelValue}/5` : '' }}
      </span>
    </div>
  </fieldset>
</template>
