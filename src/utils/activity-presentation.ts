import type { Component } from 'vue'
import {
  PhBellSimpleRinging,
  PhChefHat,
  PhCheckCircle,
  PhClipboardText,
  PhCookingPot,
  PhCreditCard,
  PhDoor,
  PhDoorOpen,
  PhForkKnife,
  PhHandWaving,
  PhPackage,
  PhReceipt,
  PhXCircle,
} from '@phosphor-icons/vue'

import type { RestaurantActivityTone, RestaurantActivityType } from '@/types/activity'

/**
 * One entry per real `RestaurantActivityType` (Carta 6.1B §9/§10) — no raw
 * type string (`order.ready`, `payment.recorded`, ...) ever reaches the
 * template; every label goes through i18n (`t(labelKey)`), never
 * hardcoded text. `Record<RestaurantActivityType, ...>` over that CLOSED
 * union is what makes this exhaustive: adding a type to
 * `types/activity.ts` without adding it here is a TypeScript error, never
 * a silently-unlabeled event in production.
 */
export interface ActivityTypePresentation {
  labelKey: string
  icon: Component
}

export const ACTIVITY_TYPE_PRESENTATION: Record<RestaurantActivityType, ActivityTypePresentation> = {
  'order.created': { labelKey: 'activity.events.orderCreated', icon: PhForkKnife },
  'order.approved': { labelKey: 'activity.events.orderApproved', icon: PhClipboardText },
  'order.rejected': { labelKey: 'activity.events.orderRejected', icon: PhXCircle },
  'order.accepted': { labelKey: 'activity.events.orderAccepted', icon: PhChefHat },
  'order.preparing': { labelKey: 'activity.events.orderPreparing', icon: PhCookingPot },
  'order.ready': { labelKey: 'activity.events.orderReady', icon: PhBellSimpleRinging },
  'order.served': { labelKey: 'activity.events.orderServed', icon: PhCheckCircle },
  'waiter_request.created': { labelKey: 'activity.events.waiterRequestCreated', icon: PhHandWaving },
  'waiter_request.acknowledged': { labelKey: 'activity.events.waiterRequestAcknowledged', icon: PhHandWaving },
  'waiter_request.completed': { labelKey: 'activity.events.waiterRequestCompleted', icon: PhCheckCircle },
  'bill_request.created': { labelKey: 'activity.events.billRequestCreated', icon: PhReceipt },
  'bill_request.acknowledged': { labelKey: 'activity.events.billRequestAcknowledged', icon: PhReceipt },
  'bill_request.completed': { labelKey: 'activity.events.billRequestCompleted', icon: PhCheckCircle },
  'payment.recorded': { labelKey: 'activity.events.paymentRecorded', icon: PhCreditCard },
  'table_session.opened': { labelKey: 'activity.events.tableSessionOpened', icon: PhDoorOpen },
  'table_session.closed': { labelKey: 'activity.events.tableSessionClosed', icon: PhDoor },
  'product.marked_unavailable': { labelKey: 'activity.events.productMarkedUnavailable', icon: PhPackage },
  'product.marked_available': { labelKey: 'activity.events.productMarkedAvailable', icon: PhPackage },
}

/**
 * One entry per backend tone (Carta 6.1B §7/§8) — full, static Tailwind
 * class strings only (never `text-${tone}-500`, which Tailwind's compiler
 * cannot detect). The marker (the dot/icon on the timeline) carries the
 * strong, saturated tone color; the event card itself only gets a
 * discreet left accent border + a barely-tinted surface wash — never an
 * extremely saturated card background (§7 "não deixar backgrounds
 * extremamente saturados").
 */
export interface ActivityTonePresentation {
  markerBg: string
  markerIcon: string
  accentBorder: string
  cardSurface: string
}

export const ACTIVITY_TONE_PRESENTATION: Record<RestaurantActivityTone, ActivityTonePresentation> = {
  neutral: {
    markerBg: 'bg-primary-container',
    markerIcon: 'text-on-primary-container',
    accentBorder: 'border-l-outline-variant',
    cardSurface: 'bg-surface-container-low',
  },
  positive: {
    markerBg: 'bg-success',
    markerIcon: 'text-on-success',
    accentBorder: 'border-l-success',
    cardSurface: 'bg-success-container/20',
  },
  warning: {
    markerBg: 'bg-warning',
    markerIcon: 'text-on-warning',
    accentBorder: 'border-l-warning',
    cardSurface: 'bg-warning-container/20',
  },
  critical: {
    markerBg: 'bg-critical',
    markerIcon: 'text-on-critical',
    accentBorder: 'border-l-critical',
    cardSurface: 'bg-critical-container/25',
  },
}
