import { reactive } from 'vue'
import type { ScreenInsets } from './camera-fit'

/**
 * Pixels per metre (on the floor, at the orbit target) at which the table labels' occupancy line has room: neighbouring
 * tables are >= ~3 m apart and a full label is ~85-105 px wide. Hysteresis keeps it from flickering while zooming.
 */
export const LABEL_DETAIL_SHOW_PX_PER_M = 34
export const LABEL_DETAIL_HIDE_PX_PER_M = 30

/** Below this scale (px per metre) the state badges shrink to a dot and a count; above it they say their full text. */
export const BADGE_COMPACT_BELOW_PX_PER_M = 20
export const BADGE_COMPACT_ABOVE_PX_PER_M = 24

/**
 * Where and how densely overlays may draw inside the canvas. Written by CameraRig (which knows the canvas, the camera
 * and the device's safe areas); read by every overlay. One restaurant scene exists per page.
 */
export const overlayViewport = reactive<{ insets: ScreenInsets; edge: number; pxPerMeter: number; labelDetail: boolean; badgeCompact: boolean }>({
  insets: { left: 0, right: 0, top: 0, bottom: 0 },
  edge: 6,
  pxPerMeter: 0,
  labelDetail: true,
  badgeCompact: false,
})

/** Updates the density state from the current scale. Pure apart from the shared state it owns. */
export function updateOverlayDensity(pxPerMeter: number): void {
  overlayViewport.pxPerMeter = pxPerMeter
  if (overlayViewport.labelDetail && pxPerMeter < LABEL_DETAIL_HIDE_PX_PER_M) overlayViewport.labelDetail = false
  else if (!overlayViewport.labelDetail && pxPerMeter >= LABEL_DETAIL_SHOW_PX_PER_M) overlayViewport.labelDetail = true
  if (!overlayViewport.badgeCompact && pxPerMeter > 0 && pxPerMeter < BADGE_COMPACT_BELOW_PX_PER_M) overlayViewport.badgeCompact = true
  else if (overlayViewport.badgeCompact && pxPerMeter >= BADGE_COMPACT_ABOVE_PX_PER_M) overlayViewport.badgeCompact = false
}
