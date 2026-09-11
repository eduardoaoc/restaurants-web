<script setup lang="ts">
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'

import ATextField from '@/components/ui/ATextField.vue'
import { AVAILABLE_LOCALES, LOCALE_LABEL, type AppLocale } from '@/i18n'
import type { TranslationDraft, TranslationDraftMap } from '@/utils/category-translation-draft'

const props = defineProps<{
  modelValue: TranslationDraftMap
  primaryLocale: AppLocale
  disabled?: boolean
  primaryNameError?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [TranslationDraftMap] }>()

const { t } = useI18n()

const descriptionId = useId()

// Content language being edited right now — starts on the restaurant's
// primary locale, independent from the admin interface's own language
// (whatever `useI18n().locale` currently is). CLAUDE.md Passo 2.3 §4.
const activeLocale = ref<AppLocale>(props.primaryLocale)

function setField(locale: AppLocale, field: keyof TranslationDraft, value: string): void {
  emit('update:modelValue', {
    ...props.modelValue,
    [locale]: { ...props.modelValue[locale], [field]: value },
  })
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div>
      <span class="text-label-lg font-medium text-on-surface-variant">{{ t('menu.categories.translationsLabel') }}</span>
      <div
        class="mt-1.5 inline-flex flex-wrap gap-1 rounded-lg border border-outline-variant bg-surface-container-low p-1"
        role="tablist"
        :aria-label="t('menu.categories.translationsLabel')"
      >
        <button
          v-for="locale in AVAILABLE_LOCALES"
          :key="locale"
          type="button"
          role="tab"
          :aria-selected="activeLocale === locale"
          class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          :class="activeLocale === locale ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
          @click="activeLocale = locale"
        >
          {{ LOCALE_LABEL[locale] }}
          <span
            v-if="locale === primaryLocale"
            class="rounded-full bg-surface-container-high px-1.5 py-0.5 text-label-md text-on-surface-variant"
            :title="t('menu.categories.primaryLocaleHint')"
          >
            {{ t('menu.categories.primaryBadge') }}
          </span>
          <span
            v-else-if="modelValue[locale]?.name"
            class="h-1.5 w-1.5 rounded-full bg-primary"
            :aria-label="t('menu.categories.translationFilled')"
          />
        </button>
      </div>
    </div>

    <ATextField
      :model-value="modelValue[activeLocale]?.name ?? ''"
      :label="t('menu.categories.nameLabel')"
      :required="activeLocale === primaryLocale"
      :error="activeLocale === primaryLocale ? primaryNameError : undefined"
      :disabled="disabled"
      @update:model-value="(value) => setField(activeLocale, 'name', value)"
    />

    <div class="flex flex-col gap-1.5">
      <label :for="descriptionId" class="text-label-lg font-medium text-on-surface-variant">{{ t('menu.categories.descriptionLabel') }}</label>
      <textarea
        :id="descriptionId"
        :value="modelValue[activeLocale]?.description ?? ''"
        :disabled="disabled"
        rows="2"
        class="w-full rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-body-lg text-on-surface placeholder:text-on-surface-variant/70 transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-[0.38]"
        @input="setField(activeLocale, 'description', ($event.target as HTMLTextAreaElement).value)"
      />
    </div>
  </div>
</template>
