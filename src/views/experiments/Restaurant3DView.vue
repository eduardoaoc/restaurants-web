<script setup lang="ts">
import { ref } from 'vue'
import RestaurantScene from '@/components/restaurant-3d/RestaurantScene.vue'
import type { RestaurantSceneMode } from '@/components/restaurant-3d/scene-mode'

const modes: { value: RestaurantSceneMode; label: string }[] = [
  { value: 'operation', label: 'Operación' },
  { value: 'edit', label: 'Editar salón' },
]
const mode = ref<RestaurantSceneMode>('operation')
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

    <RestaurantScene :mode="mode" />
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

.experimental {
  padding: 6px 10px;
  border: 1px solid #343434;
  border-radius: 999px;
  font-size: 12px;
  opacity: 0.7;
}
</style>