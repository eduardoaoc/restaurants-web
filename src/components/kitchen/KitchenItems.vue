<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { KitchenItem } from '@/types/kitchen'
defineProps<{ items: KitchenItem[]; note: string | null }>()
const { t } = useI18n()
</script>

<template>
  <ul class="kitchen-items">
    <li v-for="item in items" :key="item.id" class="kitchen-item">
      <p class="kitchen-item-primary"><span class="kitchen-item-quantity tabular-nums">{{ item.quantity }}×</span> {{ item.name }}</p>
      <ul v-if="item.modifiers.length" class="kitchen-item-modifiers">
        <li v-for="(modifier, index) in item.modifiers" :key="index">{{ modifier.group_name }}: {{ modifier.name }}</li>
      </ul>
      <p v-if="item.note" class="kitchen-item-note"><strong>{{ t('kitchen.note') }}:</strong> {{ item.note }}</p>
    </li>
  </ul>
  <p v-if="note" class="kitchen-note"><strong>{{ t('kitchen.note') }}:</strong> {{ note }}</p>
</template>

<style scoped>
.kitchen-items { display: flex; min-width: 0; flex-direction: column; gap: calc(var(--spacing) * 3); padding: 0; margin: 0; list-style: none; }
.kitchen-item { min-width: 0; overflow-wrap: anywhere; }
.kitchen-item-primary { font-size: var(--text-kds-item); font-weight: 500; line-height: var(--text-kds-item--line-height); }
.kitchen-item-quantity { font-weight: 700; }
.kitchen-item-modifiers { display: flex; flex-direction: column; gap: calc(var(--spacing) * 1); margin: calc(var(--spacing) * 1) 0 0; padding-left: calc(var(--spacing) * 4); color: var(--color-text-secondary); font-size: var(--text-body-sm); line-height: var(--text-body-sm--line-height); overflow-wrap: anywhere; }
.kitchen-item-note { margin-top: calc(var(--spacing) * 2); padding-left: calc(var(--spacing) * 3); border-left: 2px solid var(--color-border-strong); color: var(--color-text-primary); font-size: var(--text-body-sm); line-height: var(--text-body-sm--line-height); white-space: pre-wrap; overflow-wrap: anywhere; }
.kitchen-note { margin: calc(var(--spacing) * 1) 0 0; padding: calc(var(--spacing) * 3); border-radius: var(--radius-saloa-sm); background: var(--color-warning-subtle); color: var(--color-warning); font-size: var(--text-body); font-weight: 500; line-height: var(--text-body--line-height); white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
