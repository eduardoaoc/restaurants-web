<script setup lang="ts">
import { computed } from 'vue'
import qrcode from 'qrcode-generator'

/**
 * Renders a QR code as inline SVG (crisp at any size, themeable, and
 * printable without a raster round-trip — docs/design-system.md's
 * vector-only rule).
 *
 * `qrcode-generator` is a zero-dependency, long-established encoder; it is
 * the only thing added to the bundle for this, and it runs entirely
 * client-side — the token never leaves the browser to a third party.
 *
 * Type 0 = automatic version selection (smallest version that fits the
 * payload). Error-correction level M is the usual print compromise:
 * ~15% recoverable, so a slightly scuffed table sticker still scans.
 */
const props = withDefaults(
  defineProps<{
    value: string
    /** Rendered edge length in px. */
    size?: number
    /** Quiet-zone width, in modules. The spec requires 4; never go below it or scanners struggle. */
    margin?: number
  }>(),
  { size: 180, margin: 4 },
)

const modules = computed<boolean[][]>(() => {
  const qr = qrcode(0, 'M')
  qr.addData(props.value)
  qr.make()

  const count = qr.getModuleCount()
  return Array.from({ length: count }, (_, row) =>
    Array.from({ length: count }, (_, column) => qr.isDark(row, column)),
  )
})

const moduleCount = computed(() => modules.value.length)
const viewBoxSize = computed(() => moduleCount.value + props.margin * 2)

/**
 * One <path> for the whole symbol instead of one <rect> per module — a
 * 33x33 code is ~1089 nodes otherwise, which is slow to print and bloats
 * the DOM for no benefit.
 */
const path = computed(() => {
  const parts: string[] = []
  modules.value.forEach((row, rowIndex) => {
    row.forEach((isDark, columnIndex) => {
      if (isDark) parts.push(`M${columnIndex + props.margin} ${rowIndex + props.margin}h1v1h-1z`)
    })
  })
  return parts.join('')
})
</script>

<template>
  <svg
    :width="size"
    :height="size"
    :viewBox="`0 0 ${viewBoxSize} ${viewBoxSize}`"
    shape-rendering="crispEdges"
    role="img"
    :aria-label="$t('tables.qr.codeAriaLabel')"
    class="rounded-md bg-white p-1"
  >
    <!-- Always black-on-white, never themed: a themed (e.g. orange-on-dark)
         QR loses the contrast ratio scanners rely on, and this exact SVG is
         what gets printed onto a physical table card. -->
    <rect :width="viewBoxSize" :height="viewBoxSize" fill="#ffffff" />
    <path :d="path" fill="#000000" />
  </svg>
</template>
