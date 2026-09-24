<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhCheckCircle } from '@phosphor-icons/vue'

import ABottomSheet from '@/components/ui/ABottomSheet.vue'
import type { PublicCategory } from '@/types/public-menu'

/**
 * Category navigation for the Reel feed (Carta 4.4.1) — was a permanent row
 * of pills/chips floating over the media (Carta 4.4 §23/§24); now the
 * content of the bottom sheet a hamburger trigger in `PublicTableView`
 * opens, so the media stays uncluttered and category browsing becomes a
 * deliberate, on-demand action instead of a persistent overlay. Every piece
 * of behavior from the pills carries over unchanged: `activeCategoryId` is
 * still driven purely by the feed's own IntersectionObserver (never name
 * matching), and selecting a category still only ever emits its id for the
 * parent's existing `scrollToCategory` mechanism — this component never
 * touches the feed directly.
 *
 * `PublicTableView` owns the `open`/`close` lifecycle (same `v-if` pattern
 * as every other public sheet, e.g. `PublicProductSheet`) — this component
 * only renders the sheet's content and reports the two things the parent
 * needs: which category was picked, and that the sheet wants to close.
 */
defineProps<{
  categories: PublicCategory[]
  activeCategoryId: number | null
}>()

const emit = defineEmits<{ select: [categoryId: number]; close: [] }>()

const { t } = useI18n()
</script>

<template>
  <ABottomSheet :label="t('publicMenu.feed.categoryNavLabel')" @close="emit('close')">
    <div class="flex flex-col divide-y divide-outline-variant rounded-lg border border-outline-variant">
      <button
        v-for="category in categories"
        :key="category.id"
        type="button"
        class="flex min-h-11 items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :class="
          activeCategoryId === category.id
            ? 'bg-primary-container text-on-primary-container'
            : 'text-on-surface hover:bg-surface-container-highest'
        "
        :aria-current="activeCategoryId === category.id ? 'true' : undefined"
        @click="emit('select', category.id)"
      >
        <span class="truncate text-body-lg" :class="activeCategoryId === category.id && 'font-semibold'">{{ category.name }}</span>
        <PhCheckCircle v-if="activeCategoryId === category.id" :size="20" class="shrink-0 text-primary" aria-hidden="true" />
      </button>
    </div>
  </ABottomSheet>
</template>
