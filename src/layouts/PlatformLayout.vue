<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, RouterView } from 'vue-router'
import { PhStorefront } from '@phosphor-icons/vue'

import LanguageSwitcher from '@/components/shared/LanguageSwitcher.vue'
import ThemeSwitcher from '@/components/shared/ThemeSwitcher.vue'
import UserMenu from '@/components/shared/UserMenu.vue'
import { useAuthStore } from '@/stores/auth'
import aforoSymbol from '@/assets/brand/aforo-symbol.png'

/**
 * Shell of the platform-admin area. Deliberately minimal and separate from
 * AppShellLayout: no restaurant switcher, no restaurant-scoped nav, no
 * realtime — a platform admin operates no restaurant. A link back to the
 * restaurant panel appears only when this account also has an organization.
 */
const { t } = useI18n()
const auth = useAuthStore()
const hasOrganizations = computed(() => (auth.authContext?.organizations.length ?? 0) > 0)
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-background">
    <a
      href="#platform-content"
      class="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-on-primary"
    >
      {{ t('appShell.skipToContent') }}
    </a>
    <header class="flex h-16 shrink-0 items-center gap-3 border-b border-outline-variant bg-surface-container-low px-4 md:px-6">
      <img :src="aforoSymbol" alt="AFORO" class="h-8 w-8" />
      <span class="text-title-md font-medium text-on-surface">{{ t('platform.title') }}</span>
      <div class="ml-auto flex items-center gap-1">
        <RouterLink
          v-if="hasOrganizations"
          :to="{ name: 'app-dashboard' }"
          class="hidden min-h-11 items-center gap-2 rounded-full px-3 text-label-lg font-medium text-primary hover:bg-primary-container/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:inline-flex"
        >
          <PhStorefront :size="18" aria-hidden="true" />
          {{ t('platform.goToApp') }}
        </RouterLink>
        <LanguageSwitcher />
        <ThemeSwitcher />
        <UserMenu />
      </div>
    </header>
    <main id="platform-content" class="flex-1 p-4 md:p-8">
      <RouterView />
    </main>
  </div>
</template>
