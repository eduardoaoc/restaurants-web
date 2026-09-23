import {
  PhAcorn,
  PhAsteriskSimple,
  PhDrop,
  PhEgg,
  PhFish,
  PhFlower,
  PhGrains,
  PhJar,
  PhLeaf,
  PhNut,
  PhPlant,
  PhShrimp,
  PhSpiral,
  PhWine,
} from '@phosphor-icons/vue'
import type { Component } from 'vue'

import type { AllergenCode } from '@/types/allergen'

/**
 * One real Phosphor icon per allergen (Carta 4.2 §6) — Phosphor already
 * ships in this app (CLAUDE.md §17: never install a library for something
 * an existing dependency already covers), so a literal per-code icon beats
 * either emoji (explicitly forbidden) or a single repeated neutral glyph
 * for the several codes with a genuinely close visual match. A handful
 * (soybeans, celery, mustard, sesame) don't have a literal Phosphor icon —
 * those get the closest sensible conceptual match (plant/seed/condiment)
 * rather than a forced literal one, but every code still gets its OWN
 * distinct icon so the 14 chips stay visually scannable as a set.
 */
export const ALLERGEN_ICON: Record<AllergenCode, Component> = {
  gluten: PhGrains,
  crustaceans: PhShrimp,
  eggs: PhEgg,
  fish: PhFish,
  peanuts: PhNut,
  soybeans: PhLeaf,
  milk: PhDrop,
  nuts: PhAcorn,
  celery: PhPlant,
  mustard: PhJar,
  sesame: PhAsteriskSimple,
  sulphites: PhWine,
  lupin: PhFlower,
  molluscs: PhSpiral,
}
