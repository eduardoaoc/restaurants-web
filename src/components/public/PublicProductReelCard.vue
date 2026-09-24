<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPlay } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import aforoSymbol from '@/assets/brand/aforo-symbol.png'
import { ALLERGEN_ICON } from '@/utils/allergen-icons'
import { formatMoney } from '@/utils/format'
import type { PublicProduct } from '@/types/public-menu'

/**
 * One "screen" of the Reel feed (Carta 4.4 §3) — owns its own media
 * element and plays/pauses itself purely in reaction to `active` (the
 * feed's IntersectionObserver decides who's active; this component never
 * inspects its own visibility). Discovery only: no modifiers, no
 * quantity, no full detail — that's `PublicProductSheet`'s job (§20),
 * reached only through the "Añadir" CTA, never duplicated here.
 */
const props = defineProps<{
  product: PublicProduct
  locale: string
  active: boolean
  /** Active card ± 1 neighbor — the only cards allowed to mount a real `<video>` element (§12: mounting `<video src>` on every card at once makes the browser fire a preload/metadata request for all of them immediately, which is the "download everything at once" failure this guards against). Cards outside this window show their poster image (or the branded fallback) instead, and only get a real `<video>` once the feed scrolls them into the window. */
  nearActive: boolean
  /** True whenever a sheet/overlay is open anywhere in the app, or the tab isn't visible — this card must never play while either is true, active or not (§9/§10). */
  suspended: boolean
  orderingEnabled: boolean
}>()

const emit = defineEmits<{ add: [PublicProduct] }>()

const { t } = useI18n()

const videoRef = ref<HTMLVideoElement | null>(null)
const videoFailed = ref(false)
const imageFailed = ref(false)
const isPlaying = ref(false)

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
const reducedMotion = prefersReducedMotion()

/** video -> image -> branded fallback (§7/§13/§14/§15/§32) — a broken/missing media never removes the product itself. */
const effectiveMedia = computed<'video' | 'image' | 'fallback'>(() => {
  if (props.product.media.video && !videoFailed.value) return 'video'
  if (props.product.media.image && !imageFailed.value) return 'image'
  return 'fallback'
})

const posterUrl = computed(() => (!imageFailed.value ? (props.product.media.image?.url ?? undefined) : undefined))

/** Only the active card ± 1 neighbor ever mounts a real `<video>` (§12 — see the `nearActive` prop doc). A video product outside that window shows its poster image instead, same as an image-only product; the branded fallback only shows if it has no image either. */
const mountVideo = computed(() => effectiveMedia.value === 'video' && props.nearActive)
const showPosterInsteadOfVideo = computed(() => effectiveMedia.value === 'video' && !props.nearActive && posterUrl.value !== undefined)

const shouldPlay = computed(() => effectiveMedia.value === 'video' && props.active && !props.suspended && !reducedMotion)

// Reduced-motion visitors get a real, deliberate control instead of an
// automatic playback they never asked for (§11) — shown only for the
// active card, and only until they press it once (this session; there's
// no reason to persist "I pressed play" anywhere).
const manuallyStarted = ref(false)
const showPlayControl = computed(
  () => reducedMotion && effectiveMedia.value === 'video' && props.active && !manuallyStarted.value,
)

function safePlay(): void {
  const el = videoRef.value
  if (!el) return
  // .play() can reject (autoplay policy, interrupted by a pause(), a
  // suspended tab, ...) — always caught so it never surfaces as an
  // unhandled promise rejection (§8), which would otherwise fire on
  // every fast scroll past a card.
  el.play().catch(() => {})
}

watch(
  shouldPlay,
  (should) => {
    const el = videoRef.value
    if (!el) return
    if (should) safePlay()
    else el.pause()
  },
  // `flush: 'post'` (Carta 4.4 §12 windowing fix) — a fast fling can jump
  // `active`/`nearActive` straight from false to true in the same tick (the
  // in-between card's dominance never crosses the IntersectionObserver's
  // 0.6 threshold), so `mountVideo`'s `<video>` element and `shouldPlay`'s
  // "true" can land in the very same reactive flush. The default 'pre'
  // timing would run this callback BEFORE that v-if patches the DOM, so
  // `videoRef.value` would still be null and the play() call would be
  // silently dropped — the card would sit there active but paused forever.
  { immediate: true, flush: 'post' },
)

// `active` alone (independent of `shouldPlay`) governs the reduced-motion
// control and resets it once the card scrolls away, so returning to an
// already-"started" card later doesn't skip straight to autoplay for a
// reduced-motion visitor.
watch(
  () => props.active,
  (active) => {
    if (!active) manuallyStarted.value = false
  },
)

function onManualPlay(): void {
  manuallyStarted.value = true
  safePlay()
}

function onVideoError(): void {
  videoFailed.value = true
}
function onImageError(): void {
  imageFailed.value = true
}

onBeforeUnmount(() => {
  videoRef.value?.pause()
})
</script>

<template>
  <section
    :id="`public-feed-product-${product.restaurant_product_id}`"
    class="relative h-full w-full shrink-0 snap-start overflow-hidden bg-surface-container-high"
    :aria-label="product.name"
  >
    <video
      v-if="mountVideo"
      ref="videoRef"
      :src="product.media.video!.url"
      :poster="posterUrl"
      class="absolute inset-0 h-full w-full object-cover"
      muted
      playsinline
      loop
      preload="metadata"
      @error="onVideoError"
      @playing="isPlaying = true"
      @pause="isPlaying = false"
    />
    <img
      v-else-if="effectiveMedia === 'image' || showPosterInsteadOfVideo"
      :src="effectiveMedia === 'image' ? product.media.image!.url : posterUrl!"
      :alt="product.name"
      class="absolute inset-0 h-full w-full object-cover"
      loading="lazy"
      @error="onImageError"
    />
    <!--
      Branded fallback for legacy/no-media products (§15) — a plain
      surface tone + the real AFORO mark, faded. Deliberately NOT the
      brand gradient here: that token is reserved for genuine accent
      moments (logo areas, hero surfaces — CLAUDE.md §4), and would read
      as decorative wallpaper if repeated across an arbitrary number of
      feed cards.
    -->
    <div v-else class="absolute inset-0 flex items-center justify-center bg-surface-container-high" role="img" :aria-label="t('publicMenu.feed.noMediaAlt')">
      <img :src="aforoSymbol" alt="" aria-hidden="true" class="h-16 w-16 opacity-20" />
    </div>

    <button
      v-if="showPlayControl"
      type="button"
      class="absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      :aria-label="t('publicMenu.feed.playVideo')"
      @click="onManualPlay"
    >
      <PhPlay :size="26" weight="fill" />
    </button>

    <!--
      Raw black, not a surface token, on purpose (Carta 4.4 §16, CLAUDE.md
      §39's exception) — this scrim's only job is guaranteeing contrast
      for the text below against WHATEVER photo/video happens to be
      playing, independent of Light/Dark theme. Sized to the lower portion
      only, never darkening the whole frame.
    -->
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/85 via-black/35 to-transparent"
    />

    <div
      class="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 px-4 pb-5 pt-10"
      style="padding-bottom: max(1.25rem, env(safe-area-inset-bottom))"
    >
      <h2 class="text-title-lg font-semibold text-white [text-shadow:0_1px_3px_rgb(0_0_0_/_0.6)]">{{ product.name }}</h2>

      <p
        v-if="product.description"
        class="line-clamp-3 text-body-md text-white/90 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.6)]"
      >
        {{ product.description }}
      </p>

      <div v-if="product.allergens.length > 0" class="flex flex-wrap gap-1.5">
        <span
          v-for="code in product.allergens"
          :key="code"
          class="inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-1 text-label-md text-white backdrop-blur-sm"
        >
          <component :is="ALLERGEN_ICON[code]" :size="12" aria-hidden="true" />
          {{ t(`menu.products.allergens.codes.${code}`) }}
        </span>
      </div>
      <p v-else class="text-label-md text-white/70">{{ t('publicMenu.feed.allergensNone') }}</p>

      <div class="mt-1 flex items-center justify-between gap-3">
        <span class="text-title-md font-bold tabular-nums text-white [text-shadow:0_1px_3px_rgb(0_0_0_/_0.6)]">
          {{ formatMoney(product.price, locale) }}
        </span>
        <AButton v-if="orderingEnabled" @click="emit('add', product)">
          {{ t('publicMenu.product.add') }}
        </AButton>
      </div>
    </div>
  </section>
</template>
