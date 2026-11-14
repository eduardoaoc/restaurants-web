import type { RestaurantTableConfig } from '@/types/restaurant-3d/restaurant-layout'
import type { FramingPoint, ScreenInsets } from './camera-fit'
import { tableFootprint } from './table-footprint'
import { GUEST_ANCHOR_HEIGHT, TABLE_ANCHOR_HEIGHT, getTableDimensions } from './table-geometry'
import { RING_MARGIN } from './ring-style'

/**
 * On-screen size of the DOM overlays (operational pills, flags, table labels). These mirror the CSS of
 * OperationalBadge / OperationsFlagBadge / TableInfoLabel — the widest string each can show at its breakpoint — and are
 * what the camera framing and the edge clamp reserve room for. Keep them in step with those components' styles.
 */
export const COMPACT_VIEWPORT_PX = 640

export interface OverlayMetrics {
  /** Half of the widest operational pill, rim included. */
  pillHalfWidth: number
  /** Room above a table anchor: a pill stacked on a flag. */
  stackAbove: number
  /** Half height of a table label. */
  labelHalfWidth: number
  labelHalfHeight: number
  /** Breathing room between an overlay and the canvas edge. */
  edge: number
}

export function overlayMetrics(viewportWidth: number): OverlayMetrics {
  return viewportWidth <= COMPACT_VIEWPORT_PX
    ? { pillHalfWidth: 70, stackAbove: 54, labelHalfWidth: 46, labelHalfHeight: 18, edge: 6 }
    : { pillHalfWidth: 92, stackAbove: 62, labelHalfWidth: 56, labelHalfHeight: 22, edge: 8 }
}

/**
 * Share of a pill's half width the camera framing keeps between its anchor and the canvas edge. The rest is covered by
 * the edge clamp, which slides the pill inwards. On a 390 px phone the full half width would push the camera so far
 * back that tables turn into specks; half of it keeps every pill within ~35 px of the table it belongs to.
 */
export const PILL_FRAMING_SHARE = 0.5

/** Anchor of the stacked flag above the table anchor (m); see RestaurantTable. */
export const FLAG_ANCHOR_LIFT = 0.25
const LABEL_CLEARANCE = 0.55

/**
 * Everything that must stay inside the canvas for one table: footprint corners (tabletop + chairs, small pad), the
 * label resting in front of it and the anchor its pills hang from (these two with the overlay's own pixel size).
 */
export function tableFramingPoints(table: RestaurantTableConfig, metrics: OverlayMetrics): FramingPoint[] {
  const fp = tableFootprint(table)
  const points: FramingPoint[] = []
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const lx = sx * fp.halfX
      const lz = sz * fp.halfZ
      points.push({
        x: fp.x + lx * fp.axisX[0] + lz * fp.axisZ[0],
        y: 0,
        z: fp.z + lx * fp.axisX[1] + lz * fp.axisZ[1],
        padX: metrics.edge, padTop: metrics.edge, padBottom: metrics.edge,
      })
    }
  }
  // Same offset RestaurantTable uses for the label anchor (world +z, from the rotated tabletop's extent).
  const theta = (table.rotation * Math.PI) / 180
  const dims = getTableDimensions(table.shape, table.seats)
  const extentZ = (Math.abs(Math.cos(theta)) * dims.depth + Math.abs(Math.sin(theta)) * dims.width) / 2
  points.push({
    x: table.position.x, // the label's local offset is rotated back: it rests straight in front (world +z)
    y: 0.02,
    z: table.position.z + extentZ + RING_MARGIN + LABEL_CLEARANCE,
    padX: metrics.labelHalfWidth + metrics.edge,
    padTop: metrics.labelHalfHeight + metrics.edge,
    padBottom: metrics.labelHalfHeight + metrics.edge,
  })
  // Guest-targeted pills hang from the seats, which sit at the tabletop's edges: reserve the pill's width there too.
  const { width, depth } = dims
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const lx = (sx * width) / 2
      const lz = (sz * depth) / 2
      points.push({
        x: table.position.x + lx * cos + lz * sin,
        y: GUEST_ANCHOR_HEIGHT,
        z: table.position.z - lx * sin + lz * cos,
        padX: metrics.pillHalfWidth * PILL_FRAMING_SHARE + metrics.edge,
        padTop: metrics.stackAbove + metrics.edge,
        padBottom: metrics.edge,
      })
    }
  }
  points.push({
    x: table.position.x,
    y: TABLE_ANCHOR_HEIGHT + FLAG_ANCHOR_LIFT,
    z: table.position.z,
    padX: metrics.pillHalfWidth * PILL_FRAMING_SHARE + metrics.edge,
    padTop: metrics.stackAbove + metrics.edge,
    padBottom: metrics.labelHalfHeight + metrics.edge,
  })
  return points
}

// --- Safe areas ---------------------------------------------------------------------------------------------------

export interface Rect { left: number; right: number; top: number; bottom: number }

/**
 * Insets (px, relative to the canvas) that keep overlays out of the device's unsafe areas: for each side, how far the
 * canvas reaches into the region reserved by the system (notch, rounded corners, home indicator).
 */
export function canvasSafeInsets(canvas: Rect, viewport: { width: number; height: number }, safe: ScreenInsets): ScreenInsets {
  const clamp = (v: number) => Math.max(0, Math.round(v))
  return {
    left: clamp(safe.left - canvas.left),
    right: clamp(canvas.right - (viewport.width - safe.right)),
    top: clamp(safe.top - canvas.top),
    bottom: clamp(canvas.bottom - (viewport.height - safe.bottom)),
  }
}

/** Reads `env(safe-area-inset-*)` through a throw-away element (0 everywhere on devices without cut-outs). */
export function readSafeAreaInsets(): ScreenInsets {
  const zero = { left: 0, right: 0, top: 0, bottom: 0 }
  if (typeof document === 'undefined') return zero
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;inset:0;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'
  document.body.appendChild(probe)
  const style = getComputedStyle(probe)
  const read = (value: string) => Number.parseFloat(value) || 0
  const insets = { top: read(style.paddingTop), right: read(style.paddingRight), bottom: read(style.paddingBottom), left: read(style.paddingLeft) }
  probe.remove()
  return insets
}

// --- Edge clamp ---------------------------------------------------------------------------------------------------

/**
 * Keeps a centred overlay of `size` fully inside `bounds` by nudging it inwards. A point whose anchor lies more than
 * `slack` outside the bounds is left alone: that table really is off screen, and pinning its pill to the edge would
 * point at a place that is not there. Returns the position to use.
 */
export function clampOverlay(
  position: { x: number; y: number },
  size: { width: number; height: number },
  bounds: { width: number; height: number },
  insets: ScreenInsets,
  edge: number,
): { x: number; y: number } {
  const halfW = size.width / 2
  const halfH = size.height / 2
  const minX = insets.left + edge + halfW
  const maxX = bounds.width - insets.right - edge - halfW
  const minY = insets.top + edge + halfH
  const maxY = bounds.height - insets.bottom - edge - halfH
  // "Still on screen" is judged against the canvas itself (the pill's own half size as slack), not the inset area.
  const insideX = position.x >= -halfW && position.x <= bounds.width + halfW
  const insideY = position.y >= -halfH && position.y <= bounds.height + halfH
  return {
    x: insideX && maxX >= minX ? Math.min(maxX, Math.max(minX, position.x)) : position.x,
    y: insideY && maxY >= minY ? Math.min(maxY, Math.max(minY, position.y)) : position.y,
  }
}
