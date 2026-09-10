<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import EmptyState from '@/components/dashboard/EmptyState.vue'
import AButton from '@/components/ui/AButton.vue'
import ASurface from '@/components/ui/ASurface.vue'
import { PhArmchair } from '@phosphor-icons/vue'
import type { OperationsTable } from '@/types/operations'

defineProps<{ freeTables: OperationsTable[]; submitting: boolean }>()
const emit = defineEmits<{ confirm: [number]; cancel: [] }>()

const { t } = useI18n()
</script>

<template>
  <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" @click.self="emit('cancel')">
    <ASurface tone="high" radius="lg" class="w-full max-w-sm p-5 shadow-elevated">
      <h3 class="text-title-md font-semibold text-on-surface">{{ t('tableDrawer.transfer.title') }}</h3>
      <p class="mt-1 text-body-md text-on-surface-variant">{{ t('tableDrawer.transfer.subtitle') }}</p>

      <EmptyState v-if="freeTables.length === 0" :icon="PhArmchair" :message="t('tableDrawer.transfer.noFreeTables')" class="mt-3" />
      <ul v-else class="mt-3 flex max-h-64 flex-col gap-1 overflow-y-auto">
        <li v-for="table in freeTables" :key="table.id">
          <button
            type="button"
            :disabled="submitting"
            class="w-full rounded-md px-3 py-2 text-left text-body-md text-on-surface hover:bg-surface-container-highest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
            @click="emit('confirm', table.id)"
          >
            {{ table.name }}
          </button>
        </li>
      </ul>

      <div class="mt-4 flex justify-end">
        <AButton variant="text" @click="emit('cancel')">{{ t('common.cancel') }}</AButton>
      </div>
    </ASurface>
  </div>
</template>
