<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretDown, PhCaretRight } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import ATextField from '@/components/ui/ATextField.vue'
import { type AppLocale } from '@/i18n'
import { describeApiError } from '@/utils/error-message'
import { clampSelection, selectionTypeOf, type SelectionType } from '@/utils/modifier-selection'
import { populateTranslationDraftMap, type TranslationDraftMap } from '@/utils/translation-draft'
import type {
  CreateModifierGroupPayload,
  ModifierGroup,
  ModifierGroupStatus,
  ModifierTranslationInput,
  UpdateModifierGroupPayload,
} from '@/types/modifier'
import TranslationEditor from './TranslationEditor.vue'

const props = defineProps<{
  mode: 'create' | 'edit'
  group?: ModifierGroup
  primaryLocale: AppLocale
  saving: boolean
  error: ApiError | null
}>()

const emit = defineEmits<{
  save: [CreateModifierGroupPayload | UpdateModifierGroupPayload]
  cancel: []
}>()

const { t } = useI18n()

const translations = ref<TranslationDraftMap>(populateTranslationDraftMap(props.group?.translations ?? []))
const internalName = ref(props.group?.internal_name ?? '')
const internalNameTouched = ref(props.mode === 'edit')
const advancedOpen = ref(false)
const status = ref<ModifierGroupStatus>(props.group?.status ?? 'active')

const required = ref(props.group?.required ?? false)
const selectionType = ref<SelectionType>(props.group ? selectionTypeOf(props.group.max_select) : 'single')
const minSelect = ref(props.group?.min_select ?? 0)
const maxSelect = ref(props.group ? Math.max(2, props.group.max_select) : 3)

watch(
  () => translations.value[props.primaryLocale]?.name,
  (name) => {
    if (props.mode === 'create' && !internalNameTouched.value) {
      internalName.value = name ?? ''
    }
  },
)

function onInternalNameInput(value: string): void {
  internalNameTouched.value = true
  internalName.value = value
}

function parseCount(raw: string): number | null {
  const value = Number(raw)
  return Number.isInteger(value) && value >= 0 ? value : null
}

const minError = ref<string | null>(null)
const maxError = ref<string | null>(null)

function onMinInput(raw: string): void {
  const parsed = parseCount(raw)
  if (parsed !== null) minSelect.value = parsed
  minError.value = null
}

function onMaxInput(raw: string): void {
  const parsed = parseCount(raw)
  if (parsed !== null) maxSelect.value = parsed
  maxError.value = null
}

const primaryNameError = ref<string | null>(null)

const submitLabel = computed(() => (props.mode === 'create' ? t('menu.modifiers.group.create') : t('menu.modifiers.group.save')))

const bannerMessage = computed(() => {
  if (!props.error) return null
  return describeApiError(props.error, t)
})

function submit(): void {
  const primaryName = translations.value[props.primaryLocale]?.name.trim() ?? ''
  if (!primaryName) {
    primaryNameError.value = t('menu.modifiers.group.errors.nameRequired')
    return
  }
  primaryNameError.value = null

  if (selectionType.value === 'multiple' && maxSelect.value < 1) {
    maxError.value = t('menu.modifiers.group.errors.maxRequired')
    return
  }
  maxError.value = null

  // Selection is derived here, never left for the backend to reject — see
  // clampSelection's own docblock (CLAUDE.md §8/§9: silently correct the
  // one unambiguous fix rather than block on a puzzle).
  const { min, max } =
    selectionType.value === 'single'
      ? { min: required.value ? 1 : 0, max: 1 }
      : clampSelection(minSelect.value, maxSelect.value, required.value)

  const translationPayload: ModifierTranslationInput[] = (Object.keys(translations.value) as AppLocale[])
    .map((locale) => ({ locale, draft: translations.value[locale] }))
    .filter(({ draft }) => draft.name.trim().length > 0)
    .map(({ locale, draft }) => ({
      locale,
      name: draft.name.trim(),
      description: draft.description.trim() ? draft.description.trim() : null,
    }))

  const finalInternalName = internalName.value.trim() || primaryName

  const payload: CreateModifierGroupPayload | UpdateModifierGroupPayload =
    props.mode === 'create'
      ? { internal_name: finalInternalName, min_select: min, max_select: max, required: required.value, translations: translationPayload }
      : {
          internal_name: finalInternalName,
          min_select: min,
          max_select: max,
          required: required.value,
          status: status.value,
          translations: translationPayload,
        }

  emit('save', payload)
}
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="submit">
    <TranslationEditor
      v-model="translations"
      :primary-locale="primaryLocale"
      :disabled="saving"
      :primary-name-error="primaryNameError ?? undefined"
    />

    <div>
      <span class="text-label-lg font-medium text-on-surface-variant">{{ t('menu.modifiers.group.requiredQuestion') }}</span>
      <div class="mt-1.5 inline-flex gap-1 rounded-lg border border-outline-variant bg-surface-container-low p-1" role="radiogroup" :aria-label="t('menu.modifiers.group.requiredQuestion')">
        <button
          type="button"
          role="radio"
          :aria-checked="!required"
          class="rounded-md px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          :class="!required ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
          :disabled="saving"
          @click="required = false"
        >
          {{ t('menu.modifiers.group.optionalOption') }}
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="required"
          class="rounded-md px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          :class="required ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
          :disabled="saving"
          @click="required = true"
        >
          {{ t('menu.modifiers.group.requiredOption') }}
        </button>
      </div>
    </div>

    <div>
      <span class="text-label-lg font-medium text-on-surface-variant">{{ t('menu.modifiers.group.selectionQuestion') }}</span>
      <div class="mt-1.5 inline-flex gap-1 rounded-lg border border-outline-variant bg-surface-container-low p-1" role="radiogroup" :aria-label="t('menu.modifiers.group.selectionQuestion')">
        <button
          type="button"
          role="radio"
          :aria-checked="selectionType === 'single'"
          class="rounded-md px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          :class="selectionType === 'single' ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
          :disabled="saving"
          @click="selectionType = 'single'"
        >
          {{ t('menu.modifiers.group.singleOption') }}
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="selectionType === 'multiple'"
          class="rounded-md px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          :class="selectionType === 'multiple' ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
          :disabled="saving"
          @click="selectionType = 'multiple'"
        >
          {{ t('menu.modifiers.group.multipleOption') }}
        </button>
      </div>
    </div>

    <div v-if="selectionType === 'multiple'" class="grid grid-cols-2 gap-4">
      <ATextField
        :model-value="String(minSelect)"
        :label="t('menu.modifiers.group.minLabel')"
        inputmode="numeric"
        :error="minError ?? undefined"
        :disabled="saving"
        @update:model-value="onMinInput"
      />
      <ATextField
        :model-value="String(maxSelect)"
        :label="t('menu.modifiers.group.maxLabel')"
        inputmode="numeric"
        :error="maxError ?? undefined"
        :disabled="saving"
        @update:model-value="onMaxInput"
      />
    </div>

    <div>
      <button
        type="button"
        class="inline-flex items-center gap-1 text-label-lg font-medium text-on-surface-variant hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :aria-expanded="advancedOpen"
        @click="advancedOpen = !advancedOpen"
      >
        <PhCaretDown v-if="advancedOpen" :size="16" />
        <PhCaretRight v-else :size="16" />
        {{ t('menu.modifiers.group.advancedToggle') }}
      </button>

      <div v-if="advancedOpen" class="mt-3 flex flex-col gap-4">
        <ATextField
          :model-value="internalName"
          :label="t('menu.modifiers.group.internalNameLabel')"
          :help-text="t('menu.modifiers.group.internalNameHelp')"
          :error="error?.kind === 'validation' ? error.fieldErrors?.internal_name?.[0] : undefined"
          :disabled="saving"
          @update:model-value="onInternalNameInput"
        />

        <div v-if="mode === 'edit'">
          <span class="text-label-lg font-medium text-on-surface-variant">{{ t('menu.modifiers.group.statusLabel') }}</span>
          <div class="mt-1.5 inline-flex gap-1 rounded-lg border border-outline-variant bg-surface-container-low p-1" role="radiogroup" :aria-label="t('menu.modifiers.group.statusLabel')">
            <button
              type="button"
              role="radio"
              :aria-checked="status === 'active'"
              class="rounded-md px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :class="status === 'active' ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
              :disabled="saving"
              @click="status = 'active'"
            >
              {{ t('menu.status.active') }}
            </button>
            <button
              type="button"
              role="radio"
              :aria-checked="status === 'inactive'"
              class="rounded-md px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :class="status === 'inactive' ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
              :disabled="saving"
              @click="status = 'inactive'"
            >
              {{ t('menu.status.inactive') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <p v-if="bannerMessage" class="text-label-md text-error" role="alert">{{ bannerMessage }}</p>

    <div class="flex items-center gap-2">
      <AButton type="submit" :loading="saving">{{ submitLabel }}</AButton>
      <AButton variant="text" type="button" :disabled="saving" @click="emit('cancel')">{{ t('common.cancel') }}</AButton>
    </div>
  </form>
</template>
