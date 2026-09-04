<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck, PhMoon, PhSun } from '@phosphor-icons/vue'

import AIconButton from '@/components/ui/AIconButton.vue'
import ASurface from '@/components/ui/ASurface.vue'
import { useThemeStore, type ThemePreference } from '@/stores/theme'

const { t } = useI18n()
const theme = useThemeStore()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const OPTIONS: ThemePreference[] = ['system', 'light', 'dark']

function select(preference: ThemePreference): void {
  theme.setTheme(preference)
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
    <AIconButton :label="t('theme.label')" :pressed="open" @click="open = !open">
      <PhMoon v-if="theme.resolvedTheme === 'dark'" :size="20" />
      <PhSun v-else :size="20" />
    </AIconButton>
    <ASurface
      v-if="open"
      tone="high"
      radius="md"
      role="menu"
      :aria-label="t('theme.label')"
      class="absolute right-0 z-20 mt-2 min-w-40 py-1 shadow-elevated"
    >
      <button
        v-for="preference in OPTIONS"
        :key="preference"
        type="button"
        role="menuitemradio"
        :aria-checked="theme.preference === preference"
        class="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-body-md text-on-surface hover:bg-surface-container-highest"
        @click="select(preference)"
      >
        {{ t(`theme.${preference}`) }}
        <PhCheck v-if="theme.preference === preference" :size="16" />
      </button>
    </ASurface>
  </div>
</template>
