<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import AButton from '@/components/ui/AButton.vue'
import ASnackbar from '@/components/ui/ASnackbar.vue'
import RestaurantScene from '@/components/restaurant-3d/RestaurantScene.vue'
import type { RestaurantSceneMode } from '@/components/restaurant-3d/scene-mode'
import { useRestaurantFloorLayout } from '@/composables/useRestaurantFloorLayout'
import { useRestaurantTableCatalog } from '@/composables/useRestaurantTableCatalog'
import { useRestaurantOperations } from '@/composables/useRestaurantOperations'
import { useRestaurantRealtime } from '@/composables/useRestaurantRealtime'
import { usePermissions } from '@/composables/usePermissions'
import { FloorLayoutConflictError, floorLayoutService } from '@/services/floor-layout.service'
import { decideLayoutReconcile } from '@/components/restaurant-3d/layout-revision'
import { useRestaurantStore } from '@/stores/restaurant'
import { describeApiError } from '@/utils/error-message'
import type { RestaurantLayoutDocument } from '@/types/restaurant-3d/restaurant-layout'

const modes: { value: RestaurantSceneMode; label: string }[] = [
  { value: 'operation', label: 'Operación' },
  { value: 'edit', label: 'Editar salón' },
]
const mode = ref<RestaurantSceneMode>('operation')

const { t } = useI18n()
const restaurantStore = useRestaurantStore()
const route = useRoute()
const { can } = usePermissions()
const canEditLayout = computed(() => can('manage_floor_plan'))

// Development only: `?source=mock` shows the seven-table mock, never persisted.
const useMock = import.meta.env.DEV && route.query.source === 'mock'
// Ultimate assets are served only by the local Vite dev middleware. Keep the
// distributable scene KayKit until the Ultimate license is cleared.
const environment = computed(() => import.meta.env.DEV && route.query.environment === 'ultimate' ? 'ultimate' : 'kaykit')

// The restaurant list may not be loaded when this route is opened directly.
onMounted(() => void restaurantStore.load())

const restaurantId = computed(() => (useMock ? null : restaurantStore.currentRestaurantId))
const { state, layout, error, revision, reload } = useRestaurantFloorLayout(restaurantId)
const catalogEnabled = computed(() => canEditLayout.value && mode.value === 'edit' && !useMock)
const tableCatalog = useRestaurantTableCatalog(restaurantId, catalogEnabled)
const tableCatalogError = computed(() => {
  const error = tableCatalog.error.value
  if (!error) return null
  const fieldErrors = error.fieldErrors
    ? Object.fromEntries(Object.entries(error.fieldErrors).map(([field, messages]) => [field, [...messages]]))
    : undefined
  return describeApiError({ ...error, fieldErrors }, t)
})
const visibleModes = computed(() => modes.filter(option => option.value !== 'edit' || canEditLayout.value))
watch(canEditLayout, allowed => { if (!allowed && mode.value === 'edit') mode.value = 'operation' })
const canViewOperations = computed(() => can('view_operations'))
const operations = useRestaurantOperations(() => canViewOperations.value)
const operationsSnapshot = computed(() => operations.snapshot.value)
const operationsLoading = computed(() => operations.loading.value)
const operationsError = computed(() => operations.error.value)
const editorDirty = ref(false)
const editorSaving = ref(false)
/**
 * The server revision of the 3D layout this editor last loaded or saved. Every save sends it as `expected_revision`;
 * the server, not this client, decides whether it is still current.
 */
const confirmedRevision = ref(0)
watch(layout, value => { if (value) confirmedRevision.value = value.revision ?? 0 })
/**
 * The draft is based on a revision that is no longer current (a save returned 409, or a newer revision was seen while
 * the draft had edits). Saving stays blocked until the latest layout has been loaded: keeping the draft never bypasses
 * the server's check, it only lets the person look at it.
 */
const staleDraft = ref(false)
/** The conflict notice still offers both choices (false once "keep my draft" was chosen). */
const conflictUnacknowledged = ref(false)
let layoutRefreshForRestaurant: number | null = null
let pendingReconcile = false
let reconcileGeneration = 0

function markStale(): void {
  staleDraft.value = true
  conflictUnacknowledged.value = true
}

/** Looks at the server's revision (never remounts the scene by itself) and acts on `decideLayoutReconcile`. */
async function reconcileLayout(): Promise<void> {
  const id = restaurantId.value
  if (id === null || useMock) return
  const generation = ++reconcileGeneration
  let remoteRevision: number
  try {
    remoteRevision = (await floorLayoutService.get(id))?.revision ?? 0
  } catch {
    return // transport / auth problems surface through the normal load and retry paths
  }
  if (generation !== reconcileGeneration || id !== restaurantId.value) return
  const action = decideLayoutReconcile({
    remoteRevision,
    confirmedRevision: confirmedRevision.value,
    dirty: editorDirty.value,
    saving: editorSaving.value,
  })
  if (action === 'defer') pendingReconcile = true
  else if (action === 'conflict') markStale()
  else if (action === 'reload') await reload()
}

const realtime = useRestaurantRealtime(
  () => restaurantId.value,
  () => canViewOperations.value && state.value === 'ready' && !operations.loading.value,
  { refresh: async () => {
    await operations.refetch()
    if (layoutRefreshForRestaurant === restaurantId.value) {
      layoutRefreshForRestaurant = null
      await reconcileLayout()
    }
    return [operations.refreshError.value]
  } },
)
watch(realtime.lastEvent, event => {
  if (event?.name === 'floor_plan.updated') layoutRefreshForRestaurant = event.restaurant_id
})
watch(restaurantId, () => {
  layoutRefreshForRestaurant = null
  pendingReconcile = false
  reconcileGeneration++
  staleDraft.value = false
  conflictUnacknowledged.value = false
  editorDirty.value = false
  editorSaving.value = false
})
// An event that arrived during a save is looked at once the save settles, instead of being dismissed as its echo.
watch(editorSaving, saving => {
  if (!saving && pendingReconcile) {
    pendingReconcile = false
    void reconcileLayout()
  }
})
// The draft was discarded: if it was stale, bring in the latest layout so the next edit starts from the server's revision.
watch(editorDirty, dirty => {
  if (!dirty && staleDraft.value) void loadRemoteLayout()
})
async function loadRemoteLayout(): Promise<void> {
  staleDraft.value = false
  conflictUnacknowledged.value = false
  await reload() // remounts the scene from the server copy, dropping the local draft
}
const keepLocalDraft = () => { conflictUnacknowledged.value = false }

const saveLayout = async (document: RestaurantLayoutDocument) => {
  const id = restaurantId.value
  if (id === null) throw new Error('No restaurant selected')
  try {
    const saved = await floorLayoutService.replace(id, document, confirmedRevision.value)
    if (id === restaurantId.value) confirmedRevision.value = saved.revision ?? confirmedRevision.value
    return saved
  } catch (cause) {
    if (cause instanceof FloorLayoutConflictError && id === restaurantId.value) markStale()
    throw cause
  }
}
const retry = async () => { await Promise.all([reload(), operations.refetch()]) }
</script>

<template>
  <main class="restaurant-3d-lab">
    <header class="lab-header">
      <div>
        <span class="eyebrow">Ritma OS</span>
        <h1>3D Restaurant Lab</h1>
      </div>

      <div
        class="mode-switch"
        role="group"
        aria-label="Modo de la escena"
      >
        <button
          v-for="option in visibleModes"
          :key="option.value"
          type="button"
          class="mode-switch__option"
          :aria-pressed="mode === option.value"
          @click="mode = option.value"
        >
          {{ option.label }}
        </button>
      </div>

      <span class="experimental">
        Experimental
      </span>
    </header>

    <div v-if="staleDraft" class="lab-conflict" role="alert">
      <p>{{ conflictUnacknowledged ? t('floorLayout.conflict.message') : t('floorLayout.conflict.keptMessage') }}</p>
      <div class="lab-conflict__actions">
        <AButton variant="primary" @click="loadRemoteLayout">{{ t('floorLayout.conflict.reload') }}</AButton>
        <AButton v-if="conflictUnacknowledged" variant="secondary" @click="keepLocalDraft">{{ t('floorLayout.conflict.keep') }}</AButton>
      </div>
    </div>
    <RestaurantScene
      v-if="useMock"
      :mode="mode"
      :environment="environment"
    />
    <p
      v-else-if="!restaurantStore.loading && restaurantId === null"
      class="lab-status"
      role="status"
    >
      {{ t('floorLayout.noRestaurant') }}
    </p>
    <p
      v-else-if="state === 'loading' || state === 'idle'"
      class="lab-status"
      role="status"
    >
      {{ t('floorLayout.loading') }}
    </p>
    <p v-else-if="!canViewOperations" class="lab-status" role="alert">
      {{ t('operationsLive.noPermission') }}
    </p>
    <p v-else-if="operationsLoading || (!operationsSnapshot && !operationsError)" class="lab-status" role="status">
      {{ t('operationsLive.loading') }}
    </p>
    <div
      v-else-if="state === 'error' || (!operationsSnapshot && operationsError)"
      class="lab-status"
      role="alert"
    >
      <p>{{ t('operationsLive.loadFailed') }} {{ error ? describeApiError(error, t) : operationsError ? describeApiError(operationsError, t) : '' }}</p>
      <button
        type="button"
        class="mode-switch__option lab-retry"
        @click="retry"
      >
        {{ t('floorLayout.retry') }}
      </button>
    </div>
    <RestaurantScene
      v-else-if="layout && operationsSnapshot"
      :key="`${restaurantId}-${revision}`"
      :mode="mode"
      :environment="environment"
      :layout="layout"
      :operations-snapshot="operationsSnapshot"
      :restaurant-id="restaurantId"
      :backend-tables="tableCatalog.tables.value"
      :mapping-loading="tableCatalog.state.value === 'loading'"
      :mapping-load-error="tableCatalogError"
      :operational-events="[]"
      :save="saveLayout"
      :save-blocked="staleDraft"
      @dirty-change="editorDirty = $event"
      @saving-change="editorSaving = $event"
      @refresh-operational-data="operations.refetch"
    />
    <ASnackbar />
  </main>
</template>

<style scoped>
.restaurant-3d-lab {
  min-height: 100vh;
  padding: 24px;
  background: #0f0f10;
  color: #ffffff;
}

.lab-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  margin-bottom: 20px;
}
.lab-header > div:first-child { min-width: 0; }

.eyebrow {
  display: block;
  margin-bottom: 4px;
  font-size: 13px;
  opacity: 0.55;
}

h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

@media (max-width: 640px) {
  .restaurant-3d-lab { padding: 16px; }
  h1 { font-size: 20px; }
  .mode-switch { margin-left: 0; }
}

.mode-switch {
  display: inline-flex;
  margin-left: auto;
  padding: 3px;
  border: 1px solid #343434;
  border-radius: 999px;
}

.mode-switch__option {
  min-height: 44px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
}

.mode-switch__option[aria-pressed='true'] {
  background: rgb(242 234 227 / 0.14);
  font-weight: 600;
}

.mode-switch__option:focus-visible {
  outline: 2px solid #f2eae3;
  outline-offset: 2px;
}

.lab-status {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 12px;
  min-height: 320px;
  border: 1px dashed #343434;
  border-radius: 12px;
  text-align: center;
}

.lab-conflict {
  display: grid;
  gap: 8px;
  margin: 0 0 12px;
  padding: 12px 14px;
  border: 1px solid #8a5a1f;
  border-radius: 12px;
  background: rgb(60 40 10 / 0.6);
  color: #ffe1a3;
  font-size: 13px;
}
.lab-conflict p { margin: 0; }
.lab-conflict__actions { display: flex; flex-wrap: wrap; gap: 8px; }
.lab-retry {
  border: 1px solid #343434;
}

.experimental {
  white-space: nowrap;
  padding: 6px 10px;
  border: 1px solid #343434;
  border-radius: 999px;
  font-size: 12px;
  opacity: 0.7;
}
</style>
