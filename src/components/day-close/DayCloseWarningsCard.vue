<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhWarning } from '@phosphor-icons/vue'

import EmptyState from '@/components/dashboard/EmptyState.vue'
import SectionCard from '@/components/dashboard/SectionCard.vue'
import type { DayCloseWarning } from '@/types/day-close'

/**
 * CARTA 9.1B §11 — non-blocking warnings, visually separate from blockers
 * (DayCloseStatusCard) and never phrased as if they stop the close. Only
 * `active_staff_shifts`'s own extra fields are verified live (§ own
 * docblock on DayCloseWarning) — every other kind renders its translated
 * label plus `count` when present, never a guessed extra shape.
 */
defineProps<{ warnings: DayCloseWarning[] }>()

const { t } = useI18n()

function label(warning: DayCloseWarning): string {
  const key = `dayClose.status.warnings.${warning.type}`
  // active_staff_shifts' own translation already carries a `{count}`
  // placeholder (verified live); every other kind has no placeholder in
  // its text, so a known count is appended manually instead.
  if (warning.type === 'active_staff_shifts') return t(key, { count: warning.count ?? 0 })
  const translated = t(key)
  const base = translated === key ? warning.type : translated
  return typeof warning.count === 'number' ? `${base} (${warning.count})` : base
}
</script>

<template>
  <SectionCard :icon="PhWarning" :title="t('dayClose.status.warningsTitle')">
    <EmptyState v-if="warnings.length === 0" :icon="PhWarning" :message="t('dayClose.status.warningsEmpty')" />
    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="(warning, index) in warnings"
        :key="index"
        class="flex items-center gap-2 rounded-lg bg-surface-container-high px-3 py-2.5 text-body-md text-on-surface"
      >
        <PhWarning :size="18" class="shrink-0 text-on-surface-variant" aria-hidden="true" />
        {{ label(warning) }}
      </li>
    </ul>
  </SectionCard>
</template>
