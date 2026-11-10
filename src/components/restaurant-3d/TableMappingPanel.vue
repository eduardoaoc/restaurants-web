<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'
import { hasCapacityMismatch, tableMappingState } from './table-mapping'
import type { BackendTableOption } from './table-mapping'

const props = defineProps<{
  table: RestaurantTableConfig
  layoutTables: readonly RestaurantTableConfig[]
  backendTables: readonly BackendTableOption[]
  restaurantId: number
  loading?: boolean
  loadError?: string | null
}>()
const emit = defineEmits<{ map: [backendTableId: number | null] }>()
const { t } = useI18n()
const search = ref('')
const selectedId = computed(() => props.table.backendTableId == null ? '' : String(props.table.backendTableId))
const currentBackendTable = computed(() => props.backendTables.find((candidate) => candidate.id === props.table.backendTableId) ?? null)
const currentState = computed(() => props.loading || props.loadError
  ? (props.table.backendTableId == null ? 'unmapped' : 'mapped')
  : tableMappingState(props.table, props.layoutTables, props.backendTables, props.restaurantId))
const assignedElsewhere = computed(() => new Set(
  props.layoutTables.filter((table) => table.id !== props.table.id && table.backendTableId != null).map((table) => table.backendTableId!),
))
const visibleTables = computed(() => props.backendTables
  .filter((candidate) => {
    const query = search.value.trim().toLocaleLowerCase()
    return candidate.id === props.table.backendTableId || !query || `${candidate.number ?? ''} ${candidate.name} ${candidate.capacity ?? ''}`.toLocaleLowerCase().includes(query)
  })
  .slice()
  .sort((a, b) => (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name)))

watch(() => props.table.id, () => { search.value = '' })

function onSelect(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  emit('map', value === '' ? null : Number(value))
}

function tableLabel(table: BackendTableOption): string {
  const availability = assignedElsewhere.value.has(table.id)
    ? t('floorLayout.mapping.assigned')
    : t('floorLayout.mapping.available')
  const capacity = table.capacity === null
    ? t('floorLayout.mapping.capacityUnknown')
    : t('floorLayout.mapping.capacity', { count: table.capacity })
  return `${table.number === null ? table.name : t('floorLayout.mapping.backendNumber', { number: table.number })} · ${table.name} · ${capacity} · ${availability}`
}
</script>

<template>
  <section class="mapping-panel" :aria-labelledby="`mapping-title-${table.id}`">
    <h3 :id="`mapping-title-${table.id}`" class="mapping-panel__title">
      {{ t('floorLayout.mapping.title') }}
    </h3>
    <p class="mapping-panel__copy">{{ t('floorLayout.mapping.visualIdentity', { number: table.number, shape: t(`floorLayout.mapping.shape.${table.shape}`), capacity: table.seats, rotation: table.rotation }) }}</p>

    <label class="mapping-panel__label" :for="`mapping-search-${table.id}`">
      {{ t('floorLayout.mapping.search') }}
    </label>
    <input
      :id="`mapping-search-${table.id}`"
      v-model="search"
      class="mapping-panel__input"
      type="search"
      :placeholder="t('floorLayout.mapping.searchPlaceholder')"
      autocomplete="off"
    >

    <label class="mapping-panel__label" :for="`mapping-select-${table.id}`">
      {{ t('floorLayout.mapping.backendAssociation') }}
    </label>
    <select
      :id="`mapping-select-${table.id}`"
      class="mapping-panel__select"
      :value="selectedId"
      :disabled="loading || !!loadError"
      :aria-describedby="`mapping-help-${table.id}`"
      @change="onSelect"
    >
      <option value="">{{ t('floorLayout.mapping.unlinked') }}</option>
      <option
        v-if="table.backendTableId != null && !currentBackendTable"
        :value="String(table.backendTableId)"
        disabled
      >{{ t('floorLayout.mapping.missingTable', { id: table.backendTableId }) }}</option>
      <option
        v-for="candidate in visibleTables"
        :key="candidate.id"
        :value="String(candidate.id)"
        :disabled="assignedElsewhere.has(candidate.id)"
      >{{ tableLabel(candidate) }}</option>
    </select>
    <p :id="`mapping-help-${table.id}`" class="mapping-panel__help">
      {{ loading ? t('floorLayout.mapping.loading') : loadError || t('floorLayout.mapping.explicitOnly') }}
    </p>
    <p v-if="!loading && !loadError && visibleTables.length === 0" class="mapping-panel__help" role="status">
      {{ backendTables.length === 0 ? t('floorLayout.mapping.noTables') : t('floorLayout.mapping.noMatches') }}
    </p>

    <p v-if="currentState === 'missing'" class="mapping-panel__warning" role="alert">
      {{ t('floorLayout.mapping.missingWarning') }}
    </p>
    <p v-else-if="currentState === 'conflict'" class="mapping-panel__warning" role="alert">
      {{ t('floorLayout.mapping.conflictWarning') }}
    </p>
    <p v-else-if="currentBackendTable && hasCapacityMismatch(table, currentBackendTable)" class="mapping-panel__warning" role="status">
      {{ t('floorLayout.mapping.capacityMismatch', { visual: table.seats, backend: currentBackendTable.capacity }) }}
    </p>
    <p v-else class="mapping-panel__state" role="status">
      {{ currentState === 'mapped' ? t('floorLayout.mapping.mapped') : t('floorLayout.mapping.unmapped') }}
    </p>
  </section>
</template>

<style scoped>
.mapping-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  width: min(100%, 30rem);
  padding-top: 10px;
  border-top: 1px solid rgb(242 234 227 / 0.18);
}

.mapping-panel__title { margin: 0; font-size: 14px; font-weight: 600; }
.mapping-panel__copy, .mapping-panel__help, .mapping-panel__state, .mapping-panel__warning { margin: 0; font-size: 12px; line-height: 1.4; }
.mapping-panel__copy, .mapping-panel__help { color: rgb(242 234 227 / 0.72); }
.mapping-panel__label { font-size: 12px; font-weight: 600; }
.mapping-panel__input, .mapping-panel__select {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: 10px;
  background: var(--md-sys-color-surface-container-lowest);
  color: var(--md-sys-color-on-surface);
  font: inherit;
}
.mapping-panel__input:focus-visible, .mapping-panel__select:focus-visible { outline: 2px solid var(--md-sys-color-primary); outline-offset: 2px; }
.mapping-panel__warning { color: #ffe1a3; }
.mapping-panel__state { color: rgb(242 234 227 / 0.72); }
@media (max-width: 640px) {
  .mapping-panel { width: 100%; }
}
</style>
