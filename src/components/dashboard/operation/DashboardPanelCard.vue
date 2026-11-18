<script setup lang="ts">
import { PhCaretDown, PhDotsSixVertical, PhDotsThreeVertical, PhX } from '@phosphor-icons/vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  panelId: 'kitchen' | 'activity' | 'staff'
  title: string
  collapsed: boolean
  column: 'left' | 'right'
  showMoveUp: boolean
  showMoveDown: boolean
  dragActive: boolean
}>()

const emit = defineEmits<{
  collapse: []
  close: []
  move: [direction: 'up' | 'down' | 'left' | 'right']
  dragstart: [event: DragEvent, panelId: string]
  dragend: []
}>()

const { t } = useI18n()
</script>

<template>
  <section
    class="dashboard-panel-card flex min-w-0 flex-col overflow-hidden rounded-saloa-lg border border-hairline bg-surface shadow-raised"
    :class="{ 'dashboard-panel-card--dragging': dragActive }"
    :data-panel="panelId"
    :aria-labelledby="`dashboard-${panelId}-title`"
  >
    <header class="flex min-w-0 items-center gap-1 border-b border-hairline px-3 py-2">
      <button
        type="button"
        draggable="true"
        class="inline-flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-saloa-sm text-fg-muted hover:bg-surface-subtle hover:text-fg active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        :aria-label="t('operations.board.panels.drag', { title })"
        :title="t('operations.board.panels.drag', { title })"
        @dragstart="emit('dragstart', $event, panelId)"
        @dragend="emit('dragend')"
      >
        <PhDotsSixVertical :size="18" aria-hidden="true" />
      </button>
      <h2 :id="`dashboard-${panelId}-title`" class="min-w-0 flex-1 break-words text-component-title font-semibold leading-tight text-fg">{{ title }}</h2>
      <slot name="actions" />
      <details class="relative">
        <summary
          class="inline-flex size-11 cursor-pointer list-none items-center justify-center rounded-saloa-sm text-fg-muted hover:bg-surface-subtle hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden"
          :aria-label="t('operations.board.panels.positionMenu', { title })"
          :title="t('operations.board.panels.positionMenu', { title })"
        >
          <PhDotsThreeVertical :size="20" aria-hidden="true" />
        </summary>
        <div class="absolute right-0 top-full z-20 mt-1 flex min-w-48 flex-col rounded-saloa-md border border-hairline bg-surface p-1 shadow-raised">
          <button v-if="showMoveUp" type="button" class="min-h-11 rounded-saloa-sm px-3 text-left text-body-sm text-fg hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus" @click="emit('move', 'up')">{{ t('operations.board.panels.moveUp') }}</button>
          <button v-if="showMoveDown" type="button" class="min-h-11 rounded-saloa-sm px-3 text-left text-body-sm text-fg hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus" @click="emit('move', 'down')">{{ t('operations.board.panels.moveDown') }}</button>
          <button v-if="column !== 'left'" type="button" class="min-h-11 rounded-saloa-sm px-3 text-left text-body-sm text-fg hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus" @click="emit('move', 'left')">{{ t('operations.board.panels.moveLeft') }}</button>
          <button v-if="column !== 'right'" type="button" class="min-h-11 rounded-saloa-sm px-3 text-left text-body-sm text-fg hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus" @click="emit('move', 'right')">{{ t('operations.board.panels.moveRight') }}</button>
        </div>
      </details>
      <button
        type="button"
        class="inline-flex size-11 shrink-0 items-center justify-center rounded-saloa-sm text-fg-muted hover:bg-surface-subtle hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        :aria-label="collapsed ? t('operations.board.panels.expand', { title }) : t('operations.board.panels.collapse', { title })"
        :aria-expanded="!collapsed"
        @click="emit('collapse')"
      >
        <PhCaretDown :size="18" class="transition-transform duration-fast" :class="collapsed ? '-rotate-90' : ''" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="inline-flex size-11 shrink-0 items-center justify-center rounded-saloa-sm text-fg-muted hover:bg-surface-subtle hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        :aria-label="t('operations.board.panels.close', { title })"
        @click="emit('close')"
      >
        <PhX :size="18" aria-hidden="true" />
      </button>
    </header>
    <div v-if="!collapsed" class="dashboard-panel-body min-h-0 min-w-0 flex-1 overflow-auto p-4">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.dashboard-panel-card--dragging { opacity: .55; }
.dashboard-panel-body { overscroll-behavior: contain; }
</style>
