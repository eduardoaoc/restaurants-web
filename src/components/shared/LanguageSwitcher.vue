<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck, PhGlobe } from '@phosphor-icons/vue'

import ASurface from '@/components/ui/ASurface.vue'
import { AVAILABLE_LOCALES, changeLocale, type AppLocale } from '@/i18n'

const { t, locale } = useI18n()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const LOCALE_LABEL: Record<AppLocale, string> = {
  'es-ES': 'Castellano',
  'ca-ES-valencia': 'Valencià',
  'en-GB': 'English',
}

const LOCALE_CODE: Record<AppLocale, string> = {
  'es-ES': 'ES',
  'ca-ES-valencia': 'VAL',
  'en-GB': 'EN',
}

function select(next: AppLocale): void {
  changeLocale(next)
  open.value = false
}

function onFocusOut(event: FocusEvent): void {
  if (!rootRef.value?.contains(event.relatedTarget as Node | null)) {
    open.value = false
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') open.value = false
}
</script>

<template>
  <div ref="rootRef" class="relative" @focusout="onFocusOut" @keydown="onKeydown">
    <button
      type="button"
      class="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-label-lg font-medium text-on-surface-variant transition-colors duration-200 ease-out hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :aria-label="t('language.label')"
      :aria-expanded="open"
      @click="open = !open"
    >
      <PhGlobe :size="20" />
      {{ LOCALE_CODE[locale as AppLocale] }}
    </button>
    <ASurface
      v-if="open"
      tone="high"
      radius="md"
      role="menu"
      :aria-label="t('language.label')"
      class="absolute right-0 z-20 mt-2 min-w-44 py-1 shadow-elevated"
    >
      <button
        v-for="loc in AVAILABLE_LOCALES"
        :key="loc"
        type="button"
        role="menuitemradio"
        :aria-checked="locale === loc"
        class="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-body-md text-on-surface hover:bg-surface-container-highest"
        @click="select(loc)"
      >
        {{ LOCALE_LABEL[loc] }}
        <PhCheck v-if="locale === loc" :size="16" />
      </button>
    </ASurface>
  </div>
</template>
