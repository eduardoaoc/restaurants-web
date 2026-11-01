<script setup lang="ts">
import { PhClock, PhDotsThree } from '@phosphor-icons/vue'
import { useI18n } from 'vue-i18n'
import AButton from '@/components/ui/AButton.vue'
import AStatusBadge from '@/components/ui/AStatusBadge.vue'
import type { KitchenOrder, KitchenStatus } from '@/types/kitchen'
import KitchenItems from './KitchenItems.vue'
import { KITCHEN_STATUS_PRESENTATION } from '@/utils/kitchen-status-presentation'
import type { KitchenUrgency } from '@/utils/kitchen-urgency'

const props = defineProps<{
  order: KitchenOrder
  elapsed: string
  statusLabel: string
  actionLabel?: string
  actionLoading?: boolean
  actionDisabled?: boolean
  waitingLabel: string
  highlighted?: boolean
  compact?: boolean
  urgency?: KitchenUrgency
  urgencyLabel?: string
}>()
const emit = defineEmits<{ advance: []; details: [] }>()
const { t } = useI18n()
const presentation = (status: KitchenStatus) => KITCHEN_STATUS_PRESENTATION[status]
</script>

<template>
  <article class="kds-ticket" :class="{ 'kds-ticket--new': highlighted, 'kds-ticket--compact': compact }" :data-order-number="order.order_number" :data-urgency="urgency">
    <div class="kds-ticket-time" :aria-label="urgencyLabel ? `${elapsed}, ${urgencyLabel}` : elapsed">
      <PhClock :size="compact ? 20 : 24" aria-hidden="true" />
      <span class="tabular-nums">{{ elapsed }}</span>
      <span v-if="urgencyLabel" class="kds-ticket-urgency">{{ urgencyLabel }}</span>
    </div>
    <header class="kds-ticket-heading">
      <h3 class="kds-ticket-table">{{ order.table.name }}</h3>
      <p class="kds-ticket-number tabular-nums">{{ order.order_number }}</p>
    </header>
    <AStatusBadge :state="presentation(order.status).badge" :icon="presentation(order.status).icon" :label="statusLabel" />

    <KitchenItems :items="order.items" :note="order.order_note" />

    <div class="kds-ticket-actions">
      <AButton v-if="actionLabel" class="kds-ticket-advance" :size="compact ? 'md' : 'lg'" full-width :loading="actionLoading" :disabled="actionDisabled" @click="emit('advance')">
        {{ actionLabel }}
      </AButton>
      <p v-else class="kds-ticket-waiting">{{ waitingLabel }}</p>
      <button type="button" class="kds-ticket-details" :aria-label="t('kitchen.detailsFor', { number: order.order_number })" @click="emit('details')">
        <PhDotsThree :size="20" aria-hidden="true" />
        {{ t('kitchen.details') }}
      </button>
    </div>
  </article>
</template>

<style scoped>
.kds-ticket { display: flex; min-width: 0; flex-direction: column; gap: calc(var(--spacing) * 3); padding: calc(var(--spacing) * 4); border: 1px solid var(--color-border); border-radius: var(--radius-saloa-md); background: var(--color-surface); color: var(--color-text-primary); box-shadow: var(--elevation-raised); overflow-wrap: anywhere; }
.kds-ticket-time { display: flex; align-items: center; gap: calc(var(--spacing) * 2); color: var(--color-text-primary); font-size: var(--text-timer); font-weight: 700; line-height: var(--text-timer--line-height); letter-spacing: -.01em; }
.kds-ticket-time :deep(svg) { flex: 0 0 auto; }
.kds-ticket-heading { display: flex; min-width: 0; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: calc(var(--spacing) * 1) calc(var(--spacing) * 3); }
.kds-ticket-table { min-width: 0; font-size: var(--text-component-title); font-weight: 600; line-height: var(--text-component-title--line-height); overflow-wrap: anywhere; }
.kds-ticket-number { color: var(--color-text-secondary); font-size: var(--text-body); font-weight: 500; line-height: var(--text-body--line-height); }
.kds-ticket-actions { display: flex; flex-direction: column; gap: calc(var(--spacing) * 2); margin-top: auto; padding-top: calc(var(--spacing) * 1); }
.kds-ticket-advance { min-height: 56px; }
.kds-ticket-waiting { min-height: 56px; display: flex; align-items: center; justify-content: center; padding: calc(var(--spacing) * 2); color: var(--color-text-secondary); font-size: var(--text-body); font-weight: 500; text-align: center; }
.kds-ticket-details { display: inline-flex; min-width: 48px; min-height: 48px; align-self: center; align-items: center; justify-content: center; gap: calc(var(--spacing) * 1); padding: 0 calc(var(--spacing) * 3); border: 0; border-radius: var(--radius-saloa-md); background: transparent; color: var(--color-primary-text); font: inherit; font-size: var(--text-body-sm); font-weight: 500; cursor: pointer; touch-action: manipulation; }
.kds-ticket-details:hover { background: var(--color-surface-subtle); }
.kds-ticket-details:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: 2px; }
.kds-ticket--new { animation: kds-ticket-new 600ms var(--ease-out) backwards; }
@keyframes kds-ticket-new { from { background: var(--color-primary-subtle); } to { background: var(--color-surface); } }
/* Compact (incoming grid) variant + subtle wait urgency. Colour supports, never replaces, the text label. */
.kds-ticket--compact { height: 100%; gap: calc(var(--spacing) * 2); padding: calc(var(--spacing) * 3); }
.kds-ticket--compact .kds-ticket-time { font-size: var(--text-body); line-height: var(--text-body--line-height); flex-wrap: wrap; }
.kds-ticket--compact .kds-ticket-table { font-size: var(--text-body); }
.kds-ticket--compact .kds-ticket-number { font-size: var(--text-body-sm); }
.kds-ticket--compact .kds-ticket-actions { flex-direction: row; flex-wrap: wrap; align-items: center; }
.kds-ticket--compact .kds-ticket-advance { min-height: 44px; flex: 1 1 8rem; width: auto; }
.kds-ticket--compact .kds-ticket-waiting { min-height: 44px; flex: 1 1 8rem; }
.kds-ticket--compact .kds-ticket-details { min-height: 44px; }
.kds-ticket-urgency { font-size: var(--text-body-sm); font-weight: 600; }
.kds-ticket[data-urgency]:not([data-urgency='unknown']) { border-color: color-mix(in srgb, var(--urgency-accent) 55%, var(--color-border)); background: color-mix(in srgb, var(--urgency-accent) 9%, var(--color-surface)); }
.kds-ticket[data-urgency]:not([data-urgency='unknown']) .kds-ticket-time { color: var(--urgency-text); }
.kds-ticket[data-urgency='fresh'] { --urgency-accent: var(--color-wait-fresh-accent); --urgency-text: var(--color-wait-fresh); }
.kds-ticket[data-urgency='mid'] { --urgency-accent: var(--color-wait-mid-accent); --urgency-text: var(--color-wait-mid); }
.kds-ticket[data-urgency='long'] { --urgency-accent: var(--color-wait-long-accent); --urgency-text: var(--color-wait-long); }
@media (prefers-reduced-motion: reduce) { .kds-ticket--new { animation: none; } }
</style>
