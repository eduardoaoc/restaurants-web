<script setup lang="ts">
import { computed, useId, useSlots } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    label: string
    type?: string
    autocomplete?: string
    placeholder?: string
    error?: string
    helpText?: string
    disabled?: boolean
    required?: boolean
    inputmode?: 'text' | 'email' | 'numeric' | 'tel' | 'search' | 'none' | 'decimal' | 'url'
    name?: string
  }>(),
  {
    type: 'text',
    disabled: false,
    required: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [string]
  blur: [FocusEvent]
}>()

const slots = useSlots()

const fieldId = useId()
const errorId = computed(() => `${fieldId}-error`)
const helpId = computed(() => `${fieldId}-help`)

const describedBy = computed(() => {
  if (props.error) return errorId.value
  if (props.helpText) return helpId.value
  return undefined
})

const inputClasses = computed(() => [
  'min-h-11 w-full rounded-lg border bg-surface-container-lowest px-4 py-2 text-body-lg text-on-surface',
  'placeholder:text-on-surface-variant/70 transition-colors duration-200 ease-out',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
  'disabled:cursor-not-allowed disabled:opacity-[0.38]',
  props.error ? 'border-error' : 'border-outline',
  slots.leading ? 'pl-11' : '',
  slots.trailing ? 'pr-11' : '',
])

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="fieldId" class="text-label-lg font-medium text-on-surface-variant">
      {{ label }}<span v-if="required" aria-hidden="true" class="text-error"> *</span>
    </label>
    <div class="relative flex items-center">
      <div v-if="slots.leading" aria-hidden="true" class="absolute left-3.5 flex text-on-surface-variant">
        <slot name="leading" />
      </div>
      <input
        :id="fieldId"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        :disabled="disabled"
        :required="required"
        :inputmode="inputmode"
        :name="name"
        :aria-invalid="Boolean(error) || undefined"
        :aria-describedby="describedBy"
        :class="inputClasses"
        @input="onInput"
        @blur="emit('blur', $event)"
      />
      <div v-if="slots.trailing" class="absolute right-1.5">
        <slot name="trailing" />
      </div>
    </div>
    <p v-if="error" :id="errorId" class="text-label-md text-error">{{ error }}</p>
    <p v-else-if="helpText" :id="helpId" class="text-label-md text-on-surface-variant">{{ helpText }}</p>
  </div>
</template>
