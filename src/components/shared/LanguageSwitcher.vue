<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck, PhGlobe } from '@phosphor-icons/vue'

import ASurface from '@/components/ui/ASurface.vue'
import { AVAILABLE_LOCALES, changeLocale, LOCALE_CODE, LOCALE_LABEL, type AppLocale } from '@/i18n'

withDefaults(defineProps<{ inline?: boolean }>(), { inline: false })
const { t, locale } = useI18n()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

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
  <label v-if="inline" class="shell-preference text-body-md text-fg">
    <span>{{ t('language.label') }}</span>
    <select :value="locale" @change="select(($event.target as HTMLSelectElement).value as AppLocale)"><option v-for="loc in AVAILABLE_LOCALES" :key="loc" :value="loc">{{ LOCALE_LABEL[loc] }}</option></select>
  </label>
  <div v-else ref="rootRef" class="relative" @focusout="onFocusOut" @keydown="onKeydown">
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

<style scoped>
.shell-preference { display: flex; flex-direction: column; gap: calc(var(--spacing) * 2); min-width: 0; }
.shell-preference select { width: 100%; max-width: 100%; min-width: 0; min-height: calc(var(--spacing) * 12); padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3); border: 1px solid var(--color-border-strong); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text-primary); font-size: var(--text-body-lg); }
.shell-preference select:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: 2px; }
</style>
