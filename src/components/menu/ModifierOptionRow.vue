<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArchive, PhArrowDown, PhArrowUp, PhCheckCircle, PhPauseCircle, PhPencilSimple } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import AIconButton from '@/components/ui/AIconButton.vue'
import { useRestaurantStore } from '@/stores/restaurant'
import { formatMoney } from '@/utils/format'
import { resolveTranslatedName } from '@/utils/translation'
import type { AppLocale } from '@/i18n'
import type { CreateModifierOptionPayload, ModifierOption, UpdateModifierOptionPayload } from '@/types/modifier'
import ModifierOptionForm from './ModifierOptionForm.vue'

const props = defineProps<{
  option: ModifierOption
  canEdit: boolean
  primaryLocale: AppLocale
  isFirst: boolean
  isLast: boolean
  reordering: boolean
  onSave: (payload: UpdateModifierOptionPayload) => Promise<ApiError | null>
  onMove: (direction: 'up' | 'down') => Promise<ApiError | null>
}>()

const { t, locale } = useI18n()
const restaurantStore = useRestaurantStore()

const editing = ref(false)
const saving = ref(false)
const saveError = ref<ApiError | null>(null)
const quickToggling = ref(false)

const displayName = computed(() =>
  resolveTranslatedName(props.option.translations, [locale.value, props.primaryLocale], props.option.internal_name),
)

const currency = computed(() => restaurantStore.currentSettings?.currency)
const priceDisplay = computed(() => {
  const amount = Number(props.option.price_delta)
  if (!amount) return t('menu.modifiers.option.noCost')
  return `+${formatMoney(props.option.price_delta, locale.value, currency.value)}`
})

const isArchived = computed(() => props.option.status === 'inactive')

function startEditing(): void {
  saveError.value = null
  editing.value = true
}

async function onFormSave(payload: CreateModifierOptionPayload | UpdateModifierOptionPayload): Promise<void> {
  saving.value = true
  const error = await props.onSave(payload as UpdateModifierOptionPayload)
  saving.value = false

  if (!error) {
    editing.value = false
    return
  }
  saveError.value = error
}

async function toggleAvailable(): Promise<void> {
  if (quickToggling.value) return
  quickToggling.value = true
  await props.onSave({ available: !props.option.available })
  quickToggling.value = false
}
</script>

<template>
  <div class="rounded-lg bg-surface-container-high/60 p-3">
    <template v-if="!editing">
      <div class="flex items-start gap-2">
        <div v-if="canEdit" class="flex shrink-0 flex-col gap-1.5">
          <AIconButton
            :label="t('menu.modifiers.option.moveUp')"
            :disabled="isFirst || reordering || !canEdit"
            @click="onMove('up')"
          >
            <PhArrowUp :size="14" />
          </AIconButton>
          <AIconButton
            :label="t('menu.modifiers.option.moveDown')"
            :disabled="isLast || reordering || !canEdit"
            @click="onMove('down')"
          >
            <PhArrowDown :size="14" />
          </AIconButton>
        </div>

        <div class="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-body-lg font-medium text-on-surface">{{ displayName }}</span>
              <span
                v-if="isArchived"
                class="inline-flex items-center gap-1 rounded-full bg-surface-container-highest px-2 py-0.5 text-label-md text-on-surface-variant"
              >
                <PhArchive :size="12" aria-hidden="true" />
                {{ t('menu.products.archivedBadge') }}
              </span>
            </div>
            <div class="mt-0.5 flex flex-wrap items-center gap-2">
              <span class="text-label-lg tabular-nums text-on-surface-variant">{{ priceDisplay }}</span>
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label-md font-medium"
                :class="option.available ? 'bg-success-container text-on-success-container' : 'bg-surface-container-highest text-on-surface-variant'"
              >
                <PhCheckCircle v-if="option.available" :size="12" aria-hidden="true" />
                <PhPauseCircle v-else :size="12" aria-hidden="true" />
                {{ option.available ? t('menu.products.available') : t('menu.products.unavailable') }}
              </span>
            </div>
          </div>

          <div v-if="canEdit" class="flex flex-wrap items-center justify-end gap-1">
            <AButton variant="text" :loading="quickToggling" @click="toggleAvailable">
              {{ option.available ? t('menu.products.markUnavailable') : t('menu.products.markAvailable') }}
            </AButton>
            <AButton variant="tonal" @click="startEditing">
              <template #leading><PhPencilSimple :size="14" /></template>
              {{ t('menu.modifiers.option.edit') }}
            </AButton>
          </div>
        </div>
      </div>
    </template>

    <ModifierOptionForm
      v-else
      mode="edit"
      :option="option"
      :primary-locale="primaryLocale"
      :saving="saving"
      :error="saveError"
      @save="onFormSave"
      @cancel="editing = false"
    />
  </div>
</template>
