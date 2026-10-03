<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { PhCashRegister } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import ATextField from '@/components/ui/ATextField.vue'
import EmptyState from '@/components/dashboard/EmptyState.vue'
import SectionCard from '@/components/dashboard/SectionCard.vue'
import { usePermissions } from '@/composables/usePermissions'
import type { DayCloseHistoryFilters } from '@/composables/useDayCloseHistory'
import { staffService } from '@/services/staff.service'
import type { DayCloseSummary } from '@/types/day-close'
import type { StaffMember } from '@/types/staff'
import { formatMoney } from '@/utils/format'

/**
 * CARTA 9.1B §34-§36 — owner/manager history list + filters. The
 * `closed_by` dropdown only appears when `manage_users` is actually
 * reachable (it calls the real staff list, never a fabricated endpoint) —
 * absent that permission, the filter simply doesn't render. There's no
 * "sin incidencias" filter value — the real contract's `has_incidents` is
 * only meaningfully sent as `true` (omitted otherwise), matching the two
 * options the i18n copy actually offers ("Todos" / "Con incidencias").
 *
 * Each row formats money with ITS OWN `currency` (DayCloseSummary carries
 * one per close) rather than a restaurant-level default — correct even if
 * a restaurant's currency were ever changed between two closes, and avoids
 * depending on RestaurantSettings (which needs `manage_restaurants`, a
 * permission this screen's own viewers aren't guaranteed to have).
 */
const props = defineProps<{
  items: DayCloseSummary[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
}>()
const emit = defineEmits<{ 'load-more': []; 'filters-changed': [DayCloseHistoryFilters] }>()

const { t, locale } = useI18n()
const router = useRouter()
const { canOrganization } = usePermissions()

const canFilterByStaff = canOrganization('manage_users')
const staffOptions = ref<StaffMember[]>([])

const from = ref('')
const to = ref('')
const closedBy = ref<string>('')
const onlyIncidents = ref(false)

onMounted(async () => {
  if (!canFilterByStaff) return
  try {
    staffOptions.value = await staffService.list()
  } catch {
    staffOptions.value = []
  }
})

function money(amount: string, currency: string): string {
  return formatMoney(amount, locale.value, currency)
}

function dateOnly(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  try {
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(new Date(year, month - 1, day))
  } catch {
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(year, month - 1, day))
  }
}

function applyFilters(): void {
  emit('filters-changed', {
    from: from.value || null,
    to: to.value || null,
    closedBy: closedBy.value ? Number(closedBy.value) : null,
    hasIncidents: onlyIncidents.value ? true : null,
  })
}

function openDetail(dayClose: DayCloseSummary): void {
  void router.push({ name: 'app-day-close-detail', params: { id: String(dayClose.id) } })
}

</script>

<template>
  <SectionCard :icon="PhCashRegister" :title="t('dayClose.history.title')">
    <div class="flex flex-wrap items-end gap-3">
      <ATextField v-model="from" type="date" :label="t('dayClose.history.filters.from')" @update:model-value="applyFilters" />
      <ATextField v-model="to" type="date" :label="t('dayClose.history.filters.to')" @update:model-value="applyFilters" />

      <div v-if="canFilterByStaff" class="flex flex-col gap-1.5">
        <label for="day-close-filter-staff" class="text-label-lg font-medium text-on-surface-variant">{{ t('dayClose.history.filters.closedBy') }}</label>
        <select
          id="day-close-filter-staff"
          v-model="closedBy"
          class="min-h-11 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-body-lg text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          @change="applyFilters"
        >
          <option value="">{{ t('dayClose.history.filters.allStaff') }}</option>
          <option v-for="staff in staffOptions" :key="staff.id" :value="String(staff.id)">{{ staff.name }}</option>
        </select>
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="day-close-filter-incidents" class="text-label-lg font-medium text-on-surface-variant">{{ t('dayClose.history.filters.hasIncidents') }}</label>
        <select
          id="day-close-filter-incidents"
          v-model="onlyIncidents"
          class="min-h-11 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-body-lg text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          @change="applyFilters"
        >
          <option :value="false">{{ t('dayClose.history.filters.anyIncidents') }}</option>
          <option :value="true">{{ t('dayClose.history.filters.hasIncidents') }}</option>
        </select>
      </div>
    </div>

    <EmptyState v-if="!loading && items.length === 0" :icon="PhCashRegister" :message="t('dayClose.history.empty')" class="mt-4" />

    <ul v-else class="mt-4 flex flex-col divide-y divide-outline-variant">
      <li v-for="item in items" :key="item.id" class="py-1">
        <button
          type="button"
          class="flex w-full flex-col gap-1.5 rounded-lg px-2 py-2 text-left transition-colors duration-200 ease-out hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          @click="openDetail(item)"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-body-lg font-medium text-on-surface">{{ dateOnly(item.business_date) }}</span>
            <span class="text-body-lg font-medium tabular-nums text-on-surface">{{ money(item.total_received, item.currency) }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-label-md text-on-surface-variant">{{ item.closed_by.name }} · {{ t('dayClose.history.guests', { count: item.guests }) }}</span>
            <span
              class="inline-flex items-center rounded-xs px-2 py-0.5 text-label-md font-medium"
              :class="item.has_incidents ? 'bg-warning-container text-on-warning-container' : 'bg-success-container text-on-success-container'"
            >
              {{ item.has_incidents ? t('dayClose.history.badges.withIncidents') : t('dayClose.history.badges.noIncidents') }}
            </span>
          </div>
        </button>

      </li>
    </ul>

    <div v-if="hasMore" class="mt-4 flex justify-center">
      <AButton variant="outlined" :loading="loadingMore" @click="emit('load-more')">{{ t('dayClose.history.loadMore') }}</AButton>
    </div>
  </SectionCard>
</template>
