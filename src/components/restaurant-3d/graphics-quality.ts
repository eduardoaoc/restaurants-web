/**
 * Two predictable graphics tiers, chosen ONCE when the scene mounts (never re-evaluated, so quality can't oscillate):
 *  - `high`:     desktop-class devices. Pixel ratio up to 2, 2048 px shadow map.
 *  - `balanced`: phones and low-memory / few-core touch devices. Pixel ratio up to 1.5, 1024 px shadow map.
 * Geometry, materials, lighting and labels are identical in both; only render resolution and shadow detail differ.
 */
export type QualityTier = 'high' | 'balanced'

export interface GraphicsQuality {
  tier: QualityTier
  /** Pixel-ratio range handed to the renderer: [min, max]. */
  dpr: [number, number]
  shadowMapSize: number
}

export interface DeviceHints {
  coarsePointer: boolean
  viewportWidth: number
  deviceMemoryGB?: number
  cores?: number
}

export function chooseQuality(hints: DeviceHints): GraphicsQuality {
  const smallScreen = hints.viewportWidth <= 640
  const modest = (hints.deviceMemoryGB !== undefined && hints.deviceMemoryGB <= 4) || (hints.cores !== undefined && hints.cores <= 4)
  const balanced = smallScreen || (hints.coarsePointer && modest)
  return balanced
    ? { tier: 'balanced', dpr: [1, 1.5], shadowMapSize: 1024 }
    : { tier: 'high', dpr: [1, 2], shadowMapSize: 2048 }
}

export function detectDeviceHints(): DeviceHints {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return {
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    viewportWidth: window.innerWidth,
    deviceMemoryGB: nav.deviceMemory,
    cores: navigator.hardwareConcurrency || undefined,
  }
}
