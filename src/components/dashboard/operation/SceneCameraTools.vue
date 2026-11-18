<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PhArrowsIn, PhMagnifyingGlassMinus, PhMagnifyingGlassPlus } from '@phosphor-icons/vue'

import AIconButton from '@/components/ui/AIconButton.vue'
import { sceneCommands } from '@/components/restaurant-3d/scene-commands'

/** Camera controls of the 3D room: step zoom out/in and "see the whole room". Plain commands; the scene owns the camera. */
const { t } = useI18n()
</script>

<template>
  <div class="flex items-center gap-2" role="group" :aria-label="t('operations.board.floor.cameraTools')">
    <AIconButton variant="secondary" :label="t('operations.board.floor.zoomOut')" :title="t('operations.board.floor.zoomOut')" @click="sceneCommands.zoomOut++"><PhMagnifyingGlassMinus /></AIconButton>
    <AIconButton variant="secondary" :label="t('operations.board.floor.zoomIn')" :title="t('operations.board.floor.zoomIn')" @click="sceneCommands.zoomIn++"><PhMagnifyingGlassPlus /></AIconButton>
    <AIconButton variant="secondary" :label="t('operations.board.floor.fitRoom')" :title="t('operations.board.floor.fitRoom')" @click="sceneCommands.recenter++"><PhArrowsIn /></AIconButton>
  </div>
</template>
