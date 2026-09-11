<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretDown, PhCaretRight } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import ATextField from '@/components/ui/ATextField.vue'
import { AVAILABLE_LOCALES, type AppLocale } from '@/i18n'
import { describeApiError } from '@/utils/error-message'
import { slugify } from '@/utils/slugify'
import { populateTranslationDraftMap, type TranslationDraftMap } from '@/utils/translation-draft'
import type { Category, CategoryStatus, CategoryTranslationInput, CreateCategoryPayload, UpdateCategoryPayload } from '@/types/category'
import TranslationEditor from './TranslationEditor.vue'

const props = defineProps<{
  mode: 'create' | 'edit'
  category?: Category
  primaryLocale: AppLocale
  saving: boolean
  error: ApiError | null
}>()

const emit = defineEmits<{
  save: [CreateCategoryPayload | UpdateCategoryPayload]
  cancel: []
}>()

const { t } = useI18n()

const translations = ref<TranslationDraftMap>(populateTranslationDraftMap(props.category?.translations ?? []))
const slug = ref(props.category?.slug ?? '')
const status = ref<CategoryStatus>(props.category?.status ?? 'active')

// Auto-slugify only makes sense while creating (CLAUDE.md §9) — an existing
// category may already be linked elsewhere by its current slug, so editing
// its primary name must never silently rewrite it; the slug field starts
// untouched and only changes if the owner deliberately opens and edits it.
const slugTouched = ref(props.mode === 'edit')
const slugAdvancedOpen = ref(false)

watch(
  () => translations.value[props.primaryLocale]?.name,
  (name) => {
    if (props.mode === 'create' && !slugTouched.value) {
      slug.value = slugify(name ?? '')
    }
  },
)

function onSlugInput(value: string): void {
  slugTouched.value = true
  slug.value = value
}

const primaryNameError = ref<string | null>(null)
const slugError = ref<string | null>(null)

watch(
  () => props.error,
  (error) => {
    if (error?.kind === 'validation' && error.fieldErrors?.slug) {
      slugError.value = error.fieldErrors.slug[0] ?? null
      slugAdvancedOpen.value = true
    }
  },
)

const submitLabel = computed(() => (props.mode === 'create' ? t('menu.categories.create') : t('menu.categories.save')))

const bannerMessage = computed(() => {
  if (!props.error) return null
  // The slug conflict is already surfaced inline on the field itself.
  if (props.error.kind === 'validation' && props.error.fieldErrors?.slug) return null
  return describeApiError(props.error, t)
})

function submit(): void {
  const primaryName = translations.value[props.primaryLocale]?.name.trim() ?? ''
  if (!primaryName) {
    primaryNameError.value = t('menu.categories.errors.nameRequired')
    return
  }
  primaryNameError.value = null

  const finalSlug = slug.value.trim()
  if (!finalSlug) {
    slugError.value = t('menu.categories.errors.slugRequired')
    slugAdvancedOpen.value = true
    return
  }
  slugError.value = null

  const translationPayload: CategoryTranslationInput[] = AVAILABLE_LOCALES.map((locale) => ({
    locale,
    draft: translations.value[locale],
  }))
    .filter(({ draft }) => draft.name.trim().length > 0)
    .map(({ locale, draft }) => ({
      locale,
      name: draft.name.trim(),
      description: draft.description.trim() ? draft.description.trim() : null,
    }))

  if (props.mode === 'create') {
    emit('save', { slug: finalSlug, translations: translationPayload })
  } else {
    emit('save', { slug: finalSlug, status: status.value, translations: translationPayload })
  }
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

    <div v-if="mode === 'edit'">
      <span class="text-label-lg font-medium text-on-surface-variant">{{ t('menu.categories.statusLabel') }}</span>
      <div
        class="mt-1.5 inline-flex gap-1 rounded-lg border border-outline-variant bg-surface-container-low p-1"
        role="radiogroup"
        :aria-label="t('menu.categories.statusLabel')"
      >
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

    <div>
      <button
        type="button"
        class="inline-flex items-center gap-1 text-label-lg font-medium text-on-surface-variant hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :aria-expanded="slugAdvancedOpen"
        @click="slugAdvancedOpen = !slugAdvancedOpen"
      >
        <PhCaretDown v-if="slugAdvancedOpen" :size="16" />
        <PhCaretRight v-else :size="16" />
        {{ t('menu.categories.slugToggle') }}
      </button>

      <div v-if="slugAdvancedOpen" class="mt-2">
        <ATextField
          :model-value="slug"
          :label="t('menu.categories.slugLabel')"
          :help-text="t('menu.categories.slugHelp')"
          :error="slugError ?? undefined"
          :disabled="saving"
          @update:model-value="onSlugInput"
        />
      </div>
    </div>

    <p v-if="bannerMessage" class="text-label-md text-error" role="alert">{{ bannerMessage }}</p>

    <div class="flex items-center gap-2">
      <AButton type="submit" :loading="saving">{{ submitLabel }}</AButton>
      <AButton variant="text" type="button" :disabled="saving" @click="emit('cancel')">{{ t('common.cancel') }}</AButton>
    </div>
  </form>
</template>
