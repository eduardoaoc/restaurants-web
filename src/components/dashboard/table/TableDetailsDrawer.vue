<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  PhArrowsLeftRight, PhBellRinging, PhCaretDown, PhCheck, PhCreditCard, PhDotsThree, PhMinus, PhPencilSimple, PhPlus, PhReceipt,
  PhUserCircleMinus, PhUserPlus, PhX,
} from '@phosphor-icons/vue'

import { normalizeApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import AConfirmDialog from '@/components/ui/AConfirmDialog.vue'
import AIconButton from '@/components/ui/AIconButton.vue'
import AStatusBadge from '@/components/ui/AStatusBadge.vue'
import ASurface from '@/components/ui/ASurface.vue'
import ATextField from '@/components/ui/ATextField.vue'
import ASheet from '@/components/ui/ASheet.vue'
import { usePermissions } from '@/composables/usePermissions'
import { useSnackbar } from '@/composables/useSnackbar'
import { tableSessionsService } from '@/services/table-sessions.service'
import { tablesService } from '@/services/tables.service'
import { useRestaurantStore } from '@/stores/restaurant'
import type { OperationsStaffMember, OperationsTable } from '@/types/operations'
import type { SessionBill } from '@/types/table-sessions'
import { serviceTableStatus } from '@/utils/service-table-status'
import { describeApiError } from '@/utils/error-message'
import { formatDuration, formatMoney } from '@/utils/format'
import { formatOperationInstant, type OperationTiming } from '@/utils/operation-timing'
import OperationTimeLabel from '@/components/dashboard/operation/OperationTimeLabel.vue'
import BillReceiptSheet from './BillReceiptSheet.vue'
import ServiceOrderComposer from '@/components/service/ServiceOrderComposer.vue'
import TableAccessPanel from './TableAccessPanel.vue'
import TableBillPanel from './TableBillPanel.vue'
import TableOrdersList from './TableOrdersList.vue'
import TableRequestsPanel from './TableRequestsPanel.vue'
import TransferTableDialog from './TransferTableDialog.vue'

const props = defineProps<{
  table: OperationsTable | null
  staff: OperationsStaffMember[]
  freeTables: OperationsTable[]
  currency: string
  /** Opt-in presentation used by ServiceView; preserves the Service body and actions. */
  serviceMode?: boolean
  /** Dashboard uses the modal primitive while retaining its existing body/actions. */
  dashboardMode?: boolean
  /** Operation board on wide screens: an embedded, non-modal panel beside the map so the whole floor stays visible. Same body/actions. */
  inlineMode?: boolean
  /** Operation board: the session age classified against the operational day, so a leftover session reads "since 21/10", not "158h". */
  sessionTiming?: OperationTiming | null
  initialSection?: 'overview' | 'orders' | 'requests' | 'bill'
}>()

const emit = defineEmits<{ close: []; refresh: [] }>()

const { t, locale } = useI18n()
const snackbar = useSnackbar()
const modalMode = computed(() => props.serviceMode || props.dashboardMode)

/**
 * Every table-session action here maps to the exact backend Policy ability
 * it hits (verified against restaurants-api's TablePolicy/TableSessionPolicy/
 * WaiterCallPolicy — see the Passo 1.2C report's TableDetailsDrawer table):
 *   - open:            TablePolicy::open            -> manage_tables
 *   - close:            TableSessionPolicy::close     -> manage_tables OR close_bill
 *   - assign/unassign:  TableSessionPolicy::assignWaiter -> assign_waiters
 *   - call responsible: WaiterCallPolicy::create      -> assign_waiters (reused, not a dedicated slug)
 *   - transfer:         TableSessionPolicy::transfer   -> transfer_tables
 *   - view orders:      OrderPolicy::viewAny's OR set  -> create_orders/approve_customer_orders/update_kitchen_status/serve_orders/close_bill
 */
const { can, canAny } = usePermissions()
const restaurantStore = useRestaurantStore()
// Reused as-is for the "Acceso a la mesa" section below (Carta 8.1B §10):
// GET /tables/{table} — the only endpoint carrying `public_token` — is
// manage_tables-only on the real backend (verified live: 403 otherwise),
// the exact same capability that already gates opening a table here.
const canOpenTable = computed(() => can('manage_tables'))
const canUpdateGuestCount = computed(() => can('manage_tables'))
const canCloseTable = computed(() => can('manage_tables') || can('close_bill'))
const canAssignWaiters = computed(() => can('assign_waiters'))
const canTransferTables = computed(() => can('transfer_tables'))
const canViewOrders = computed(() =>
  canAny(['create_orders', 'approve_customer_orders', 'update_kitchen_status', 'serve_orders', 'close_bill']),
)
// Passo 3.2: distinct from canViewOrders — a user may see a table's orders
// (e.g. close_bill-only) without being allowed to create a new one, and
// vice versa. Maps 1:1 to POST /tables/{table}/orders's own Policy check.
const canCreateOrders = computed(() => can('create_orders'))
// Passo 3.4: the two real billing capabilities — record_payments (can
// charge) and close_bill (can close, which needs to see what's owed first).
// Never gated on manage_tables here: viewing/recording money is a distinct
// grant from configuring the floor plan, even though both may close a table.
const canViewReceipt = computed(() => can('record_payments') || can('close_bill'))
const canViewBilling = computed(() => can('record_payments') || can('close_bill'))
const canRecordPayments = computed(() => can('record_payments'))
const canHandleTableRequests = computed(() => can('handle_table_requests'))

const showOrders = ref(false)
const showAccess = ref(false)
const showBill = ref(false)
const showReceipt = ref(false)
const showTransfer = ref(false)
const showWaiterMenu = ref(false)
const showMoreActions = ref(false)
const showOrderComposer = ref(false)
const showCloseConfirm = ref(false)
const showGuestCountEditor = ref(false)
const showGuestCountConfirm = ref(false)
const guestCountDraft = ref(1)
const pendingGuestCount = ref<number | null>(null)
const pendingGuestCountVersion = ref<number | null>(null)
const waitingForGuestCountRefresh = ref(false)
const confirmedGuestCount = ref<{ sessionId: number; count: number; version: number } | null>(null)
const guestCountSaving = ref(false)
const openGuestCount = ref('2')
const submittingAction = ref<string | null>(null)
const feedback = ref<{ kind: 'success' | 'error'; message: string } | null>(null)
// Populated by TableBillPanel's `bill-loaded` emit whenever the panel is
// mounted (always, once there's a session + canViewBilling — see template)
// — the ONLY signal the Close button's disabled state below reads, never a
// locally-derived balance check (see TableBillPanel's own docblock).
const bill = ref<SessionBill | null>(null)
const authoritativeGuestCount = computed(() => {
  const session = props.table?.session
  return session && confirmedGuestCount.value?.sessionId === session.id
    ? confirmedGuestCount.value.count
    : session?.guest_count ?? 0
})
const guestCountLimit = computed(() => props.table?.capacity ?? 100)
const guestCountCanSave = computed(() => !!props.table?.session
  && Number.isInteger(guestCountDraft.value)
  && guestCountDraft.value >= 1
  && guestCountDraft.value <= guestCountLimit.value
  && guestCountDraft.value !== authoritativeGuestCount.value
  && !guestCountSaving.value
  && !waitingForGuestCountRefresh.value)

watch(() => [props.table?.session?.id, props.table?.session?.guest_count_version] as const, ([sessionId, version], [previousId, previousVersion]) => {
  if (sessionId !== previousId) {
    confirmedGuestCount.value = null
    showGuestCountEditor.value = false
    showGuestCountConfirm.value = false
    waitingForGuestCountRefresh.value = false
    if (props.table?.session) guestCountDraft.value = props.table.session.guest_count
  } else if (version !== previousVersion && props.table?.session) {
    if (confirmedGuestCount.value?.version !== version) confirmedGuestCount.value = null
    if (waitingForGuestCountRefresh.value) {
      waitingForGuestCountRefresh.value = false
      pendingGuestCountVersion.value = version ?? null
      if (pendingGuestCount.value !== props.table.session.guest_count) showGuestCountConfirm.value = true
      else pendingGuestCount.value = null
    }
  }
})

watch(
  () => `${restaurantStore.currentRestaurantId}:${props.table?.id}:${props.table?.session?.id}:${props.initialSection}`,
  () => {
    // Carta 8.1B §2: a session's orders are no longer an extra click away —
    // they're visible the moment a table with an active session opens, same
    // as every other piece of its context. A free table (no session) simply
    // has none to show; TableOrdersList itself only ever renders inside the
    // `table.session` branch below, so this never fires a request for a free
    // table (§3).
    showOrders.value = !!(props.table?.session && canViewOrders.value)
    showAccess.value = false
    showBill.value = props.serviceMode === true && props.initialSection === 'bill'
    showReceipt.value = false
    showTransfer.value = false
    showWaiterMenu.value = false
    showMoreActions.value = false
    showOrderComposer.value = false
    showCloseConfirm.value = false
    showGuestCountEditor.value = false
    showGuestCountConfirm.value = false
    pendingGuestCount.value = null
    pendingGuestCountVersion.value = null
    waitingForGuestCountRefresh.value = false
    confirmedGuestCount.value = null
    if (props.table?.session) guestCountDraft.value = props.table.session.guest_count
    feedback.value = null
    bill.value = null
    if (props.serviceMode && props.initialSection && props.initialSection !== 'overview') {
      const target = {
        orders: 'service-table-orders',
        requests: 'service-table-requests',
        bill: 'service-table-bill',
      }[props.initialSection]
      void nextTick(() => document.getElementById(target)?.scrollIntoView({ block: 'start', behavior: scrollBehavior() }))
    }
  },
  { immediate: true },
)

function onOrderCreated(): void {
  showOrderComposer.value = false
  feedback.value = { kind: 'success', message: t('tableDrawer.feedback.orderCreated') }
  if (props.serviceMode) snackbar.showSnackbar({ message: t('tableDrawer.feedback.orderCreated'), kind: 'success' })
  emit('refresh')
}

const serviceStatus = computed(() => props.table ? serviceTableStatus(props.table.primary_status) : null)

type ServicePrimaryAction = 'open' | 'orders' | 'requests' | 'bill' | 'new-order'
const servicePrimaryAction = computed<ServicePrimaryAction | null>(() => {
  const table = props.table
  if (!props.serviceMode || !table) return null
  if (!table.session && canOpenTable.value) return 'open'
  if (table.primary_status === 'waiting_approval' || table.primary_status === 'ready') {
    return canViewOrders.value ? 'orders' : null
  }
  if (table.primary_status === 'bill_requested' && canViewBilling.value) return 'bill'
  if (table.primary_status === 'waiter_requested' && canHandleTableRequests.value) return 'requests'
  if (table.session && canCreateOrders.value) return 'new-order'
  return null
})

// Frequent actions are icon + short label tiles (≥44 px, 8 px apart); the rest hide behind "More actions".
const tileClass = 'flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-saloa-md border border-hairline bg-surface px-2 py-2 text-center text-label-md font-medium text-fg transition-colors duration-fast ease-out hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 aria-expanded:bg-surface-subtle'
const transferBlocked = computed(() => props.freeTables.length === 0)
const hasMoreActions = computed(() => canTransferTables.value || canViewReceipt.value)
const restaurantTimezone = computed(() => restaurantStore.currentSettings?.timezone ?? 'Europe/Madrid')
function startedAt(): string | null {
  const started = props.table?.session?.started_at
  return started ? formatOperationInstant(new Date(started), locale.value, restaurantTimezone.value) : null
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

function scrollToServiceSection(id: string): void {
  document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: scrollBehavior() })
}

function runServicePrimaryAction(): void {
  switch (servicePrimaryAction.value) {
    case 'open': openTable(); break
    case 'orders':
      showOrders.value = true
      void nextTick(() => scrollToServiceSection('service-table-orders'))
      break
    case 'requests':
      void nextTick(() => scrollToServiceSection('service-table-requests'))
      break
    case 'bill':
      showBill.value = true
      void nextTick(() => scrollToServiceSection('service-table-bill'))
      break
    case 'new-order': showOrderComposer.value = true; break
  }
}

// Matches the house dropdown pattern (RestaurantSwitcher/LanguageSwitcher/
// ThemeSwitcher/UserMenu, see CLAUDE.md's component notes): without this,
// the waiter menu had no way to close except re-clicking its own toggle —
// found via real interaction testing, it stayed open and its absolutely
// positioned panel silently intercepted clicks on the buttons below it.
function onWaiterMenuFocusOut(event: FocusEvent): void {
  const root = event.currentTarget as HTMLElement
  if (!root.contains(event.relatedTarget as Node | null)) {
    showWaiterMenu.value = false
  }
}

function onWaiterMenuKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') showWaiterMenu.value = false
}

async function run(action: string, task: () => Promise<unknown>, successKey: string): Promise<void> {
  if (submittingAction.value) return
  submittingAction.value = action
  feedback.value = null
  try {
    await task()
    feedback.value = { kind: 'success', message: t(successKey) }
    if (props.serviceMode) snackbar.showSnackbar({ message: t(successKey), kind: 'success' })
    emit('refresh')
  } catch (err) {
    feedback.value = { kind: 'error', message: describeApiError(normalizeApiError(err), t) }
  } finally {
    submittingAction.value = null
  }
}

function openTable(): void {
  if (!props.table) return
  const guestCount = Number(openGuestCount.value)
  if (!Number.isInteger(guestCount) || guestCount < 1) {
    feedback.value = { kind: 'error', message: t('tableDrawer.errors.invalidGuestCount') }
    return
  }
  void run('open', () => tablesService.open(props.table!.id, { guest_count: guestCount }), 'tableDrawer.feedback.opened')
}

function beginGuestCountEdit(): void {
  if (!props.table?.session || !canUpdateGuestCount.value) return
  guestCountDraft.value = authoritativeGuestCount.value
  pendingGuestCount.value = null
  pendingGuestCountVersion.value = null
  showGuestCountEditor.value = true
}

function changeGuestCount(delta: -1 | 1): void {
  if (!showGuestCountEditor.value || guestCountSaving.value || waitingForGuestCountRefresh.value) return
  const next = guestCountDraft.value + delta
  if (next < 1 || next > guestCountLimit.value) return
  guestCountDraft.value = next
}

function requestGuestCountConfirmation(): void {
  const session = props.table?.session
  if (!session || !guestCountCanSave.value) return
  pendingGuestCount.value = guestCountDraft.value
  pendingGuestCountVersion.value = session.guest_count_version
  showGuestCountConfirm.value = true
}

function cancelGuestCountEdit(): void {
  showGuestCountEditor.value = false
  showGuestCountConfirm.value = false
  waitingForGuestCountRefresh.value = false
  pendingGuestCount.value = null
  pendingGuestCountVersion.value = null
}

function cancelGuestCountConfirmation(): void {
  showGuestCountConfirm.value = false
  pendingGuestCount.value = null
  pendingGuestCountVersion.value = null
}

async function confirmGuestCountChange(): Promise<void> {
  const session = props.table?.session
  const nextCount = pendingGuestCount.value
  const expectedVersion = pendingGuestCountVersion.value
  if (!session || nextCount === null || expectedVersion === null || guestCountSaving.value) return

  guestCountSaving.value = true
  feedback.value = null
  try {
    const updated = await tableSessionsService.updateGuestCount(session.id, {
      guest_count: nextCount,
      expected_version: expectedVersion,
    })
    confirmedGuestCount.value = { sessionId: updated.id, count: updated.guest_count, version: updated.guest_count_version }
    guestCountDraft.value = updated.guest_count
    showGuestCountConfirm.value = false
    showGuestCountEditor.value = false
    pendingGuestCount.value = null
    feedback.value = { kind: 'success', message: t('tableDrawer.guestCountUpdated') }
    if (props.serviceMode) snackbar.showSnackbar({ message: t('tableDrawer.guestCountUpdated'), kind: 'success' })
    emit('refresh')
  } catch (error) {
    const apiError = normalizeApiError(error)
    if (apiError.code === 'GUEST_COUNT_VERSION_CONFLICT') {
      showGuestCountConfirm.value = false
      waitingForGuestCountRefresh.value = true
      feedback.value = { kind: 'error', message: t('tableDrawer.guestCountConflict') }
      emit('refresh')
    } else {
      feedback.value = { kind: 'error', message: describeApiError(apiError, t) }
      if (apiError.kind === 'conflict' || apiError.kind === 'not_found') emit('refresh')
    }
  } finally {
    guestCountSaving.value = false
  }
}

// Close is a sensitive action (§12/§13) — the button only opens the confirm
// dialog; the actual POST /tables/{id}/close never fires without that
// explicit second step. `closeDisabled` reads `bill.can_close` ONLY when a
// bill has actually loaded (canViewBilling); a user who can close a table
// but genuinely cannot view its bill (a real, if unusual, permission split)
// falls back to the backend's own enforcement — verified live (Passo 3.4)
// that POST .../close 409s with TABLE_SESSION_HAS_OPEN_ORDERS in exactly
// this case, so nothing is silently bypassed either way.
const closeDisabled = computed(() => bill.value !== null && !bill.value.can_close)

function requestClose(): void {
  if (!props.table || closeDisabled.value) return
  showCloseConfirm.value = true
}

async function confirmClose(): Promise<void> {
  if (!props.table) return
  await run('close', () => tablesService.close(props.table!.id), 'tableDrawer.feedback.closed')
  showCloseConfirm.value = false
}

function onBillLoaded(value: SessionBill | null): void {
  bill.value = value
}

function onBillingChanged(): void {
  emit('refresh')
}

function onTableRequestsChanged(): void {
  emit('refresh')
}

function callWaiter(): void {
  if (!props.table?.session) return
  void run('call', () => tableSessionsService.callWaiter(props.table!.session!.id), 'tableDrawer.feedback.called')
}

function assignWaiter(userId: number): void {
  if (!props.table?.session) return
  showWaiterMenu.value = false
  void run('assign', () => tableSessionsService.assignWaiter(props.table!.session!.id, { user_id: userId }), 'tableDrawer.feedback.assigned')
}

function unassignWaiter(): void {
  if (!props.table?.session) return
  showWaiterMenu.value = false
  void run('assign', () => tableSessionsService.unassignWaiter(props.table!.session!.id), 'tableDrawer.feedback.unassigned')
}

async function confirmTransfer(targetTableId: number): Promise<void> {
  if (!props.table?.session) return
  // Keep the dialog open (with its own submitting/disabled state) until the
  // request actually resolves — closing it immediately on click, as a
  // previous version did, made its `submitting` prop dead code and left no
  // visible feedback for the entire duration of the request.
  await run(
    'transfer',
    () => tableSessionsService.transfer(props.table!.session!.id, { target_table_id: targetTableId }),
    'tableDrawer.feedback.transferred',
  )
  showTransfer.value = false
}
</script>

<template>
  <Transition name="drawer">
    <component
      :is="modalMode ? ASheet : 'aside'"
      v-if="table"
      :title="table.name"
      variant="side"
      size="md"
      :class="modalMode ? 'service-table-sheet' : inlineMode ? 'h-full overflow-y-auto overscroll-contain p-4' : 'fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-outline-variant bg-surface-container-high p-5 shadow-elevated sm:inset-x-auto sm:inset-y-6 sm:right-6 sm:w-96 sm:rounded-2xl'"
      :role="modalMode ? undefined : inlineMode ? 'region' : 'dialog'"
      :aria-label="modalMode ? undefined : table.name"
      @close="emit('close')"
      @keydown.esc="inlineMode && emit('close')"
    >
      <!-- Header: table, state and (from the modal itself) close. -->
      <template v-if="modalMode" #header>
        <span class="inline-flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span class="min-w-0 break-words">{{ table.name }}</span>
          <AStatusBadge v-if="serviceStatus" :state="serviceStatus.state" :label="t(serviceStatus.labelKey)" :icon="serviceStatus.icon" />
        </span>
      </template>
      <div v-if="!modalMode" class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-title-lg font-semibold text-on-surface">{{ table.name }}</h3>
          <AStatusBadge v-if="serviceStatus" class="mt-1" :state="serviceStatus.state" :label="t(serviceStatus.labelKey)" :icon="serviceStatus.icon" />
        </div>
        <AIconButton :label="t('common.close')" @click="emit('close')">
          <PhX :size="18" />
        </AIconButton>
      </div>

      <p
        v-if="feedback && (!serviceMode || feedback.kind === 'error')"
        class="mt-3 rounded-md px-3 py-2 text-label-lg"
        :class="feedback.kind === 'success' ? 'bg-success-container text-on-success-container' : 'bg-critical-container text-on-critical-container'"
        role="status"
      >
        {{ feedback.message }}
      </p>

      <!-- No active session: only real action is opening one, and only for a user who holds manage_tables -->
      <div v-if="!table.session && canOpenTable" class="mt-4 flex flex-col gap-3">
        <p class="text-body-md text-on-surface-variant">{{ t('tableDrawer.freeHint') }}</p>
        <ATextField v-model="openGuestCount" :label="t('tableDrawer.guestCount')" inputmode="numeric" type="number" />
        <AButton v-if="!serviceMode" :loading="submittingAction === 'open'" @click="openTable">{{ t('tableDrawer.actions.open') }}</AButton>
      </div>
      <p v-else-if="!table.session" class="mt-4 text-body-md text-on-surface-variant">{{ t('tableDrawer.freeHint') }}</p>

      <template v-else>
        <!-- 2 · Compact summary: guests, time, waiter, total. -->
        <dl class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" data-table-summary>
          <div class="min-w-0 rounded-saloa-md bg-surface-subtle px-3 py-2">
            <dt class="text-label-md text-fg-muted">{{ t('tableDrawer.guests') }}</dt>
            <dd class="mt-0.5 flex items-center gap-1 text-title-md font-semibold tabular-nums text-fg">
              {{ authoritativeGuestCount }}
              <AIconButton v-if="canUpdateGuestCount && !showGuestCountEditor" size="sm" class="-my-1" :label="t('tableDrawer.editGuests')" :disabled="guestCountSaving" @click="beginGuestCountEdit">
                <PhPencilSimple :size="16" />
              </AIconButton>
            </dd>
          </div>
          <div class="min-w-0 rounded-saloa-md bg-surface-subtle px-3 py-2">
            <dt class="text-label-md text-fg-muted">{{ sessionTiming?.kind === 'previous' ? t('operations.board.timing.previousSession') : t('tableDrawer.elapsed') }}</dt>
            <dd class="mt-0.5 font-semibold tabular-nums text-fg" :class="sessionTiming?.kind === 'previous' ? 'text-body-sm' : 'text-title-md'">
              <OperationTimeLabel v-if="sessionTiming" :timing="sessionTiming" :timezone="restaurantTimezone" />
              <template v-else>{{ formatDuration(table.session.elapsed_seconds) }}</template>
            </dd>
          </div>
          <div class="min-w-0 rounded-saloa-md bg-surface-subtle px-3 py-2">
            <dt class="text-label-md text-fg-muted">{{ t('tableDrawer.waiter') }}</dt>
            <dd class="mt-0.5 truncate text-title-md font-semibold text-fg">{{ table.session.assigned_waiter?.name ?? t('tableDrawer.pendingAssignment') }}</dd>
          </div>
          <div class="min-w-0 rounded-saloa-md bg-surface-subtle px-3 py-2">
            <dt class="text-label-md text-fg-muted">{{ t('tableDrawer.total') }}</dt>
            <dd class="mt-0.5 truncate text-title-md font-semibold tabular-nums text-fg">{{ table.billing ? formatMoney(table.billing.total, locale, currency) : '—' }}</dd>
          </div>
        </dl>
        <div v-if="canUpdateGuestCount && showGuestCountEditor" class="mt-3 rounded-lg border border-outline-variant bg-surface-container p-3">
          <p class="text-label-lg font-medium text-on-surface">{{ t('tableDrawer.guestCount') }}</p>
          <div class="mt-2 flex items-center justify-center gap-4">
            <AIconButton
              :label="t('tableDrawer.decreaseGuests')"
              :disabled="guestCountDraft <= 1 || guestCountSaving || waitingForGuestCountRefresh"
              @click="changeGuestCount(-1)"
            ><PhMinus :size="18" /></AIconButton>
            <output class="min-w-10 text-center text-title-lg font-semibold tabular-nums text-on-surface" aria-live="polite">{{ guestCountDraft }}</output>
            <AIconButton
              :label="t('tableDrawer.increaseGuests')"
              :disabled="guestCountDraft >= guestCountLimit || guestCountSaving || waitingForGuestCountRefresh"
              @click="changeGuestCount(1)"
            ><PhPlus :size="18" /></AIconButton>
          </div>
          <p class="mt-2 text-center text-body-sm text-on-surface-variant">{{ t('tableDrawer.guestCountCapacity', { capacity: guestCountLimit }) }}</p>
          <div class="mt-3 flex gap-2">
            <AButton variant="secondary" :disabled="guestCountSaving" @click="cancelGuestCountEdit">{{ t('common.cancel') }}</AButton>
            <AButton :disabled="!guestCountCanSave" @click="requestGuestCountConfirmation">{{ t('tableDrawer.saveGuestCount') }}</AButton>
          </div>
        </div>

        <!-- Pending customer requests: urgent context, shown only when there are any. -->
      <TableRequestsPanel
        v-if="table.session && canHandleTableRequests"
        id="service-table-requests"
        class="mt-3"
        :table-id="table.id"
        :restaurant-id="restaurantStore.currentRestaurantId"
        :refresh-key="table"
        :service-mode="serviceMode"
        @changed="onTableRequestsChanged"
      />

        <!-- 3 · Orders: open by default, "New order" right where the orders are. -->
        <section v-if="canViewOrders || canCreateOrders" class="mt-4" aria-labelledby="table-orders-title" data-section="orders">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <button
              v-if="canViewOrders"
              type="button"
              class="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-md px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              :aria-expanded="showOrders"
              aria-controls="service-table-orders"
              @click="showOrders = !showOrders"
            >
              <PhCaretDown :size="16" :class="showOrders ? '' : '-rotate-90'" class="text-fg-muted transition-transform duration-fast ease-out motion-reduce:transition-none" aria-hidden="true" />
              <h3 id="table-orders-title" class="text-title-md font-semibold text-fg">{{ t('tableDrawer.sections.orders') }}</h3>
              <span class="rounded-full bg-surface-subtle px-2 text-label-md tabular-nums text-fg-muted">{{ table.orders.open_count }}</span>
            </button>
            <h3 v-else id="table-orders-title" class="text-title-md font-semibold text-fg">{{ t('tableDrawer.sections.orders') }}</h3>
            <AButton v-if="canCreateOrders && (!serviceMode || servicePrimaryAction !== 'new-order')" variant="tonal" @click="showOrderComposer = true">
              <template #leading><PhPlus /></template>{{ t('tableDrawer.actions.newOrder') }}
            </AButton>
          </div>
          <div v-if="showOrders && canViewOrders" id="service-table-orders" class="mt-2">
            <TableOrdersList
              :key="table.session.id"
              :table-session-id="table.session.id"
              :currency="currency"
              :timezone="restaurantTimezone"
              :refresh-key="table"
              :service-mode="serviceMode"
              @served="emit('refresh')"
              @approved="emit('refresh')"
            />
          </div>
        </section>

        <!-- 4 · Table actions, below the orders: frequent ones as icon + short label, the rest under "More actions". -->
        <section class="mt-5 border-t border-outline-variant pt-4" aria-labelledby="table-actions-title" data-section="actions">
          <h3 id="table-actions-title" class="text-title-md font-semibold text-fg">{{ t('tableDrawer.sections.actions') }}</h3>
          <div class="mt-2" @focusout="onWaiterMenuFocusOut" @keydown="onWaiterMenuKeydown">
            <div class="grid grid-cols-2 gap-2 min-[25rem]:grid-cols-4">
              <button v-if="canViewBilling && (!serviceMode || servicePrimaryAction !== 'bill')" type="button" :class="tileClass" :aria-expanded="showBill" aria-controls="service-table-bill" @click="showBill = !showBill">
                <PhCreditCard :size="20" aria-hidden="true" />{{ t('tableDrawer.short.bill') }}
              </button>
              <button v-if="canAssignWaiters" type="button" :class="tileClass" :aria-expanded="showWaiterMenu" aria-haspopup="true" @click="showWaiterMenu = !showWaiterMenu">
                <PhUserPlus :size="20" aria-hidden="true" />{{ t('tableDrawer.short.assign') }}
              </button>
              <button v-if="canAssignWaiters" type="button" :class="tileClass" :disabled="submittingAction === 'call'" :aria-busy="submittingAction === 'call' || undefined" @click="callWaiter">
                <PhBellRinging :size="20" aria-hidden="true" />{{ t('tableDrawer.short.call') }}
              </button>
              <button v-if="hasMoreActions" type="button" :class="tileClass" :aria-expanded="showMoreActions" aria-controls="table-more-actions" @click="showMoreActions = !showMoreActions">
                <PhDotsThree :size="20" weight="bold" aria-hidden="true" />{{ t('tableDrawer.actions.more') }}
              </button>
            </div>

            <ASurface v-if="showWaiterMenu && canAssignWaiters" tone="highest" radius="md" class="mt-2 max-h-48 overflow-y-auto py-1" role="group" :aria-label="t('tableDrawer.actions.reassignWaiter')">
              <button
                v-if="table.session?.assigned_waiter"
                type="button"
                :disabled="submittingAction === 'assign'"
                class="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-body-md text-on-surface hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-50"
                @click="unassignWaiter"
              >
                <PhUserCircleMinus :size="16" />
                {{ t('tableDrawer.actions.unassign') }}
              </button>
              <button
                v-for="member in staff"
                :key="member.user.id"
                type="button"
                :disabled="submittingAction === 'assign'"
                class="flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-body-md text-on-surface hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-50"
                @click="assignWaiter(member.user.id)"
              >
                {{ member.user.name ?? t('operations.staff.unnamed') }}
                <PhCheck v-if="table.session?.assigned_waiter?.id === member.user.id" :size="14" />
              </button>
              <p v-if="staff.length === 0" class="px-3 py-2 text-label-md text-on-surface-variant">{{ t('tableDrawer.noStaffToAssign') }}</p>
            </ASurface>

            <div v-if="showMoreActions && hasMoreActions" id="table-more-actions" class="mt-2 flex flex-col gap-2">
              <div v-if="canTransferTables">
                <button type="button" :class="[tileClass, 'w-full flex-row justify-start gap-3 px-3']" :disabled="transferBlocked" :aria-describedby="transferBlocked ? 'table-transfer-hint' : undefined" @click="showTransfer = true">
                  <PhArrowsLeftRight :size="20" aria-hidden="true" />{{ t('tableDrawer.actions.transfer') }}
                </button>
                <p v-if="transferBlocked" id="table-transfer-hint" class="mt-1 text-label-md text-on-surface-variant">{{ t('tableDrawer.transferNoFreeTables') }}</p>
              </div>
              <button v-if="canViewReceipt" type="button" :class="[tileClass, 'w-full flex-row justify-start gap-3 px-3']" @click="showReceipt = true">
                <PhReceipt :size="20" aria-hidden="true" />{{ t('tableDrawer.actions.viewReceipt') }}
              </button>
            </div>
          </div>

          <div v-show="table.session && canViewBilling && showBill" id="service-table-bill" class="mt-4 border-t border-outline-variant pt-4">
            <TableBillPanel
              v-if="table.session && canViewBilling"
              :key="table.session.id"
              :table-session-id="table.session.id"
              :currency="currency"
              :refresh-key="table"
              :can-record-payments="canRecordPayments"
              @bill-loaded="onBillLoaded"
              @changed="onBillingChanged"
            />
          </div>

          <!-- bill === null: not loaded yet, or this user cannot view it — the snapshot's own balance is the advisory then. -->
          <p
            v-if="!bill && table.billing && Number(table.billing.outstanding) > 0"
            class="mt-3 rounded-md bg-warning-container px-3 py-2 text-label-lg text-on-warning-container"
          >
            {{ t('tableDrawer.outstandingBalance', { amount: formatMoney(table.billing.outstanding, locale, currency) }) }}
          </p>

          <AButton
            v-if="canCloseTable"
            variant="filled"
            full-width
            class="mt-3"
            :disabled="closeDisabled"
            :aria-describedby="closeDisabled ? 'table-close-hint' : undefined"
            :loading="submittingAction === 'close'"
            @click="requestClose"
          >
            {{ t('tableDrawer.actions.close') }}
          </AButton>
          <p v-if="canCloseTable && closeDisabled" id="table-close-hint" class="mt-1.5 text-label-md text-on-surface-variant">
            {{ t('tableDrawer.closeDisabledHint') }}
          </p>
        </section>
      </template>

      <!--
        Carta 8.1B §6 — deliberately discreet (collapsed by default, plain
        text toggle, placed last) and independent of session state: a free
        table's QR/link is just as real as an occupied one's. Only
        manage_tables sees this at all (canOpenTable, §10) — never a role
        check, and TableAccessPanel itself fetches nothing until expanded.
      -->
      <div v-if="canOpenTable" class="mt-4 border-t border-outline-variant pt-3">
        <button
          type="button"
          class="-mx-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-label-lg font-medium text-on-surface-variant hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          :aria-expanded="showAccess"
          @click="showAccess = !showAccess"
        >
          <PhCaretDown :size="14" :class="showAccess ? 'rotate-180' : ''" class="transition-transform duration-200 ease-out" aria-hidden="true" />
          {{ showAccess ? t('tableDrawer.access.hide') : t('tableDrawer.access.show') }}
        </button>
        <div v-if="showAccess" class="mt-2">
          <dl class="mb-3 grid grid-cols-2 gap-2 text-body-sm" data-table-extra>
            <div class="min-w-0"><dt class="text-label-md text-on-surface-variant">{{ t('tableDrawer.more.capacity') }}</dt><dd class="font-medium text-on-surface">{{ table.capacity ?? '—' }}</dd></div>
            <div v-if="startedAt()" class="min-w-0"><dt class="text-label-md text-on-surface-variant">{{ t('tableDrawer.more.started') }}</dt><dd class="font-medium text-on-surface">{{ startedAt() }}</dd></div>
          </dl>
          <TableAccessPanel :key="table.id" :table-id="table.id" />
        </div>
      </div>
      <template v-if="serviceMode && servicePrimaryAction" #footer>
        <AButton size="lg" full-width :loading="servicePrimaryAction === 'open' && submittingAction === 'open'" @click="runServicePrimaryAction">
          {{ t(`service.tableAction.${servicePrimaryAction}`) }}
        </AButton>
      </template>
    </component>
  </Transition>

  <TransferTableDialog
    v-if="showTransfer"
    :free-tables="freeTables"
    :submitting="submittingAction === 'transfer'"
    @confirm="confirmTransfer"
    @cancel="showTransfer = false"
  />

  <ServiceOrderComposer
    v-if="showOrderComposer && table"
    :table-id="table.id"
    :table-name="table.name"
    :currency="currency"
    @close="showOrderComposer = false"
    @created="onOrderCreated"
  />

  <AConfirmDialog
    v-if="showCloseConfirm && table"
    :label="t('tableDrawer.closeConfirm.title')"
    :message="t('tableDrawer.closeConfirm.message', { table: table.name })"
    :confirm-label="t('tableDrawer.actions.close')"
    :loading="submittingAction === 'close'"
    @confirm="confirmClose"
    @cancel="showCloseConfirm = false"
  />

  <AConfirmDialog
    v-if="showGuestCountConfirm && pendingGuestCount !== null && table?.session"
    :label="t('tableDrawer.guestCountConfirmTitle')"
    :message="t('tableDrawer.guestCountConfirmMessage', { previous: authoritativeGuestCount, next: pendingGuestCount })"
    :confirm-label="t('tableDrawer.saveGuestCount')"
    :loading="guestCountSaving"
    @confirm="confirmGuestCountChange"
    @cancel="cancelGuestCountConfirmation"
  />

  <BillReceiptSheet
    v-if="showReceipt && table?.session"
    :table-session-id="table.session.id"
    :currency="currency"
    :timezone="restaurantStore.currentSettings?.timezone ?? 'Europe/Madrid'"
    @close="showReceipt = false"
  />
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition:
    transform 250ms ease-out,
    opacity 250ms ease-out;
}
.drawer-enter-from,
.drawer-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
@media (min-width: 640px) {
  .drawer-enter-from,
  .drawer-leave-to {
    transform: translateX(24px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .drawer-enter-active,
  .drawer-leave-active {
    transition: none;
  }
}
</style>
