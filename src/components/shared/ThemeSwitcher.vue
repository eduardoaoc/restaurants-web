<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck, PhMoon, PhSun } from '@phosphor-icons/vue'

import AIconButton from '@/components/ui/AIconButton.vue'
import ASurface from '@/components/ui/ASurface.vue'
import { useThemeStore, type ThemePreference } from '@/stores/theme'

withDefaults(defineProps<{ onMedia?: boolean; inline?: boolean }>(), { onMedia: false, inline: false })

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
  <label v-if="inline" class="shell-preference text-body-md text-fg">
    <span>{{ t('theme.label') }}</span>
    <select :value="theme.preference" @change="select(($event.target as HTMLSelectElement).value as ThemePreference)"><option v-for="preference in OPTIONS" :key="preference" :value="preference">{{ t(`theme.${preference}`) }}</option></select>
  </label>
  <div v-else ref="rootRef" class="relative" @focusout="onFocusOut" @keydown="onKeydown">
    <AIconButton
      :label="t('theme.label')"
      :pressed="open"
      :variant="onMedia ? 'onMedia' : 'default'"
      @click="open = !open"
    >
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

<style scoped>
.shell-preference { display: flex; flex-direction: column; gap: calc(var(--spacing) * 2); min-width: 0; }
.shell-preference select { width: 100%; max-width: 100%; min-width: 0; min-height: calc(var(--spacing) * 12); padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3); border: 1px solid var(--color-border-strong); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text-primary); font-size: var(--text-body-lg); }
.shell-preference select:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: 2px; }
</style>
