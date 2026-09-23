<script setup lang="ts">
import { useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck, PhWarningCircle } from '@phosphor-icons/vue'

import AChip from '@/components/ui/AChip.vue'
import { ALLERGEN_CODES, type AllergenCode } from '@/types/allergen'
import { ALLERGEN_ICON } from '@/utils/allergen-icons'

/**
 * The allergen declaration section (Carta 4.2 §5-8) — critical distinction
 * this component exists to enforce visually: `selected: []` +
 * `noneDeclared: false` is NOT the same state as `noneDeclared: true`. The
 * first means "nothing chosen yet" (invalid to submit); the second is a
 * real, explicit declaration the owner made on purpose. `ProductForm` reads
 * both back out to decide `null` vs `[]` for the actual payload — this
 * component never touches the payload shape itself, only the two pieces of
 * UI state.
 */
const props = defineProps<{
  selected: AllergenCode[]
  noneDeclared: boolean
  disabled?: boolean
  error?: string | null
  /** Shown when editing a product whose `allergens` came back `null` from the backend — a real "not declared yet" gap, never rendered as "sin alérgenos" (Carta 4.2 §8). */
  showLegacyWarning?: boolean
}>()

const emit = defineEmits<{
  'update:selected': [AllergenCode[]]
  'update:noneDeclared': [boolean]
}>()

const { t } = useI18n()
const groupId = useId()
const noneCheckboxId = useId()

function isChecked(code: AllergenCode): boolean {
  return props.selected.includes(code)
}

function toggleCode(code: AllergenCode): void {
  // Selecting a real allergen always overrides a prior "none of these"
  // declaration — the two are mutually exclusive by definition, never both
  // true at once (defense-in-depth: the chips are also disabled outright
  // while `noneDeclared` is true, so this path is normally unreachable via
  // click, only relevant if a future caller re-enables them programmatically).
  if (props.noneDeclared) emit('update:noneDeclared', false)
  const next = isChecked(code) ? props.selected.filter((existing) => existing !== code) : [...props.selected, code]
  emit('update:selected', next)
}

function toggleNone(event: Event): void {
  const checked = (event.target as HTMLInputElement).checked
  emit('update:noneDeclared', checked)
  if (checked) emit('update:selected', [])
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div>
      <span class="text-title-md font-medium text-on-surface">{{ t('menu.products.allergens.title') }}</span>
      <p class="mt-0.5 text-label-md text-on-surface-variant">{{ t('menu.products.allergens.hint') }}</p>
    </div>

    <p
      v-if="showLegacyWarning"
      class="flex items-start gap-2 rounded-lg bg-tertiary-container px-3 py-2.5 text-label-lg text-on-tertiary-container"
      role="alert"
    >
      <PhWarningCircle :size="18" class="mt-0.5 shrink-0" aria-hidden="true" />
      {{ t('menu.products.allergens.legacyWarning') }}
    </p>

    <div :id="groupId" role="group" :aria-label="t('menu.products.allergens.title')" class="flex flex-wrap gap-2">
      <AChip
        v-for="code in ALLERGEN_CODES"
        :key="code"
        :model-value="isChecked(code)"
        :label="t(`menu.products.allergens.codes.${code}`)"
        :disabled="disabled || noneDeclared"
        @update:model-value="toggleCode(code)"
      >
        <template #icon>
          <PhCheck v-if="isChecked(code)" :size="16" aria-hidden="true" />
          <component :is="ALLERGEN_ICON[code]" v-else :size="16" aria-hidden="true" />
        </template>
      </AChip>
    </div>

    <label
      :for="noneCheckboxId"
      class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2"
      :class="disabled ? 'cursor-not-allowed opacity-[0.38]' : ''"
    >
      <span class="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <input
          :id="noneCheckboxId"
          type="checkbox"
          :checked="noneDeclared"
          :disabled="disabled"
          class="peer sr-only"
          @change="toggleNone"
        />
        <span
          aria-hidden="true"
          class="absolute inset-0 rounded-xs border transition-colors duration-200 ease-out"
          :class="noneDeclared ? 'border-primary bg-primary' : 'border-outline bg-transparent'"
        />
        <PhCheck v-if="noneDeclared" :size="14" weight="bold" class="relative text-on-primary" aria-hidden="true" />
        <span
          aria-hidden="true"
          class="pointer-events-none absolute -inset-1 rounded-sm peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
        />
      </span>
      <span class="text-body-lg text-on-surface">{{ t('menu.products.allergens.noneOption') }}</span>
    </label>

    <p v-if="error" class="text-label-md text-error" role="alert">{{ error }}</p>
  </div>
</template>
