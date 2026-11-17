import { Color, MeshStandardMaterial } from 'three'

/**
 * Finish of the urban exterior (Phase 3.1K-D2A/D2B): neutral pavement, quiet asphalt, natural greenery, warm timber.
 * Everything is a flat-colour standard material (no textures). The restaurant keeps the warm terracotta: the street
 * stays desaturated so it reads as context, not as a second focal point. Components never inline colours.
 */
export const URBAN_PALETTE = {
  ground: '#2b3326',
  apron: '#a9a49b',
  pavement: '#c3beb5',
  pavementAlt: '#b9b4ab',
  curb: '#d8d4cc',
  road: '#47484c',
  marking: '#e4e0d4',
  pit: '#5a544c',
  trunk: '#6a5240',
  leaf: ['#5f8f4c', '#4f7f40', '#6c9954'],
  shrub: '#4d7c3f',
  hedge: '#3a5f31',
  planter: '#9b9188',
  pole: '#34363a',
  lampGlow: '#ffe2a8',
  deck: '#a97b52',
  deckGap: '#3a2a1d',
} as const

/**
 * Dashboard light stage only (the dev fixture and the editor keep URBAN_PALETTE as is): the world around the room must
 * sit in the same pale maquette as the page chrome, so the huge ground disc takes the stage background and the asphalt
 * is lightened to a quiet grey. Greens, pavement, timber and lamp colours are unchanged.
 */
export const URBAN_STAGE_PALETTE = {
  ground: '#d3ccc1',
  road: '#85868a',
} as const

export interface UrbanMaterials {
  ground: MeshStandardMaterial
  apron: MeshStandardMaterial
  /** White base: tinted per instance (slabs, planks, leaves, neighbours). */
  tinted: MeshStandardMaterial
  curb: MeshStandardMaterial
  road: MeshStandardMaterial
  marking: MeshStandardMaterial
  pit: MeshStandardMaterial
  trunk: MeshStandardMaterial
  shrub: MeshStandardMaterial
  hedge: MeshStandardMaterial
  planter: MeshStandardMaterial
  pole: MeshStandardMaterial
  lampGlow: MeshStandardMaterial
  all: MeshStandardMaterial[]
}

export function createUrbanMaterials(stage = false): UrbanMaterials {
  const std = (color: string, roughness: number, metalness = 0) => new MeshStandardMaterial({ color: new Color(color), roughness, metalness })
  const ground = std(stage ? URBAN_STAGE_PALETTE.ground : URBAN_PALETTE.ground, 1)
  const apron = std(URBAN_PALETTE.apron, 0.95)
  const tinted = std('#ffffff', 0.92)
  const curb = std(URBAN_PALETTE.curb, 0.9)
  const road = std(stage ? URBAN_STAGE_PALETTE.road : URBAN_PALETTE.road, 0.97)
  const marking = std(URBAN_PALETTE.marking, 0.9)
  const pit = std(URBAN_PALETTE.pit, 1)
  const trunk = std(URBAN_PALETTE.trunk, 0.95)
  const shrub = std(URBAN_PALETTE.shrub, 0.9)
  const hedge = std(URBAN_PALETTE.hedge, 0.95)
  const planter = std(URBAN_PALETTE.planter, 0.92)
  const pole = std(URBAN_PALETTE.pole, 0.5, 0.25)
  const lampGlow = std(URBAN_PALETTE.lampGlow, 0.5)
  lampGlow.emissive = new Color(URBAN_PALETTE.lampGlow)
  lampGlow.emissiveIntensity = 0.55
  return { ground, apron, tinted, curb, road, marking, pit, trunk, shrub, hedge, planter, pole, lampGlow, all: [ground, apron, tinted, curb, road, marking, pit, trunk, shrub, hedge, planter, pole, lampGlow] }
}
