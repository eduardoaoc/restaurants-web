<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'

import PublicProductReelCard from './PublicProductReelCard.vue'
import type { PublicFeedItem, PublicProduct } from '@/types/public-menu'

/**
 * The scroll/snap/active-product/video-orchestration owner (Carta 4.4 §3/
 * §6). `PublicTableView` still owns every piece of cross-cutting state
 * (cart, sheets, waiter/bill, feedback, locale/theme) — this component
 * only ever decides which ONE card is "active" and forwards that decision
 * down as a prop, never touching a `<video>` element directly itself
 * (`PublicProductReelCard` owns its own element and reacts to `active`).
 */
const props = defineProps<{
  items: PublicFeedItem[]
  locale: string
  suspended: boolean
  orderingEnabled: boolean
}>()

const emit = defineEmits<{
  add: [PublicProduct]
  'open-product-info': [PublicProduct]
  'active-category-change': [categoryId: number]
}>()

const scrollContainerRef = ref<HTMLElement | null>(null)
const cardEls = new Map<number, HTMLElement>()

/** `PublicProductReelCard` is a component, so its `ref` callback hands back a public instance — `$el` is its root `<section>`, the actual node the observer/scrollIntoView need. */
function setCardEl(index: number, el: Element | ComponentPublicInstance | null): void {
  const node = el instanceof Element ? el : (el?.$el as unknown)
  if (node instanceof HTMLElement) {
    cardEls.set(index, node)
  } else {
    cardEls.delete(index)
  }
}

const activeIndex = ref(0)
const pageVisible = ref(typeof document === 'undefined' || document.visibilityState === 'visible')

function onVisibilityChange(): void {
  pageVisible.value = document.visibilityState === 'visible'
}

let observer: IntersectionObserver | null = null
const ratios = new Map<Element, number>()

function recomputeActive(): void {
  let bestIndex: number | null = null
  let bestRatio = 0
  for (const [index, el] of cardEls) {
    const ratio = ratios.get(el) ?? 0
    if (ratio > bestRatio) {
      bestRatio = ratio
      bestIndex = index
    }
  }
  // Only ever move to a new active card once it's genuinely dominant
  // (§6/§25) — never during the brief transit where every card reports a
  // low, similar ratio mid-scroll.
  if (bestIndex !== null && bestRatio >= 0.6) {
    activeIndex.value = bestIndex
  }
}

function setupObserver(): void {
  observer?.disconnect()
  ratios.clear()
  if (!scrollContainerRef.value) return

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        ratios.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0)
      }
      recomputeActive()
    },
    { root: scrollContainerRef.value, threshold: [0, 0.25, 0.5, 0.6, 0.7, 0.85, 1] },
  )

  for (const el of cardEls.values()) observer.observe(el)
}

/**
 * Distinguishes "the actual set of products changed" from "same products,
 * new object references" — a locale switch rebuilds `menu` (and therefore
 * `items`) wholesale with freshly-translated content, but the underlying
 * `restaurant_product_id`s are identical, and Vue's keyed `v-for` reuses
 * the exact same card instances/DOM nodes for them. Resetting
 * `activeIndex`/re-observing on every such reload would yank playback
 * back to product 1 the instant someone switches language mid-scroll,
 * even though they never moved and the DOM never actually changed.
 */
function itemsIdentityKey(items: PublicFeedItem[]): string {
  return items.map((item) => item.product.restaurant_product_id).join(',')
}

let lastItemsKey = ''
watch(
  () => props.items,
  (items) => {
    const key = itemsIdentityKey(items)
    if (key === lastItemsKey) return
    lastItemsKey = key
    activeIndex.value = 0
    void nextTick(setupObserver)
  },
  { immediate: true },
)

watch(activeIndex, (index) => {
  const categoryId = props.items[index]?.category.id
  if (categoryId !== undefined) emit('active-category-change', categoryId)
})

// The identity-keyed watcher above already runs immediately (via
// `nextTick`) and covers first setup — this only needs to register the
// one page-visibility listener.
onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  observer?.disconnect()
})

/** Scrolls to the FIRST product of `categoryId` (Carta 4.4 §23) — the IntersectionObserver above takes it from there once the scroll settles; nothing here marks a card active early. */
function scrollToCategory(categoryId: number): void {
  const index = props.items.findIndex((item) => item.category.id === categoryId)
  if (index === -1) return
  cardEls.get(index)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

defineExpose({ scrollToCategory })
</script>

<template>
  <div
    ref="scrollContainerRef"
    class="h-full w-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
  >
    <PublicProductReelCard
      v-for="(item, index) in items"
      :key="item.product.restaurant_product_id"
      :ref="(el) => setCardEl(index, el as Element | ComponentPublicInstance | null)"
      :product="item.product"
      :locale="locale"
      :active="index === activeIndex"
      :near-active="Math.abs(index - activeIndex) <= 1"
      :suspended="suspended || !pageVisible"
      :ordering-enabled="orderingEnabled"
      @add="emit('add', $event)"
      @open-product-info="emit('open-product-info', $event)"
    />
  </div>
</template>
