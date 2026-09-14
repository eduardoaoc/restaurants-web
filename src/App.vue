<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'

import AppBootstrapScreen from '@/components/shared/AppBootstrapScreen.vue'
import router from '@/router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
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
  <RouterView v-else />
</template>
