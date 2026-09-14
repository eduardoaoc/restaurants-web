import { computed, ref } from 'vue'

import type { CreateStaffOrderItemPayload } from '@/types/orders'

export interface StaffCartModifierSelection {
  group_id: number
  group_name: string
  option_id: number
  option_name: string
  /** Decimal string, same shape as ModifierOption.price_delta — summed as a number only at display/total time. */
  price_delta: string
}

export interface StaffCartLine {
  /** restaurant_product_id + sorted option ids + note — identical configurations increment quantity, different ones stay separate lines (same rule as the public cart, Passo 3.1 §15). */
  key: string
  restaurant_product_id: number
  name: string
  unit_price: string
  modifiers: StaffCartModifierSelection[]
  quantity: number
  note: string | null
}

function buildLineKey(restaurantProductId: number, optionIds: number[], note: string | null): string {
  const sortedOptions = [...optionIds].sort((a, b) => a - b).join(',')
  return `${restaurantProductId}::${sortedOptions}::${note ?? ''}`
}

function unitTotal(line: Pick<StaffCartLine, 'unit_price' | 'modifiers'>): number {
  return Number(line.unit_price) + line.modifiers.reduce((sum, m) => sum + Number(m.price_delta), 0)
}

/**
 * The waiter's manual-order-in-progress cart (Passo 3.2 §12) — purely local
 * state for ONE table, held only while the order composer sheet is open.
 * Deliberately NOT persisted to localStorage like the public cart
 * (usePublicCart, Passo 3.1 §16): this is a short-lived staff action inside
 * an already-authenticated session, not something a customer could lose by
 * switching apps mid-visit — closing the composer discards the draft, same
 * as every other unsent admin form in this app.
 */
export function useStaffOrderCart() {
  const lines = ref<StaffCartLine[]>([])

  function addItem(
    product: { restaurant_product_id: number; name: string; price: string },
    quantity: number,
    selectedOptions: StaffCartModifierSelection[],
    note: string | null,
  ): void {
    const optionIds = selectedOptions.map((o) => o.option_id)
    const key = buildLineKey(product.restaurant_product_id, optionIds, note)
    const existing = lines.value.find((line) => line.key === key)

    if (existing) {
      existing.quantity += quantity
      return
    }

    lines.value.push({
      key,
      restaurant_product_id: product.restaurant_product_id,
      name: product.name,
      unit_price: product.price,
      modifiers: selectedOptions,
      quantity,
      note,
    })
  }

  function setQuantity(key: string, quantity: number): void {
    if (quantity <= 0) {
      removeItem(key)
      return
    }
    const line = lines.value.find((l) => l.key === key)
    if (line) line.quantity = quantity
  }

  function removeItem(key: string): void {
    lines.value = lines.value.filter((l) => l.key !== key)
  }

  function clear(): void {
    lines.value = []
  }

  const totalItems = computed(() => lines.value.reduce((sum, l) => sum + l.quantity, 0))
  const total = computed(() => lines.value.reduce((sum, l) => sum + unitTotal(l) * l.quantity, 0))

  function lineTotal(line: StaffCartLine): number {
    return unitTotal(line) * line.quantity
  }

  /** Converts the cart into exactly CreateStaffOrderPayload.items — never anything the backend didn't ask for (Passo 3.2 §12: real Staff Order payload, never the public shape). */
  function toOrderItems(): CreateStaffOrderItemPayload[] {
    return lines.value.map((line) => ({
      restaurant_product_id: line.restaurant_product_id,
      quantity: line.quantity,
      note: line.note ?? undefined,
      modifier_option_ids: line.modifiers.length > 0 ? line.modifiers.map((m) => m.option_id) : undefined,
    }))
  }

  return { lines, totalItems, total, addItem, setQuantity, removeItem, clear, lineTotal, toOrderItems }
}
