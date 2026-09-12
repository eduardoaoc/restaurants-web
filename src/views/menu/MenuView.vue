<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhBookOpen, PhEye, PhFaders, PhForkKnife, PhSquaresFour } from '@phosphor-icons/vue'

import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import CategoryList from '@/components/menu/CategoryList.vue'
import MenuEmptyState from '@/components/menu/MenuEmptyState.vue'
import MenuHeaderCard from '@/components/menu/MenuHeaderCard.vue'
import MenuPreview from '@/components/menu/MenuPreview.vue'
import MenuSectionTabs, { type MenuSection } from '@/components/menu/MenuSectionTabs.vue'
import ModifiersOverview from '@/components/menu/ModifiersOverview.vue'
import ProductList from '@/components/menu/ProductList.vue'
import { usePermissions } from '@/composables/usePermissions'
import { useRestaurantMenu } from '@/composables/useRestaurantMenu'
import { AVAILABLE_LOCALES, DEFAULT_LOCALE, type AppLocale } from '@/i18n'
import { useRestaurantStore } from '@/stores/restaurant'

const { t } = useI18n()
const { can } = usePermissions()
const restaurantStore = useRestaurantStore()

/**
 * The restaurant's own primary content language for the Carta (CLAUDE.md
 * Passo 2.3 §5) — read from RestaurantSettings.default_locale, which is
 * best-effort (only loads for a user who also holds manage_restaurants,
 * see restaurant.ts's own docblock). When it's unavailable, or holds a
 * value this app doesn't recognize, this falls back to DEFAULT_LOCALE
 * ('es-ES') rather than guessing — never invented, always the same
 * documented fallback (PENDÊNCIA: no other reliable signal exists for a
 * manage_menu-only user who lacks manage_restaurants).
 */
const primaryLocale = computed<AppLocale>(() => {
  const raw = restaurantStore.currentSettings?.default_locale
  return raw && (AVAILABLE_LOCALES as readonly string[]).includes(raw) ? (raw as AppLocale) : DEFAULT_LOCALE
})

// CLAUDE.md §16/§24: never call GET .../menu while the current restaurant's
// context already says manage_menu is missing — same proactive-gate pattern
// as useRestaurantOperations/useRestaurantAnalytics in DashboardView. This
// also covers a restaurant switch mid-session (not just first navigation —
// the router guard already blocks that entry, see src/router/index.ts).
const canManageMenu = computed(() => can('manage_menu'))
const canManageProducts = computed(() => can('manage_products'))

const { menu, loading, notFound, error, saving, saveError, createMenu, updateMenu } = useRestaurantMenu(
  () => canManageMenu.value,
)

const ALL_SECTIONS: { id: MenuSection; icon: typeof PhSquaresFour; permission?: 'manage_products' }[] = [
  { id: 'categories', icon: PhSquaresFour },
  { id: 'products', icon: PhForkKnife, permission: 'manage_products' },
  { id: 'modifiers', icon: PhFaders, permission: 'manage_products' },
  { id: 'preview', icon: PhEye },
]

// Categorías always shows once the Carta exists (gated only by manage_menu,
// already required for this whole route). Productos/Modificadores are
// prepared to hide per manage_products (CLAUDE.md §24) — not enforced on
// the route itself in this step, only on these two sub-tabs.
const visibleSections = computed(() =>
  ALL_SECTIONS.filter((section) => !section.permission || canManageProducts.value),
)

const activeSection = ref<MenuSection>('categories')

const sectionTabs = computed(() =>
  visibleSections.value.map((section) => ({ id: section.id, label: t(`menu.sections.${section.id}.title`) })),
)

// A restaurant switch can drop manage_products mid-session (CLAUDE.md §22)
// — if that hides the currently active sub-tab, fall back to Categorías
// rather than leaving the content area blank.
watch(visibleSections, (sections) => {
  if (!sections.some((section) => section.id === activeSection.value)) {
    activeSection.value = 'categories'
  }
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h2 class="text-headline font-bold text-on-surface">{{ t('menu.pageTitle') }}</h2>
      <p class="mt-1.5 text-body-md text-on-surface-variant">{{ t('menu.pageSubtitle') }}</p>
    </div>

    <div v-if="!canManageMenu" class="flex flex-col gap-6">
      <ASurface tone="container" radius="lg" class="max-w-xl p-6">
        <p class="text-title-md font-medium text-on-surface">{{ t('menu.errors.forbidden') }}</p>
      </ASurface>
    </div>

    <div v-else-if="loading" class="flex items-center justify-center py-24">
      <AProgress />
    </div>

    <ASurface
      v-else-if="error"
      tone="container"
      radius="lg"
      role="alert"
      class="max-w-xl border border-error/40 bg-error-container p-6 text-on-error-container"
    >
      <p class="text-title-md font-medium">
        {{
          error.kind === 'forbidden'
            ? t('menu.errors.forbidden')
            : error.kind === 'network'
              ? t('menu.errors.network')
              : t('menu.errors.generic')
        }}
      </p>
    </ASurface>

    <MenuEmptyState
      v-else-if="notFound"
      :can-create="canManageMenu"
      :creating="saving"
      :create-error="saveError"
      @create="(payload) => createMenu(payload)"
    />

    <template v-else-if="menu">
      <MenuHeaderCard :menu="menu" :can-edit="canManageMenu" :on-save="updateMenu" />

      <div class="flex flex-col gap-4">
        <MenuSectionTabs v-model="activeSection" :sections="sectionTabs" />

        <CategoryList
          v-if="activeSection === 'categories'"
          :enabled="canManageMenu && menu !== null"
          :can-manage="canManageMenu"
          :can-manage-products="canManageProducts"
          :primary-locale="primaryLocale"
        />
        <ProductList
          v-else-if="activeSection === 'products' && canManageProducts"
          :enabled="canManageProducts && menu !== null"
          :can-manage="canManageProducts"
          :primary-locale="primaryLocale"
        />
        <ModifiersOverview
          v-else-if="activeSection === 'modifiers' && canManageProducts"
          @go-to-products="activeSection = 'products'"
        />
        <MenuPreview
          v-else-if="activeSection === 'preview'"
          :enabled="canManageMenu && menu !== null"
          :primary-locale="primaryLocale"
        />
      </div>
    </template>

    <ASurface v-else tone="container" radius="lg" class="max-w-xl p-6">
      <div class="flex items-center gap-2 text-on-surface-variant">
        <PhBookOpen :size="20" aria-hidden="true" />
        <p class="text-body-md">{{ t('menu.errors.generic') }}</p>
      </div>
    </ASurface>
  </div>
</template>
