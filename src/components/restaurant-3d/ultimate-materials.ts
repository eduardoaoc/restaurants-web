import { Color, DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial, type Material } from 'three'

/**
 * Finish of the Ultimate Pack architecture (threejs-materials). The converted GLBs only carry their Unity slot names;
 * every surface is re-skinned here so each material answers to light in its own way (roughness / metalness / opacity):
 *  - paint:    terracotta, matte (roughness ~0.92, no metalness) - reads as painted plaster, not plastic.
 *  - trim:     cream, matte - bands, skirting, joints.
 *  - frame:    graphite window frames and door, slightly satin so the edge catches a thin highlight.
 *  - glass:    pale blue, discreet; transparent without transmission (no extra render pass), tiny roughness for a glint.
 *  - wood:     dark counter top, semi-matt.
 * Values are the visual-design tokens of this scene; components never inline colours.
 */
export const ULTIMATE_PALETTE = {
  terracotta: '#d9774a',
  terracottaDeep: '#a9502f',
  cream: '#ead9b9',
  beige: '#cdb28a',
  graphite: '#2c2e33',
  glass: '#b7dbea',
  sky: '#dfe9ee',
  wood: '#4a2b19',
  woodWarm: '#6a4128',
  grout: '#8f7556',
  chair: '#c4622f',
  chairLegs: '#7a3b1d',
  plate: '#f3eee4',
  potGrey: '#a3a8ae',
  leaf: '#3f9140',
  juice: '#e9a65a',
  lamp: '#f6c23a',
  floorCream: '#f6ede3',
  floorRose: '#ecd0bd',
  counterBody: '#d9743f',
  rim: '#8a7466',
  glassPane: '#cde6ef',
  till: '#d4d6d8',
} as const

export interface UltimateMaterials {
  paint: MeshStandardMaterial
  paintDeep: MeshStandardMaterial
  cream: MeshStandardMaterial
  beige: MeshStandardMaterial
  graphite: MeshStandardMaterial
  glass: MeshPhysicalMaterial
  wood: MeshStandardMaterial
  woodWarm: MeshStandardMaterial
  grout: MeshStandardMaterial
  chair: MeshStandardMaterial
  chairLegs: MeshStandardMaterial
  plate: MeshStandardMaterial
  potGrey: MeshStandardMaterial
  leaf: MeshStandardMaterial
  juice: MeshStandardMaterial
  lamp: MeshStandardMaterial
  till: MeshStandardMaterial
  floor: MeshStandardMaterial
  counterBody: MeshStandardMaterial
  rim: MeshStandardMaterial
  glassPane: MeshStandardMaterial
  all: Material[]
}

/**
 * `raw` is the unfinished baseline used for before/after review (same geometry, camera and size): generic roughness 0.5 /
 * metalness 0.1 on every surface, the pack's own greys and browns, opaque-ish glass. `final` is the finish described above.
 */
export type UltimateFinish = 'final' | 'raw'

function createRawMaterials(): UltimateMaterials {
  const std = (color: string) => new MeshStandardMaterial({ color: new Color(color), roughness: 0.5, metalness: 0.1 })
  const paint = std('#b78552')
  const cream = std('#e6e6e6')
  const beige = std('#c9b08a')
  const graphite = std('#f2f2f2')
  const wood = std('#8a5a33')
  const grout = std('#8f7556')
  const glass = new MeshPhysicalMaterial({ color: new Color('#ffffff'), roughness: 0.5, metalness: 0.1, transparent: true, opacity: 0.6, depthWrite: false, side: DoubleSide })
  const f = std('#bbbbbb')
  return { paint, paintDeep: paint, cream, beige, graphite, glass, wood, woodWarm: wood, grout, chair: f, chairLegs: f, plate: f, potGrey: f, leaf: f, juice: f, lamp: f, till: f, floor: f, counterBody: f, rim: f, glassPane: f, all: [paint, cream, beige, graphite, glass, wood, grout, f] }
}

export function createUltimateMaterials(finish: UltimateFinish = 'final'): UltimateMaterials {
  if (finish === 'raw') return createRawMaterials()
  const std = (color: string, roughness: number, metalness = 0) => new MeshStandardMaterial({ color: new Color(color), roughness, metalness })
  const paint = std(ULTIMATE_PALETTE.terracotta, 0.92)
  const paintDeep = std(ULTIMATE_PALETTE.terracottaDeep, 0.92)
  const cream = std(ULTIMATE_PALETTE.cream, 0.88)
  const beige = std(ULTIMATE_PALETTE.beige, 0.88)
  const graphite = std(ULTIMATE_PALETTE.graphite, 0.5, 0.2)
  const wood = std(ULTIMATE_PALETTE.wood, 0.55)
  const woodWarm = std(ULTIMATE_PALETTE.woodWarm, 0.6)
  const grout = std(ULTIMATE_PALETTE.grout, 1)
  const glass = new MeshPhysicalMaterial({
    color: new Color(ULTIMATE_PALETTE.glass),
    roughness: 0.06,
    metalness: 0,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    side: DoubleSide,
  })
  const chair = std(ULTIMATE_PALETTE.chair, 0.78)
  const chairLegs = std(ULTIMATE_PALETTE.chairLegs, 0.7)
  const plate = std(ULTIMATE_PALETTE.plate, 0.35)
  const potGrey = std(ULTIMATE_PALETTE.potGrey, 0.8)
  const leaf = std(ULTIMATE_PALETTE.leaf, 0.75)
  const juice = std(ULTIMATE_PALETTE.juice, 0.4)
  const lamp = std(ULTIMATE_PALETTE.lamp, 0.5)
  lamp.emissive = new Color(ULTIMATE_PALETTE.lamp)
  lamp.emissiveIntensity = 0.35
  const till = std(ULTIMATE_PALETTE.till, 0.45, 0.15)
  // Walls are single-sided in the pack: show the paint from outside too (the lowered walls are seen from outside).
  paint.side = DoubleSide
  cream.side = DoubleSide
  const floor = std('#ffffff', 0.85)
  const counterBody = std(ULTIMATE_PALETTE.counterBody, 0.8)
  const rim = std(ULTIMATE_PALETTE.rim, 0.85)
  rim.side = DoubleSide
  const glassPane = std(ULTIMATE_PALETTE.glassPane, 0.08)
  glassPane.emissive = new Color(ULTIMATE_PALETTE.glassPane)
  glassPane.emissiveIntensity = 0.25
  return { paint, paintDeep, cream, beige, graphite, glass, wood, woodWarm, grout, chair, chairLegs, plate, potGrey, leaf, juice, lamp, till, floor, counterBody, rim, glassPane, all: [paint, paintDeep, cream, beige, graphite, glass, wood, woodWarm, grout, chair, chairLegs, plate, potGrey, leaf, juice, lamp, till, floor, counterBody, rim, glassPane] }
}

/** Unity slot name (as exported from the pack's FBX) -> finish. */
export type UltimateSlot = 'BROWN-LIGHTEST' | 'GREY-WHITE' | 'WHITE' | 'GLASS' | 'BROWN-DARKEST' | 'BROWN-LIGHT'

export function skinForSlot(rawName: string, m: UltimateMaterials): Material {
  // The converted GLBs keep FBX material names as "<id> <SLOT>" (e.g. "23 GREY-WHITE").
  const slot = rawName.replace(/^\d+\s+/, '')
  switch (slot) {
    // GREY-WHITE is the large face of every wall module (the one that looks into the room): this is the terracotta paint.
    // BROWN-LIGHTEST is the thin edges and top: a muted grey-brown rim, like the thin grey edge of the reference.
    case 'GREY-WHITE': return m.paint
    case 'BROWN-LIGHTEST': return m.rim
    case 'WHITE': return m.graphite
    case 'GLASS': return m.glass
    case 'BROWN-DARKEST': return m.wood
    case 'BROWN-LIGHT': return m.woodWarm
    default: return m.paint
  }
}

export type UltimatePiece = 'table' | 'chair' | 'plate' | 'glass' | 'plant'

/** Finish of the furniture and tableware pieces (same slot-name convention as the architecture). */
export function skinFurniture(rawName: string, piece: UltimatePiece, m: UltimateMaterials): Material {
  const slot = rawName.replace(/^\d+\s+/, '')
  switch (piece) {
    case 'table': return m.wood
    case 'chair': return slot === 'GREY-DARKEST' ? m.chairLegs : m.chair
    case 'plate': return m.plate
    case 'glass': return slot === 'GLASS' ? m.glass : m.juice
    case 'plant': return slot.startsWith('GREEN') ? m.leaf : m.potGrey
  }
}
