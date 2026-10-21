<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhForkKnife } from '@phosphor-icons/vue'
import SectionCard from '@/components/dashboard/SectionCard.vue'
import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ATextField from '@/components/ui/ATextField.vue'
import type { ApiError } from '@/api/errors'
import type { RestaurantProduct } from '@/types/product'
import { describeApiError } from '@/utils/error-message'
import { resolveTranslatedName } from '@/utils/translation'
import { safeHttpUrl } from '@/utils/safe-url'
const props = defineProps<{
  products: RestaurantProduct[]; loading: boolean; error: ApiError | null
  busy: Record<number, boolean>; errors: Record<number, ApiError | null>
}>()
const emit = defineEmits<{ toggle: [RestaurantProduct]; refresh: [] }>()
const { t, locale } = useI18n()
const search = ref('')
const name = (p: RestaurantProduct) => resolveTranslatedName(p.product?.translations ?? [], [locale.value], p.product?.internal_name ?? `#${p.id}`)
const visible = computed(() => props.products.filter(p => p.product?.status === 'active' && name(p).toLocaleLowerCase().includes(search.value.toLocaleLowerCase())))
</script>
<template>
  <SectionCard :icon="PhForkKnife" :title="t('availability.title')">
    <ATextField v-model="search" :label="t('availability.search')" />
    <p v-if="error" role="alert" class="mt-3 text-body-md text-error">{{ describeApiError(error, t) }}</p>
    <div v-if="loading && products.length === 0" class="flex justify-center py-4"><AProgress /></div>
    <p v-else-if="visible.length === 0" class="py-4 text-body-md text-on-surface-variant">{{ t('availability.empty') }}</p>
    <ul class="mt-3 divide-y divide-outline-variant">
      <li v-for="product in visible" :key="product.id" class="flex flex-col gap-2 py-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <img v-if="safeHttpUrl(product.product?.media.image?.url)" :src="safeHttpUrl(product.product?.media.image?.url)!" alt="" loading="lazy" class="h-12 w-12 shrink-0 rounded-md object-cover" />
            <div class="min-w-0"><p class="break-words text-body-lg font-medium text-on-surface">{{ name(product) }}</p>
              <p class="text-label-lg text-on-surface-variant">{{ t(product.available ? 'availability.available' : 'availability.soldOut') }}</p>
            </div>
          </div>
          <AButton variant="outlined" :loading="busy[product.id]" :disabled="busy[product.id]" :aria-label="`${name(product)}: ${t(product.available ? 'availability.markSoldOut' : 'availability.restore')}`" @click="emit('toggle', product)">
            {{ t(product.available ? 'availability.markSoldOut' : 'availability.restore') }}
          </AButton>
        </div>
        <p v-if="errors[product.id]" role="alert" class="text-body-md text-error">{{ describeApiError(errors[product.id]!, t) }}</p>
      </li>
    </ul>
    <AButton variant="text" :loading="loading" class="mt-3" @click="emit('refresh')">{{ t('operations.quickActions.refresh') }}</AButton>
  </SectionCard>
</template>
