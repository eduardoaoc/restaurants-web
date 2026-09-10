<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCaretDown, PhCheck, PhStorefront } from '@phosphor-icons/vue'

import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import { useRestaurantStore } from '@/stores/restaurant'

const { t } = useI18n()
const restaurantStore = useRestaurantStore()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

function select(id: number): void {
  void restaurantStore.selectRestaurant(id)
  open.value = false
}

function onFocusOut(event: FocusEvent): void {
  if (!rootRef.value?.contains(event.relatedTarget as Node | null)) {
    open.value = false
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') open.value = false
}
</script>

<template>
  <div v-if="restaurantStore.loading" class="flex h-11 items-center gap-2 px-3 text-on-surface-variant">
    <AProgress size="sm" />
  </div>

  <p
    v-else-if="restaurantStore.availableRestaurants.length === 0"
    class="flex h-11 items-center gap-2 px-3 text-label-lg text-on-surface-variant"
  >
    <PhStorefront :size="18" />
    {{ t('restaurant.noAccess') }}
  </p>

  <!-- Single restaurant: a plain label, not an interactive control with nothing to switch to -->
  <p
    v-else-if="restaurantStore.availableRestaurants.length === 1"
    class="flex h-11 max-w-40 sm:max-w-64 items-center gap-2 truncate px-3 text-label-lg font-medium text-on-surface"
  >
    <PhStorefront :size="18" class="shrink-0 text-on-surface-variant" />
    <span class="truncate">{{ restaurantStore.currentRestaurant?.name }}</span>
  </p>

  <div v-else ref="rootRef" class="relative" @focusout="onFocusOut" @keydown="onKeydown">
    <button
      type="button"
      class="flex h-11 max-w-40 sm:max-w-64 items-center gap-2 rounded-full px-3 text-label-lg font-medium text-on-surface transition-colors duration-200 ease-out hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :aria-label="t('restaurant.switcherLabel')"
      :aria-expanded="open"
      @click="open = !open"
    >
      <PhStorefront :size="18" class="shrink-0 text-on-surface-variant" />
      <span class="truncate">{{ restaurantStore.currentRestaurant?.name }}</span>
      <PhCaretDown :size="14" class="shrink-0 text-on-surface-variant" />
    </button>
    <ASurface
      v-if="open"
      tone="high"
      radius="md"
      role="menu"
      :aria-label="t('restaurant.switcherLabel')"
      class="absolute left-0 z-20 mt-2 min-w-56 py-1 shadow-elevated"
    >
      <button
        v-for="restaurant in restaurantStore.availableRestaurants"
        :key="restaurant.id"
        type="button"
        role="menuitemradio"
        :aria-checked="restaurantStore.currentRestaurantId === restaurant.id"
        class="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-body-md text-on-surface hover:bg-surface-container-highest"
        @click="select(restaurant.id)"
      >
        <span class="truncate">{{ restaurant.name }}</span>
        <PhCheck v-if="restaurantStore.currentRestaurantId === restaurant.id" :size="16" class="shrink-0" />
      </button>
    </ASurface>
  </div>
</template>
