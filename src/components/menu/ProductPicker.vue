<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhMagnifyingGlass, PhPlus } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import ATextField from '@/components/ui/ATextField.vue'
import type { AppLocale } from '@/i18n'
import { describeApiError } from '@/utils/error-message'
import { parsePriceInput } from '@/utils/price'
import { resolveTranslatedName } from '@/utils/translation'
import type { Product } from '@/types/product'

const props = defineProps<{
  catalog: Product[]
  /** product_ids already on this restaurant's carta — excluded from the pickable list (CLAUDE.md Passo 2.4 §15). */
  attachedProductIds: Set<number>
  loading: boolean
  primaryLocale: AppLocale
  attaching: boolean
  attachError: ApiError | null
}>()

const emit = defineEmits<{
  attach: [{ productId: number; price: number; available: boolean }]
  cancel: []
}>()

const { t, locale } = useI18n()

const query = ref('')
const selectedProductId = ref<number | null>(null)
const priceRaw = ref('')
const available = ref(true)
const priceError = ref<string | null>(null)

const pickable = computed(() => props.catalog.filter((product) => !props.attachedProductIds.has(product.id)))

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return pickable.value

  return pickable.value.filter((product) => {
    const name = resolveTranslatedName(product.translations, [locale.value, props.primaryLocale], '')
    return (
      name.toLowerCase().includes(needle) ||
      product.internal_name.toLowerCase().includes(needle) ||
      (product.sku ?? '').toLowerCase().includes(needle)
    )
  })
})

function displayName(product: Product): string {
  return resolveTranslatedName(product.translations, [locale.value, props.primaryLocale], product.internal_name)
}

function select(productId: number): void {
  selectedProductId.value = productId
  priceRaw.value = ''
  available.value = true
  priceError.value = null
}

function submitAttach(): void {
  if (selectedProductId.value === null) return
  const parsedPrice = parsePriceInput(priceRaw.value)
  if (parsedPrice === null) {
    priceError.value = t('menu.products.errors.priceInvalid')
    return
  }
  priceError.value = null
  emit('attach', { productId: selectedProductId.value, price: parsedPrice, available: available.value })
}

const bannerMessage = computed(() => {
  if (!props.attachError) return null
  if (props.attachError.kind === 'validation' && props.attachError.fieldErrors?.product_id) {
    return t('menu.products.errors.duplicateProduct')
  }
  return describeApiError(props.attachError, t)
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <div v-if="loading" class="flex items-center justify-center py-8">
      <AProgress />
    </div>

    <template v-else>
      <ATextField v-model="query" :label="t('menu.products.searchLabel')" :placeholder="t('menu.products.searchPlaceholder')">
        <template #leading><PhMagnifyingGlass :size="18" /></template>
      </ATextField>

      <p v-if="pickable.length === 0" class="text-body-md text-on-surface-variant">
        {{ t('menu.products.catalogEmpty') }}
      </p>
      <p v-else-if="filtered.length === 0" class="text-body-md text-on-surface-variant">
        {{ t('menu.products.noResults') }}
      </p>

      <ul v-else class="flex max-h-72 flex-col gap-1 overflow-y-auto">
        <li v-for="p in filtered" :key="p.id">
          <div v-if="selectedProductId !== p.id" class="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-surface-container-high">
            <div class="min-w-0">
              <p class="truncate text-body-lg text-on-surface">{{ displayName(p) }}</p>
              <p v-if="p.sku" class="truncate text-label-md text-on-surface-variant">{{ p.sku }}</p>
            </div>
            <AButton variant="text" @click="select(p.id)">
              <template #leading><PhPlus :size="16" /></template>
              {{ t('menu.products.addToCarta') }}
            </AButton>
          </div>

          <ASurface v-else tone="high" radius="md" class="flex flex-col gap-3 p-3">
            <p class="text-body-lg font-medium text-on-surface">{{ displayName(p) }}</p>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ATextField
                v-model="priceRaw"
                :label="t('menu.products.priceLabel')"
                inputmode="decimal"
                :error="priceError ?? undefined"
                :disabled="attaching"
                required
              >
                <template #leading>€</template>
              </ATextField>
              <div>
                <span class="text-label-lg font-medium text-on-surface-variant">{{ t('menu.products.availableLabel') }}</span>
                <div class="mt-1.5 inline-flex gap-1 rounded-lg border border-outline-variant bg-surface-container-low p-1" role="radiogroup" :aria-label="t('menu.products.availableLabel')">
                  <button
                    type="button"
                    role="radio"
                    :aria-checked="available"
                    class="rounded-md px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    :class="available ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
                    :disabled="attaching"
                    @click="available = true"
                  >
                    {{ t('menu.products.available') }}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    :aria-checked="!available"
                    class="rounded-md px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    :class="!available ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
                    :disabled="attaching"
                    @click="available = false"
                  >
                    {{ t('menu.products.unavailable') }}
                  </button>
                </div>
              </div>
            </div>
            <p v-if="bannerMessage" class="text-label-md text-error" role="alert">{{ bannerMessage }}</p>
            <div class="flex items-center gap-2">
              <AButton :loading="attaching" @click="submitAttach">{{ t('menu.products.addToCarta') }}</AButton>
              <AButton variant="text" type="button" :disabled="attaching" @click="selectedProductId = null">{{ t('common.cancel') }}</AButton>
            </div>
          </ASurface>
        </li>
      </ul>

      <AButton variant="text" type="button" class="self-start" @click="emit('cancel')">{{ t('common.cancel') }}</AButton>
    </template>
  </div>
</template>
