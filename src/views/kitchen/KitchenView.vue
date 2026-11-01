<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowClockwise } from '@phosphor-icons/vue'
import AButton from '@/components/ui/AButton.vue'
import ASheet from '@/components/ui/ASheet.vue'
import AStatusBadge from '@/components/ui/AStatusBadge.vue'
import AKitchenTicket from '@/components/kitchen/AKitchenTicket.vue'
import KitchenDashboardPanel from '@/components/kitchen/KitchenDashboardPanel.vue'
import KitchenItems from '@/components/kitchen/KitchenItems.vue'
import KitchenTicketSheet from '@/components/kitchen/KitchenTicketSheet.vue'
import { useKitchenDashboard } from '@/composables/useKitchenDashboard'
import { useKitchenOrders } from '@/composables/useKitchenOrders'
import { usePermissions } from '@/composables/usePermissions'
import { useRestaurantRealtime } from '@/composables/useRestaurantRealtime'
import { useRestaurantStore } from '@/stores/restaurant'
import { KITCHEN_ACTIONS, KITCHEN_STATUSES, type KitchenOrder, type KitchenStatus } from '@/types/kitchen'
import { kitchenUrgency } from '@/utils/kitchen-urgency'
import { kitchenError } from '@/utils/kitchen-error'
import { createKitchenRealtimeArrivals } from '@/utils/kitchen-realtime-arrivals'

const { t, locale } = useI18n()
const restaurant = useRestaurantStore()
const { can, canAny } = usePermissions()
// These are the existing read/mutation gates. Keep the restaurant API as authority.
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

// 'confirmed' orders (the "Aceptar pedido" ones) live in the incoming grid above the board.
const BOARD_STATUSES = KITCHEN_STATUSES.filter(status => status !== 'confirmed')
const selectedMobileStatus = ref<KitchenStatus>('accepted')
const incomingOrders = computed(() => queue.orders.value.filter(order => order.status === 'confirmed'))
const view = ref<'queue' | 'metrics'>('queue')
const selectedId = ref<number | null>(null)
const ticketId = ref<number | null>(null)
const selected = computed(() => queue.orders.value.find(order => order.id === selectedId.value) ?? null)
const mobileOrders = computed(() => queue.orders.value.filter(order => order.status === selectedMobileStatus.value))
const orderCount = (status: KitchenStatus) => queue.orders.value.filter(order => order.status === status).length
const now = ref(Date.now())
const highlightedOrders = ref(new Set<number>())
let timer: ReturnType<typeof setInterval> | null = null
let highlightTimer: ReturnType<typeof setTimeout> | null = null
const arrivals = createKitchenRealtimeArrivals()

watch(() => [restaurant.currentRestaurantId, canView.value] as const, () => {
  selectedId.value = null
  ticketId.value = null
  selectedMobileStatus.value = 'accepted'
  view.value = 'queue'
  arrivals.reset()
  highlightedOrders.value = new Set()
  if (timer) clearInterval(timer)
  timer = null
  now.value = Date.now()
  if (canView.value && restaurant.currentRestaurantId !== null) timer = setInterval(() => { now.value = Date.now() }, 1000)
}, { immediate: true, flush: 'sync' })

watch(realtime.lastEvent, event => {
  arrivals.noteEvent(event)
})

watch(queue.orders, orders => {
  if (queue.loading.value) return
  const addedIds = arrivals.observe(orders.map(order => order.id), realtime.lastRefreshSource.value)
  if (addedIds.length) {
    highlightedOrders.value = new Set(addedIds)
    if (highlightTimer) clearTimeout(highlightTimer)
    highlightTimer = setTimeout(() => { highlightedOrders.value = new Set() }, 650)
  }
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  if (highlightTimer) clearTimeout(highlightTimer)
})

function elapsedSeconds(order: KitchenOrder): number {
  // elapsed_seconds is the server baseline. Local time only advances that baseline.
  return order.elapsed_seconds + Math.max(0, (now.value - queue.receivedAt.value) / 1000)
}
function urgency(order: KitchenOrder) {
  // Neutral when the real timestamps are unusable; never inferred from formatted text.
  if (Number.isNaN(Date.parse(order.created_at)) || !Number.isFinite(order.elapsed_seconds)) return 'unknown'
  return kitchenUrgency(elapsedSeconds(order))
}
function age(order: KitchenOrder): string {
  const seconds = elapsedSeconds(order)
  return t('kitchen.minutes', { count: new Intl.NumberFormat(locale.value).format(Math.floor(seconds / 60)) })
}
function timestamp(value: string): string {
  const timezone = restaurant.currentSettings?.timezone ?? 'UTC'
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'short', timeStyle: 'short', timeZone: timezone }).format(new Date(value)) + ` (${timezone})`
}
async function advance(order: KitchenOrder): Promise<void> {
  if (!canManage.value) return
  const focus = document.activeElement
  await queue.advance(order)
  await nextTick()
  // A server-confirmed move can remove this ticket from the current mobile status.
  if (focus instanceof HTMLElement && (!focus.isConnected || focus.closest('[inert]'))) {
    const target = document.querySelector<HTMLInputElement>('.kds-mobile-status input:checked')
    if (target) target.focus()
    else document.getElementById('kitchen-heading')?.focus()
  }
}
function openTicket(id: number): void { selectedId.value = null; ticketId.value = id }
function openDetails(id: number): void { selectedId.value = id }
function selectTab(status: KitchenStatus): void {
  if (status !== 'confirmed') selectedMobileStatus.value = status
  view.value = 'queue'
}
function showStatus(status: KitchenStatus): void { selectedMobileStatus.value = status }
function disableLeavingTicket(element: Element): void { (element as HTMLElement).inert = true }
</script>

<template>
  <main class="kds-view">
    <header class="kds-header">
      <h1 id="kitchen-heading" tabindex="-1">{{ t('kitchen.title') }}</h1>
      <div class="kds-header-actions">
        <AButton v-if="canView" variant="secondary" :loading="queue.loading.value" @click="() => { void queue.refetch(); void dashboard.refetch() }">
          <template #leading><PhArrowClockwise :size="20" aria-hidden="true" /></template>
          {{ t('kitchen.refresh') }}
        </AButton>
        <AButton v-if="canView" variant="secondary" :aria-pressed="view === 'metrics'" @click="view = view === 'queue' ? 'metrics' : 'queue'">
          {{ view === 'queue' ? t('kitchen.viewMetrics') : t('kitchen.viewQueue') }}
        </AButton>
      </div>
    </header>

    <p v-if="!canView" role="alert" class="kds-error">{{ t('kitchen.noAccess') }}</p>
    <template v-else>
      <p v-if="realtime.connectionState.value !== 'connected'" class="kds-connection" role="status">
        {{ t(`kitchen.connection.${realtime.connectionState.value}`) }}
        <span>{{ t('kitchen.refreshHint') }}</span>
      </p>
      <div v-if="queue.actionError.value" class="kds-error" role="alert">{{ kitchenError(queue.actionError.value, t) }}</div>
      <div v-if="queue.error.value" class="kds-error kds-error-row" role="alert">
        <span>{{ kitchenError(queue.error.value, t) }}</span>
        <AButton variant="secondary" @click="queue.refetch">{{ t('kitchen.retry') }}</AButton>
      </div>
      <p v-if="queue.orders.value.length === 100" class="kds-limit">{{ t('kitchen.limit') }}</p>

      <template v-if="view === 'queue'">
        <section class="kds-incoming" aria-labelledby="kds-incoming-title" data-testid="kds-incoming">
          <header class="kds-incoming-heading">
            <h2 id="kds-incoming-title">{{ t('kitchen.incomingTitle') }}</h2>
            <span class="kds-count tabular-nums" :aria-label="t('kitchen.orderCount', { count: incomingOrders.length })">{{ incomingOrders.length }}</span>
          </header>
          <div v-if="queue.loading.value && !queue.orders.value.length" class="kds-incoming-grid kds-column-skeleton" aria-busy="true" :aria-label="t('kitchen.loading')">
            <div v-for="index in 3" :key="index" class="kds-skeleton-ticket"><span /><span /><span /></div>
          </div>
          <p v-else-if="!queue.error.value && incomingOrders.length === 0" class="kds-empty" role="status">{{ t('kitchen.columnEmpty') }}</p>
          <TransitionGroup v-else name="kds-ticket" tag="div" class="kds-incoming-grid" @before-leave="disableLeavingTicket">
            <AKitchenTicket v-for="order in incomingOrders" :key="order.id" compact :order="order" :elapsed="age(order)"
              :urgency="urgency(order)" :urgency-label="urgency(order) === 'unknown' ? undefined : t(`kitchen.urgency.${urgency(order)}`)"
              :status-label="t(`tableDrawer.orders.status.${order.status}`)"
              :action-label="canManage && KITCHEN_ACTIONS[order.status] ? t(`kitchen.actions.${KITCHEN_ACTIONS[order.status]}`) : undefined"
              :waiting-label="t('kitchen.awaitingWaiter')" :action-loading="queue.actingOn[order.id]"
              :action-disabled="!!queue.error.value" :highlighted="highlightedOrders.has(order.id)"
              @advance="advance(order)" @details="openDetails(order.id)" />
          </TransitionGroup>
        </section>

        <fieldset class="kds-mobile-status">
          <legend class="sr-only">{{ t('kitchen.filter') }}</legend>
          <label v-for="status in BOARD_STATUSES" :key="status" class="kds-mobile-status-option">
            <input v-model="selectedMobileStatus" type="radio" name="kitchen-status" :value="status" @change="showStatus(status)">
            <span>{{ t(`kitchen.columns.${status}`) }}</span>
            <span class="kds-count tabular-nums">{{ orderCount(status) }}</span>
          </label>
        </fieldset>

        <section class="kds-mobile-board" :aria-label="t(`kitchen.columns.${selectedMobileStatus}`)">
          <div v-if="queue.loading.value && !queue.orders.value.length" class="kds-mobile-column kds-mobile-skeleton" aria-busy="true" :aria-label="t('kitchen.loading')">
            <div v-for="index in 2" :key="index" class="kds-skeleton-ticket"><span /><span /><span /></div>
          </div>
          <p v-else-if="!queue.error.value && mobileOrders.length === 0" class="kds-empty" role="status">{{ t('kitchen.columnEmpty') }}</p>
          <TransitionGroup v-else name="kds-ticket" tag="div" class="kds-mobile-column" @before-leave="disableLeavingTicket">
            <AKitchenTicket v-for="order in mobileOrders" :key="order.id" :order="order" :elapsed="age(order)"
              :status-label="t(`tableDrawer.orders.status.${order.status}`)"
              :action-label="canManage && KITCHEN_ACTIONS[order.status] ? t(`kitchen.actions.${KITCHEN_ACTIONS[order.status]}`) : undefined"
              :waiting-label="t('kitchen.awaitingWaiter')" :action-loading="queue.actingOn[order.id]"
              :action-disabled="!!queue.error.value" :highlighted="highlightedOrders.has(order.id)"
              @advance="advance(order)" @details="openDetails(order.id)" />
          </TransitionGroup>
        </section>

        <section class="kds-columns" :aria-label="t('kitchen.queue')">
          <article v-for="status in BOARD_STATUSES" :key="status" class="kds-column" :aria-labelledby="`kds-column-${status}`">
            <header class="kds-column-heading">
              <h2 :id="`kds-column-${status}`">{{ t(`kitchen.columns.${status}`) }}</h2>
              <span class="kds-count tabular-nums" :aria-label="t('kitchen.orderCount', { count: orderCount(status) })">{{ orderCount(status) }}</span>
            </header>
            <div v-if="queue.loading.value && !queue.orders.value.length" class="kds-column-list kds-column-skeleton" aria-busy="true" :aria-label="t('kitchen.loading')">
              <div v-for="index in 2" :key="index" class="kds-skeleton-ticket"><span /><span /><span /></div>
            </div>
            <p v-else-if="!queue.error.value && orderCount(status) === 0" class="kds-empty" role="status">{{ t('kitchen.columnEmpty') }}</p>
            <TransitionGroup v-else name="kds-ticket" tag="div" class="kds-column-list" @before-leave="disableLeavingTicket">
              <AKitchenTicket v-for="order in queue.orders.value.filter(entry => entry.status === status)" :key="order.id" :order="order" :elapsed="age(order)"
                :status-label="t(`tableDrawer.orders.status.${order.status}`)"
                :action-label="canManage && KITCHEN_ACTIONS[order.status] ? t(`kitchen.actions.${KITCHEN_ACTIONS[order.status]}`) : undefined"
                :waiting-label="t('kitchen.awaitingWaiter')" :action-loading="queue.actingOn[order.id]"
                :action-disabled="!!queue.error.value" :highlighted="highlightedOrders.has(order.id)"
                @advance="advance(order)" @details="openDetails(order.id)" />
            </TransitionGroup>
          </article>
        </section>
      </template>

      <section v-else class="kds-metrics" :aria-label="t('kitchen.dashboard.sections.now')">
        <KitchenDashboardPanel :dashboard="dashboard.dashboard.value" :loading="dashboard.loading.value" :error="dashboard.error.value"
          @retry="dashboard.refetch" @select-tab="selectTab" />
      </section>

      <ASheet v-if="selected && !queue.error.value" :title="`${selected.table.name} · ${selected.order_number}`" variant="bottom" size="md" @close="selectedId = null">
        <AStatusBadge :state="selected.status === 'ready' ? 'success' : selected.status === 'confirmed' ? 'attention' : 'normal'" :label="t(`tableDrawer.orders.status.${selected.status}`)" />
        <p class="kds-detail-age">{{ age(selected) }}</p>
        <p class="kds-detail-created">{{ t('kitchen.created') }}: {{ timestamp(selected.created_at) }}</p>
        <KitchenItems :items="selected.items" :note="selected.order_note" />
        <template #footer><AButton full-width variant="secondary" @click="openTicket(selected.id)">{{ t('kitchen.ticket') }}</AButton></template>
      </ASheet>
      <KitchenTicketSheet v-if="ticketId !== null && restaurant.currentRestaurantId !== null" :key="ticketId" :order-id="ticketId" :restaurant-id="restaurant.currentRestaurantId" :timestamp="timestamp" @close="ticketId = null" @refresh="queue.refetch" />
    </template>
  </main>
</template>

<style scoped>
.kds-view { display: flex; min-width: 0; max-width: 100%; flex-direction: column; gap: calc(var(--spacing) * 4); color: var(--color-text-primary); }
.kds-header { display: flex; min-width: 0; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: calc(var(--spacing) * 3); }
.kds-header h1 { min-width: 0; font-size: var(--text-component-title); font-weight: 600; line-height: var(--text-component-title--line-height); overflow-wrap: anywhere; }
.kds-header-actions { display: flex; flex-wrap: wrap; gap: calc(var(--spacing) * 2); }
.kds-header-actions :deep(.a-control), .kds-error-row :deep(.a-control) { min-height: 48px; }
.kds-connection, .kds-error { display: flex; min-width: 0; flex-wrap: wrap; align-items: center; gap: calc(var(--spacing) * 2); padding: calc(var(--spacing) * 3); border-radius: var(--radius-saloa-sm); overflow-wrap: anywhere; }
.kds-connection { border: 1px solid var(--color-border); background: var(--color-surface-subtle); color: var(--color-text-secondary); font-size: var(--text-body-sm); }
.kds-error { border: 1px solid var(--color-danger); background: var(--color-danger-subtle); color: var(--color-danger); font-size: var(--text-body); }
.kds-error-row { justify-content: space-between; }
.kds-limit { color: var(--color-text-secondary); font-size: var(--text-body-sm); }
.kds-mobile-status, .kds-mobile-board { display: none; }
.kds-incoming { display: flex; min-width: 0; flex-direction: column; gap: calc(var(--spacing) * 2); }
.kds-incoming-heading { display: flex; align-items: center; gap: calc(var(--spacing) * 2); }
.kds-incoming-heading h2 { font-size: var(--text-component-title); font-weight: 600; line-height: var(--text-component-title--line-height); }
/* 1 col mobile, 2 tablet, 3 desktop, 4 only when ≥ ~1250px of content. One row tall; extra rows scroll inside. */
.kds-incoming-grid { display: grid; min-width: 0; grid-template-columns: repeat(auto-fill, minmax(min(100%, 19rem), 1fr)); align-items: stretch; gap: calc(var(--spacing) * 3); max-height: clamp(13rem, 34dvh, 22rem); overflow-y: auto; overscroll-behavior-y: contain; scrollbar-gutter: stable; }
.kds-incoming-grid > * { min-width: 0; }
.kds-columns { display: grid; width: 100%; min-width: 0; max-width: 100%; height: min(64dvh, 44rem); min-height: 22rem; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: calc(var(--spacing) * 3); overflow: hidden; padding: 0 0 calc(var(--spacing) * 2); }
.kds-column { display: flex; min-width: 0; min-height: 0; flex-direction: column; overflow: hidden; overscroll-behavior: contain; border: 1px solid var(--color-border); border-radius: var(--radius-saloa-md); background: var(--color-surface-subtle); }
.kds-column-heading { position: sticky; top: 0; z-index: var(--z-sticky); display: flex; min-height: calc(var(--spacing) * 14); align-items: center; justify-content: space-between; gap: calc(var(--spacing) * 2); padding: calc(var(--spacing) * 3) calc(var(--spacing) * 4); border-bottom: 1px solid var(--color-border); background: var(--color-surface); }
.kds-column-heading h2 { min-width: 0; font-size: var(--text-component-title); font-weight: 600; line-height: var(--text-component-title--line-height); overflow-wrap: anywhere; }
.kds-count { display: inline-flex; min-width: 32px; min-height: 32px; flex: 0 0 auto; align-items: center; justify-content: center; padding-inline: calc(var(--spacing) * 2); border-radius: var(--radius-saloa-sm); background: var(--color-surface); color: var(--color-text-primary); font-size: var(--text-body-sm); font-weight: 600; }
.kds-column-list { display: flex; min-width: 0; min-height: 0; flex: 1; flex-direction: column; gap: calc(var(--spacing) * 3); overflow-y: auto; overscroll-behavior-y: contain; scrollbar-gutter: stable; padding: calc(var(--spacing) * 3); }
.kds-empty { padding: calc(var(--spacing) * 4); color: var(--color-text-secondary); font-size: var(--text-body); }
.kds-skeleton-ticket { display: flex; min-height: calc(var(--spacing) * 64); flex-direction: column; gap: calc(var(--spacing) * 3); padding: calc(var(--spacing) * 4); border: 1px solid var(--color-border); border-radius: var(--radius-saloa-md); background: var(--color-surface); }
.kds-skeleton-ticket span { display: block; height: 16px; border-radius: var(--radius-saloa-sm); background: var(--color-surface-subtle); }
.kds-skeleton-ticket span:first-child { width: 52%; height: 32px; }
.kds-skeleton-ticket span:nth-child(2) { width: 78%; height: 72px; }
.kds-skeleton-ticket span:last-child { width: 100%; height: 56px; margin-top: auto; }
.kds-detail-age { margin-top: calc(var(--spacing) * 3); font-size: var(--text-timer); font-weight: 700; line-height: var(--text-timer--line-height); font-variant-numeric: tabular-nums; }
.kds-detail-created { margin: calc(var(--spacing) * 2) 0 calc(var(--spacing) * 4); color: var(--color-text-secondary); font-size: var(--text-body-sm); }
.kds-metrics { min-width: 0; }
.kds-view :deep(.kds-ticket-enter-active), .kds-view :deep(.kds-ticket-leave-active), .kds-view :deep(.kds-ticket-move) { transition: opacity var(--duration-base) var(--ease-out), transform var(--duration-base) var(--ease-out); }
.kds-view :deep(.kds-ticket-enter-from), .kds-view :deep(.kds-ticket-leave-to) { opacity: 0; transform: translateY(calc(var(--spacing) * 1)); }
.kds-view :deep(.kds-ticket-leave-active) { pointer-events: none; }
@media (max-width: 1023px) {
  .kds-view { gap: calc(var(--spacing) * 3); }
  .kds-header { align-items: flex-start; }
  .kds-header-actions { width: 100%; }
  .kds-header-actions :deep(.a-control) { flex: 1 1 auto; }
  .kds-columns { display: none; }
  .kds-mobile-board { display: block; }
  .kds-mobile-status { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: calc(var(--spacing) * 2); min-width: 0; padding: 0; margin: 0; border: 0; }
  .kds-mobile-status-option { position: relative; display: flex; min-width: 0; min-height: 48px; align-items: center; gap: calc(var(--spacing) * 2); padding: calc(var(--spacing) * 2); border: 1px solid var(--color-border-strong); border-radius: var(--radius-saloa-md); background: var(--color-surface); color: var(--color-text-primary); font-size: var(--text-body-sm); font-weight: 500; overflow-wrap: anywhere; cursor: pointer; }
  .kds-mobile-status-option input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  .kds-mobile-status-option:has(input:checked) { border-color: var(--color-primary-text); background: var(--color-primary-subtle); color: var(--color-primary-text); font-weight: 600; }
  .kds-mobile-status-option:has(input:focus-visible) { outline: 2px solid var(--color-focus-ring); outline-offset: 2px; }
  .kds-mobile-status-option > span:first-of-type { min-width: 0; flex: 1; }
  .kds-count { min-width: 28px; min-height: 28px; }
  .kds-mobile-column { display: flex; min-width: 0; max-height: min(70dvh, 44rem); flex-direction: column; gap: calc(var(--spacing) * 3); overflow-y: auto; overscroll-behavior-y: contain; scrollbar-gutter: stable; }
  .kds-incoming-grid { max-height: clamp(17rem, 46dvh, 28rem); }
}
@media (prefers-reduced-motion: reduce) { .kds-columns { scroll-behavior: auto; } .kds-view :deep(.kds-ticket-enter-active), .kds-view :deep(.kds-ticket-leave-active), .kds-view :deep(.kds-ticket-move) { transition: none; } }
</style>
