import { PhCheckCircle, PhChefHat, PhCookingPot, PhPackage } from '@phosphor-icons/vue'
import type { Component } from 'vue'
import type { KitchenStatus } from '@/types/kitchen'

/** Presentation only: backend status/action contracts remain in types/kitchen. */
export const KITCHEN_STATUS_PRESENTATION: Record<KitchenStatus, { badge: 'normal' | 'attention' | 'success'; icon: Component }> = {
  confirmed: { badge: 'attention', icon: PhChefHat },
  accepted: { badge: 'normal', icon: PhCheckCircle },
  preparing: { badge: 'normal', icon: PhCookingPot },
  ready: { badge: 'success', icon: PhPackage },
}
