<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { KitchenItem } from '@/types/kitchen'
defineProps<{ items: KitchenItem[]; note: string | null }>()
const { t } = useI18n()
</script>

<template>
  <ul class="kitchen-items flex flex-col gap-4">
    <li v-for="item in items" :key="item.id" class="break-words">
      <p class="text-body-lg font-semibold">{{ item.quantity }}× {{ item.name }}</p>
      <ul v-if="item.modifiers.length" class="mt-1 flex flex-col gap-1 pl-3 text-body-md">
        <li v-for="(modifier, index) in item.modifiers" :key="index">{{ modifier.group_name }}: {{ modifier.name }}</li>
      </ul>
      <p v-if="item.note" class="mt-2 whitespace-pre-wrap border-l-2 border-outline pl-3 text-body-md font-medium">{{ t('kitchen.note') }}: {{ item.note }}</p>
    </li>
  </ul>
  <p v-if="note" class="kitchen-note mt-4 whitespace-pre-wrap break-words rounded-md bg-secondary-container p-3 text-body-lg font-medium text-on-secondary-container">{{ t('kitchen.note') }}: {{ note }}</p>
</template>
