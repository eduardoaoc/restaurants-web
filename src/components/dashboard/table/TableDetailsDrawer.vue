<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretDown, PhCheck, PhUserCircleMinus, PhX } from '@phosphor-icons/vue'

import { normalizeApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import AIconButton from '@/components/ui/AIconButton.vue'
import ASurface from '@/components/ui/ASurface.vue'
import ATextField from '@/components/ui/ATextField.vue'
import { usePermissions } from '@/composables/usePermissions'
import { getTableStatusStyle } from '@/composables/useTableStatusStyle'
import { tableSessionsService } from '@/services/table-sessions.service'
import { tablesService } from '@/services/tables.service'
import type { OperationsStaffMember, OperationsTable } from '@/types/operations'
import { describeApiError } from '@/utils/error-message'
import { formatDuration, formatMoney } from '@/utils/format'
import TableOrdersList from './TableOrdersList.vue'
import TransferTableDialog from './TransferTableDialog.vue'

const props = defineProps<{
  table: OperationsTable | null
  staff: OperationsStaffMember[]
  freeTables: OperationsTable[]
  currency: string
}>()

const emit = defineEmits<{ close: []; refresh: [] }>()

const { t, locale } = useI18n()

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
const canOpenTable = computed(() => can('manage_tables'))
const canCloseTable = computed(() => can('manage_tables') || can('close_bill'))
const canAssignWaiters = computed(() => can('assign_waiters'))
const canTransferTables = computed(() => can('transfer_tables'))
const canViewOrders = computed(() =>
  canAny(['create_orders', 'approve_customer_orders', 'update_kitchen_status', 'serve_orders', 'close_bill']),
)

const showOrders = ref(false)
const showTransfer = ref(false)
const showWaiterMenu = ref(false)
const openGuestCount = ref('2')
const submittingAction = ref<string | null>(null)
const feedback = ref<{ kind: 'success' | 'error'; message: string } | null>(null)

watch(
  () => props.table?.id,
  () => {
    showOrders.value = false
    showTransfer.value = false
    showWaiterMenu.value = false
    feedback.value = null
  },
)

const style = computed(() => (props.table ? getTableStatusStyle(props.table.primary_status) : null))

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
  submittingAction.value = action
  feedback.value = null
  try {
    await task()
    feedback.value = { kind: 'success', message: t(successKey) }
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

function closeTable(): void {
  if (!props.table) return
  void run('close', () => tablesService.close(props.table!.id), 'tableDrawer.feedback.closed')
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
    <aside
      v-if="table"
      class="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-outline-variant bg-surface-container-high p-5 shadow-elevated sm:inset-x-auto sm:inset-y-6 sm:right-6 sm:w-96 sm:rounded-2xl"
      role="dialog"
      :aria-label="table.name"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-title-lg font-semibold text-on-surface">{{ table.name }}</h3>
          <p v-if="style" class="mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-label-md" :class="style.tone">
            {{ t(style.labelKey) }}
          </p>
        </div>
        <AIconButton :label="t('common.close')" @click="emit('close')">
          <PhX :size="18" />
        </AIconButton>
      </div>

      <p
        v-if="feedback"
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
        <AButton :loading="submittingAction === 'open'" @click="openTable">{{ t('tableDrawer.actions.open') }}</AButton>
      </div>
      <p v-else-if="!table.session" class="mt-4 text-body-md text-on-surface-variant">{{ t('tableDrawer.freeHint') }}</p>

      <template v-else>
        <div class="mt-4 grid grid-cols-2 gap-2">
          <div class="rounded-lg bg-surface-container p-3">
            <span class="block text-label-md text-on-surface-variant">{{ t('tableDrawer.elapsed') }}</span>
            <span class="mt-1 block text-title-md font-semibold text-on-surface">{{ formatDuration(table.session.elapsed_seconds) }}</span>
          </div>
          <div class="rounded-lg bg-surface-container p-3">
            <span class="block text-label-md text-on-surface-variant">{{ t('tableDrawer.guests') }}</span>
            <span class="mt-1 block text-title-md font-semibold text-on-surface">{{ table.session.guest_count }}</span>
          </div>
          <div class="rounded-lg bg-surface-container p-3">
            <span class="block text-label-md text-on-surface-variant">{{ t('tableDrawer.waiter') }}</span>
            <span class="mt-1 block truncate text-title-md font-semibold text-on-surface">
              {{ table.session.assigned_waiter?.name ?? t('tableDrawer.unassigned') }}
            </span>
          </div>
          <div class="rounded-lg bg-surface-container p-3">
            <span class="block text-label-md text-on-surface-variant">{{ t('tableDrawer.total') }}</span>
            <span class="mt-1 block text-title-md font-semibold text-on-surface">
              {{ table.billing ? formatMoney(table.billing.total, locale, currency) : '—' }}
            </span>
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

        <div class="mt-4 grid grid-cols-2 gap-2">
          <AButton v-if="canViewOrders" variant="tonal" @click="showOrders = !showOrders">{{ t('tableDrawer.actions.viewOrders') }}</AButton>
          <AButton v-if="canViewOrders" variant="outlined" disabled>
            {{ t('tableDrawer.actions.newOrder') }}
          </AButton>
          <AButton v-if="canAssignWaiters" variant="outlined" :loading="submittingAction === 'call'" @click="callWaiter">
            {{ t('tableDrawer.actions.callWaiter') }}
          </AButton>
          <AButton v-if="canTransferTables" variant="outlined" @click="showTransfer = true">{{ t('tableDrawer.actions.transfer') }}</AButton>
        </div>
        <!-- Visible, not just a hover title — a disabled native <button> never receives focus, so a
             title-only explanation would be unreachable by keyboard/screen-reader users (§27). -->
        <p v-if="canViewOrders" class="mt-1.5 text-label-md text-on-surface-variant">{{ t('tableDrawer.actions.newOrderDisabledHint') }}</p>

        <p
          v-if="table.billing && Number(table.billing.outstanding) > 0"
          class="mt-3 rounded-md bg-warning-container px-3 py-2 text-label-lg text-on-warning-container"
        >
          {{ t('tableDrawer.outstandingBalance', { amount: formatMoney(table.billing.outstanding, locale, currency) }) }}
        </p>

        <AButton
          v-if="canCloseTable"
          variant="filled"
          full-width
          class="mt-3"
          :loading="submittingAction === 'close'"
          @click="closeTable"
        >
          {{ t('tableDrawer.actions.close') }}
        </AButton>

        <div v-if="showOrders" class="mt-4 border-t border-outline-variant pt-4">
          <TableOrdersList :table-session-id="table.session.id" :currency="currency" />
        </div>
      </template>
    </aside>
  </Transition>

  <TransferTableDialog
    v-if="showTransfer"
    :free-tables="freeTables"
    :submitting="submittingAction === 'transfer'"
    @confirm="confirmTransfer"
    @cancel="showTransfer = false"
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
