<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretDown, PhCheck, PhMinus, PhPlus, PhUserCircleMinus, PhX } from '@phosphor-icons/vue'

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
import type { OperationTiming } from '@/utils/operation-timing'
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
      <template v-if="serviceMode" #header>{{ table.name }}</template>
      <div v-if="serviceMode" class="mb-3 flex min-w-0 flex-wrap items-center gap-2">
        <AStatusBadge v-if="serviceStatus" :state="serviceStatus.state" :label="t(serviceStatus.labelKey)" :icon="serviceStatus.icon" />
        <span v-if="table.session?.assigned_waiter?.name" class="break-words text-body-sm text-fg-muted">
          {{ table.session.assigned_waiter.name }}
        </span>
      </div>
      <div v-else-if="dashboardMode" class="mb-3 flex min-w-0 flex-wrap items-center gap-2">
        <AStatusBadge v-if="serviceStatus" :state="serviceStatus.state" :label="t(serviceStatus.labelKey)" :icon="serviceStatus.icon" />
        <span v-if="table.session?.assigned_waiter?.name" class="break-words text-body-sm text-fg-muted">
          {{ table.session.assigned_waiter.name }}
        </span>
      </div>
      <div v-else class="flex items-start justify-between gap-3">
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

      <!-- No active session: only real action is opening one, and only for a user who holds manage_tables -->
      <div v-if="!table.session && canOpenTable" class="mt-4 flex flex-col gap-3">
        <p class="text-body-md text-on-surface-variant">{{ t('tableDrawer.freeHint') }}</p>
        <ATextField v-model="openGuestCount" :label="t('tableDrawer.guestCount')" inputmode="numeric" type="number" />
        <AButton v-if="!serviceMode" :loading="submittingAction === 'open'" @click="openTable">{{ t('tableDrawer.actions.open') }}</AButton>
      </div>
      <p v-else-if="!table.session" class="mt-4 text-body-md text-on-surface-variant">{{ t('tableDrawer.freeHint') }}</p>

      <template v-else>
        <div class="mt-4 grid grid-cols-2 gap-2">
          <div class="rounded-lg bg-surface-container p-3">
            <span class="block text-label-md text-on-surface-variant">{{ t('tableDrawer.elapsed') }}</span>
            <OperationTimeLabel
              v-if="sessionTiming"
              :timing="sessionTiming"
              :timezone="restaurantStore.currentSettings?.timezone ?? 'Europe/Madrid'"
              class="mt-1 text-title-md font-semibold text-on-surface"
            />
            <span v-else class="mt-1 block text-title-md font-semibold text-on-surface">{{ formatDuration(table.session.elapsed_seconds) }}</span>
          </div>
          <div class="rounded-lg bg-surface-container p-3">
            <span class="block text-label-md text-on-surface-variant">{{ t('tableDrawer.guests') }}</span>
            <span class="mt-1 block text-title-md font-semibold text-on-surface">{{ authoritativeGuestCount }}</span>
          </div>
          <div class="rounded-lg bg-surface-container p-3">
            <span class="block text-label-md text-on-surface-variant">{{ t('tableDrawer.waiter') }}</span>
            <span class="mt-1 block truncate text-title-md font-semibold text-on-surface">
              {{ table.session.assigned_waiter?.name ?? t('tableDrawer.pendingAssignment') }}
            </span>
          </div>
          <div class="rounded-lg bg-surface-container p-3">
            <span class="block text-label-md text-on-surface-variant">{{ t('tableDrawer.total') }}</span>
            <span class="mt-1 block text-title-md font-semibold text-on-surface">
              {{ table.billing ? formatMoney(table.billing.total, locale, currency) : '—' }}
            </span>
          </div>
        </div>
        <div v-if="canUpdateGuestCount" class="mt-3">
          <AButton
            v-if="!showGuestCountEditor"
            variant="secondary"
            :disabled="guestCountSaving"
            @click="beginGuestCountEdit"
          >
            {{ t('tableDrawer.editGuests') }}
          </AButton>
          <div v-else class="rounded-lg border border-outline-variant bg-surface-container p-3">
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
        </div>

        <!-- Waiter assignment — assign_waiters only -->
        <div v-if="canAssignWaiters" class="relative mt-4" @focusout="onWaiterMenuFocusOut" @keydown="onWaiterMenuKeydown">
          <button
            type="button"
            class="flex w-full items-center justify-between rounded-lg border border-outline-variant px-3 py-2.5 text-body-md text-on-surface hover:bg-surface-container-highest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            @click="showWaiterMenu = !showWaiterMenu"
          >
            {{ t('tableDrawer.actions.reassignWaiter') }}
            <PhCaretDown :size="14" />
          </button>
          <ASurface v-if="showWaiterMenu" tone="highest" radius="md" class="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto py-1 shadow-elevated">
            <button
              v-if="table.session?.assigned_waiter"
              type="button"
              :disabled="submittingAction === 'assign'"
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-body-md text-on-surface hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-50"
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
              class="flex w-full items-center justify-between px-3 py-2 text-left text-body-md text-on-surface hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-50"
              @click="assignWaiter(member.user.id)"
            >
              {{ member.user.name ?? t('operations.staff.unnamed') }}
              <PhCheck v-if="table.session?.assigned_waiter?.id === member.user.id" :size="14" />
            </button>
            <p v-if="staff.length === 0" class="px-3 py-2 text-label-md text-on-surface-variant">
              {{ t('tableDrawer.noStaffToAssign') }}
            </p>
          </ASurface>
        </div>

        <div class="mt-4 grid gap-2" :class="inlineMode ? 'grid-cols-1' : 'grid-cols-1 min-[25rem]:grid-cols-2'">
          <AButton v-if="canViewOrders && (!serviceMode || servicePrimaryAction !== 'orders')" variant="tonal" @click="showOrders = !showOrders">
            {{ showOrders ? t('tableDrawer.actions.hideOrders') : t('tableDrawer.actions.viewOrders') }}
          </AButton>
          <AButton
            v-if="canCreateOrders && (!serviceMode || servicePrimaryAction !== 'new-order')"
            variant="outlined"
            :disabled="!table.session"
            @click="showOrderComposer = true"
          >
            {{ t('tableDrawer.actions.newOrder') }}
          </AButton>
          <AButton v-if="canAssignWaiters" variant="outlined" :loading="submittingAction === 'call'" @click="callWaiter">
            {{ t('tableDrawer.actions.callWaiter') }}
          </AButton>
          <AButton v-if="canTransferTables" variant="outlined" @click="showTransfer = true">{{ t('tableDrawer.actions.transfer') }}</AButton>
          <AButton v-if="canViewBilling && (!serviceMode || servicePrimaryAction !== 'bill')" variant="tonal" @click="showBill = !showBill">{{ t('tableDrawer.actions.viewBill') }}</AButton>
          <AButton v-if="canViewReceipt" variant="outlined" @click="showReceipt = true">{{ t('tableDrawer.actions.viewReceipt') }}</AButton>
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
        <!-- Visible, not just a hover title — a disabled native <button> never receives focus, so a
             title-only explanation would be unreachable by keyboard/screen-reader users (§27). Only
             shown while the button is actually disabled (Passo 3.2 §14 — POST /tables/{table}/orders
             409s without an active session, so this is real domain behaviour, never invented). -->
        <p v-if="canCreateOrders && !table.session" class="mt-1.5 text-label-md text-on-surface-variant">
          {{ t('tableDrawer.actions.newOrderDisabledHint') }}
        </p>

        <!-- bill === null means either it hasn't loaded yet or this user
             lacks canViewBilling — table.billing (always present in the
             Operations snapshot) is the fallback advisory in that case,
             same as before Passo 3.4. Once the real bill loads, it alone
             drives both this hint and the Close button below. -->
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
          :loading="submittingAction === 'close'"
          @click="requestClose"
        >
          {{ t('tableDrawer.actions.close') }}
        </AButton>
        <p v-if="canCloseTable && closeDisabled" class="mt-1.5 text-label-md text-on-surface-variant">
          {{ t('tableDrawer.closeDisabledHint') }}
        </p>

        <div v-if="showOrders && canViewOrders" id="service-table-orders" class="mt-4 border-t border-outline-variant pt-4">
          <TableOrdersList
            :key="table.session.id"
            :table-session-id="table.session.id"
            :currency="currency"
            :timezone="restaurantStore.currentSettings?.timezone ?? 'Europe/Madrid'"
            :refresh-key="table"
            :service-mode="serviceMode"
            @served="emit('refresh')"
            @approved="emit('refresh')"
          />
        </div>
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
