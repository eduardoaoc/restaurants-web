<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import aforoSymbol from '@/assets/brand/aforo-symbol.png'

/**
 * The cinematic QR entry sequence (Carta Cliente 4.1 §4-6) — two slides,
 * INTRO_RESTAURANT ("Bienvenido a {restaurant}") then INTRO_MESSAGE ("Todo
 * está listo. Descubre nuestra carta."), each dissolving into the next like
 * smoke: opacity down + blur up + a very slight scale/translate, never
 * particles or a library (spec §5 is explicit about that). Emits `done`
 * once both have played so the parent can move to the gateway.
 *
 * Only ever mounted once the caller already has `restaurantName` resolved
 * (PublicTableView gates this behind `menu` being loaded) — never shows
 * "Bienvenido a" over an empty name.
 *
 * `bg-brand-panel` + `--brand-glow` is the same theme-invariant "brand hero
 * moment" treatment as LoginView's brand panel (docs/design-system.md §4) —
 * intentionally not theme-adaptive, since this is a brief, non-interactive
 * splash, not a persisted screen (see CLAUDE.md §5's own single exception
 * for that token, extended here to a second legitimate brand moment).
 */
const props = defineProps<{ restaurantName: string }>()
const emit = defineEmits<{ done: [] }>()

const { t } = useI18n()

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const reduced = prefersReducedMotion()

// Normal motion: ~1.6s visible (enter+hold) per slide, 500ms smoke dissolve
// between them — within the spec's 1.4-1.8s / 400-600ms ranges. Reduced
// motion: short, blur/scale-free opacity fades, "chegar rapidamente ao
// gateway" (§12).
const ENTER_MS = reduced ? 120 : 500
const DISSOLVE_MS = reduced ? 150 : 500
const RESTAURANT_HOLD_MS = reduced ? 400 : 1100
const MESSAGE_HOLD_MS = reduced ? 350 : 850

type Phase = 'restaurant' | 'message'
type Visual = '' | 'in' | 'out'

const phase = ref<Phase>('restaurant')
const visual = ref<Visual>('')

const timers: number[] = []
function after(ms: number, fn: () => void): void {
  timers.push(window.setTimeout(fn, ms))
}
function clearTimers(): void {
  timers.forEach((id) => window.clearTimeout(id))
  timers.length = 0
}

function showPhase(next: Phase): void {
  phase.value = next
  visual.value = ''
  // Two rAFs guarantee the browser has committed the base (hidden) style
  // before the 'in' class is applied, so the enter transition actually
  // animates instead of jumping straight to its end state.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      visual.value = 'in'
    })
  })
}

function scheduleAdvance(): void {
  const hold = phase.value === 'restaurant' ? RESTAURANT_HOLD_MS : MESSAGE_HOLD_MS
  after(ENTER_MS + hold, () => {
    visual.value = 'out'
    after(DISSOLVE_MS, () => {
      if (phase.value === 'restaurant') {
        showPhase('message')
        scheduleAdvance()
      } else {
        emit('done')
      }
    })
  })
}

/** Accessible escape hatch for keyboard users who don't want to wait out an automatic, non-essential animation (§14 "keyboard"). Visually hidden until focused. */
function skip(): void {
  clearTimers()
  emit('done')
}

onMounted(() => {
  showPhase('restaurant')
  scheduleAdvance()
})

onUnmounted(clearTimers)
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-brand-panel px-6 text-center">
    <button
      type="button"
      class="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:right-4 focus-visible:top-4 focus-visible:z-10 focus-visible:min-h-11 focus-visible:rounded-full focus-visible:border focus-visible:border-white/30 focus-visible:bg-white/10 focus-visible:px-4 focus-visible:text-label-lg focus-visible:text-on-brand-panel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      @click="skip"
    >
      {{ t('publicMenu.entry.skip') }}
    </button>

    <div
      aria-hidden="true"
      class="pointer-events-none absolute -right-24 -top-24 h-[26rem] w-[26rem] opacity-40 mix-blend-screen blur-3xl"
      style="background: var(--brand-glow)"
    />
    <div
      aria-hidden="true"
      class="pointer-events-none absolute -bottom-32 -left-16 h-[22rem] w-[22rem] opacity-30 mix-blend-screen blur-3xl"
      style="background: var(--brand-glow)"
    />

    <div
      v-if="phase === 'restaurant'"
      class="entry-slide relative z-10 flex flex-col items-center gap-3"
      :class="visual"
      :style="{ '--enter-ms': `${ENTER_MS}ms`, '--exit-ms': `${DISSOLVE_MS}ms` }"
      role="status"
      aria-live="polite"
    >
      <img :src="aforoSymbol" alt="" aria-hidden="true" class="h-10 w-10 opacity-80" />
      <p class="text-title-lg font-medium text-on-brand-panel/85">{{ t('publicMenu.entry.welcomeTo') }}</p>
      <h1 class="max-w-xs text-display font-semibold text-on-brand-panel">{{ props.restaurantName }}</h1>
    </div>

    <div
      v-else
      class="entry-slide relative z-10 flex flex-col items-center gap-2"
      :class="visual"
      :style="{ '--enter-ms': `${ENTER_MS}ms`, '--exit-ms': `${DISSOLVE_MS}ms` }"
      role="status"
      aria-live="polite"
    >
      <p class="text-title-lg font-medium text-on-brand-panel">{{ t('publicMenu.entry.readyTitle') }}</p>
      <p class="text-body-lg text-on-brand-panel/75">{{ t('publicMenu.entry.readySubtitle') }}</p>
    </div>
  </div>
</template>

<style scoped>
.entry-slide {
  opacity: 0;
  filter: blur(8px);
  transform: translateY(6px) scale(0.98);
}
.entry-slide.in {
  opacity: 1;
  filter: blur(0);
  transform: translateY(0) scale(1);
  transition:
    opacity var(--enter-ms) ease-out,
    filter var(--enter-ms) ease-out,
    transform var(--enter-ms) ease-out;
}
.entry-slide.out {
  opacity: 0;
  filter: blur(10px);
  transform: translateY(-4px) scale(1.03);
  transition:
    opacity var(--exit-ms) ease-in,
    filter var(--exit-ms) ease-in,
    transform var(--exit-ms) ease-in;
}

@media (prefers-reduced-motion: reduce) {
  .entry-slide,
  .entry-slide.in,
  .entry-slide.out {
    filter: none;
    transform: none;
  }
}
</style>
