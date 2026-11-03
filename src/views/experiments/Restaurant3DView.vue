<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import ASnackbar from '@/components/ui/ASnackbar.vue'
import RestaurantScene from '@/components/restaurant-3d/RestaurantScene.vue'
import type { RestaurantSceneMode } from '@/components/restaurant-3d/scene-mode'
import { useRestaurantFloorLayout } from '@/composables/useRestaurantFloorLayout'
import { floorLayoutService } from '@/services/floor-layout.service'
import { useRestaurantStore } from '@/stores/restaurant'
import { describeApiError } from '@/utils/error-message'
import type { RestaurantLayoutDocument } from '@/types/restaurant-3d/restaurant-layout'

const modes: { value: RestaurantSceneMode; label: string }[] = [
  { value: 'operation', label: 'Operación' },
  { value: 'edit', label: 'Editar salón' },
]
const mode = ref<RestaurantSceneMode>('operation')

const { t } = useI18n()
const restaurantStore = useRestaurantStore()
const route = useRoute()

// Development only: `?source=mock` shows the seven-table mock, never persisted.
const useMock = import.meta.env.DEV && route.query.source === 'mock'

// The restaurant list may not be loaded when this route is opened directly.
onMounted(() => void restaurantStore.load())

const restaurantId = computed(() => (useMock ? null : restaurantStore.currentRestaurantId))
const { state, layout, error, revision, reload } = useRestaurantFloorLayout(restaurantId)

const saveLayout = (document: RestaurantLayoutDocument) => {
  const id = restaurantId.value
  if (id === null) return Promise.reject(new Error('No restaurant selected'))
  return floorLayoutService.replace(id, document)
}
</script>

<template>
  <main class="restaurant-3d-lab">
    <header class="lab-header">
      <div>
        <span class="eyebrow">Ritma OS</span>
        <h1>3D Restaurant Lab</h1>
      </div>

      <div
        class="mode-switch"
        role="group"
        aria-label="Modo de la escena"
      >
        <button
          v-for="option in modes"
          :key="option.value"
          type="button"
          class="mode-switch__option"
          :aria-pressed="mode === option.value"
          @click="mode = option.value"
        >
          {{ option.label }}
        </button>
      </div>

      <span class="experimental">
        Experimental
      </span>
    </header>

    <RestaurantScene
      v-if="useMock"
      :mode="mode"
    />
    <p
      v-else-if="!restaurantStore.loading && restaurantId === null"
      class="lab-status"
      role="status"
    >
      {{ t('floorLayout.noRestaurant') }}
    </p>
    <p
      v-else-if="state === 'loading' || state === 'idle'"
      class="lab-status"
      role="status"
    >
      {{ t('floorLayout.loading') }}
    </p>
    <div
      v-else-if="state === 'error'"
      class="lab-status"
      role="alert"
    >
      <p>{{ t('floorLayout.loadFailed') }} {{ error ? describeApiError(error, t) : '' }}</p>
      <button
        type="button"
        class="mode-switch__option lab-retry"
        @click="reload"
      >
        {{ t('floorLayout.retry') }}
      </button>
    </div>
    <RestaurantScene
      v-else-if="layout"
      :key="`${restaurantId}-${revision}`"
      :mode="mode"
      :layout="layout"
      :save="saveLayout"
    />
    <ASnackbar />
  </main>
</template>

<style scoped>
.restaurant-3d-lab {
  min-height: 100vh;
  padding: 24px;
  background: #0f0f10;
  color: #ffffff;
}

.lab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.eyebrow {
  display: block;
  margin-bottom: 4px;
  font-size: 13px;
  opacity: 0.55;
}

h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.mode-switch {
  display: inline-flex;
  margin-left: auto;
  padding: 3px;
  border: 1px solid #343434;
  border-radius: 999px;
}

.mode-switch__option {
  min-height: 44px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.mode-switch__option[aria-pressed='true'] {
  background: rgb(242 234 227 / 0.14);
  font-weight: 600;
}

.mode-switch__option:focus-visible {
  outline: 2px solid #f2eae3;
  outline-offset: 2px;
}

.lab-status {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 12px;
  min-height: 320px;
  border: 1px dashed #343434;
  border-radius: 12px;
  text-align: center;
}

.lab-retry {
  border: 1px solid #343434;
}

.experimental {
  padding: 6px 10px;
  border: 1px solid #343434;
  border-radius: 999px;
  font-size: 12px;
  opacity: 0.7;
}
</style>