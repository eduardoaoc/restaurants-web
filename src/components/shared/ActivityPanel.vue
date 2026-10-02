<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhClockCounterClockwise, PhWarningCircle, PhX } from '@phosphor-icons/vue'

import ActivityEventItem from './ActivityEventItem.vue'
import type { ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import { useRestaurantStore } from '@/stores/restaurant'
import type { RestaurantActivityCategory, RestaurantActivityEvent } from '@/types/activity'
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from '@/utils/format'
import { describeApiError } from '@/utils/error-message'

/**
 * The notification/timeline drawer (Carta 6.1B §4/§5) — a full-height
 * panel docked to the right edge on desktop, a near-full-height bottom
 * sheet on mobile. Deliberately its own shell rather than reusing
 * `ABottomSheet` (which is always centred on `sm:+`): the same proven
 * interaction model (Escape, backdrop click, return-focus-on-close, and
 * the after-the-fact Tab-trap correction — see ABottomSheet's own
 * docblock for why a preemptive first/last check fails on radio groups
 * and trailing disabled controls) is reimplemented here with different
 * positioning CSS only.
 */
const props = defineProps<{
  events: RestaurantActivityEvent[]
  loading: boolean
  loadingMore: boolean
  error: ApiError | null
  loadMoreError: ApiError | null
  hasMore: boolean
  category: RestaurantActivityCategory | null
}>()

const emit = defineEmits<{
  close: []
  'load-more': []
  'set-category': [RestaurantActivityCategory | null]
  retry: []
}>()

const { t, locale } = useI18n()
const restaurantStore = useRestaurantStore()

const timezone = computed(() => restaurantStore.currentSettings?.timezone ?? DEFAULT_TIMEZONE)
const currency = computed(() => restaurantStore.currentSettings?.currency ?? DEFAULT_CURRENCY)

const CATEGORIES: Array<{ value: RestaurantActivityCategory | null; labelKey: string }> = [
  { value: null, labelKey: 'activity.filters.all' },
  { value: 'orders', labelKey: 'activity.filters.orders' },
  { value: 'service', labelKey: 'activity.filters.service' },
  { value: 'billing', labelKey: 'activity.filters.billing' },
  { value: 'tables', labelKey: 'activity.filters.tables' },
  { value: 'menu', labelKey: 'activity.filters.menu' },
]

function dayKey(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
      date,
    )
  }
}

/** Pure calendar-label arithmetic on an already timezone-resolved Y-M-D key — never a raw ms subtraction on the instant, which can land on the wrong calendar day across a DST boundary. */
function shiftDayKey(key: string, deltaDays: number): string {
  const [year, month, day] = key.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

interface ActivityGroup {
  key: string
  label: string
  events: RestaurantActivityEvent[]
}

/** Grouped newest-first, in the RESTAURANT's own timezone (§6) — never the browser's, never hardcoded Europe/Madrid. */
const groups = computed<ActivityGroup[]>(() => {
  const tz = timezone.value
  const todayKey = dayKey(new Date(), tz)
  const yesterdayKey = shiftDayKey(todayKey, -1)

  const order: string[] = []
  const byKey = new Map<string, RestaurantActivityEvent[]>()

  for (const event of props.events) {
    const key = dayKey(new Date(event.occurred_at), tz)
    if (!byKey.has(key)) {
      byKey.set(key, [])
      order.push(key)
    }
    byKey.get(key)!.push(event)
  }

  return order.map((key) => {
    let label: string
    if (key === todayKey) label = t('activity.today')
    else if (key === yesterdayKey) label = t('activity.yesterday')
    else {
      const [year, month, day] = key.split('-').map(Number)
      try {
        label = new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'long' }).format(new Date(Date.UTC(year, month - 1, day)))
      } catch {
        label = key
      }
    }
    return { key, label, events: byKey.get(key)! }
  })
})

const isEmpty = computed(() => !props.loading && !props.error && props.events.length === 0)

/* ---------------------------------------------------------------- Shell interaction (Escape / focus trap / backdrop) ---------------------------------------------------------------- */

const panelRef = ref<HTMLElement | null>(null)
let returnFocus: HTMLElement | null = null

function requestClose(): void {
  emit('close')
}

/**
 * Same after-the-fact correction as ABottomSheet's own fixed trap (Carta
 * 5.2 regression) — let Tab run natively, then pull focus back in if it
 * landed outside the panel. Filter chips (a horizontal row of buttons,
 * not a radio group) and the "Mostrar anteriores" button (present only
 * when `hasMore`) are exactly the kind of variable-shaped control set a
 * preemptive first/last check gets wrong.
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    requestClose()
    return
  }
  if (event.key !== 'Tab' || !panelRef.value) return
  const panel = panelRef.value
  const shiftKey = event.shiftKey
  requestAnimationFrame(() => {
    if (panel.contains(document.activeElement)) return
    const controls = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
      ),
    ).filter((element) => element.getClientRects().length > 0)
    const target = shiftKey ? controls[controls.length - 1] : controls[0]
    if (target) target.focus()
    else panel.focus()
  })
}

onMounted(() => {
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  document.addEventListener('keydown', onKeydown)
  panelRef.value?.focus()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  if (returnFocus?.isConnected) returnFocus.focus()
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex justify-end">
      <div class="absolute inset-0 bg-black/40" aria-hidden="true" @click="requestClose" />

      <div
        ref="panelRef"
        role="dialog"
        aria-modal="true"
        :aria-label="t('activity.title')"
        tabindex="-1"
        class="relative flex h-full w-full max-w-md flex-col bg-surface-container-high text-on-surface shadow-elevated focus:outline-none max-sm:mt-auto max-sm:h-[88vh] max-sm:max-w-full max-sm:rounded-t-2xl"
      >
        <div class="flex shrink-0 items-center justify-between gap-3 border-b border-outline-variant px-5 py-4">
          <h2 class="text-title-lg font-semibold text-on-surface">{{ t('activity.title') }}</h2>
          <button
            type="button"
            :aria-label="t('common.close')"
            class="flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant transition-colors duration-200 ease-out hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            @click="requestClose"
          >
            <PhX :size="20" />
          </button>
        </div>

        <div class="shrink-0 overflow-x-auto border-b border-outline-variant px-5 py-3">
          <div class="flex w-max gap-2">
            <button
              v-for="option in CATEGORIES"
              :key="option.value ?? 'all'"
              type="button"
              class="inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :class="
                category === option.value
                  ? 'border-primary bg-primary-container text-on-primary-container'
                  : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
              "
              :aria-pressed="category === option.value"
              @click="emit('set-category', option.value)"
            >
              {{ t(option.labelKey) }}
            </button>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <!-- Loading skeleton -->
          <div v-if="loading" class="flex flex-col gap-4" aria-hidden="true">
            <div v-for="n in 4" :key="n" class="flex gap-3">
              <div class="h-8 w-8 shrink-0 animate-pulse rounded-full bg-surface-container-highest" />
              <div class="flex-1 space-y-2 pt-1">
                <div class="h-3.5 w-2/3 animate-pulse rounded bg-surface-container-highest" />
                <div class="h-3 w-1/2 animate-pulse rounded bg-surface-container-highest" />
              </div>
            </div>
          </div>

          <!-- Error -->
          <div v-else-if="error" class="flex h-full flex-col items-center justify-center gap-3 text-center">
            <PhWarningCircle :size="32" class="text-on-surface-variant" aria-hidden="true" />
            <p class="max-w-xs text-body-md text-on-surface-variant">{{ describeApiError(error, t) }}</p>
            <AButton variant="outlined" @click="emit('retry')">{{ t('activity.retry') }}</AButton>
          </div>

          <!-- Empty -->
          <div v-else-if="isEmpty" class="flex h-full flex-col items-center justify-center gap-3 text-center">
            <PhClockCounterClockwise :size="32" class="text-on-surface-variant" aria-hidden="true" />
            <div>
              <p class="text-body-lg font-medium text-on-surface">{{ t('activity.emptyTitle') }}</p>
              <p class="mt-1 max-w-xs text-body-md text-on-surface-variant">{{ t('activity.emptyMessage') }}</p>
            </div>
          </div>

          <!-- Timeline -->
          <template v-else>
            <div v-for="group in groups" :key="group.key" class="mb-6 last:mb-0">
              <h3 class="mb-3 text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">{{ group.label }}</h3>
              <ul class="flex flex-col">
                <ActivityEventItem
                  v-for="(event, index) in group.events"
                  :key="event.id"
                  :event="event"
                  :locale="locale"
                  :timezone="timezone"
                  :currency="currency"
                  :is-last="index === group.events.length - 1"
                />
              </ul>
            </div>

            <div v-if="hasMore" class="mt-2 flex flex-col items-center gap-2">
              <p v-if="loadMoreError" class="text-label-md text-error" role="alert">{{ describeApiError(loadMoreError, t) }}</p>
              <AButton variant="outlined" :loading="loadingMore" @click="emit('load-more')">
                {{ t('activity.loadPrevious') }}
              </AButton>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
