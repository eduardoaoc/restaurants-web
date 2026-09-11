<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowLeft, PhPlus, PhSliders } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import AIconButton from '@/components/ui/AIconButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import { useProductModifierGroups } from '@/composables/useProductModifierGroups'
import { useRestaurantStore } from '@/stores/restaurant'
import { describeApiError } from '@/utils/error-message'
import { formatMoney } from '@/utils/format'
import { resolveTranslatedName } from '@/utils/translation'
import type { AppLocale } from '@/i18n'
import type { CreateModifierGroupPayload, UpdateModifierGroupPayload } from '@/types/modifier'
import type { RestaurantProduct } from '@/types/product'
import ModifierGroupCard from './ModifierGroupCard.vue'
import ModifierGroupForm from './ModifierGroupForm.vue'

const props = defineProps<{
  restaurantProduct: RestaurantProduct
  canManage: boolean
  primaryLocale: AppLocale
}>()

const emit = defineEmits<{ back: [] }>()

const { t, locale } = useI18n()
const restaurantStore = useRestaurantStore()

const {
  groups,
  loading,
  error,
  saving,
  saveError,
  reordering,
  optionsByGroup,
  optionsLoading,
  optionSaving,
  optionSaveError,
  optionReordering,
  createGroup,
  updateGroup,
  moveGroup,
  createOption,
  updateOption,
  moveOption,
} = useProductModifierGroups(() => props.restaurantProduct.id)

const productName = computed(() => {
  const product = props.restaurantProduct.product
  if (!product) return `#${props.restaurantProduct.product_id}`
  return resolveTranslatedName(product.translations, [locale.value, props.primaryLocale], product.internal_name)
})

const currency = computed(() => restaurantStore.currentSettings?.currency)
const priceDisplay = computed(() => formatMoney(props.restaurantProduct.price, locale.value, currency.value))

const showCreateGroup = ref(false)

async function onCreateGroup(payload: CreateModifierGroupPayload | UpdateModifierGroupPayload): Promise<void> {
  const err = await createGroup(payload as CreateModifierGroupPayload)
  if (!err) showCreateGroup.value = false
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-3">
      <AIconButton :label="t('common.back')" @click="emit('back')">
        <PhArrowLeft :size="20" />
      </AIconButton>
      <div class="min-w-0">
        <p class="text-label-md text-on-surface-variant">{{ t('menu.modifiers.context.label') }}</p>
        <div class="flex flex-wrap items-baseline gap-2">
          <span class="text-title-lg font-semibold text-on-surface">{{ productName }}</span>
          <span class="text-body-lg tabular-nums text-on-surface-variant">{{ priceDisplay }}</span>
        </div>
      </div>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-16">
      <AProgress />
    </div>

    <ASurface
      v-else-if="error"
      tone="container"
      radius="lg"
      role="alert"
      class="border border-error/40 bg-error-container p-6 text-on-error-container"
    >
      <p class="text-title-md font-medium">{{ describeApiError(error, t) }}</p>
    </ASurface>

    <ASurface v-else-if="groups.length === 0" tone="container" radius="lg" bordered elevated class="max-w-xl p-6">
      <div class="flex items-center gap-3">
        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
          <PhSliders :size="22" aria-hidden="true" />
        </span>
        <div>
          <h3 class="text-title-lg font-semibold text-on-surface">{{ t('menu.modifiers.empty.title') }}</h3>
          <p class="text-body-md text-on-surface-variant">{{ t('menu.modifiers.empty.subtitle') }}</p>
        </div>
      </div>

      <p v-if="!canManage" class="mt-5 text-body-md text-on-surface-variant">{{ t('menu.modifiers.empty.noPermission') }}</p>

      <template v-else-if="!showCreateGroup">
        <AButton class="mt-5" @click="showCreateGroup = true">{{ t('menu.modifiers.empty.cta') }}</AButton>
      </template>

      <div v-else class="mt-5">
        <ModifierGroupForm
          mode="create"
          :primary-locale="primaryLocale"
          :saving="saving"
          :error="saveError"
          @save="onCreateGroup"
          @cancel="showCreateGroup = false"
        />
      </div>
    </ASurface>

    <template v-else>
      <div v-if="canManage">
        <AButton v-if="!showCreateGroup" variant="tonal" @click="showCreateGroup = true">
          <template #leading><PhPlus :size="16" /></template>
          {{ t('menu.modifiers.empty.cta') }}
        </AButton>

        <ASurface v-else tone="container" radius="lg" bordered elevated class="p-4">
          <ModifierGroupForm
            mode="create"
            :primary-locale="primaryLocale"
            :saving="saving"
            :error="saveError"
            @save="onCreateGroup"
            @cancel="showCreateGroup = false"
          />
        </ASurface>
      </div>

      <div class="flex flex-col gap-3">
        <ModifierGroupCard
          v-for="(group, index) in groups"
          :key="group.id"
          :group="group"
          :options="optionsByGroup[group.id] ?? []"
          :options-loading="optionsLoading[group.id] ?? false"
          :can-edit="canManage"
          :primary-locale="primaryLocale"
          :is-first="index === 0"
          :is-last="index === groups.length - 1"
          :reordering="reordering"
          :option-reordering="optionReordering[group.id] ?? false"
          :option-creating="optionSaving[group.id] ?? false"
          :option-create-error="optionSaveError[group.id] ?? null"
          :on-save-group="(payload) => updateGroup(group.id, payload)"
          :on-move-group="(direction) => moveGroup(group.id, direction)"
          :on-create-option="(payload) => createOption(group.id, payload)"
          :on-save-option="(optionId, payload) => updateOption(group.id, optionId, payload)"
          :on-move-option="(optionId, direction) => moveOption(group.id, optionId, direction)"
        />
      </div>
    </template>
  </div>
</template>
