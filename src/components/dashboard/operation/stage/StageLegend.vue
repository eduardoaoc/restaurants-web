<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { TablePrimaryStatus } from '@/types/operations'
import { serviceTableStatus } from '@/utils/service-table-status'

// The seven real statuses of the operations contract, in the order they usually matter on the floor.
const STATUSES: TablePrimaryStatus[] = ['free', 'occupied', 'waiting_approval', 'preparing', 'ready', 'waiter_requested', 'bill_requested']
const { t } = useI18n()
</script>

<template>
  <!-- One compact line: icon + short label per status (never colour alone). Wraps only when the panel is narrow. -->
  <ul class="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 pt-1" :aria-label="t('operations.board.stage.legend')">
    <li
      v-for="status in STATUSES"
      :key="status"
      class="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-label-md"
      :class="serviceTableStatus(status).state === 'attention' ? 'text-warning' : 'text-fg-muted'"
    >
      <component :is="serviceTableStatus(status).icon" :size="14" aria-hidden="true" />
      {{ t(serviceTableStatus(status).labelKey) }}
    </li>
  </ul>
</template>
