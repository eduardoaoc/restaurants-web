<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhMinus, PhPlus, PhUsers, PhWarningCircle } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import AIconButton from '@/components/ui/AIconButton.vue'
import ASurface from '@/components/ui/ASurface.vue'
import ATextField from '@/components/ui/ATextField.vue'
import { describeApiError } from '@/utils/error-message'
import { TABLE_STATUSES, type FloorPlanTable, type TableStatus, type UpdateTablePayload } from '@/types/floor-plan'

/** Zones flattened with their floor's name, so the picker can read "Terraza · Planta principal". */
export interface ZoneOption {
  id: number
  name: string
  floorName: string
}

const props = defineProps<{
  table: FloorPlanTable
  zones: ZoneOption[]
  /**
   * `manage_tables` — the BASE permission to touch this table at all.
   * CARTA 8.2B: `status` stays gated by this alone, never by
   * `canManageStructure` (confirmed against the live OpenAPI contract —
   * "status alone is never gated by the setting"), so a waiter whose
   * `waiter_table_management_enabled` is off can still take a table out of
   * service while the restaurant is in the middle of handling a real
   * problem with it (burst pipe, broken chair), not just change its name.
   */
  canManageTables: boolean
  /**
   * CARTA 8.2B — `can_manage_table_structure` for the current restaurant
   * (see RestaurantContext's own docblock): name/number/capacity. True for
   * manage_floor_plan holders unconditionally; for a manage_tables-only
   * waiter, follows the restaurant's `waiter_table_management_enabled`
   * setting. Never re-derived from a role here.
   */
  canManageStructure: boolean
  /** `manage_floor_plan` — zone assignment (and, elsewhere, position). Unaffected by the toggle (§21/§22 of CARTA 8.2B — a waiter never gains floor-plan access just because the toggle is on). */
  canManageFloorPlan: boolean
  saving: boolean
  error: ApiError | null
  onSave: (payload: UpdateTablePayload) => Promise<ApiError | null>
}>()

const { t } = useI18n()

const CAPACITY_MIN = 1
/** Real backend ceiling — UpdateTableRequest: capacity `min:1, max:100`. */
const CAPACITY_MAX = 100

const zoneSelectId = useId()

const name = ref(props.table.name)
const numberRaw = ref(props.table.number === null ? '' : String(props.table.number))
const capacity = ref<number | null>(props.table.capacity)
const zoneId = ref<number | null>(props.table.zone_id)
const status = ref<TableStatus>((props.table.status as TableStatus) ?? 'active')
const nameError = ref<string | null>(null)

// Re-seed whenever the owner selects a different table on the map, so the
// panel never shows one table's values while another is selected.
watch(
  () => props.table,
  (table) => {
    name.value = table.name
    numberRaw.value = table.number === null ? '' : String(table.number)
    capacity.value = table.capacity
    zoneId.value = table.zone_id
    status.value = (table.status as TableStatus) ?? 'active'
    nameError.value = null
  },
)

const hasActiveSession = computed(() => props.table.has_active_session)

function stepCapacity(delta: number): void {
  const next = (capacity.value ?? 0) + delta
  capacity.value = Math.min(Math.max(next, CAPACITY_MIN), CAPACITY_MAX)
}

function onCapacityInput(raw: string): void {
  const trimmed = raw.trim()
  if (!trimmed) {
    capacity.value = null
    return
  }
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed)) return
  capacity.value = Math.min(Math.max(parsed, CAPACITY_MIN), CAPACITY_MAX)
}

/**
 * Only what actually changed — the backend treats every field as
 * `sometimes`. Name/number/capacity are additionally gated here on
 * `canManageStructure` (defense-in-depth, same reasoning as the pre-existing
 * `canManageFloorPlan` guard on `zone_id` just below) — the inputs are
 * already disabled when it's false, so this only matters if that's ever
 * bypassed, never a behavior change for the normal path.
 */
const changes = computed<UpdateTablePayload>(() => {
  const payload: UpdateTablePayload = {}

  if (props.canManageStructure) {
    const trimmedName = name.value.trim()
    if (trimmedName && trimmedName !== props.table.name) payload.name = trimmedName

    const parsedNumber = numberRaw.value.trim() === '' ? null : Number(numberRaw.value)
    const numberIsValid = parsedNumber === null || Number.isInteger(parsedNumber)
    if (numberIsValid && parsedNumber !== props.table.number) payload.number = parsedNumber

    if (capacity.value !== props.table.capacity) payload.capacity = capacity.value
  }

  // Never gated on canManageStructure — see the prop's own docblock.
  if (status.value !== props.table.status) payload.status = status.value

  if (props.canManageFloorPlan && zoneId.value !== props.table.zone_id) payload.zone_id = zoneId.value

  return payload
})

const hasChanges = computed(() => Object.keys(changes.value).length > 0)

/**
 * CARTA 8.2B §19/§20 — a 403 here is the stale-capability case (the toggle
 * was true when this panel opened, an admin turned it off since): a
 * dedicated, actionable copy instead of the generic "no tienes permiso"
 * `describeApiError` would otherwise show, since `useFloorPlanEditor` has
 * already kicked off a context refresh that will hide these fields a
 * moment after this renders.
 */
const bannerMessage = computed(() => {
  if (!props.error) return null
  if (props.error.kind === 'forbidden') return t('tables.errors.structureForbidden')
  return describeApiError(props.error, t)
})

async function submit(): Promise<void> {
  if (!name.value.trim()) {
    nameError.value = t('tables.errors.nameRequired')
    return
  }
  nameError.value = null
  if (!hasChanges.value) return

  await props.onSave(changes.value)
}

function reset(): void {
  name.value = props.table.name
  numberRaw.value = props.table.number === null ? '' : String(props.table.number)
  capacity.value = props.table.capacity
  zoneId.value = props.table.zone_id
  status.value = (props.table.status as TableStatus) ?? 'active'
  nameError.value = null
}
</script>

<template>
  <ASurface tone="container" radius="lg" bordered class="flex flex-col gap-4 p-4">
    <div>
      <h3 class="text-title-md font-medium text-on-surface">{{ t('tables.config.title') }}</h3>
      <p class="mt-0.5 text-body-md text-on-surface-variant">{{ t('tables.config.subtitle') }}</p>
    </div>

    <!--
      A table someone is currently sitting at. The backend does NOT refuse
      these edits, so the guard is ours: the one genuinely dangerous change
      (taking the table out of service mid-service) is disabled and
      explained, while harmless edits stay available (§14).
    -->
    <p
      v-if="hasActiveSession"
      class="flex items-start gap-2 rounded-lg bg-warning-container px-3 py-2.5 text-label-lg text-on-warning-container"
      role="status"
    >
      <PhWarningCircle :size="18" class="mt-0.5 shrink-0" aria-hidden="true" />
      {{ t('tables.config.activeSessionNotice') }}
    </p>

    <!-- CARTA 8.2B §15: Información / Ubicación / Estado, clearly separated
         fieldsets instead of one flat stack of fields — Acceso QR stays its
         own sibling component below (TableQrPanel, unchanged). -->
    <fieldset class="flex flex-col gap-4">
      <legend class="mb-1 text-label-lg font-semibold text-on-surface">{{ t('tables.config.infoSectionTitle') }}</legend>

      <ATextField
        :model-value="name"
        :label="t('tables.config.nameLabel')"
        :help-text="t('tables.config.nameHelp')"
        :error="nameError ?? undefined"
        :disabled="!canManageStructure || saving"
        required
        @update:model-value="(value) => { name = value; nameError = null }"
      />

      <ATextField
        :model-value="numberRaw"
        :label="t('tables.config.numberLabel')"
        :help-text="t('tables.config.numberHelp')"
        inputmode="numeric"
        :disabled="!canManageStructure || saving"
        @update:model-value="(value) => (numberRaw = value)"
      />

      <!-- Capacity: a stepper, not a raw integer box — the owner thinks in
           "mesa para 4", and the backend accepts any 1..100 so nothing is
           artificially restricted beyond its real rule (§9). -->
      <div>
        <span class="text-label-lg font-medium text-on-surface-variant">{{ t('tables.config.capacityLabel') }}</span>
        <div class="mt-1.5 flex items-center gap-2">
          <AIconButton
            :label="t('tables.config.capacityDecrease')"
            :disabled="!canManageStructure || saving || (capacity ?? CAPACITY_MIN) <= CAPACITY_MIN"
            @click="stepCapacity(-1)"
          >
            <PhMinus :size="16" />
          </AIconButton>

          <div class="flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2">
            <PhUsers :size="16" class="text-on-surface-variant" aria-hidden="true" />
            <input
              :value="capacity ?? ''"
              type="text"
              inputmode="numeric"
              :aria-label="t('tables.config.capacityLabel')"
              :disabled="!canManageStructure || saving"
              class="w-12 bg-transparent text-center text-body-lg tabular-nums text-on-surface outline-none disabled:opacity-[0.38]"
              @input="onCapacityInput(($event.target as HTMLInputElement).value)"
            />
            <span class="text-label-md text-on-surface-variant">{{ t('tables.config.capacityUnit') }}</span>
          </div>

          <AIconButton
            :label="t('tables.config.capacityIncrease')"
            :disabled="!canManageStructure || saving || (capacity ?? 0) >= CAPACITY_MAX"
            @click="stepCapacity(1)"
          >
            <PhPlus :size="16" />
          </AIconButton>
        </div>
        <p class="mt-1.5 text-label-md text-on-surface-variant">{{ t('tables.config.capacityHelp') }}</p>
      </div>
    </fieldset>

    <fieldset v-if="canManageFloorPlan" class="flex flex-col gap-1.5">
      <legend class="mb-1 text-label-lg font-semibold text-on-surface">{{ t('tables.config.locationSectionTitle') }}</legend>
      <label :for="zoneSelectId" class="text-label-lg font-medium text-on-surface-variant">
        {{ t('tables.config.zoneLabel') }}
      </label>
      <select
        :id="zoneSelectId"
        v-model="zoneId"
        :disabled="saving"
        class="mt-1.5 w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2.5 text-body-lg text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-[0.38]"
      >
        <option :value="null">{{ t('tables.config.zoneUnassigned') }}</option>
        <option v-for="zone in zones" :key="zone.id" :value="zone.id">{{ zone.floorName }} · {{ zone.name }}</option>
      </select>
    </fieldset>

    <fieldset class="flex flex-col gap-1.5">
      <legend class="mb-1 text-label-lg font-semibold text-on-surface">{{ t('tables.config.statusSectionTitle') }}</legend>
      <span class="sr-only">{{ t('tables.config.statusLabel') }}</span>
      <div
        class="mt-1.5 inline-flex flex-wrap gap-1 rounded-lg border border-outline-variant bg-surface-container-low p-1"
        role="radiogroup"
        :aria-label="t('tables.config.statusLabel')"
      >
        <button
          v-for="option in TABLE_STATUSES"
          :key="option"
          type="button"
          role="radio"
          :aria-checked="status === option"
          :disabled="!canManageTables || saving || hasActiveSession"
          class="inline-flex min-h-11 items-center rounded-md px-3 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-[0.38]"
          :class="status === option ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
          @click="status = option"
        >
          {{ t(`tables.status.${option}`) }}
        </button>
      </div>
      <p class="mt-1.5 text-label-md text-on-surface-variant">{{ t('tables.config.statusHelp') }}</p>
    </fieldset>

    <p v-if="bannerMessage" class="text-label-md text-error" role="alert">{{ bannerMessage }}</p>

    <!-- Shown whenever EITHER the base permission (status) or the
         structural capability (name/number/capacity/zone) allows anything
         at all — a manage_floor_plan-only account with no manage_tables
         (can_manage_table_structure true, canManageTables false) would
         otherwise lose its own Save button (CARTA 8.2B edge case). -->
    <div v-if="canManageTables || canManageStructure" class="flex flex-wrap items-center gap-2">
      <AButton :loading="saving" :disabled="!hasChanges" @click="submit">{{ t('common.save') }}</AButton>
      <AButton variant="text" :disabled="saving || !hasChanges" @click="reset">{{ t('common.cancel') }}</AButton>
    </div>
    <p v-else class="text-label-md text-on-surface-variant">{{ t('tables.config.noPermission') }}</p>
  </ASurface>
</template>
