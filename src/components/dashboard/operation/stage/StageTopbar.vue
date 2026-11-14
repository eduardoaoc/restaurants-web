<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowsClockwise, PhCalendarCheck, PhCalendarX, PhChartBar, PhWifiHigh, PhWifiSlash } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import AIconButton from '@/components/ui/AIconButton.vue'
import { SHELL_TOPBAR_CENTER_ID, SHELL_TOPBAR_TRAILING_ID } from '@/composables/useShellStage'
import type { RealtimeConnectionState } from '@/types/realtime'

const props = defineProps<{
  floorView: 'plan' | '3d'
  /** The full-bleed 3D stage is on screen: the bar also carries status, clock, refresh and the analytics link. */
  stage: boolean
  dayState: { open: boolean; label: string } | null
  connectionState?: RealtimeConnectionState
  refreshing?: boolean
  canRefresh?: boolean
  canViewReports?: boolean
  timezone: string
}>()
const emit = defineEmits<{ 'update:floorView': ['plan' | '3d']; refresh: [] }>()
const { t, locale } = useI18n()

// The bar belongs to the shell; this page only lends it its controls. Without the shell's targets (legacy shell) the
// same controls render in place, so the selector is never lost.
const targetsReady = ref(false)
const attached = ref(false)
onMounted(() => {
  targetsReady.value = !!document.getElementById(SHELL_TOPBAR_CENTER_ID) && !!document.getElementById(SHELL_TOPBAR_TRAILING_ID)
  attached.value = true
})

const now = ref(Date.now())
const timer = window.setInterval(() => { now.value = Date.now() }, 30_000)
onBeforeUnmount(() => window.clearInterval(timer))
/** The restaurant's own clock, never the browser's. */
const clock = computed(() => {
  try {
    return new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit', timeZone: props.timezone }).format(now.value)
  } catch {
    return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(now.value)
  }
})
const live = computed(() => props.connectionState === 'connected' && !props.refreshing)
const connectionLabel = computed(() => t(`operations.connection.${props.refreshing ? 'refreshing' : props.connectionState ?? 'unavailable'}`))

const views = computed(() => [
  { id: 'plan' as const, label: t('operations.board.floor.planView') },
  { id: '3d' as const, label: '3D' },
])
// Arrow keys move between the two options (roving tabindex), like a radio group.
function onKey(event: KeyboardEvent): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const next = event.key === 'ArrowLeft' || event.key === 'Home' ? 'plan' : '3d'
  emit('update:floorView', next)
  const group = (event.currentTarget as HTMLElement)
  requestAnimationFrame(() => group.querySelector<HTMLElement>(`[data-view="${next}"]`)?.focus())
}
</script>

<template>
  <template v-if="attached">
    <Teleport v-if="stage" :to="`#${SHELL_TOPBAR_CENTER_ID}`" :disabled="!targetsReady">
      <div class="stage-status hidden min-w-0 items-center gap-4 text-body-sm md:flex" :class="targetsReady ? '' : '!flex flex-wrap py-1'" role="status">
        <span v-if="dayState" class="inline-flex min-w-0 items-center gap-1.5 font-medium" :class="dayState.open ? 'text-fg' : 'text-warning'">
          <component :is="dayState.open ? PhCalendarCheck : PhCalendarX" :size="16" aria-hidden="true" />
          <span class="truncate">{{ dayState.label }}</span>
        </span>
        <span class="inline-flex items-center gap-1.5 text-fg-muted">
          <component :is="live ? PhWifiHigh : PhWifiSlash" :size="16" :class="live ? 'text-success' : 'text-warning'" aria-hidden="true" />
          {{ connectionLabel }}
        </span>
        <time class="tabular-nums font-semibold text-fg" :aria-label="t('operations.board.stage.clock')">{{ clock }}</time>
      </div>
    </Teleport>

    <Teleport :to="`#${SHELL_TOPBAR_TRAILING_ID}`" :disabled="!targetsReady">
      <div class="flex items-center gap-2">
        <AIconButton v-if="stage && canRefresh" :label="t('operations.quickActions.refresh')" :loading="refreshing" @click="emit('refresh')"><PhArrowsClockwise /></AIconButton>
        <AButton v-if="stage && canViewReports" as="RouterLink" :to="{ name: 'app-dashboard-analytics' }" variant="ghost" size="sm" class="hidden lg:inline-flex">
          <template #leading><PhChartBar /></template>{{ t('operations.tabs.analysis') }}
        </AButton>
        <div class="flex gap-1 rounded-saloa-md bg-surface-subtle p-1" role="radiogroup" :aria-label="t('operations.board.floor.viewLabel')" @keydown="onKey">
          <button
            v-for="view in views"
            :key="view.id"
            type="button"
            role="radio"
            :data-view="view.id"
            :aria-checked="floorView === view.id"
            :tabindex="floorView === view.id ? 0 : -1"
            class="stage-view-option min-h-10 min-w-12 rounded-saloa-sm px-3 text-label-lg font-medium transition-colors duration-fast ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            :class="floorView === view.id ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg'"
            @click="emit('update:floorView', view.id)"
          >{{ view.label }}</button>
        </div>
      </div>
    </Teleport>
  </template>
</template>
