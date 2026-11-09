<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import RestaurantScene from '@/components/restaurant-3d/RestaurantScene.vue'
import type { CustomerStats } from '@/components/restaurant-3d/RestaurantCustomers.vue'
import type { RestaurantSceneMode } from '@/components/restaurant-3d/scene-mode'
import { FLOOR } from '@/components/restaurant-3d/floor'
import { guestFixture } from '@/data/restaurant-3d/guest-fixtures'
import { mockLayout } from '@/data/restaurant-3d/mock-layout'
import { mockOperationalState } from '@/data/restaurant-3d/mock-operational-state'
import type { RestaurantLayoutDocument } from '@/types/restaurant-3d/restaurant-layout'
import type { RestaurantOperationalState } from '@/types/restaurant-3d/restaurant-operations'

/**
 * DEV-ONLY fixture harness for the real RestaurantScene (public route, no auth, no API). It exists so the operational
 * floor can be exercised when the backend is unavailable: mock layout, mock or generated guests (`?guests=1|5|10|20`),
 * a configurable entrance, and a visual arrival/departure simulator. EVERY control only edits local reactive state in
 * this component; nothing is sent anywhere. `save` only echoes the document: it proves the editor's save FLOW, not the
 * backend contract. /dev/restaurant-3d is unchanged.
 */
const route = useRoute()
const modes: { value: RestaurantSceneMode; label: string }[] = [
  { value: 'operation', label: 'Operación' },
  { value: 'edit', label: 'Editar salón' },
]
const mode = ref<RestaurantSceneMode>('operation')

const guestsParam = Number(route.query.guests)
const initialState = (): RestaurantOperationalState => {
  const layout = mockLayout
  return structuredClone(
    Number.isInteger(guestsParam) && guestsParam >= 0 ? guestFixture(layout, guestsParam) : (mockOperationalState as RestaurantOperationalState),
  )
}

// A fresh clone per (re)mount, exactly like the scene expects ("read once on mount"). The state is reactive on
// purpose: the simulator edits guest records and the scene mirrors them.
const resetKey = ref(0)
const layout = ref(structuredClone(mockLayout))
const state = reactive<RestaurantOperationalState>(initialState())
const saved = ref<RestaurantLayoutDocument | null>(null)

function save(document: RestaurantLayoutDocument) {
  saved.value = structuredClone(document)
  return Promise.resolve(document)
}

// ---- simulator ---------------------------------------------------------------------------------------------------
const entrance = reactive({ x: 0, z: 6.5 })
const entranceStatus = ref<{ ok: boolean; reason?: string }>({ ok: true })
const nav = reactive({ paths: true, arrivals: true, departures: true, obstacles: false, approach: false, timeScale: 1 })
// Simulation speed: slow motion and pause only slow the SIMULATION (customers, chairs); operational state is untouched.
const speed = ref(1)
const paused = ref(false)
const targetTableId = ref(mockLayout.tables[0].id)
const stats = ref<CustomerStats | null>(null)
const failures = ref<string[]>([])
let simCounter = 0
const timers = new Set<number>()

const tableOptions = computed(() => layout.value.tables.map((t) => ({ id: t.id, label: `Mesa ${t.number} (${t.seats} · ${state[t.id]?.guests.length ?? 0})` })))
watch([speed, paused], () => { nav.timeScale = paused.value ? 0 : speed.value }, { immediate: true })

function stepSim(seconds: number) {
  const lab = (window as unknown as { __floorLab?: { step(s: number): void } }).__floorLab
  lab?.step(seconds)
}

const guestCount = computed(() => Object.values(state).reduce((n, s) => n + s.guests.length, 0))
const targetTable = computed(() => layout.value.tables.find((t) => t.id === targetTableId.value))

function record(tableId: string) {
  state[tableId] ??= { tableId, status: 'available', guests: [], occupiedAt: null }
  return state[tableId]
}

function addGuest(): boolean {
  const table = targetTable.value
  if (!table) return false
  const rec = record(table.id)
  const used = new Set(rec.guests.map((g) => g.seatIndex))
  const seatIndex = Array.from({ length: table.seats }, (_, i) => i).find((i) => !used.has(i))
  if (seatIndex === undefined) return false
  rec.guests.push({ id: `guest-sim-${++simCounter}`, seatIndex })
  rec.status = 'eating'
  rec.occupiedAt ??= new Date().toISOString()
  return true
}

function removeGuest(): boolean {
  const table = targetTable.value
  const rec = table ? state[table.id] : undefined
  if (!rec?.guests.length) return false
  rec.guests.pop()
  if (!rec.guests.length) {
    rec.status = 'available'
    rec.occupiedAt = null
  }
  return true
}

function later(ms: number, fn: () => void) {
  const id = window.setTimeout(() => {
    timers.delete(id)
    fn()
  }, ms)
  timers.add(id)
}

/** Several guests arrive at the target table, one new record every 0.4 s (the scene staggers the actual entrances). */
function startArrivals() {
  const table = targetTable.value
  if (!table) return
  const free = table.seats - (state[table.id]?.guests.length ?? 0)
  for (let i = 0; i < Math.min(free, 4); i++) later(i * 400, addGuest)
}

/** Everyone at the target table leaves, staggered 0.9 s apart. */
function startDepartures() {
  const n = state[targetTableId.value]?.guests.length ?? 0
  for (let i = 0; i < n; i++) later(i * 900, removeGuest)
}

function reset() {
  timers.forEach((id) => clearTimeout(id))
  timers.clear()
  for (const key of Object.keys(state)) delete state[key]
  Object.assign(state, initialState())
  layout.value = structuredClone(mockLayout)
  failures.value = []
  saved.value = null
  mode.value = 'operation'
  // Remounting the scene guarantees a clean slate: guests present now are seated, nothing replays.
  resetKey.value++
}

function onEntranceStatus(value: { ok: boolean; reason?: string }) {
  if (value.ok !== entranceStatus.value.ok || value.reason !== entranceStatus.value.reason) entranceStatus.value = value
}

function onSelect(id: string | null) {
  if (id) targetTableId.value = id
}

onBeforeUnmount(() => timers.forEach((id) => clearTimeout(id)))
</script>

<template>
  <main class="fixture-lab">
    <header>
      <h1>3D Restaurant — fixture (dev)</h1>
      <div
        class="mode-switch"
        role="group"
        aria-label="Modo de la escena"
      >
        <button
          v-for="option in modes"
          :key="option.value"
          type="button"
          :aria-pressed="mode === option.value"
          :data-mode="option.value"
          @click="mode = option.value"
        >
          {{ option.label }}
        </button>
      </div>
      <span
        v-if="saved"
        data-saved
      >saved: {{ saved.tables.length }} tables (fixture, no API)</span>
    </header>

    <div class="fixture-body">
      <RestaurantScene
        :key="resetKey"
        :mode="mode"
        :layout="layout"
        :operational-state="state"
        :save="save"
        :entrance="entrance"
        :nav-debug="nav"
        @table-selected="onSelect"
        @entrance-status="onEntranceStatus"
        @nav-failure="failures.unshift($event)"
        @stats="stats = $event"
      />

      <aside
        class="sim"
        data-sim
        aria-label="Simulador (solo desarrollo)"
      >
        <h2>Simulador (dev)</h2>
        <label>
          Mesa destino
          <select
            v-model="targetTableId"
            data-sim="table"
          >
            <option
              v-for="t in tableOptions"
              :key="t.id"
              :value="t.id"
            >{{ t.label }}</option>
          </select>
        </label>
        <div class="row">
          <button
            type="button"
            data-sim="add"
            @click="addGuest()"
          >
            + Comensal
          </button>
          <button
            type="button"
            data-sim="remove"
            @click="removeGuest()"
          >
            − Comensal
          </button>
        </div>
        <div class="row">
          <button
            type="button"
            data-sim="arrivals"
            @click="startArrivals"
          >
            Simular llegadas
          </button>
          <button
            type="button"
            data-sim="departures"
            @click="startDepartures"
          >
            Simular salidas
          </button>
        </div>
        <fieldset>
          <legend>Entrada (m)</legend>
          <label>X <input
            v-model.number="entrance.x"
            type="number"
            step="0.5"
            :min="-FLOOR.width / 2"
            :max="FLOOR.width / 2"
            data-sim="entrance-x"
          ></label>
          <label>Z <input
            v-model.number="entrance.z"
            type="number"
            step="0.5"
            :min="-FLOOR.depth / 2"
            :max="FLOOR.depth / 2"
            data-sim="entrance-z"
          ></label>
          <p
            class="status"
            :class="{ bad: !entranceStatus.ok }"
            data-sim="entrance-status"
          >
            {{ entranceStatus.ok ? 'Entrada válida' : `Entrada no válida: ${entranceStatus.reason}` }}
          </p>
        </fieldset>
        <fieldset>
          <legend>Navegación</legend>
          <label><input
            v-model="nav.paths"
            type="checkbox"
            data-sim="paths"
          > Mostrar rutas</label>
          <label><input
            v-model="nav.arrivals"
            type="checkbox"
            data-sim="show-arrivals"
          > Rutas de llegada</label>
          <label><input
            v-model="nav.departures"
            type="checkbox"
            data-sim="show-departures"
          > Rutas de salida</label>
          <label><input
            v-model="nav.obstacles"
            type="checkbox"
            data-sim="obstacles"
          > Mostrar obstáculos</label>
          <label><input
            v-model="nav.approach"
            type="checkbox"
            data-sim="approach"
          > Puntos de aproximación</label>
        </fieldset>
        <fieldset>
          <legend>Tiempo</legend>
          <div class="row">
            <button
              v-for="v in [1, 0.5, 0.25, 0.1]"
              :key="v"
              type="button"
              :aria-pressed="speed === v"
              :data-sim="`speed-${v}`"
              @click="speed = v"
            >
              {{ v === 1 ? '1×' : `${v}×` }}
            </button>
          </div>
          <div class="row">
            <button
              type="button"
              :aria-pressed="paused"
              data-sim="pause"
              @click="paused = !paused"
            >
              {{ paused ? 'Reanudar' : 'Pausa' }}
            </button>
            <button
              type="button"
              data-sim="step"
              :disabled="!paused"
              @click="stepSim(0.1)"
            >
              Paso 0,1 s
            </button>
          </div>
        </fieldset>
        <button
          type="button"
          data-sim="reset"
          @click="reset"
        >
          Reiniciar simulación
        </button>
        <dl class="numbers">
          <div><dt>Comensales</dt><dd data-sim="guest-count">{{ guestCount }}</dd></div>
          <div><dt>Llegadas activas</dt><dd data-sim="active-arrivals">{{ stats?.arrivals ?? 0 }}</dd></div>
          <div><dt>Salidas activas</dt><dd data-sim="active-departures">{{ stats?.departures ?? 0 }}</dd></div>
          <div><dt>Fallos de ruta</dt><dd data-sim="failures">{{ failures.length }}</dd></div>
          <div><dt>Sillas en uso</dt><dd data-sim="chairs">{{ stats?.chairs ?? 0 }}</dd></div>
          <div><dt>Draw calls</dt><dd data-sim="calls">{{ stats?.calls ?? '—' }}</dd></div>
          <div><dt>Triángulos</dt><dd data-sim="triangles">{{ stats?.triangles ?? '—' }}</dd></div>
        </dl>
        <ul
          v-if="stats?.phases.length"
          class="phases"
          data-sim="phases"
          aria-label="Fases de animación"
        >
          <li
            v-for="line in stats.phases"
            :key="line"
          >
            {{ line }}
          </li>
        </ul>
        <ul
          v-if="failures.length"
          class="failures"
          data-sim="failure-list"
        >
          <li
            v-for="(f, i) in failures.slice(0, 4)"
            :key="i"
          >
            {{ f }}
          </li>
        </ul>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.fixture-lab { min-height: 100vh; padding: 16px 24px; background: #0f0f10; color: #fff; }
header { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin-bottom: 12px; }
h1 { margin: 0; font-size: 18px; }
h2 { margin: 0; font-size: 14px; }
.mode-switch { display: inline-flex; padding: 3px; border: 1px solid #343434; border-radius: 999px; }
.mode-switch button { min-height: 44px; padding: 0 16px; border: 0; border-radius: 999px; background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
.mode-switch button[aria-pressed='true'] { background: rgb(242 234 227 / 0.14); font-weight: 600; }
.fixture-body { display: grid; gap: 12px; grid-template-columns: 1fr; }
.sim { display: grid; gap: 10px; align-content: start; padding: 12px; border: 1px solid #343434; border-radius: 12px; font-size: 13px; }
.sim label { display: grid; gap: 4px; }
.sim label:has(input[type='checkbox']) { display: flex; align-items: center; gap: 8px; min-height: 32px; }
.sim select, .sim input[type='number'] { min-height: 44px; padding: 0 8px; border: 1px solid #343434; border-radius: 8px; background: #151515; color: inherit; font: inherit; }
.sim button { min-height: 44px; padding: 0 12px; border: 1px solid #343434; border-radius: 999px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.sim button:focus-visible, .sim select:focus-visible, .sim input:focus-visible { outline: 2px solid #f2eae3; outline-offset: 2px; }
.row { display: flex; gap: 8px; }
.row button { flex: 1; }
fieldset { display: grid; gap: 6px; margin: 0; padding: 8px 10px; border: 1px solid #343434; border-radius: 8px; }
legend { padding: 0 4px; opacity: 0.65; }
.status { margin: 0; font-size: 12px; opacity: 0.8; }
.status.bad { color: #ef4444; opacity: 1; }
.numbers { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin: 0; }
.numbers div { padding: 6px 10px; border: 1px solid #343434; border-radius: 8px; }
.numbers dt { font-size: 11px; opacity: 0.6; }
.numbers dd { margin: 0; font-variant-numeric: tabular-nums; }
.phases { margin: 0; padding-left: 16px; font-size: 11px; font-variant-numeric: tabular-nums; opacity: 0.85; }
.sim button[aria-pressed='true'] { background: rgb(242 234 227 / 0.14); border-color: #f2eae3; }
.sim button:disabled { opacity: 0.4; cursor: default; }
.failures { margin: 0; padding-left: 16px; color: #fbbf24; font-size: 12px; }
@media (min-width: 1000px) { .fixture-body { grid-template-columns: minmax(0, 1fr) 300px; } }
</style>
