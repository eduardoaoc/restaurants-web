<script setup lang="ts">
// Rollback presentation only. Initialization and navigation data are shared
// with V2 in AppShellLayout; no second subscription/auth/restaurant lifecycle.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import { PhList, PhX } from '@phosphor-icons/vue'
import AIconButton from '@/components/ui/AIconButton.vue'
import ASurface from '@/components/ui/ASurface.vue'
import type { ShellNavItem } from './navigation'
import aforoSymbol from '@/assets/brand/aforo-symbol.png'
import aforoWordmark from '@/assets/brand/aforo-wordmark.png'
const props = defineProps<{ items: ShellNavItem[]; routeKey?: string }>()
const { t } = useI18n()
const route = useRoute()
const visibleNavItems = computed(() => props.items.filter(item => item.group !== 'footer'))
const drawerOpen = ref(false)
const isActive = (name: string) => props.items.some(item => item.routeName === name && item.active)
function closeDrawer(): void { drawerOpen.value = false }
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
      :aria-label="t('appShell.mainNav')"
    >
      <img :src="aforoSymbol" alt="AFORO" class="h-9 w-9" />
      <RouterLink
        v-for="item in visibleNavItems"
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
              v-for="item in visibleNavItems"
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
            <slot name="language" />
            <slot name="theme" />
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
          <span class="hidden shrink-0 text-title-md font-medium text-on-surface sm:block">{{ t(items.find(item => item.routeName === route.name)?.labelKey ?? (route.name === 'app-day-close-detail' ? 'dayClose.detail.title' : items.find(item => item.active)?.labelKey ?? 'common.settings')) }}</span>
          <span class="hidden h-5 w-px shrink-0 bg-outline-variant sm:block" aria-hidden="true" />
          <slot name="restaurant" />
        </div>
        <div class="ml-auto flex items-center gap-1">
          <span class="hidden md:inline-flex"><slot name="language" /></span>
          <slot name="theme" />
          <slot name="activity" />
          <slot name="user" />
        </div>
      </header>

      <main id="main-content" class="flex-1 overflow-y-auto p-4 md:p-8">
        <slot />
      </main>
    </div>

    <slot name="notifications" />
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
