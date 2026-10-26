<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhDotsThree } from '@phosphor-icons/vue'
import AButton from '@/components/ui/AButton.vue'
import { groupShellNavigation, type ShellNavItem } from './navigation'

const props = withDefaults(defineProps<{
  items: ShellNavItem[]
  mode?: 'bottom' | 'rail' | 'sidebar' | 'sheet'
  more?: boolean
  moreActive?: boolean
  moreOpen?: boolean
  moreCount?: number
}>(), { mode: 'bottom', more: false, moreActive: false, moreOpen: false, moreCount: 0 })
defineEmits<{ more: [MouseEvent]; navigate: [] }>()
const { t, n } = useI18n()
const groups = computed(() => groupShellNavigation(props.items, props.mode === 'sidebar'))
</script>

<template>
  <nav class="shell-navigation" :data-mode="mode" :aria-label="t('appShell.mainNav')">
    <div v-for="group in groups" :key="group.id" class="shell-nav-group" :data-group="group.id">
      <p v-if="group.labelKey" class="shell-nav-group-label text-label-md text-fg-muted">{{ t(group.labelKey) }}</p>
      <ul class="shell-nav-list">
        <li v-for="item in group.items" :key="item.id">
          <AButton
            as="RouterLink" :to="{ name: item.routeName }" variant="ghost"
            class="shell-nav-control" :data-destination="item.id" :data-active="item.active || undefined"
            :aria-current="item.active ? 'page' : undefined" @click="$emit('navigate')"
          >
            <span class="shell-nav-symbol" aria-hidden="true"><component :is="item.icon" :weight="item.active ? 'fill' : 'regular'" /></span>
            <span class="shell-nav-label">{{ t(item.labelKey) }}</span>
            <span v-if="item.badge" class="shell-nav-badge text-label-md tabular-nums" aria-hidden="true">{{ n(item.badge.count) }}</span>
            <span v-if="item.badge" class="sr-only">{{ t(item.badge.labelKey, { count: item.badge.count }) }}</span>
          </AButton>
        </li>
        <li v-if="more" class="shell-nav-more">
          <AButton
            variant="ghost" class="shell-nav-control" data-shell-more
            :data-active="moreActive || moreOpen || undefined" :aria-expanded="moreOpen"
            aria-haspopup="dialog" aria-controls="shell-more-sheet" @click="$emit('more', $event)"
          >
            <span class="shell-nav-symbol" aria-hidden="true"><PhDotsThree :weight="moreActive || moreOpen ? 'fill' : 'regular'" /></span>
            <span class="shell-nav-label">{{ t('appShell.more') }}</span>
            <span v-if="moreCount" class="shell-nav-badge text-label-md tabular-nums" aria-hidden="true">{{ n(moreCount) }}</span>
            <span v-if="moreCount" class="sr-only">{{ t('appShell.readyCount', { count: moreCount }) }}</span>
          </AButton>
        </li>
      </ul>
    </div>
  </nav>
</template>

<style scoped>
.shell-navigation { min-width: 0; }
.shell-nav-list { display: flex; gap: calc(var(--spacing) * 2); }
.shell-nav-list > li { min-width: 0; flex: 1 1 0; }
.shell-navigation :deep(.shell-nav-control) { width: 100%; min-width: calc(var(--spacing) * 12); min-height: calc(var(--spacing) * 12); height: 100%; padding: 0 var(--spacing); color: var(--color-text-secondary); border-radius: var(--radius-md); }
.shell-navigation :deep(.a-control-label) { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0; width: 100%; font-size: var(--text-label-md); line-height: var(--text-label-md--line-height); }
.shell-navigation :deep(.shell-nav-control[data-active='true']) { color: var(--color-text-primary); font-weight: 600; }
.shell-nav-symbol { display: inline-flex; align-items: center; justify-content: center; min-width: calc(var(--spacing) * 10); border-radius: var(--radius-md); }
.shell-nav-symbol > svg { width: var(--icon-lg); height: var(--icon-lg); }
.shell-nav-control[data-active='true'] .shell-nav-symbol { background: var(--color-primary-subtle); }
.shell-nav-label { max-width: 100%; overflow-wrap: anywhere; }
.shell-nav-badge { position: absolute; right: 0; top: 0; min-width: calc(var(--spacing) * 4); padding-inline: var(--spacing); border-radius: var(--radius-full); background: var(--color-primary); color: var(--color-on-primary); }
.shell-nav-group-label { padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3); }
/* Rail follows the same ordered items as compact; excess destinations go
   to More. Its list can scroll in tablet landscape, keeping More reachable. */
.shell-navigation[data-mode='rail'] .shell-nav-list { flex-direction: column; }
.shell-navigation[data-mode='rail'] .shell-nav-list > li { flex: none; }
.shell-navigation[data-mode='rail'] :deep(.shell-nav-control) { min-height: calc(var(--spacing) * 16); padding-block: var(--spacing); }
.shell-navigation[data-mode='rail'] .shell-nav-more { position: sticky; bottom: 0; padding-top: calc(var(--spacing) * 2); background: var(--color-background); }
.shell-navigation[data-mode='sidebar'], .shell-navigation[data-mode='sheet'] { display: flex; flex-direction: column; gap: calc(var(--spacing) * 4); }
.shell-navigation[data-mode='sidebar'] .shell-nav-list, .shell-navigation[data-mode='sheet'] .shell-nav-list { flex-direction: column; }
.shell-navigation[data-mode='sidebar'] :deep(.shell-nav-control), .shell-navigation[data-mode='sheet'] :deep(.shell-nav-control) { padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3); }
.shell-navigation[data-mode='sidebar'] :deep(.a-control-label), .shell-navigation[data-mode='sheet'] :deep(.a-control-label) { flex-direction: row; justify-content: flex-start; gap: calc(var(--spacing) * 3); font-size: var(--text-body-md); text-align: left; }
.shell-navigation[data-mode='sidebar'] .shell-nav-symbol, .shell-navigation[data-mode='sheet'] .shell-nav-symbol { min-width: 0; flex-shrink: 0; }
.shell-navigation[data-mode='sidebar'] .shell-nav-symbol > svg, .shell-navigation[data-mode='sheet'] .shell-nav-symbol > svg { width: var(--icon-md); height: var(--icon-md); }
.shell-navigation[data-mode='sidebar'] .shell-nav-label, .shell-navigation[data-mode='sheet'] .shell-nav-label { flex: 1; min-width: 0; }
.shell-navigation[data-mode='sidebar'] :deep(.shell-nav-control[data-active='true']), .shell-navigation[data-mode='sheet'] :deep(.shell-nav-control[data-active='true']) { background: var(--color-primary-subtle); }
.shell-navigation[data-mode='sidebar'] .shell-nav-badge, .shell-navigation[data-mode='sheet'] .shell-nav-badge { position: static; }
.shell-nav-group[data-group='footer'] { border-top: 1px solid var(--color-border); padding-top: calc(var(--spacing) * 4); }
</style>
