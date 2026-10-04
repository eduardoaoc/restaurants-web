<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AButton from '@/components/ui/AButton.vue'

import AppBootstrapScreen from '@/components/shared/AppBootstrapScreen.vue'
import router from '@/router'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const auth = useAuthStore()
async function retry(): Promise<void> {
  await auth.retryBootstrap()
  if (!auth.unavailable) await router.replace({ path: route.fullPath, force: true })
}
const route = useRoute()

/**
 * The public QR surface (Passo 3.1, `meta.public`) must never wait on, or
 * even trigger, an admin identity check — this used to be the ONE place
 * that still called `auth.bootstrap()` unconditionally even after the
 * router guard itself was taught to skip public routes (router/index.ts),
 * because this component mounts, and gates the whole app behind
 * `auth.initializing`, independently of that guard. `router.isReady()` is
 * awaited first so `route.meta` reflects the real initial route rather
 * than a transient empty one.
 */
const isPublicRoute = computed(() => route.meta.public === true)

onMounted(async () => {
  await router.isReady()
  if (!isPublicRoute.value) void auth.bootstrap()
})
</script>

<template>
  <AppBootstrapScreen v-if="!isPublicRoute && auth.initializing" />
  <div v-else-if="!isPublicRoute && auth.unavailable" class="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-6">
    <p role="alert">{{ t('auth.apiUnavailable') }}</p>
    <AButton @click="retry">{{ t('auth.retry') }}</AButton>
  </div>
  <RouterView v-else />
</template>
