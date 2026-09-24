<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { PublicCategory } from '@/types/public-menu'

/**
 * Compact horizontal category pills for the Reel feed (Carta 4.4 §23/§24) —
 * always styled for the fullscreen-media overlay context it lives in
 * (never reused on a plain surface, unlike `PublicLanguageSwitcher`/
 * `ThemeSwitcher`), so no token-driven default is needed here: this is
 * exactly the "overlay neutro necessário para contraste" case CLAUDE.md
 * §39 calls out. `activeCategoryId` is driven by the feed's own
 * IntersectionObserver — never by name matching (§24).
 */
defineProps<{
  categories: PublicCategory[]
  activeCategoryId: number | null
}>()

const emit = defineEmits<{ select: [categoryId: number] }>()

const { t } = useI18n()
</script>

<template>
  <nav
    v-if="categories.length > 1"
    class="pointer-events-auto flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    :aria-label="t('publicMenu.feed.categoryNavLabel')"
  >
    <button
      v-for="category in categories"
      :key="category.id"
      type="button"
      :aria-current="activeCategoryId === category.id ? 'true' : undefined"
      class="shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-label-lg font-medium backdrop-blur-sm transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :class="
        activeCategoryId === category.id
          ? 'border-primary bg-primary text-on-primary'
          : 'border-white/25 bg-black/30 text-white hover:bg-black/45'
      "
      @click="emit('select', category.id)"
    >
      {{ category.name }}
    </button>
  </nav>
</template>
