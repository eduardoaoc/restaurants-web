<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretDown, PhCheck, PhUserCircleMinus, PhX } from '@phosphor-icons/vue'

import { normalizeApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import AIconButton from '@/components/ui/AIconButton.vue'
import ASurface from '@/components/ui/ASurface.vue'
import ATextField from '@/components/ui/ATextField.vue'
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

function confirmTransfer(targetTableId: number): void {
  if (!props.table?.session) return
  showTransfer.value = false
  void run(
    'transfer',
    () => tableSessionsService.transfer(props.table!.session!.id, { target_table_id: targetTableId }),
    'tableDrawer.feedback.transferred',
  )
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

      <!-- No active session: only real action is opening one -->
      <div v-if="!table.session" class="mt-4 flex flex-col gap-3">
        <p class="text-body-md text-on-surface-variant">{{ t('tableDrawer.freeHint') }}</p>
        <ATextField v-model="openGuestCount" :label="t('tableDrawer.guestCount')" inputmode="numeric" type="number" />
        <AButton :loading="submittingAction === 'open'" @click="openTable">{{ t('tableDrawer.actions.open') }}</AButton>
      </div>

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

        <!-- Waiter assignment -->
        <div class="relative mt-4">
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
              type="button"
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-body-md text-on-surface hover:bg-surface-container-high"
              @click="unassignWaiter"
            >
              <PhUserCircleMinus :size="16" />
              {{ t('tableDrawer.actions.unassign') }}
            </button>
            <button
              v-for="member in staff"
              :key="member.user.id"
              type="button"
              class="flex w-full items-center justify-between px-3 py-2 text-left text-body-md text-on-surface hover:bg-surface-container-high"
              @click="assignWaiter(member.user.id)"
            >
              {{ member.user.name ?? t('operations.staff.unnamed') }}
              <PhCheck v-if="table.session?.assigned_waiter?.id === member.user.id" :size="14" />
            </button>
          </ASurface>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-2">
          <AButton variant="tonal" @click="showOrders = !showOrders">{{ t('tableDrawer.actions.viewOrders') }}</AButton>
          <AButton
            variant="outlined"
            disabled
            :title="t('tableDrawer.actions.newOrderDisabledHint')"
          >
            {{ t('tableDrawer.actions.newOrder') }}
          </AButton>
          <AButton variant="outlined" :loading="submittingAction === 'call'" @click="callWaiter">
            {{ t('tableDrawer.actions.callWaiter') }}
          </AButton>
          <AButton variant="outlined" @click="showTransfer = true">{{ t('tableDrawer.actions.transfer') }}</AButton>
          <AButton variant="filled" full-width class="col-span-2" :loading="submittingAction === 'close'" @click="closeTable">
            {{ t('tableDrawer.actions.close') }}
          </AButton>
        </div>

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
