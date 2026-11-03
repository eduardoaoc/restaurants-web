<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'
import { type TableDraft, validateTableDraft } from './editor-validation'
import TableConfigFields from './TableConfigFields.vue'
import { defaultShapeForSeats, suggestTableNumber } from './table-defaults'
import { type TableFormState, draftFromForm } from './table-form'

/**
 * "Agregar mesa": number (suggested), shape and capacity. The shape follows
 * the capacity until the person picks one themselves.
 */
const props = defineProps<{
  tables: RestaurantTableConfig[]
  /** Set by the owner of the layout when placing fails (e.g. no free space). */
  error?: string | null
}>()
const emit = defineEmits<{ create: [draft: TableDraft]; cancel: [] }>()

const form = ref<TableFormState>({
  number: String(suggestTableNumber(props.tables)),
  shape: defaultShapeForSeats(4),
  seatsChoice: '4',
  customSeats: '4',
})
const shapePicked = ref(false)

const draft = computed(() => draftFromForm(form.value))
const issues = computed(() => validateTableDraft(draft.value, props.tables))

// Capacity suggests a shape, unless the person already chose one.
watch(() => draft.value.seats, (seats) => {
  if (!shapePicked.value && Number.isInteger(seats) && seats >= 1) {
    form.value = { ...form.value, shape: defaultShapeForSeats(seats) }
  }
})
</script>

<template>
  <form
    class="add-panel"
    aria-label="Agregar mesa"
    @submit.prevent="issues.length === 0 && emit('create', draft)"
  >
    <h2 class="add-panel__title">
      Agregar mesa
    </h2>
    <TableConfigFields
      v-model="form"
      @shape-picked="shapePicked = true"
    />
    <p
      v-for="found in issues"
      :key="found.code"
      class="add-panel__error"
      role="alert"
    >
      {{ found.message }}
    </p>
    <p
      v-if="error"
      class="add-panel__error"
      role="alert"
    >
      {{ error }}
    </p>
    <div class="add-panel__actions">
      <button
        type="submit"
        class="add-panel__button add-panel__button--primary"
        :disabled="issues.length > 0"
      >
        Agregar
      </button>
      <button
        type="button"
        class="add-panel__button"
        @click="emit('cancel')"
      >
        Cancelar
      </button>
    </div>
  </form>
</template>

<style scoped>
.add-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid #343434;
  border-radius: 14px;
  background: rgb(23 24 28 / 0.92);
  color: #f2eae3;
}

.add-panel__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.add-panel__error {
  margin: 0;
  color: #ffb4a8;
  font-size: 12px;
}

.add-panel__actions {
  display: flex;
  gap: 8px;
}

.add-panel__button {
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid #343434;
  border-radius: 12px;
  background: rgb(242 234 227 / 0.08);
  color: inherit;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.add-panel__button--primary {
  background: rgb(242 234 227 / 0.18);
  font-weight: 600;
}

.add-panel__button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.add-panel__button:focus-visible {
  outline: 2px solid #f2eae3;
  outline-offset: 2px;
}
</style>
