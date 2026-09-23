<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhBellRinging, PhCheckCircle } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import ThemeSwitcher from '@/components/shared/ThemeSwitcher.vue'
import PublicLanguageSwitcher from './PublicLanguageSwitcher.vue'
import type { AppLocale } from '@/i18n'
import { describeApiError } from '@/utils/error-message'

/**
 * WELCOME_GATE (Carta Cliente 4.1 §7) — the stable screen after the
 * cinematic intro dissolves. Unlike the intro, this is a real, persisted
 * screen (survives a reload via sessionStorage — see usePublicEntryState),
 * so it follows the normal themed surface tokens rather than the intro's
 * fixed dark brand panel — it must work correctly in both Light and Dark
 * (CLAUDE.md §5), same as the carta it leads into.
 *
 * `waiterCalled`/`requestingWaiter`/`requestError` are the SAME refs
 * PublicTableView already threads into the in-menu quick-actions bar —
 * deliberately shared, not a separate copy, so calling the waiter here and
 * then entering the menu shows the already-confirmed state there too
 * instead of allowing a second, redundant request.
 */
const props = defineProps<{
  restaurantName: string
  tableName: string
  showWaiterCall: boolean
  waiterCalled: boolean
  requestingWaiter: boolean
  requestError: ApiError | null
  availableLocales: AppLocale[]
  currentLocale: AppLocale
  /**
   * From `resolveTable`'s own `menu.available` (Carta Cliente 4.1 final
   * fix) — never from the menu fetch itself, which may not even have run
   * yet. When false, "Ver la carta" is disabled in place rather than
   * hidden, with a short explanation, instead of leading to a broken/empty
   * carta screen.
   */
  menuAvailable: boolean
}>()

const emit = defineEmits<{
  enterMenu: []
  callWaiter: []
  selectLocale: [AppLocale]
}>()

const { t } = useI18n()

const headingRef = ref<HTMLHeadingElement | null>(null)

// Coherent focus on arrival (§14): never trapped, just landed on the
// screen's own heading so keyboard/screen-reader users continue naturally
// from here into the CTAs below.
onMounted(() => headingRef.value?.focus())
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-background text-on-surface">
    <div class="flex items-center justify-end gap-1 p-3">
      <PublicLanguageSwitcher :available="availableLocales" :current="currentLocale" @select="emit('selectLocale', $event)" />
      <ThemeSwitcher />
    </div>

    <main class="flex flex-1 flex-col items-center justify-center gap-8 px-6 pb-12 text-center">
      <div class="flex flex-col items-center gap-0.5">
        <p class="truncate text-label-lg font-medium text-on-surface-variant">{{ restaurantName }}</p>
        <p v-if="tableName" class="truncate text-label-lg text-on-surface-variant">{{ tableName }}</p>
      </div>

      <div class="flex flex-col items-center gap-2">
        <h1 ref="headingRef" tabindex="-1" class="text-headline font-semibold text-on-surface focus:outline-none">
          {{ t('publicMenu.entry.gateTitle') }}
        </h1>
        <p class="max-w-sm text-body-lg text-on-surface-variant">{{ t('publicMenu.entry.gateSubtitle') }}</p>
      </div>

      <div class="flex w-full max-w-xs flex-col items-stretch gap-3">
        <AButton full-width :disabled="!menuAvailable" @click="emit('enterMenu')">
          {{ t('publicMenu.entry.viewMenu') }}
        </AButton>
        <p v-if="!menuAvailable" class="text-label-lg text-on-surface-variant" role="status">
          {{ t('publicMenu.errors.menuUnavailable') }}
        </p>

        <template v-if="showWaiterCall">
          <p
            v-if="waiterCalled"
            class="flex items-center justify-center gap-2 rounded-lg bg-surface-container-low px-3 py-2.5 text-left text-label-lg text-on-surface-variant"
            role="status"
          >
            <PhCheckCircle :size="18" class="shrink-0 text-primary" aria-hidden="true" />
            <span class="flex flex-col">
              <span class="font-medium text-on-surface">{{ t('publicMenu.entry.waiterCalledTitle') }}</span>
              <span>{{ t('publicMenu.entry.waiterCalledSubtitle') }}</span>
            </span>
          </p>
          <AButton v-else variant="outlined" full-width :loading="requestingWaiter" @click="emit('callWaiter')">
            <template #leading><PhBellRinging :size="16" /></template>
            {{ t('publicMenu.requests.callWaiter') }}
          </AButton>
        </template>

        <p v-if="requestError" class="rounded-md bg-error-container px-3 py-2 text-label-lg text-on-error-container" role="alert">
          {{ describeApiError(requestError, t) }}
        </p>
      </div>
    </main>
  </div>
</template>
