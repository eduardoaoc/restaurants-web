<script setup lang="ts">
import { onMounted } from 'vue'

import AppBootstrapScreen from '@/components/shared/AppBootstrapScreen.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

onMounted(() => {
  void auth.bootstrap()
})
</script>

<template>
  <AppBootstrapScreen v-if="auth.initializing" />
  <RouterView v-else />
</template>
