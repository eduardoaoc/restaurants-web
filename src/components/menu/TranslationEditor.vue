<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhSparkle, PhWarningCircle } from '@phosphor-icons/vue'

import ATextField from '@/components/ui/ATextField.vue'
import { AVAILABLE_LOCALES, LOCALE_LABEL, type AppLocale } from '@/i18n'
import type { TranslationDraft, TranslationDraftMap } from '@/utils/translation-draft'

const props = defineProps<{
  modelValue: TranslationDraftMap
  primaryLocale: AppLocale
  disabled?: boolean
  primaryNameError?: string
  /**
   * One message per locale whose `name` is filled in but `description`
   * isn't (Carta 4.2 §3/§19) — keyed by locale, not just the primary one,
   * since any translation actually submitted (i.e. has a name) now needs a
   * description too. Recomputed live (clears the moment the owner fixes a
   * given locale), so the auto-jump below is driven by `validationAttempt`
   * instead — jumping every time this map's *contents* change would yank
   * the active tab away mid-keystroke as soon as the current locale's own
   * error clears, not just right after a real submit click.
   */
  descriptionErrors?: Partial<Record<AppLocale, string>>
  /** Bumped by the parent once per submit click (regardless of outcome) — the only thing this component actually watches to decide when to auto-jump. */
  validationAttempt?: number
}>()

const emit = defineEmits<{ 'update:modelValue': [TranslationDraftMap] }>()

const { t } = useI18n()

const descriptionId = useId()

// Content language being edited right now — starts on the restaurant's
// primary locale, independent from the admin interface's own language
// (whatever `useI18n().locale` currently is). CLAUDE.md Passo 2.3 §4 —
// shared as-is by Category (2.3) and Product (2.4) forms, same distinction.
const activeLocale = ref<AppLocale>(props.primaryLocale)

watch(
  () => props.validationAttempt,
  () => {
    const firstOffender = props.descriptionErrors && (Object.keys(props.descriptionErrors)[0] as AppLocale | undefined)
    if (firstOffender) activeLocale.value = firstOffender
  },
)

const activeDescriptionError = computed(() => props.descriptionErrors?.[activeLocale.value])

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
      <span class="text-label-lg font-medium text-on-surface-variant">{{ t('menu.translations.translationsLabel') }}</span>
      <div
        class="mt-1.5 inline-flex flex-wrap gap-1 rounded-lg border border-outline-variant bg-surface-container-low p-1"
        role="tablist"
        :aria-label="t('menu.translations.translationsLabel')"
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
            :title="t('menu.translations.primaryLocaleHint')"
          >
            {{ t('menu.translations.primaryBadge') }}
          </span>
          <PhWarningCircle
            v-if="descriptionErrors?.[locale]"
            :size="14"
            class="text-error"
            :aria-label="t('menu.translations.translationIncomplete')"
          />
          <span
            v-else-if="modelValue[locale]?.name"
            class="h-1.5 w-1.5 rounded-full bg-primary"
            :aria-label="t('menu.translations.translationFilled')"
          />
        </button>
      </div>
    </div>

    <ATextField
      :model-value="modelValue[activeLocale]?.name ?? ''"
      :label="t('menu.translations.nameLabel')"
      :required="activeLocale === primaryLocale"
      :error="activeLocale === primaryLocale ? primaryNameError : undefined"
      :disabled="disabled"
      @update:model-value="(value) => setField(activeLocale, 'name', value)"
    />

    <div class="flex flex-col gap-1.5">
      <label :for="descriptionId" class="text-label-lg font-medium text-on-surface-variant">
        {{ t('menu.translations.descriptionLabel') }}
        <span v-if="activeLocale === primaryLocale || modelValue[activeLocale]?.name" aria-hidden="true" class="text-error"> *</span>
      </label>
      <textarea
        :id="descriptionId"
        :value="modelValue[activeLocale]?.description ?? ''"
        :disabled="disabled"
        rows="2"
        maxlength="500"
        :aria-invalid="Boolean(activeDescriptionError) || undefined"
        :aria-describedby="activeDescriptionError ? `${descriptionId}-error` : `${descriptionId}-help`"
        class="w-full rounded-lg border bg-surface-container-lowest px-4 py-2 text-body-lg text-on-surface placeholder:text-on-surface-variant/70 transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-[0.38]"
        :class="activeDescriptionError ? 'border-error' : 'border-outline'"
        @input="setField(activeLocale, 'description', ($event.target as HTMLTextAreaElement).value)"
      />
      <p v-if="activeDescriptionError" :id="`${descriptionId}-error`" class="text-label-md text-error">{{ activeDescriptionError }}</p>
      <p v-else :id="`${descriptionId}-help`" class="text-label-md text-on-surface-variant">{{ t('menu.translations.descriptionHelp') }}</p>
    </div>

    <!--
      Auto-translate CTA — genuinely disabled, never a fake/mocked action
      (CLAUDE.md Passo 2.6 §22): no auto-translation provider exists yet,
      frontend or backend (see the Passo 2.6 report §16/§21). Shown only
      from the primary-locale tab, matching the intended future flow
      ("Castellano -> translate to pending target locales"). Kept as a
      real, reachable, properly-disabled control (not hidden) so the owner
      understands the capability exists and is coming, rather than
      wondering why it's missing entirely.
    -->
    <button
      v-if="activeLocale === primaryLocale"
      type="button"
      disabled
      :title="t('menu.translations.autoTranslateUnavailable')"
      class="inline-flex w-fit items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-label-lg font-medium text-on-surface-variant opacity-[0.38] disabled:cursor-not-allowed"
    >
      <PhSparkle :size="16" aria-hidden="true" />
      {{ t('menu.translations.autoTranslateCta') }}
    </button>
  </div>
</template>
