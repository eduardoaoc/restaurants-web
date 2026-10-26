<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ASheet from '@/components/ui/ASheet.vue'
import ShellNavigation from './ShellNavigation.vue'
import type { ShellNavItem } from './navigation'
defineProps<{ open: boolean; items: ShellNavItem[] }>()
defineEmits<{ 'update:open': [boolean]; close: [] }>()
const { t } = useI18n()
</script>

<template>
  <ASheet id="shell-more-sheet" :open="open" :title="t('appShell.more')" variant="bottom" @update:open="$emit('update:open', $event)" @close="$emit('close')">
    <div class="shell-more-content">
      <ShellNavigation v-if="items.length" :items="items" mode="sheet" @navigate="$emit('update:open', false)" />
      <div class="shell-more-preferences"><slot name="language" /><slot name="theme" /></div>
      <div class="shell-more-account"><slot name="account" /></div>
    </div>
  </ASheet>
</template>

<style scoped>
.shell-more-content { display: flex; flex-direction: column; gap: calc(var(--spacing) * 6); min-width: 0; }
.shell-more-preferences { display: grid; grid-template-columns: minmax(0, 1fr); gap: calc(var(--spacing) * 4); }
.shell-more-account { border-top: 1px solid var(--color-border); padding-top: calc(var(--spacing) * 4); min-width: 0; }
</style>
