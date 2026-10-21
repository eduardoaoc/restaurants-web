<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhChefHat, PhClock, PhArrowClockwise, PhGauge } from '@phosphor-icons/vue'
import ABottomSheet from '@/components/ui/ABottomSheet.vue'
import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import EmptyState from '@/components/dashboard/EmptyState.vue'
import KitchenDashboardPanel from '@/components/kitchen/KitchenDashboardPanel.vue'
import KitchenItems from '@/components/kitchen/KitchenItems.vue'
import KitchenTicketSheet from '@/components/kitchen/KitchenTicketSheet.vue'
import { useKitchenDashboard } from '@/composables/useKitchenDashboard'
import { useKitchenOrders } from '@/composables/useKitchenOrders'
import { usePermissions } from '@/composables/usePermissions'
import { useRestaurantRealtime } from '@/composables/useRestaurantRealtime'
import { useRestaurantStore } from '@/stores/restaurant'
import { KITCHEN_ACTIONS, KITCHEN_STATUSES, type KitchenOrder, type KitchenStatus } from '@/types/kitchen'
import { kitchenError } from '@/utils/kitchen-error'

const { t, locale } = useI18n()
const restaurant = useRestaurantStore()
const { can, canAny } = usePermissions()
// Carta 7.1B §25/§26: the real backend Policy for GET kitchen/orders and
// GET kitchen/dashboard accepts EITHER update_kitchen_status OR
// serve_orders (verified live) — `canView` gates reading the screen.
// Mutating a status (accept/preparing/ready) stays update_kitchen_status
// ONLY (verified live: a serve_orders-only account gets 403 on
// POST .../accept) — `canManage` gates every action button. The nav rail
// deliberately still only shows "Cocina" for update_kitchen_status (see
// AppShellLayout's NAV_ITEMS) — a waiter reaching this screen by direct
// navigation is a real, authorized read, never hidden by a role check,
// but their everyday workflow is Mesas/Servicio plus the ready-order alert,
// not this dashboard.
const canView = computed(() => canAny(['update_kitchen_status', 'serve_orders']))
const canManage = computed(() => can('update_kitchen_status'))
const queue = useKitchenOrders(() => restaurant.currentRestaurantId, () => canView.value)
const dashboard = useKitchenDashboard(() => restaurant.currentRestaurantId, () => canView.value)
const realtime = useRestaurantRealtime(() => restaurant.currentRestaurantId, () => canView.value, {
  refresh: async () => {
    await Promise.all([queue.refetch(), dashboard.refetch()])
    return [queue.error.value, dashboard.error.value]
  },
})
const tab = ref<KitchenStatus | 'dashboard'>('dashboard')
const TABS = ['dashboard', ...KITCHEN_STATUSES] as const
const selectedId = ref<number | null>(null)
const ticketId = ref<number | null>(null)
const selected = computed(() => queue.orders.value.find(order => order.id === selectedId.value) ?? null)
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

watch(() => [restaurant.currentRestaurantId, canView.value] as const, () => {
  selectedId.value = null
  ticketId.value = null
  tab.value = 'dashboard'
  if (timer) clearInterval(timer)
  timer = null
  now.value = Date.now()
  if (canView.value && restaurant.currentRestaurantId !== null) timer = setInterval(() => { now.value = Date.now() }, 1000)
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

const activeColumnOrders = computed(() => queue.orders.value.filter(order => order.status === tab.value))
const oldest = computed(() => queue.orders.value.find(order => order.status !== 'ready')?.id)

function selectTab(next: KitchenStatus | 'dashboard'): void {
  tab.value = next
}

function age(order: KitchenOrder): string {
  // The server calculates elapsed_seconds from created_at. Advance that
  // baseline locally, avoiding a wrong kitchen-device clock inventing age.
  const seconds = order.elapsed_seconds + Math.max(0, (now.value - queue.receivedAt.value) / 1000)
  return t('kitchen.minutes', { count: new Intl.NumberFormat(locale.value).format(Math.floor(seconds / 60)) })
}
function timestamp(value: string): string {
  // Kitchen users cannot read admin settings; UTC is explicit until the
  // kitchen contract exposes the restaurant timezone. Never guess local time.
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'short', timeStyle: 'short', timeZone: restaurant.currentSettings?.timezone ?? 'UTC',
  }).format(new Date(value)) + ` (${restaurant.currentSettings?.timezone ?? 'UTC'})`
}
async function advance(order: KitchenOrder): Promise<void> {
  if (!canManage.value) return
  const focus = document.activeElement
  await queue.advance(order)
  await nextTick()
  // A card can move to another column (or out of the selected filter).
  // Restore a useful keyboard position when its old button was removed.
  if (focus instanceof HTMLElement && !focus.isConnected) document.getElementById('kitchen-heading')?.focus()
}
function openTicket(id: number): void { selectedId.value = null; ticketId.value = id }
</script>

<template>
  <div class="flex flex-col gap-6">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 id="kitchen-heading" tabindex="-1" class="text-headline font-bold text-on-surface">{{ t('kitchen.title') }}</h1>
        <p class="mt-1 text-body-md text-on-surface-variant">{{ t('kitchen.subtitle') }}</p>
      </div>
      <AButton v-if="canView" variant="tonal" :loading="queue.loading.value" @click="() => { void queue.refetch(); void dashboard.refetch() }">
        <template #leading><PhArrowClockwise :size="20" aria-hidden="true" /></template>
        {{ t('kitchen.refresh') }}
      </AButton>
    </header>

    <p v-if="!canView" role="alert" class="text-body-lg text-on-surface">{{ t('kitchen.noAccess') }}</p>
    <template v-else>
      <div class="flex flex-wrap items-center gap-3 text-body-md text-on-surface-variant" role="status">
        <span>{{ t(`kitchen.connection.${realtime.connectionState.value}`) }}</span>
        <span v-if="realtime.connectionState.value !== 'connected'">{{ t('kitchen.refreshHint') }}</span>
      </div>
      <p v-if="queue.actionError.value" class="rounded-lg bg-error-container p-4 text-body-lg text-on-error-container" role="alert">{{ kitchenError(queue.actionError.value, t) }}</p>
      <p v-if="queue.error.value" class="rounded-lg bg-error-container p-4 text-body-lg text-on-error-container" role="alert">{{ kitchenError(queue.error.value, t) }}</p>
      <p v-if="queue.orders.value.length === 100" class="text-body-md text-on-surface-variant">{{ t('kitchen.limit') }}</p>

      <div class="flex gap-2 overflow-x-auto" role="tablist" :aria-label="t('kitchen.filter')">
        <button v-for="status in TABS" :key="status" type="button" role="tab" :id="`kitchen-tab-${status}`"
          :aria-selected="tab === status" :aria-controls="`kitchen-panel-${status}`"
          class="flex min-h-12 shrink-0 items-center gap-2 rounded-md px-4 py-2 text-label-lg font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          :class="tab === status ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'"
          @click="selectTab(status)">
          <PhGauge v-if="status === 'dashboard'" :size="18" aria-hidden="true" />
          {{ t(`kitchen.columns.${status}`) }}
          <span v-if="status !== 'dashboard'" class="tabular-nums">{{ queue.orders.value.filter(order => order.status === status).length }}</span>
        </button>
      </div>

      <div v-if="tab === 'dashboard'" id="kitchen-panel-dashboard" role="tabpanel" aria-labelledby="kitchen-tab-dashboard">
        <KitchenDashboardPanel :dashboard="dashboard.dashboard.value" :loading="dashboard.loading.value" :error="dashboard.error.value" @retry="dashboard.refetch" @select-tab="selectTab" />
      </div>
      <div v-else :id="`kitchen-panel-${tab}`" role="tabpanel" :aria-labelledby="`kitchen-tab-${tab}`">
        <div v-if="queue.loading.value && !queue.orders.value.length" class="flex justify-center py-12"><AProgress /></div>
        <ASurface v-else-if="!queue.error.value && !activeColumnOrders.length" tone="low" radius="lg" class="p-8">
          <EmptyState :icon="PhChefHat" :message="t('kitchen.columnEmpty')" />
        </ASurface>
        <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <article v-for="order in activeColumnOrders" :key="order.id" :data-order-number="order.order_number" class="min-w-0 rounded-lg bg-surface-container-high p-4 text-on-surface shadow-card">
            <header class="mb-4 flex flex-col gap-2">
              <span v-if="oldest === order.id" class="self-start rounded-sm bg-primary-container px-2 py-1 text-label-md font-bold text-on-primary-container">{{ t('kitchen.oldest') }}</span>
              <h3 class="break-words text-title-lg font-bold">{{ order.table.name }}</h3>
              <div class="flex flex-wrap items-center justify-between gap-2 text-body-lg font-semibold">
                <span>{{ order.order_number }}</span>
                <span class="flex items-center gap-1 tabular-nums"><PhClock :size="20" aria-hidden="true" />{{ age(order) }}</span>
              </div>
              <p class="text-label-lg">{{ t(`tableDrawer.orders.status.${order.status}`) }}</p>
            </header>
            <KitchenItems :items="order.items" :note="order.order_note" />
            <div class="mt-5 flex flex-col gap-3">
              <template v-if="canManage">
                <AButton v-if="KITCHEN_ACTIONS[order.status]" class="min-h-12" full-width :loading="queue.actingOn[order.id]" :disabled="!!queue.error.value" @click="advance(order)">
                  {{ t(`kitchen.actions.${KITCHEN_ACTIONS[order.status]}`) }}
                </AButton>
                <p v-else class="text-body-md font-semibold">{{ t('kitchen.awaitingWaiter') }}</p>
              </template>
              <AButton variant="tonal" full-width class="min-h-12" :aria-label="t('kitchen.detailsFor', { number: order.order_number })" @click="selectedId = order.id">{{ t('kitchen.details') }}</AButton>
            </div>
          </article>
        </div>
      </div>

      <ABottomSheet v-if="selected && !queue.error.value" :label="`${selected.table.name} · ${selected.order_number}`" @close="selectedId = null">
        <p class="mb-2 text-title-md font-semibold">{{ t(`tableDrawer.orders.status.${selected.status}`) }} · {{ age(selected) }}</p>
        <p class="mb-4 text-body-md">{{ t('kitchen.created') }}: {{ timestamp(selected.created_at) }}</p>
        <KitchenItems :items="selected.items" :note="selected.order_note" />
        <template #footer><AButton full-width variant="tonal" @click="openTicket(selected.id)">{{ t('kitchen.ticket') }}</AButton></template>
      </ABottomSheet>
      <KitchenTicketSheet v-if="ticketId !== null && restaurant.currentRestaurantId !== null" :key="ticketId" :order-id="ticketId" :restaurant-id="restaurant.currentRestaurantId" :timestamp="timestamp" @close="ticketId = null" @refresh="queue.refetch" />
    </template>
  </div>
</template>
