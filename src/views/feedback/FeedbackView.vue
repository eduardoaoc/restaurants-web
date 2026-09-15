<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhChatCircleText, PhStar, PhUsersThree } from '@phosphor-icons/vue'

import EmptyState from '@/components/dashboard/EmptyState.vue'
import MetricCard from '@/components/dashboard/MetricCard.vue'
import SectionCard from '@/components/dashboard/SectionCard.vue'
import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import FeedbackDetailSheet from '@/components/feedback/FeedbackDetailSheet.vue'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { usePermissions } from '@/composables/usePermissions'
import { customerFeedbackService } from '@/services/customer-feedback.service'
import { useRestaurantStore } from '@/stores/restaurant'
import type { CustomerFeedbackListItem, CustomerFeedbackPaginationMeta } from '@/types/customer-feedback'
import { describeApiError } from '@/utils/error-message'

/**
 * "Feedback" (Passo 3.5) — the owner/manager's view of customer post-visit
 * ratings, gated on `view_customer_feedback` (never a role check — see
 * router/index.ts + AppShellLayout's nav item). Deliberately NOT an
 * analytics dashboard: a simple list plus a summary strip, matching
 * CLAUDE.md's "não transformar em dashboard analítico complexo".
 *
 * The real contract (GET /restaurants/{restaurant}/feedback) has NO
 * restaurant-wide aggregate endpoint — only a per-visit list with
 * pagination meta (`meta.total` is the one authoritative, always-correct
 * number here) and two narrower summary endpoints (own/one-staff-member,
 * used elsewhere — Servicio's "Mis valoraciones", StaffDetailPanel).
 * Inventing a "restaurant average" by re-deriving it from whatever page
 * happens to be loaded would silently go wrong the moment there's a second
 * page — so the four rating averages below are explicitly computed ONLY
 * over the currently loaded rows and labelled as such, never presented as
 * "the restaurant's true average" (see CLAUDE.md's critical rule + Passo
 * 3.5 §14's own explicit instruction on this exact tradeoff).
 */
const { t, locale } = useI18n()
const restaurantStore = useRestaurantStore()
const { can } = usePermissions()

const canView = computed(() => can('view_customer_feedback'))

const items = ref<CustomerFeedbackListItem[]>([])
const meta = ref<CustomerFeedbackPaginationMeta | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<ApiError | null>(null)
const selectedId = ref<number | null>(null)

let controller: AbortController | null = null

async function fetchPage(page: number): Promise<void> {
  const restaurantId = restaurantStore.currentRestaurantId
  if (!canView.value || restaurantId === null) {
    items.value = []
    meta.value = null
    return
  }
  controller?.abort()
  const request = new AbortController()
  controller = request
  if (page === 1) loading.value = true
  else loadingMore.value = true
  error.value = null

  try {
    const result = await customerFeedbackService.list(restaurantId, { page, per_page: 50 }, request.signal)
    if (request.signal.aborted) return
    items.value = page === 1 ? result.feedback : [...items.value, ...result.feedback]
    meta.value = result.meta
  } catch (err) {
    if (request.signal.aborted) return
    error.value = normalizeApiError(err)
    if (page === 1) items.value = []
  } finally {
    if (!request.signal.aborted) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

// Restaurant switch (Passo 3.5 §25/§28): never let Restaurant A's feedback
// remain on screen while B loads — reset first, then refetch, exactly like
// StaffView's own restaurant-switch handling.
watch(
  () => [restaurantStore.currentRestaurantId, canView.value] as const,
  () => {
    selectedId.value = null
    void fetchPage(1)
  },
  { immediate: true },
)
onBeforeUnmount(() => controller?.abort())

const hasMore = computed(() => meta.value !== null && meta.value.current_page < meta.value.last_page)

function loadMore(): void {
  if (!meta.value || loadingMore.value) return
  void fetchPage(meta.value.current_page + 1)
}

/** Loaded-only averages — see this file's own docblock for why these are never presented as a restaurant-wide truth. */
const loadedSummary = computed(() => {
  if (items.value.length === 0) return null
  const sum = (pick: (item: CustomerFeedbackListItem) => number) =>
    items.value.reduce((total, item) => total + pick(item), 0) / items.value.length
  return {
    overall: sum((i) => i.overall_rating),
    food: sum((i) => i.food_rating),
    service: sum((i) => i.service_rating),
    waitTime: sum((i) => i.wait_time_rating),
  }
})

function formatAverage(value: number): string {
  return value.toFixed(1)
}

function timestamp(value: string): string {
  const timezone = restaurantStore.currentSettings?.timezone ?? 'Europe/Madrid'
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(value))
}

function openDetail(item: CustomerFeedbackListItem): void {
  selectedId.value = item.id
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h2 class="text-headline font-bold text-on-surface">{{ t('feedback.pageTitle') }}</h2>
      <p class="mt-1.5 text-body-md text-on-surface-variant">{{ t('feedback.pageSubtitle') }}</p>
    </div>

    <ASurface v-if="!canView" tone="container" radius="lg" class="max-w-xl p-6">
      <p class="text-title-md font-medium text-on-surface">{{ t('feedback.noAccess') }}</p>
    </ASurface>

    <template v-else>
      <div v-if="loading" class="flex items-center justify-center py-16">
        <AProgress />
      </div>

      <ASurface
        v-else-if="error"
        tone="container"
        radius="lg"
        role="alert"
        class="max-w-xl border border-error/40 bg-error-container p-6 text-on-error-container"
      >
        <p class="text-title-md font-medium">{{ describeApiError(error, t) }}</p>
      </ASurface>

      <EmptyState v-else-if="items.length === 0" :icon="PhStar" :message="t('feedback.empty')" />

      <template v-else>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <MetricCard :icon="PhUsersThree" :label="t('feedback.summary.total')" :value="String(meta?.total ?? items.length)" />
          <MetricCard
            v-if="loadedSummary"
            :icon="PhStar"
            :label="t('feedback.summary.overall')"
            :value="formatAverage(loadedSummary.overall)"
            :context="t('feedback.summary.loadedContext')"
          />
          <MetricCard
            v-if="loadedSummary"
            :icon="PhStar"
            :label="t('feedback.summary.food')"
            :value="formatAverage(loadedSummary.food)"
            :context="t('feedback.summary.loadedContext')"
          />
          <MetricCard
            v-if="loadedSummary"
            :icon="PhStar"
            :label="t('feedback.summary.service')"
            :value="formatAverage(loadedSummary.service)"
            :context="t('feedback.summary.loadedContext')"
          />
          <MetricCard
            v-if="loadedSummary"
            :icon="PhStar"
            :label="t('feedback.summary.waitTime')"
            :value="formatAverage(loadedSummary.waitTime)"
            :context="t('feedback.summary.loadedContext')"
          />
        </div>

        <SectionCard :icon="PhChatCircleText" :title="t('feedback.list.title')">
          <ul class="flex flex-col divide-y divide-outline-variant">
            <li v-for="item in items" :key="item.id">
              <button
                type="button"
                class="flex w-full flex-col gap-1.5 py-3 text-left hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                @click="openDetail(item)"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-body-lg font-medium text-on-surface">{{ item.customer_name }}</span>
                  <span class="inline-flex items-center gap-1 text-body-lg font-semibold text-on-surface">
                    <PhStar :size="16" weight="fill" class="text-primary" aria-hidden="true" />
                    {{ item.overall_rating }}/5
                  </span>
                </div>
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-label-md text-on-surface-variant">
                  <span>{{ timestamp(item.submitted_at) }}</span>
                  <span>{{ item.table.name }}</span>
                  <span>{{ item.waiter ? item.waiter.name : t('feedback.noWaiter') }}</span>
                </div>
              </button>
            </li>
          </ul>

          <div v-if="hasMore" class="mt-3 flex justify-center">
            <AButton variant="outlined" :loading="loadingMore" @click="loadMore">{{ t('feedback.loadMore') }}</AButton>
          </div>
        </SectionCard>
      </template>
    </template>

    <FeedbackDetailSheet v-if="selectedId !== null" :feedback-id="selectedId" @close="selectedId = null" />
  </div>
</template>
