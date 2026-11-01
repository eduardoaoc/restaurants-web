<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  PhBellRinging,
  PhBellSimple,
  PhCaretDown,
  PhCaretRight,
  PhCheckCircle,
  PhHandPalm,
  PhPhoneCall,
  PhProhibit,
  PhReceipt,
  PhUserCircleMinus,
  PhUserMinus,
  PhWarning,
} from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import AStatusBadge, { type StatusBadgeState } from '@/components/ui/AStatusBadge.vue'
import type { OperationsDailyOperation } from '@/types/daily-operation'
import type { OperationsAlert, OperationsAlertSeverity, OperationsStaffMember, OperationsTable } from '@/types/operations'
import { classifyOperationAge, type OperationTiming } from '@/utils/operation-timing'
import { operationsAlertTypeLabelKey } from '@/utils/operations-alerts'
import OperationTimeLabel from './OperationTimeLabel.vue'

/**
 * "Atención ahora" — the snapshot's own `alerts`, nothing derived: type,
 * severity, table, person and age all come from GET /operations/live. The
 * only ordering is the backend severity, then the longest wait first. The
 * single split is current service vs. previous sessions (see
 * utils/operation-timing.ts), so leftovers from earlier days never bury
 * what needs doing now. Every action selects the table so the existing
 * table flows (approve, serve, requests, bill, assign) run in context.
 */
const props = defineProps<{
  alerts: OperationsAlert[]
  tables: OperationsTable[]
  staff: OperationsStaffMember[]
  generatedAt: string
  dailyOperation: OperationsDailyOperation
  timezone: string
  selectedAlertId: string | null
  canViewService: boolean
  /** Narrow layouts show the first items and disclose the rest on demand. */
  compact?: boolean
}>()

const emit = defineEmits<{ select: [OperationsAlert] }>()
const { t } = useI18n()

type QueueTab = 'current' | 'previous'
const tab = ref<QueueTab>('current')
const expanded = ref(false)
const COMPACT_LIMIT = 3

const SEVERITY_RANK: Record<OperationsAlertSeverity, number> = { critical: 0, warning: 1, info: 2 }
const SEVERITY_BADGE: Record<OperationsAlertSeverity, StatusBadgeState> = { critical: 'critical', warning: 'warning', info: 'normal' }

const TYPE_ICON: Record<string, Component> = {
  order_waiting_approval: PhHandPalm,
  order_ready: PhBellSimple,
  customer_waiter_request_pending: PhBellRinging,
  bill_request_pending: PhReceipt,
  responsible_waiter_call_pending: PhPhoneCall,
  active_table_unassigned: PhUserCircleMinus,
  assigned_waiter_off_shift: PhUserMinus,
  assigned_waiter_suspended: PhProhibit,
}

const TYPE_ACTION: Record<string, string> = {
  order_waiting_approval: 'review',
  order_ready: 'serve',
  customer_waiter_request_pending: 'attend',
  bill_request_pending: 'bill',
  active_table_unassigned: 'assign',
  assigned_waiter_off_shift: 'assign',
  assigned_waiter_suspended: 'assign',
}

interface QueueItem {
  alert: OperationsAlert
  table: OperationsTable | null
  timing: OperationTiming
  label: string
  icon: Component
  summary: string[]
  actionKey: string | null
}

const tablesById = computed(() => new Map(props.tables.map((table) => [table.id, table])))
const staffById = computed(() => new Map(props.staff.map((member) => [member.user.id, member])))

function summaryFor(alert: OperationsAlert, table: OperationsTable | null): string[] {
  const parts: string[] = []
  if (alert.type === 'order_waiting_approval' && table && table.orders.waiting_approval > 0) {
    parts.push(t('operations.board.queue.ordersWaiting', table.orders.waiting_approval))
  } else if (alert.type === 'order_ready' && table && table.orders.ready > 0) {
    parts.push(t('operations.board.queue.ordersReady', table.orders.ready))
  }
  if (table?.session) {
    parts.push(t('operations.board.queue.guests', table.session.guest_count))
    parts.push(table.session.assigned_waiter?.name ?? t('operations.board.queue.unassigned'))
  } else if (alert.user_id !== null) {
    const name = staffById.value.get(alert.user_id)?.user.name
    if (name) parts.push(name)
  }
  return parts
}

const items = computed<QueueItem[]>(() =>
  props.alerts
    .map((alert) => {
      const table = alert.table_id !== null ? tablesById.value.get(alert.table_id) ?? null : null
      const labelKey = operationsAlertTypeLabelKey(alert.type)
      const actionKey = table ? TYPE_ACTION[alert.type] ?? 'view' : props.canViewService ? 'service' : null
      return {
        alert,
        table,
        timing: classifyOperationAge(alert.age_seconds, props.generatedAt, props.dailyOperation),
        label: labelKey ? t(labelKey) : t('operations.now.genericAttention'),
        icon: TYPE_ICON[alert.type] ?? PhWarning,
        summary: summaryFor(alert, table),
        actionKey,
      }
    })
    .sort((a, b) => SEVERITY_RANK[a.alert.severity] - SEVERITY_RANK[b.alert.severity] || b.alert.age_seconds - a.alert.age_seconds),
)

const currentItems = computed(() => items.value.filter((item) => item.timing.kind !== 'previous'))
const previousItems = computed(() => items.value.filter((item) => item.timing.kind === 'previous'))
const activeItems = computed(() => (tab.value === 'current' ? currentItems.value : previousItems.value))
const visibleItems = computed(() => (props.compact && !expanded.value ? activeItems.value.slice(0, COMPACT_LIMIT) : activeItems.value))
const hiddenCount = computed(() => activeItems.value.length - visibleItems.value.length)

watch(tab, () => { expanded.value = false })

function tabClass(active: boolean): string {
  return active ? 'bg-surface font-semibold text-fg shadow-raised' : 'font-medium text-fg-muted hover:text-fg'
}
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-col" aria-labelledby="operation-queue-title">
    <header class="flex items-center justify-between gap-3 px-4 pt-4">
      <h2 id="operation-queue-title" class="min-w-0 text-component-title font-semibold text-fg">{{ t('operations.board.queue.title') }}</h2>
      <!-- Tabs below show the counts visually; this is the single announced summary. -->
      <span class="sr-only" role="status" aria-atomic="true">
        {{ t('operations.board.queue.count', currentItems.length) }}
      </span>
    </header>

    <div class="px-4 pt-3">
      <div class="grid grid-cols-2 gap-1 rounded-saloa-md bg-surface-subtle p-1" role="group" :aria-label="t('operations.board.queue.filter')">
        <button
          v-for="option in (['current', 'previous'] as const)"
          :key="option"
          type="button"
          :aria-pressed="tab === option"
          class="inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-saloa-sm px-2 text-label-lg transition-colors duration-fast ease-out pointer-fine:min-h-9 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          :class="tabClass(tab === option)"
          @click="tab = option"
        >
          <span class="min-w-0 truncate">{{ t(`operations.board.queue.${option}`) }}</span>
          <span class="tabular-nums text-fg-muted">{{ option === 'current' ? currentItems.length : previousItems.length }}</span>
        </button>
      </div>
      <p v-if="tab === 'previous' && previousItems.length > 0" class="mt-2 text-label-md text-fg-muted">{{ t('operations.board.queue.previousHint') }}</p>
    </div>

    <div class="operation-queue-scroll mt-3 min-h-0 flex-1 overflow-y-auto px-4 pb-4">
      <div v-if="activeItems.length === 0" class="flex flex-col items-center gap-2 rounded-saloa-md border border-dashed border-hairline px-4 py-8 text-center">
        <PhCheckCircle :size="24" class="text-fg-muted" aria-hidden="true" />
        <p class="text-body-sm text-fg-muted">
          {{ tab === 'current' ? t('operations.board.queue.empty') : t('operations.board.queue.emptyPrevious') }}
        </p>
        <AButton v-if="tab === 'current' && previousItems.length > 0" variant="ghost" size="sm" @click="tab = 'previous'">
          {{ t('operations.board.queue.previous') }} ({{ previousItems.length }})
          <template #trailing><PhCaretRight /></template>
        </AButton>
      </div>

      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="item in visibleItems"
          :key="item.alert.id"
          class="relative min-w-0 overflow-hidden rounded-saloa-md border p-3 transition-colors duration-fast ease-out"
          :class="selectedAlertId === item.alert.id ? 'border-accent bg-primary-subtle/40' : 'border-hairline bg-surface-subtle'"
          :aria-current="selectedAlertId === item.alert.id ? 'true' : undefined"
        >
          <span v-if="selectedAlertId === item.alert.id" class="absolute inset-y-0 left-0 w-1 bg-accent" aria-hidden="true" />
          <div class="flex min-w-0 items-start justify-between gap-2">
            <AStatusBadge class="shrink-0 whitespace-nowrap" :state="SEVERITY_BADGE[item.alert.severity]" :label="t(`operations.alerts.severity.${item.alert.severity}`)" />
            <OperationTimeLabel :timing="item.timing" :timezone="timezone" prefix="ago" class="pt-0.5 text-right text-label-md" />
          </div>
          <div class="mt-2 flex min-w-0 items-start gap-2">
            <component :is="item.icon" :size="18" class="mt-0.5 shrink-0 text-fg-muted" aria-hidden="true" />
            <div class="min-w-0 flex-1">
              <p class="break-words text-body-sm font-semibold text-fg">{{ item.label }}</p>
              <p class="break-words text-body-sm text-fg">{{ item.table?.name ?? t('operations.board.queue.noTable') }}</p>
              <p v-if="item.summary.length" class="break-words text-label-md text-fg-muted">{{ item.summary.join(' · ') }}</p>
            </div>
          </div>
          <div v-if="item.actionKey" class="mt-3">
            <AButton
              v-if="item.actionKey === 'service'"
              as="RouterLink"
              :to="{ name: 'app-service' }"
              variant="secondary"
              size="sm"
              full-width
            >
              {{ t('operations.board.queue.actions.service') }}
            </AButton>
            <AButton
              v-else
              :variant="selectedAlertId === item.alert.id ? 'primary' : 'secondary'"
              size="sm"
              full-width
              :aria-label="`${t(`operations.board.queue.actions.${item.actionKey}`)} — ${item.table?.name ?? ''}`"
              @click="emit('select', item.alert)"
            >
              {{ t(`operations.board.queue.actions.${item.actionKey}`) }}
            </AButton>
          </div>
        </li>
      </ul>

      <AButton v-if="hiddenCount > 0 || (compact && expanded)" variant="ghost" size="sm" full-width class="mt-2" :aria-expanded="expanded" @click="expanded = !expanded">
        <template #leading><PhCaretDown :class="expanded ? 'rotate-180' : ''" /></template>
        {{ expanded ? t('operations.board.queue.showLess') : t('operations.board.queue.showAll', { count: activeItems.length }) }}
      </AButton>
    </div>
  </section>
</template>
