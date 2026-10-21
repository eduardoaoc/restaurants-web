<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhBell } from '@phosphor-icons/vue'

import ActivityPanel from './ActivityPanel.vue'
import AIconButton from '@/components/ui/AIconButton.vue'
import { useActivityPanelToggle } from '@/composables/useActivityPanelToggle'
import { usePermissions } from '@/composables/usePermissions'
import { useRestaurantActivity } from '@/composables/useRestaurantActivity'
import { useRestaurantStore } from '@/stores/restaurant'

/** Full activity needs view_activity. Service staff see only their own
 * assignment notices; assign_waiters also grants pending-assignment notices.
 * REST enforces this scope independently of the bell's presentation gate.
 */
const { can } = usePermissions()
const restaurantStore = useRestaurantStore()
const { t } = useI18n()

const hasAccess = computed(() => can('view_activity') || can('serve_orders') || can('assign_waiters'))

const activity = useRestaurantActivity(
  () => restaurantStore.currentRestaurantId,
  () => hasAccess.value,
  () => can('view_activity'),
)

const panelToggle = useActivityPanelToggle()
const isOpen = panelToggle.isOpen
watch(() => restaurantStore.currentRestaurantId, () => panelToggle.close())

// A Dashboard "Ver actividad" CTA (Carta 6.2) flips `isOpen` externally via
// the same singleton — this watch is what actually fetches/marks-read in
// that case too, so there's exactly one place that reacts to the panel
// opening regardless of who requested it.
watch(isOpen, async (open) => {
  if (open) await activity.openPanel()
  else activity.closePanel()
})

const unreadLabel = computed(() => (activity.unreadCount.value > 99 ? '99+' : String(activity.unreadCount.value)))
const bellLabel = computed(() =>
  activity.unreadCount.value > 0
    ? t('activity.bellLabelUnread', { count: activity.unreadCount.value })
    : t('activity.bellLabel'),
)

function open(): void {
  panelToggle.open()
}

function close(): void {
  panelToggle.close()
}
</script>

<template>
  <template v-if="hasAccess">
    <span class="relative inline-flex">
      <AIconButton :label="bellLabel" @click="open">
        <PhBell :size="22" />
      </AIconButton>
      <span
        v-if="activity.unreadCount.value > 0"
        aria-hidden="true"
        class="pointer-events-none absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-on-primary"
      >
        {{ unreadLabel }}
      </span>
    </span>

    <ActivityPanel
      v-if="isOpen"
      :events="activity.events.value"
      :loading="activity.loading.value"
      :loading-more="activity.loadingMore.value"
      :error="activity.error.value"
      :load-more-error="activity.loadMoreError.value"
      :has-more="activity.hasMore.value"
      :category="activity.category.value"
      @close="close"
      @load-more="activity.loadMore"
      @set-category="activity.setCategory"
      @retry="activity.retry"
    />
  </template>
</template>
