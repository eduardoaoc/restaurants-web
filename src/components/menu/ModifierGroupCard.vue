<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArchive, PhArrowDown, PhArrowUp, PhPencilSimple, PhPlus } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import AIconButton from '@/components/ui/AIconButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import { describeSelection } from '@/utils/modifier-selection'
import { resolveTranslatedName } from '@/utils/translation'
import type { AppLocale } from '@/i18n'
import type {
  CreateModifierGroupPayload,
  CreateModifierOptionPayload,
  ModifierGroup,
  ModifierOption,
  UpdateModifierGroupPayload,
  UpdateModifierOptionPayload,
} from '@/types/modifier'
import ModifierGroupForm from './ModifierGroupForm.vue'
import ModifierOptionForm from './ModifierOptionForm.vue'
import ModifierOptionRow from './ModifierOptionRow.vue'

const props = defineProps<{
  group: ModifierGroup
  options: ModifierOption[]
  optionsLoading: boolean
  canEdit: boolean
  primaryLocale: AppLocale
  isFirst: boolean
  isLast: boolean
  reordering: boolean
  optionReordering: boolean
  optionCreating: boolean
  optionCreateError: ApiError | null
  onSaveGroup: (payload: UpdateModifierGroupPayload) => Promise<ApiError | null>
  onMoveGroup: (direction: 'up' | 'down') => Promise<ApiError | null>
  onCreateOption: (payload: CreateModifierOptionPayload) => Promise<ApiError | null>
  onSaveOption: (optionId: number, payload: UpdateModifierOptionPayload) => Promise<ApiError | null>
  onMoveOption: (optionId: number, direction: 'up' | 'down') => Promise<ApiError | null>
}>()

const { t, locale } = useI18n()

const editing = ref(false)
const saving = ref(false)
const saveError = ref<ApiError | null>(null)
const quickToggling = ref(false)
const showCreateOption = ref(false)

const displayName = computed(() =>
  resolveTranslatedName(props.group.translations, [locale.value, props.primaryLocale], props.group.internal_name),
)

const selectionSummary = computed(() => describeSelection(props.group.min_select, props.group.max_select, props.group.required, t))

const isArchived = computed(() => props.group.status === 'inactive')

function startEditing(): void {
  saveError.value = null
  editing.value = true
}

async function onFormSave(payload: CreateModifierGroupPayload | UpdateModifierGroupPayload): Promise<void> {
  saving.value = true
  const error = await props.onSaveGroup(payload as UpdateModifierGroupPayload)
  saving.value = false

  if (!error) {
    editing.value = false
    return
  }
  saveError.value = error
}

async function toggleStatus(): Promise<void> {
  if (quickToggling.value) return
  quickToggling.value = true
  await props.onSaveGroup({ status: props.group.status === 'active' ? 'inactive' : 'active' })
  quickToggling.value = false
}

async function onCreateOptionSave(payload: CreateModifierOptionPayload | UpdateModifierOptionPayload): Promise<void> {
  const error = await props.onCreateOption(payload as CreateModifierOptionPayload)
  if (!error) showCreateOption.value = false
}
</script>

<template>
  <ASurface tone="container" radius="lg" bordered class="p-4">
    <template v-if="!editing">
      <div class="flex items-start gap-3">
        <div v-if="canEdit" class="flex shrink-0 flex-col gap-2">
          <AIconButton :label="t('menu.modifiers.group.moveUp')" :disabled="isFirst || reordering" @click="onMoveGroup('up')">
            <PhArrowUp :size="16" />
          </AIconButton>
          <AIconButton :label="t('menu.modifiers.group.moveDown')" :disabled="isLast || reordering" @click="onMoveGroup('down')">
            <PhArrowDown :size="16" />
          </AIconButton>
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-title-md font-medium text-on-surface">{{ displayName }}</span>
                <span
                  v-if="isArchived"
                  class="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2.5 py-1 text-label-md font-medium text-on-surface-variant"
                >
                  <PhArchive :size="14" aria-hidden="true" />
                  {{ t('menu.products.archivedBadge') }}
                </span>
              </div>
              <p class="mt-0.5 text-label-lg text-on-surface-variant">{{ selectionSummary }}</p>
            </div>

            <div v-if="canEdit" class="flex flex-wrap items-center justify-end gap-1">
              <AButton variant="text" :loading="quickToggling" @click="toggleStatus">
                {{ group.status === 'active' ? t('menu.modifiers.group.deactivate') : t('menu.modifiers.group.activate') }}
              </AButton>
              <AButton variant="tonal" @click="startEditing">
                <template #leading><PhPencilSimple :size="16" /></template>
                {{ t('menu.modifiers.group.edit') }}
              </AButton>
            </div>
          </div>

          <div class="mt-4 flex flex-col gap-2">
            <div v-if="optionsLoading" class="flex justify-center py-4">
              <AProgress size="sm" />
            </div>

            <template v-else>
              <ModifierOptionRow
                v-for="(option, index) in options"
                :key="option.id"
                :option="option"
                :can-edit="canEdit"
                :primary-locale="primaryLocale"
                :is-first="index === 0"
                :is-last="index === options.length - 1"
                :reordering="optionReordering"
                :on-save="(payload) => onSaveOption(option.id, payload)"
                :on-move="(direction) => onMoveOption(option.id, direction)"
              />

              <p v-if="options.length === 0 && !showCreateOption" class="py-2 text-body-md text-on-surface-variant">
                {{ t('menu.modifiers.option.empty') }}
              </p>
            </template>

            <div v-if="canEdit">
              <AButton v-if="!showCreateOption" variant="text" class="self-start" @click="showCreateOption = true">
                <template #leading><PhPlus :size="14" /></template>
                {{ t('menu.modifiers.option.newOption') }}
              </AButton>

              <ASurface v-else tone="high" radius="md" class="p-3">
                <ModifierOptionForm
                  mode="create"
                  :primary-locale="primaryLocale"
                  :saving="optionCreating"
                  :error="optionCreateError"
                  @save="onCreateOptionSave"
                  @cancel="showCreateOption = false"
                />
              </ASurface>
            </div>
          </div>
        </div>
      </div>
    </template>

    <ModifierGroupForm
      v-else
      mode="edit"
      :group="group"
      :primary-locale="primaryLocale"
      :saving="saving"
      :error="saveError"
      @save="onFormSave"
      @cancel="editing = false"
    />
  </ASurface>
</template>
