import { computed, ref, watch } from 'vue'

import type { PublicOrderItemPayload, PublicProduct } from '@/types/public-menu'

export interface CartModifierSelection {
  group_id: number
  group_name: string
  option_id: number
  option_name: string
  /** Decimal string, same shape as the backend's own price_delta — summed as a number only at display/total time. */
  price_delta: string
}

export interface CartLine {
  /** Stable per-configuration id — restaurant_product_id + sorted option ids + note, so two DIFFERENT configurations of the same product never collapse into one line (CLAUDE.md §15), while adding the exact same configuration again just increments quantity. */
  key: string
  restaurant_product_id: number
  name: string
  description: string | null
  unit_price: string
  modifiers: CartModifierSelection[]
  quantity: number
  note: string | null
}

function buildLineKey(restaurantProductId: number, optionIds: number[], note: string | null): string {
  const sortedOptions = [...optionIds].sort((a, b) => a - b).join(',')
  return `${restaurantProductId}::${sortedOptions}::${note ?? ''}`
}

function unitTotal(line: Pick<CartLine, 'unit_price' | 'modifiers'>): number {
  const modifiersTotal = line.modifiers.reduce((sum, m) => sum + Number(m.price_delta), 0)
  return Number(line.unit_price) + modifiersTotal
}

/**
 * The cart is local-only frontend state until the customer confirms
 * (Passo 3.1 §15) — nothing here talks to the backend. Persisted to
 * localStorage under a key scoped by `publicToken` (§16) so two different
 * tables/tokens on the same device NEVER share or leak a cart, and cleared
 * ONLY after a real, successful order response (§20) — never optimistically
 * on submit.
 */
export function usePublicCart(publicToken: string) {
  const storageKey = `aforo-public-cart:${publicToken}`
  const lines = ref<CartLine[]>(loadFromStorage())

  function loadFromStorage(): CartLine[] {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as CartLine[]) : []
    } catch {
      return []
    }
  }

  watch(
    lines,
    (value) => {
      try {
        if (value.length === 0) localStorage.removeItem(storageKey)
        else localStorage.setItem(storageKey, JSON.stringify(value))
      } catch {
        // Persistence is a convenience — an unavailable/full localStorage never blocks the in-memory cart.
      }
    },
    { deep: true },
  )

  /**
   * `selectedOptionIds` must already have passed modifier validation
   * (min/max/required) — this function only assembles the line, it never
   * re-validates (see PublicProductSheet, which owns that check before
   * calling this).
   */
  function addItem(
    product: PublicProduct,
    quantity: number,
    selectedOptions: CartModifierSelection[],
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
      description: product.description,
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

  function lineUnitTotal(line: CartLine): number {
    return unitTotal(line)
  }

  function lineTotal(line: CartLine): number {
    return unitTotal(line) * line.quantity
  }

  /** Converts the cart into exactly the shape PublicOrderCreateRequest.items expects — never anything the backend didn't ask for. */
  function toOrderItems(): PublicOrderItemPayload[] {
    return lines.value.map((line) => ({
      restaurant_product_id: line.restaurant_product_id,
      quantity: line.quantity,
      note: line.note ?? undefined,
      modifier_option_ids: line.modifiers.length > 0 ? line.modifiers.map((m) => m.option_id) : undefined,
    }))
  }

  return {
    lines,
    totalItems,
    total,
    addItem,
    setQuantity,
    removeItem,
    clear,
    lineUnitTotal,
    lineTotal,
    toOrderItems,
  }
}
