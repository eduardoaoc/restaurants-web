<script setup lang="ts">
import { useId } from 'vue'
import type { RestaurantTableShape } from '@/types/restaurant-3d/restaurant-layout'
import { CAPACITY_LIMITS, TABLE_SHAPES } from './editor-validation'
import { CAPACITY_PRESETS } from './table-defaults'
import type { SeatsChoice, TableFormState } from './table-form'

/**
 * Number / shape / capacity inputs, shared by the add panel and the selected
 * table's toolbar. Presentational: it edits the form state and reports
 * `commit` when a field is done changing; rules live in editor-validation.
 */
const form = defineModel<TableFormState>({ required: true })
defineEmits<{
  commit: []
  /** The person picked a shape themselves (stops automatic shape suggestions). */
  'shape-picked': []
}>()

const id = useId()
const SHAPE_LABELS: Record<RestaurantTableShape, string> = {
  round: 'Redonda',
  square: 'Cuadrada',
  rectangular: 'Rectangular',
}

function pickSeats(choice: SeatsChoice, commit: () => void): void {
  form.value = { ...form.value, seatsChoice: choice }
  // A preset applies right away; "Personalizada" waits for the number.
  if (choice !== 'custom') commit()
}
</script>

<template>
  <div class="fields">
    <label class="field">
      <span class="field__label">Número</span>
      <input
        v-model="form.number"
        class="field__input"
        type="number"
        inputmode="numeric"
        min="1"
        step="1"
        @change="$emit('commit')"
      >
    </label>

    <label class="field">
      <span class="field__label">Forma</span>
      <select
        :value="form.shape"
        class="field__input"
        @change="form = { ...form, shape: ($event.target as HTMLSelectElement).value as RestaurantTableShape }; $emit('shape-picked'); $emit('commit')"
      >
        <option
          v-for="shape in TABLE_SHAPES"
          :key="shape"
          :value="shape"
        >
          {{ SHAPE_LABELS[shape] }}
        </option>
      </select>
    </label>

    <label class="field">
      <span class="field__label">Lugares</span>
      <select
        :value="form.seatsChoice"
        class="field__input"
        @change="pickSeats(($event.target as HTMLSelectElement).value as SeatsChoice, () => $emit('commit'))"
      >
        <option
          v-for="seats in CAPACITY_PRESETS"
          :key="seats"
          :value="String(seats)"
        >
          {{ seats }}
        </option>
        <option value="custom">
          Personalizada
        </option>
      </select>
    </label>

    <label
      v-if="form.seatsChoice === 'custom'"
      class="field"
    >
      <span
        :id="`${id}-custom`"
        class="field__label"
      >Lugares ({{ CAPACITY_LIMITS.min }}–{{ CAPACITY_LIMITS.max }})</span>
      <input
        v-model="form.customSeats"
        class="field__input"
        type="number"
        inputmode="numeric"
        :min="CAPACITY_LIMITS.min"
        :max="CAPACITY_LIMITS.max"
        step="1"
        :aria-labelledby="`${id}-custom`"
        @change="$emit('commit')"
      >
    </label>
  </div>
</template>

<style scoped>
.fields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}

.field__label {
  color: rgb(242 234 227 / 0.6);
}

.field__input {
  min-height: 44px;
  width: 8.5rem;
  padding: 0 10px;
  border: 1px solid #343434;
  border-radius: 10px;
  background: rgb(242 234 227 / 0.08);
  color: #f2eae3;
  font: inherit;
  font-size: 14px;
}

.field__input:focus-visible {
  outline: 2px solid #f2eae3;
  outline-offset: 2px;
}

.field__input option {
  color: #17181c;
}
</style>
