<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretDown, PhCaretRight } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import ATextField from '@/components/ui/ATextField.vue'
import { type AppLocale } from '@/i18n'
import { describeApiError } from '@/utils/error-message'
import { parsePriceInput } from '@/utils/price'
import { populateTranslationDraftMap, type TranslationDraftMap } from '@/utils/translation-draft'
import type {
  CreateModifierOptionPayload,
  ModifierOption,
  ModifierOptionStatus,
  ModifierTranslationInput,
  UpdateModifierOptionPayload,
} from '@/types/modifier'
import TranslationEditor from './TranslationEditor.vue'

const props = defineProps<{
  mode: 'create' | 'edit'
  option?: ModifierOption
  primaryLocale: AppLocale
  saving: boolean
  error: ApiError | null
}>()

const emit = defineEmits<{
  save: [CreateModifierOptionPayload | UpdateModifierOptionPayload]
  cancel: []
}>()

const { t } = useI18n()

const translations = ref<TranslationDraftMap>(populateTranslationDraftMap(props.option?.translations ?? []))
const internalName = ref(props.option?.internal_name ?? '')
const internalNameTouched = ref(props.mode === 'edit')
const advancedOpen = ref(false)
const status = ref<ModifierOptionStatus>(props.option?.status ?? 'active')
const priceRaw = ref(props.option?.price_delta ?? '0')
const available = ref(props.option?.available ?? true)

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

const primaryNameError = ref<string | null>(null)
const priceError = ref<string | null>(null)

const submitLabel = computed(() => (props.mode === 'create' ? t('menu.modifiers.option.create') : t('menu.modifiers.option.save')))

const bannerMessage = computed(() => {
  if (!props.error) return null
  if (props.error.kind === 'validation' && props.error.fieldErrors?.price_delta) return null
  return describeApiError(props.error, t)
})

watch(
  () => props.error,
  (error) => {
    if (error?.kind === 'validation' && error.fieldErrors?.price_delta) {
      priceError.value = error.fieldErrors.price_delta[0] ?? null
    }
  },
)

function submit(): void {
  const primaryName = translations.value[props.primaryLocale]?.name.trim() ?? ''
  if (!primaryName) {
    primaryNameError.value = t('menu.modifiers.option.errors.nameRequired')
    return
  }
  primaryNameError.value = null

  const parsedPrice = parsePriceInput(priceRaw.value)
  if (parsedPrice === null) {
    priceError.value = t('menu.modifiers.option.errors.priceInvalid')
    return
  }
  priceError.value = null

  const translationPayload: ModifierTranslationInput[] = (Object.keys(translations.value) as AppLocale[])
    .map((locale) => ({ locale, draft: translations.value[locale] }))
    .filter(({ draft }) => draft.name.trim().length > 0)
    .map(({ locale, draft }) => ({
      locale,
      name: draft.name.trim(),
      description: draft.description.trim() ? draft.description.trim() : null,
    }))

  const finalInternalName = internalName.value.trim() || primaryName

  const payload: CreateModifierOptionPayload | UpdateModifierOptionPayload =
    props.mode === 'create'
      ? { internal_name: finalInternalName, price_delta: parsedPrice, available: available.value, translations: translationPayload }
      : {
          internal_name: finalInternalName,
          price_delta: parsedPrice,
          available: available.value,
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

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <ATextField
        :model-value="priceRaw"
        :label="t('menu.modifiers.option.priceDeltaLabel')"
        :help-text="t('menu.modifiers.option.priceDeltaHelp')"
        inputmode="decimal"
        :error="priceError ?? undefined"
        :disabled="saving"
        @update:model-value="(value) => { priceRaw = value; priceError = null }"
      >
        <template #leading>+€</template>
      </ATextField>

      <div>
        <span class="text-label-lg font-medium text-on-surface-variant">{{ t('menu.products.availableLabel') }}</span>
        <div class="mt-1.5 inline-flex gap-1 rounded-lg border border-outline-variant bg-surface-container-low p-1" role="radiogroup" :aria-label="t('menu.products.availableLabel')">
          <button
            type="button"
            role="radio"
            :aria-checked="available"
            class="rounded-md px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :class="available ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
            :disabled="saving"
            @click="available = true"
          >
            {{ t('menu.products.available') }}
          </button>
          <button
            type="button"
            role="radio"
            :aria-checked="!available"
            class="rounded-md px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :class="!available ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
            :disabled="saving"
            @click="available = false"
          >
            {{ t('menu.products.unavailable') }}
          </button>
        </div>
      </div>
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
        {{ t('menu.modifiers.option.advancedToggle') }}
      </button>

      <div v-if="advancedOpen" class="mt-3 flex flex-col gap-4">
        <ATextField
          :model-value="internalName"
          :label="t('menu.modifiers.option.internalNameLabel')"
          :error="error?.kind === 'validation' ? error.fieldErrors?.internal_name?.[0] : undefined"
          :disabled="saving"
          @update:model-value="onInternalNameInput"
        />

        <div v-if="mode === 'edit'">
          <span class="text-label-lg font-medium text-on-surface-variant">{{ t('menu.modifiers.option.statusLabel') }}</span>
          <div class="mt-1.5 inline-flex gap-1 rounded-lg border border-outline-variant bg-surface-container-low p-1" role="radiogroup" :aria-label="t('menu.modifiers.option.statusLabel')">
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
