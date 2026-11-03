<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { PhArrowClockwise, PhArrowCounterClockwise } from '@phosphor-icons/vue'
import type { RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'
import type { TableDraft } from './editor-validation'
import TableConfigFields from './TableConfigFields.vue'
import { type TableFormState, draftFromForm, formFromTable } from './table-form'

/**
 * Selected-table panel: number, shape and capacity (applied as each field is
 * committed), position and rotation readouts, rotate, duplicate and delete
 * (which asks first). Lab-local Spanish copy, like the rest of the lab's UI.
 */
const props = defineProps<{
  table: RestaurantTableConfig
  /** Why the last edit was refused, if it was. */
  error?: string | null
}>()
const emit = defineEmits<{
  rotate: [direction: 1 | -1]
  update: [patch: Partial<TableDraft>]
  duplicate: []
  remove: []
}>()

const title = computed(() => `Mesa ${String(props.table.number).padStart(2, '0')}`)
const metres = (value: number) => value.toFixed(2)

const form = ref<TableFormState>(formFromTable(props.table))
const confirmingDelete = ref(false)

const syncForm = () => {
  form.value = formFromTable(props.table)
}
// Another table, or an edit applied elsewhere (rotate, undo of a refused change).
watch(() => [props.table.id, props.table.number, props.table.shape, props.table.seats], () => {
  syncForm()
  confirmingDelete.value = false
})

/** Sends only what differs; if the layout refuses, the fields snap back to the real values. */
async function commit(): Promise<void> {
  const next = draftFromForm(form.value)
  const patch: Partial<TableDraft> = {}
  if (!Object.is(next.number, props.table.number)) patch.number = next.number
  if (next.shape !== props.table.shape) patch.shape = next.shape
  if (!Object.is(next.seats, props.table.seats)) patch.seats = next.seats
  if (Object.keys(patch).length === 0) return
  emit('update', patch)
  await nextTick()
  syncForm()
}
</script>

<template>
  <section
    class="editor-toolbar"
    aria-label="Editor de mesa"
  >
    <h2 class="editor-toolbar__title">
      {{ title }}
    </h2>

    <TableConfigFields
      v-model="form"
      @commit="commit"
    />

    <dl class="editor-toolbar__readout">
      <div>
        <dt>Posición</dt>
        <dd>X: {{ metres(table.position.x) }} · Z: {{ metres(table.position.z) }}</dd>
      </div>
      <div>
        <dt>Rotación</dt>
        <dd>{{ table.rotation }}°</dd>
      </div>
    </dl>

    <div class="editor-toolbar__actions">
      <button
        type="button"
        class="editor-toolbar__icon"
        aria-label="Girar a la izquierda"
        @click="emit('rotate', -1)"
      >
        <PhArrowCounterClockwise
          :size="20"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        class="editor-toolbar__icon"
        aria-label="Girar a la derecha"
        @click="emit('rotate', 1)"
      >
        <PhArrowClockwise
          :size="20"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        class="editor-toolbar__button"
        @click="emit('duplicate')"
      >
        Duplicar
      </button>
      <button
        v-if="!confirmingDelete"
        type="button"
        class="editor-toolbar__button editor-toolbar__button--danger"
        @click="confirmingDelete = true"
      >
        Eliminar mesa
      </button>
    </div>

    <div
      v-if="confirmingDelete"
      class="editor-toolbar__confirm"
      role="alertdialog"
      :aria-label="`Eliminar ${title}`"
    >
      <span>¿Eliminar {{ title }}? Se quitará del salón.</span>
      <button
        type="button"
        class="editor-toolbar__button editor-toolbar__button--danger"
        @click="emit('remove')"
      >
        Eliminar
      </button>
      <button
        type="button"
        class="editor-toolbar__button"
        @click="confirmingDelete = false"
      >
        Cancelar
      </button>
    </div>

    <p
      v-if="error"
      class="editor-toolbar__error"
      role="alert"
    >
      {{ error }}
    </p>
  </section>
</template>

<style scoped>
.editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 20px;
  padding: 10px 14px;
  border: 1px solid #343434;
  border-radius: 14px;
  max-width: min(100%, 46rem);
  background: rgb(23 24 28 / 0.92);
  color: #f2eae3;
}

.editor-toolbar__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.editor-toolbar__readout {
  display: flex;
  gap: 20px;
  margin: 0;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.editor-toolbar__readout dt {
  color: rgb(242 234 227 / 0.6);
}

.editor-toolbar__readout dd {
  margin: 0;
}

.editor-toolbar__actions {
  display: flex;
  gap: 8px;
}

.editor-toolbar__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 1px solid #343434;
  border-radius: 12px;
  background: rgb(242 234 227 / 0.08);
  color: inherit;
  cursor: pointer;
}

.editor-toolbar__icon:hover {
  background: rgb(242 234 227 / 0.16);
}

.editor-toolbar__icon:focus-visible {
  outline: 2px solid #f2eae3;
  outline-offset: 2px;
}
.editor-toolbar__button {
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid #343434;
  border-radius: 12px;
  background: rgb(242 234 227 / 0.08);
  color: inherit;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.editor-toolbar__button:hover {
  background: rgb(242 234 227 / 0.16);
}

.editor-toolbar__button:focus-visible {
  outline: 2px solid #f2eae3;
  outline-offset: 2px;
}

.editor-toolbar__button--danger {
  color: #ffb4a8;
}

.editor-toolbar__confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: 100%;
  font-size: 13px;
}

.editor-toolbar__error {
  width: 100%;
  margin: 0;
  color: #ffb4a8;
  font-size: 12px;
}
</style>
