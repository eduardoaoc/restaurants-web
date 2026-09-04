<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import AProgress from '@/components/ui/AProgress.vue'
import aforoSymbol from '@/assets/brand/aforo-symbol.png'

const { t } = useI18n()
</script>

<template>
  <div class="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface text-on-surface">
    <img :src="aforoSymbol" alt="AFORO" class="h-12 w-12" />
    <div class="flex items-center gap-2 text-on-surface-variant">
      <AProgress size="sm" />
      <span class="text-body-md">{{ t('appShell.bootstrapLoading') }}</span>
    </div>
  </div>
</template>
