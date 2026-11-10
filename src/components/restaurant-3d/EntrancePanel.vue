<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AButton from '@/components/ui/AButton.vue'
import type { FloorPosition } from '@/types/restaurant-3d/restaurant-layout'
import { GRID_STEP } from './floor'
import { parseCoordinate } from './layout-editing'
import type { EntranceValidation } from './entrance-validation'

/**
 * Entrance section of the floor editor: configured / not configured, X and Z, nudge, tap-to-place, remove and the
 * validation message. It edits the shared layout draft through events only — it owns no entrance state.
 */
const props = defineProps<{
  entrance: FloorPosition | null
  check: EntranceValidation | null
  selected: boolean
  placing: boolean
  /** Why the last typed value was refused (typed input is never silently clamped). */
  inputIssue?: 'invalid_coordinates' | 'outside_floor' | null
}>()
const emit = defineEmits<{
  add: []
  select: []
  place: [placing: boolean]
  /** Nudge buttons: relative moves, kept on the floor. */
  set: [position: FloorPosition]
  /** Typed X/Z: validated by the owner and REFUSED (not clamped) when invalid. */
  type: [position: FloorPosition]
  remove: []
}>()
const { t } = useI18n()

const x = ref<number | string>('')
const z = ref<number | string>('')
function syncFields(): void {
  x.value = props.entrance ? props.entrance.x : ''
  z.value = props.entrance ? props.entrance.z : ''
}
watch(() => props.entrance, syncFields, { immediate: true, deep: true })

const issue = computed(() => (props.check && !props.check.ok ? props.check : null))
const issueText = computed(() => props.inputIssue ? t(`floorLayout.entrance.issue.${props.inputIssue}`) : issue.value
  ? t(`floorLayout.entrance.issue.${issue.value.issue}`, { count: issue.value.unreachable?.length ?? 0, tables: issue.value.tableNumbers?.join(', ') ?? '' })
  : null)

/** Typed coordinates are committed on change/enter; an invalid number is kept visible and reported, not rewritten. */
async function commit(): Promise<void> {
  emit('type', { x: parseCoordinate(x.value), z: parseCoordinate(z.value) })
  await nextTick()
  syncFields() // a refused value snaps back to the real one; the reason is shown below
}
function nudge(dx: number, dz: number): void {
  if (!props.entrance) return
  emit('set', { x: props.entrance.x + dx * GRID_STEP, z: props.entrance.z + dz * GRID_STEP })
}
</script>

<template>
  <section class="entrance-panel" :class="{ 'entrance-panel--selected': selected }" :aria-labelledby="'entrance-title'">
    <h3 id="entrance-title" class="entrance-panel__title">{{ t('floorLayout.entrance.title') }}</h3>

    <template v-if="!entrance">
      <p class="entrance-panel__copy">{{ t('floorLayout.entrance.notConfigured') }}</p>
      <AButton class="entrance-panel__btn" size="md" @click="emit('add')">{{ t('floorLayout.entrance.configure') }}</AButton>
    </template>

    <template v-else>
      <p class="entrance-panel__copy">{{ t('floorLayout.entrance.configured') }}</p>
      <div class="entrance-panel__fields">
        <label class="entrance-panel__field">
          <span>{{ t('floorLayout.entrance.x') }}</span>
          <input v-model="x" type="number" inputmode="decimal" :step="GRID_STEP" @change="commit" @keydown.enter="commit">
        </label>
        <label class="entrance-panel__field">
          <span>{{ t('floorLayout.entrance.z') }}</span>
          <input v-model="z" type="number" inputmode="decimal" :step="GRID_STEP" @change="commit" @keydown.enter="commit">
        </label>
      </div>

      <div class="entrance-panel__nudge" role="group" :aria-label="t('floorLayout.entrance.nudge')">
        <AButton variant="secondary" size="md" :aria-label="t('floorLayout.entrance.left')" @click="nudge(-1, 0)">←</AButton>
        <AButton variant="secondary" size="md" :aria-label="t('floorLayout.entrance.up')" @click="nudge(0, -1)">↑</AButton>
        <AButton variant="secondary" size="md" :aria-label="t('floorLayout.entrance.down')" @click="nudge(0, 1)">↓</AButton>
        <AButton variant="secondary" size="md" :aria-label="t('floorLayout.entrance.right')" @click="nudge(1, 0)">→</AButton>
      </div>

      <div class="entrance-panel__actions">
        <AButton class="entrance-panel__btn" variant="secondary" size="md" :aria-pressed="placing" @click="emit('place', !placing)">
          {{ placing ? t('floorLayout.entrance.cancelMove') : t('floorLayout.entrance.move') }}
        </AButton>
        <AButton class="entrance-panel__btn" variant="danger" size="md" @click="emit('remove')">{{ t('floorLayout.entrance.remove') }}</AButton>
      </div>
      <p v-if="placing" class="entrance-panel__copy" role="status">{{ t('floorLayout.entrance.placeHint') }}</p>
      <p v-else class="entrance-panel__copy">{{ t('floorLayout.entrance.dragHint') }}</p>

      <p v-if="issueText" class="entrance-panel__issue" role="alert">{{ issueText }} {{ inputIssue ? '' : t('floorLayout.entrance.saveBlocked') }}</p>
      <p v-else-if="check?.ok" class="entrance-panel__ok" role="status">{{ t('floorLayout.entrance.valid') }}</p>
    </template>
  </section>
</template>

<style scoped>
.entrance-panel {
  box-sizing: border-box;
  display: grid;
  gap: 8px;
  width: min(100%, 22rem);
  padding: 12px 14px;
  border: 1px solid #343434;
  border-radius: 14px;
  background: rgb(23 24 28 / 0.92);
  color: #f2eae3;
  pointer-events: auto;
  transition: border-color 160ms ease;
}
.entrance-panel--selected { border-color: #7dd3fc; }
.entrance-panel__title { margin: 0; font-size: 14px; font-weight: 600; }
.entrance-panel__copy, .entrance-panel__issue, .entrance-panel__ok { margin: 0; font-size: 12px; line-height: 1.4; color: rgb(242 234 227 / 0.72); }
.entrance-panel__issue { color: #ffd8d3; }
.entrance-panel__ok { color: #b8edc7; }
.entrance-panel__fields { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.entrance-panel__field { display: grid; gap: 4px; font-size: 12px; font-weight: 600; min-width: 0; }
.entrance-panel__field input {
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
.entrance-panel__field input:focus-visible { outline: 2px solid var(--md-sys-color-primary); outline-offset: 2px; }
.entrance-panel__nudge { display: grid; grid-template-columns: repeat(4, minmax(44px, 1fr)); gap: 8px; }
.entrance-panel__btn { font-size: 13px; }
.entrance-panel__actions { display: flex; flex-wrap: wrap; gap: 8px; }
@media (prefers-reduced-motion: reduce) { .entrance-panel { transition: none; } }
@media (max-width: 640px) { .entrance-panel { width: 100%; } }
</style>
