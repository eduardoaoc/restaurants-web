/**
 * Catalogue of the browser-ready Quaternius characters (CC0) used by the
 * character laboratory. Every file shares the same 62-bone rig and the same
 * 24 clips, verified when the assets were converted — the clip list itself is
 * still read from each loaded file at runtime, never hardcoded here.
 */
export type CharacterGender = 'men' | 'women'

export interface CharacterVariant {
  id: string
  label: string
  url: string
}

export const CHARACTER_ASSET_ROOT = '/assets/restaurant-3d/characters'
const BASE = `${CHARACTER_ASSET_ROOT}/optimized`

export const CHARACTER_CATALOG: Record<CharacterGender, { label: string; variants: CharacterVariant[] }> = {
  men: {
    label: 'Male',
    variants: [
      { id: 'casual-2', label: 'Casual', url: `${BASE}/men/casual-2.glb` },
      { id: 'casual-hoodie', label: 'Hoodie', url: `${BASE}/men/casual-hoodie.glb` },
      { id: 'suit', label: 'Suit', url: `${BASE}/men/suit.glb` },
    ],
  },
  women: {
    label: 'Female',
    variants: [
      { id: 'casual', label: 'Casual', url: `${BASE}/women/casual.glb` },
      { id: 'formal', label: 'Formal', url: `${BASE}/women/formal.glb` },
      { id: 'suit', label: 'Suit', url: `${BASE}/women/suit.glb` },
    ],
  },
}

/**
 * Single-draw-call customer build of a variant (all primitives baked into one skinned mesh with
 * vertex colours, only the clips a customer needs). Parts cannot be toggled on these; the clip
 * viewer keeps using the per-part `optimized/` files.
 */
export const customerAsset = (url: string) => url.replace('/characters/optimized/', '/characters/customers/')
