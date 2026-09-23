<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhGlobe } from '@phosphor-icons/vue'

import { LOCALE_LABEL, type AppLocale } from '@/i18n'

/**
 * Extracted from PublicTableView's header (Carta Cliente 4.1) so the same
 * discreet language picker can also sit on the pre-menu gateway screen
 * without duplicating the dropdown markup in two places (CLAUDE.md §17).
 * Renders nothing when there's nothing to switch between.
 */
defineProps<{
  available: AppLocale[]
  current: AppLocale
}>()

const emit = defineEmits<{ select: [AppLocale] }>()

const { t } = useI18n()
const open = ref(false)

function choose(loc: AppLocale): void {
  emit('select', loc)
  open.value = false
}
</script>

<template>
  <div v-if="available.length > 1" class="relative">
    <button
      type="button"
      class="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-label-lg font-medium text-on-surface-variant hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :aria-label="t('publicMenu.languageLabel')"
      :aria-expanded="open"
      @click="open = !open"
    >
      <PhGlobe :size="20" />
    </button>
    <div
      v-if="open"
      role="menu"
      :aria-label="t('publicMenu.languageLabel')"
      class="absolute right-0 z-20 mt-2 min-w-40 rounded-md border border-outline-variant bg-surface-container-high py-1 shadow-elevated"
    >
      <button
        v-for="loc in available"
        :key="loc"
        type="button"
        role="menuitemradio"
        :aria-checked="current === loc"
        class="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-body-md text-on-surface hover:bg-surface-container-highest"
        @click="choose(loc)"
      >
        {{ LOCALE_LABEL[loc] }}
      </button>
    </div>
  </div>
</template>
