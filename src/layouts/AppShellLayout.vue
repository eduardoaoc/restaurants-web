<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { PhGauge, PhList, PhX } from '@phosphor-icons/vue'

import AIconButton from '@/components/ui/AIconButton.vue'
import ASurface from '@/components/ui/ASurface.vue'
import LanguageSwitcher from '@/components/shared/LanguageSwitcher.vue'
import RestaurantSwitcher from '@/components/shared/RestaurantSwitcher.vue'
import ThemeSwitcher from '@/components/shared/ThemeSwitcher.vue'
import UserMenu from '@/components/shared/UserMenu.vue'
import { useRestaurantStore } from '@/stores/restaurant'
import aforoSymbol from '@/assets/brand/aforo-symbol.png'
import aforoWordmark from '@/assets/brand/aforo-wordmark.png'

interface NavItem {
  routeName: string
  labelKey: string
  icon: typeof PhGauge
}

// Only Dashboard exists in this block — this is deliberately a data-driven
// list (not hardcoded markup) so Mesas/Pedidos/Cocina/etc. are a one-line
// addition later, without rebuilding the rail/drawer. See CLAUDE.md §17.
const NAV_ITEMS: NavItem[] = [{ routeName: 'app-dashboard', labelKey: 'common.dashboard', icon: PhGauge }]

const { t } = useI18n()
const route = useRoute()
const restaurantStore = useRestaurantStore()
const drawerOpen = ref(false)

function isActive(routeName: string): boolean {
  return route.name === routeName
}

function closeDrawer(): void {
  drawerOpen.value = false
}

onMounted(() => {
  void restaurantStore.load()
})
</script>

<template>
  <div class="flex min-h-dvh bg-background">
    <a
      href="#main-content"
      class="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-on-primary"
    >
      {{ t('appShell.skipToContent') }}
    </a>

    <!-- Desktop / tablet: Material 3 navigation rail -->
    <nav
      class="hidden w-20 shrink-0 flex-col items-center gap-6 border-r border-outline-variant bg-surface-container-low py-6 md:flex"
      :aria-label="t('common.dashboard')"
    >
      <img :src="aforoSymbol" alt="AFORO" class="h-9 w-9" />
      <RouterLink
        v-for="item in NAV_ITEMS"
        :key="item.routeName"
        :to="{ name: item.routeName }"
        class="flex w-16 flex-col items-center gap-1 rounded-lg py-2 text-label-md text-on-surface-variant transition-colors duration-200 ease-out hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :class="isActive(item.routeName) ? 'text-on-surface' : ''"
      >
        <span
          class="flex h-8 w-14 items-center justify-center rounded-full"
          :class="isActive(item.routeName) ? 'bg-primary-container text-on-primary-container' : ''"
        >
          <component :is="item.icon" :size="22" :weight="isActive(item.routeName) ? 'fill' : 'regular'" />
        </span>
        {{ t(item.labelKey) }}
      </RouterLink>
    </nav>

    <!-- Mobile: modal navigation drawer -->
    <Transition name="fade">
      <div v-if="drawerOpen" class="fixed inset-0 z-30 md:hidden">
        <div class="absolute inset-0 bg-black/40" @click="closeDrawer" />
        <ASurface
          tone="low"
          radius="none"
          class="absolute inset-y-0 left-0 flex w-72 flex-col gap-4 p-4 shadow-elevated"
        >
          <div class="flex items-center justify-between">
            <img :src="aforoWordmark" alt="AFORO" class="h-6 w-auto" />
            <AIconButton :label="t('appShell.closeMenu')" @click="closeDrawer">
              <PhX :size="20" />
            </AIconButton>
          </div>
          <nav class="flex flex-col gap-1">
            <RouterLink
              v-for="item in NAV_ITEMS"
              :key="item.routeName"
              :to="{ name: item.routeName }"
              class="flex items-center gap-3 rounded-md px-3 py-3 text-body-lg text-on-surface hover:bg-surface-container-high"
              :class="isActive(item.routeName) ? 'bg-primary-container text-on-primary-container' : ''"
              @click="closeDrawer"
            >
              <component :is="item.icon" :size="22" />
              {{ t(item.labelKey) }}
            </RouterLink>
          </nav>
          <hr class="border-outline-variant" />
          <div class="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </ASurface>
      </div>
    </Transition>

    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="flex h-16 shrink-0 items-center gap-3 border-b border-outline-variant bg-surface-container-low px-4 md:px-6"
      >
        <AIconButton :label="t('appShell.openMenu')" class="md:hidden" @click="drawerOpen = true">
          <PhList :size="22" />
        </AIconButton>
        <div class="flex min-w-0 items-center gap-1">
          <span class="shrink-0 truncate text-title-md font-medium text-on-surface">{{ t('common.dashboard') }}</span>
          <span class="hidden h-5 w-px shrink-0 bg-outline-variant sm:block" aria-hidden="true" />
          <RestaurantSwitcher />
        </div>
        <div class="ml-auto flex items-center gap-1">
          <LanguageSwitcher class="hidden md:inline-flex" />
          <ThemeSwitcher />
          <UserMenu />
        </div>
      </header>

      <main id="main-content" class="flex-1 overflow-y-auto p-4 md:p-8">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 200ms ease-out;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .fade-enter-active,
  .fade-leave-active {
    transition: none;
  }
}
</style>
