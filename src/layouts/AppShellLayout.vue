<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AAppShell from '@/components/shell/AAppShell.vue'
import LegacyAppShell from '@/components/shell/LegacyAppShell.vue'
import { resolveShellNavigation } from '@/components/shell/navigation'
import ActivityBell from '@/components/shared/ActivityBell.vue'
import LanguageSwitcher from '@/components/shared/LanguageSwitcher.vue'
import ReadyOrderNotificationStack from '@/components/shared/ReadyOrderNotificationStack.vue'
import RestaurantSwitcher from '@/components/shared/RestaurantSwitcher.vue'
import ThemeSwitcher from '@/components/shared/ThemeSwitcher.vue'
import UserMenu from '@/components/shared/UserMenu.vue'
import { usePermissions } from '@/composables/usePermissions'
import { useReadyOrderNotifications } from '@/composables/useReadyOrderNotifications'
import { useRestaurantStore } from '@/stores/restaurant'
import { appConfig } from '@/config/runtime'
import { unlockNotificationSound } from '@/utils/notification-sound'

const route = useRoute()
const restaurantStore = useRestaurantStore()
const permissions = usePermissions()
// Kept outside both presentations and RouterView: exactly one ready
// subscription and one memoized restaurant initialization, as before.
const readyOrderNotifications = useReadyOrderNotifications()
const items = computed(() => resolveShellNavigation(permissions, route.name, route.matched.map(record => record.name), readyOrderNotifications.notifications.value.length))
function unlockSoundOnce(): void {
  unlockNotificationSound()
  document.removeEventListener('pointerdown', unlockSoundOnce)
  document.removeEventListener('keydown', unlockSoundOnce)
}
onMounted(() => {
  void restaurantStore.load()
  document.addEventListener('pointerdown', unlockSoundOnce, { once: true })
  document.addEventListener('keydown', unlockSoundOnce, { once: true })
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', unlockSoundOnce)
  document.removeEventListener('keydown', unlockSoundOnce)
})
</script>

<template>
  <component :is="appConfig.shellV2 ? AAppShell : LegacyAppShell" :items="items" :route-key="route.path">
    <RouterView />
    <template #restaurant><RestaurantSwitcher /></template>
    <template #activity><ActivityBell /></template>
    <template #language><LanguageSwitcher /></template>
    <template #theme><ThemeSwitcher /></template>
    <template #user><UserMenu :hide-settings="appConfig.shellV2" /></template>
    <template #language-inline><LanguageSwitcher inline /></template>
    <template #theme-inline><ThemeSwitcher inline /></template>
    <template #account-inline><UserMenu inline hide-settings /></template>
    <template #notifications>
      <ReadyOrderNotificationStack :notifications="readyOrderNotifications.notifications.value" class="app-shell-ready" @dismiss="readyOrderNotifications.dismiss" />
    </template>
  </component>
</template>
