<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { ACTIVITY_TONE_PRESENTATION, ACTIVITY_TYPE_PRESENTATION } from '@/utils/activity-presentation'
import type { RestaurantActivityEvent, RestaurantActivityType } from '@/types/activity'
import { formatMoney } from '@/utils/format'

/**
 * One timeline row (Carta 6.1B §5/§9/§11). The marker + its own downward
 * stub of the vertical line live here, so the line reads as continuous
 * across consecutive `<li>`s without any parent needing to draw it
 * separately; `isLast` only hides that stub on the final item of a group.
 *
 * Context/detail lines are built from whichever of `table`/`order`/
 * `metadata`/`actor` the event actually carries — nothing invented,
 * nothing shown as a null/placeholder (§11/§12).
 */
const props = defineProps<{
  event: RestaurantActivityEvent
  locale: string
  timezone: string
  currency: string
  isLast: boolean
}>()

const { t } = useI18n()

const presentation = computed(() => ACTIVITY_TYPE_PRESENTATION[props.event.type])
const tone = computed(() => ACTIVITY_TONE_PRESENTATION[props.event.tone])

const time = computed(() => {
  try {
    return new Intl.DateTimeFormat(props.locale, { timeStyle: 'short', timeZone: props.timezone }).format(
      new Date(props.event.occurred_at),
    )
  } catch {
    return new Intl.DateTimeFormat('es-ES', { timeStyle: 'short', timeZone: props.timezone }).format(
      new Date(props.event.occurred_at),
    )
  }
})

/**
 * The only two types whose own label (§9, "Cliente solicita...") already
 * names the customer grammatically — showing a second, separate "Cliente"
 * actor line under those would be pure repetition. Every other
 * customer-originated event (e.g. `order.created` via QR, whose label is
 * the neutral "Nuevo pedido") still benefits from it, since nothing else
 * says who started it.
 */
const LABEL_ALREADY_NAMES_CUSTOMER = new Set<RestaurantActivityType>(['waiter_request.created', 'bill_request.created'])

const actorLabel = computed<string | null>(() => {
  const actor = props.event.actor
  if (actor.type === 'staff') return actor.name
  if (LABEL_ALREADY_NAMES_CUSTOMER.has(props.event.type)) return null
  return t('activity.customerActor')
})

const contextParts = computed<string[]>(() => {
  const parts: string[] = []
  if (props.event.table) parts.push(t('activity.context.table', { name: props.event.table.name }))
  if (props.event.order) parts.push(t('activity.context.order', { reference: props.event.order.reference }))
  return parts
})

const detailParts = computed<string[]>(() => {
  const parts: string[] = []
  const metadata = props.event.metadata

  if (metadata?.total !== undefined) parts.push(formatMoney(metadata.total, props.locale, props.currency))
  else if (metadata?.amount !== undefined) parts.push(formatMoney(metadata.amount, props.locale, props.currency))

  if (metadata?.method) parts.push(t(`dashboard.payments.methods.${metadata.method}`))
  if (metadata?.guest_count !== undefined) parts.push(t('activity.context.guests', { count: metadata.guest_count }))
  if (metadata?.item_count !== undefined) parts.push(t('activity.context.items', { count: metadata.item_count }))
  if (metadata?.product_name) parts.push(metadata.product_name)
  if (actorLabel.value) parts.push(actorLabel.value)

  return parts
})
</script>

<template>
  <li class="relative flex gap-3">
    <div class="flex shrink-0 flex-col items-center">
      <span
        class="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        :class="tone.markerBg"
      >
        <component :is="presentation.icon" :size="16" :class="tone.markerIcon" aria-hidden="true" />
      </span>
      <span v-if="!isLast" class="mt-1 w-px flex-1 bg-outline-variant" aria-hidden="true" />
    </div>

    <div class="min-w-0 flex-1 rounded-lg border-l-4 py-1.5 pl-3 pr-1" :class="[tone.accentBorder, tone.cardSurface, isLast ? '' : 'mb-3']">
      <div class="flex items-baseline justify-between gap-3">
        <p class="text-body-lg font-medium text-on-surface">{{ t(presentation.labelKey) }}</p>
        <time :datetime="event.occurred_at" class="shrink-0 text-label-md tabular-nums text-on-surface-variant">{{ time }}</time>
      </div>
      <p v-if="contextParts.length" class="mt-0.5 text-label-lg text-on-surface-variant">{{ contextParts.join(' · ') }}</p>
      <p v-if="detailParts.length" class="mt-0.5 text-label-md text-on-surface-variant">{{ detailParts.join(' · ') }}</p>
    </div>
  </li>
</template>
