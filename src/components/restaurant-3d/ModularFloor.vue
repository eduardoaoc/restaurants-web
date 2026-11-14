<script setup lang="ts">
import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D } from 'three'
import { onBeforeUnmount } from 'vue'
import { FLOOR } from './floor'
import { LIGHT_STAGE } from './scene-appearance'

const props = withDefaults(defineProps<{ light?: boolean }>(), { light: false })

// Lightweight 1 m floor modules share one geometry/material and one draw call.
const columns = Math.ceil(FLOOR.width)
const rows = Math.ceil(FLOOR.depth)
const mesh = new InstancedMesh(
  new BoxGeometry(0.985, 0.02, 0.985),
  new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }),
  columns * rows,
)
mesh.name = 'modular-dining-floor'
mesh.receiveShadow = true
mesh.castShadow = false
const tile = new Object3D()
const matrix = new Matrix4()
let index = 0
for (let row = 0; row < rows; row++) {
  for (let column = 0; column < columns; column++) {
    tile.position.set(column - FLOOR.width / 2 + 0.5, -0.01, row - FLOOR.depth / 2 + 0.5)
    tile.updateMatrix()
    matrix.copy(tile.matrix)
    mesh.setMatrixAt(index, matrix)
    mesh.setColorAt(index, new Color(props.light
      // Soft peach stripes (two rows each) for the light maquette; the dark scene keeps its checker.
      ? LIGHT_STAGE.floorTiles[Math.floor(row / 2) % 2]
      : (row + column) % 2 ? '#b99875' : '#bea080'))
    index++
  }
}
mesh.instanceMatrix.needsUpdate = true
if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
onBeforeUnmount(() => {
  mesh.dispose()
  mesh.geometry.dispose()
  mesh.material.dispose()
})
</script>

<template>
  <primitive :object="mesh" />
</template>
