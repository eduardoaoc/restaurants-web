<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { normalizeApiError, type ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import ASheet from '@/components/ui/ASheet.vue'
import KitchenItems from './KitchenItems.vue'
import { kitchenService } from '@/services/kitchen.service'
import type { KitchenTicket } from '@/types/kitchen'
import { kitchenError } from '@/utils/kitchen-error'

const props = defineProps<{ orderId: number; restaurantId: number; timestamp: (value: string) => string }>()
const emit = defineEmits<{ close: []; refresh: [] }>()
const { t } = useI18n()
const ticket = ref<KitchenTicket | null>(null)
const error = ref<ApiError | null>(null)
const loading = ref(false)
const printing = ref(false)
const printDocument = ref<KitchenTicket | null>(null)
const controller = new AbortController()
let active = true

async function preview(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const result = await kitchenService.ticket(props.orderId, controller.signal)
    if (active && result.restaurant.id === props.restaurantId) ticket.value = result
  } catch (err) {
    if (active) error.value = normalizeApiError(err)
  } finally {
    if (active) loading.value = false
  }
}

function finishPrint(): void {
  document.body.classList.remove('aforo-printing-ticket')
  printDocument.value = null
}

async function print(): Promise<void> {
  if (printing.value || !ticket.value) return
  printing.value = true
  error.value = null
  try {
    const result = await kitchenService.print(props.orderId)
    if (!active || result.restaurant.id !== props.restaurantId) return
    ticket.value = result
    printDocument.value = result
    await nextTick()
    if (!active) return
    document.body.classList.add('aforo-printing-ticket')
    // The backend records a print REQUEST; the browser cannot confirm
    // physical delivery or distinguish cancellation from successful print.
    window.print()
  } catch (err) {
    if (active) { error.value = normalizeApiError(err); emit('refresh') }
  } finally {
    if (active) printing.value = false
  }
}

onMounted(() => { void preview(); window.addEventListener('afterprint', finishPrint) })
onBeforeUnmount(() => {
  active = false
  controller.abort()
  window.removeEventListener('afterprint', finishPrint)
  finishPrint()
})
</script>

<template>
  <ASheet :title="t('kitchen.ticket')" variant="bottom" size="md" @close="emit('close')">
    <div v-if="loading" class="kitchen-ticket-skeleton" aria-busy="true" :aria-label="t('kitchen.loading')">
      <span /><span /><span /><span />
    </div>
    <p v-if="error" class="kitchen-ticket-error" role="alert">{{ kitchenError(error, t) }}</p>
    <AButton v-if="!ticket && !loading" variant="tonal" @click="preview">{{ t('kitchen.retry') }}</AButton>
    <article v-if="ticket" class="kitchen-ticket-preview">
      <header>
        <h3>{{ ticket.restaurant.name }}</h3>
        <p class="kitchen-ticket-location">{{ ticket.table.name }} · {{ ticket.order.order_number }}</p>
        <p class="kitchen-ticket-created">{{ timestamp(ticket.order.created_at) }}</p>
      </header>
      <KitchenItems :items="ticket.items" :note="ticket.order_note" />
    </article>
    <template #footer>
      <AButton full-width :disabled="!ticket || loading" :loading="printing" @click="print">{{ t('kitchen.print') }}</AButton>
    </template>
  </ASheet>
  <Teleport to="body">
    <article v-if="printDocument" class="aforo-kitchen-print">
      <header>
        <h1>{{ printDocument.restaurant.name }}</h1>
        <h2>{{ printDocument.table.name }} · {{ printDocument.order.order_number }}</h2>
        <p>{{ t('kitchen.created') }}: {{ timestamp(printDocument.order.created_at) }}</p>
      </header>
      <KitchenItems :items="printDocument.items" :note="printDocument.order_note" />
    </article>
  </Teleport>
</template>

<style>
.kitchen-ticket-skeleton { display: flex; min-height: 50dvh; flex-direction: column; gap: calc(var(--spacing) * 4); padding: calc(var(--spacing) * 4); }
.kitchen-ticket-skeleton span { display: block; border-radius: var(--radius-saloa-sm); background: var(--color-surface-subtle); }
.kitchen-ticket-skeleton span { height: var(--text-body--line-height); }
.kitchen-ticket-skeleton span:first-child { width: 60%; height: var(--text-component-title--line-height); }
.kitchen-ticket-skeleton span:nth-child(2) { width: 80%; }
.kitchen-ticket-skeleton span:nth-child(3) { width: 100%; min-height: calc(var(--spacing) * 24); }
.kitchen-ticket-skeleton span:last-child { width: 100%; min-height: calc(var(--spacing) * 12); margin-top: auto; }
.kitchen-ticket-error { margin-bottom: calc(var(--spacing) * 4); padding: calc(var(--spacing) * 3); border-radius: var(--radius-sm); background: var(--color-danger-subtle); color: var(--color-danger); overflow-wrap: anywhere; }
.kitchen-ticket-preview { display: flex; flex-direction: column; gap: calc(var(--spacing) * 4); color: var(--color-text-primary); }
.kitchen-ticket-preview h3, .kitchen-ticket-location { font-size: var(--text-component-title); font-weight: 600; line-height: var(--text-component-title--line-height); overflow-wrap: anywhere; }
.kitchen-ticket-created { color: var(--color-text-secondary); font-size: var(--text-body-sm); line-height: var(--text-body-sm--line-height); }
.aforo-kitchen-print { display: none; }
@media print {
  @page { size: auto; margin: 4mm; }
  body.aforo-printing-ticket > :not(.aforo-kitchen-print) { display: none !important; }
  body.aforo-printing-ticket { background: white !important; color: black !important; }
  .aforo-printing-ticket .aforo-kitchen-print {
    display: block; width: 100%; max-width: 72mm; margin: 0 auto;
    color: black; background: white; font: 12pt/1.4 monospace;
    overflow-wrap: anywhere;
  }
  .aforo-kitchen-print header { border-bottom: 1px dashed black; margin-bottom: 4mm; padding-bottom: 3mm; }
  .aforo-kitchen-print h1, .aforo-kitchen-print h2 { font-size: 15pt; font-weight: bold; }
  .aforo-kitchen-print li { break-inside: avoid; }
  .aforo-kitchen-print p, .aforo-kitchen-print ul { font-size: inherit; color: black; }
  .aforo-kitchen-print .kitchen-note { color: black; background: none; padding: 3mm 0; border-top: 1px dashed black; }
}
</style>
