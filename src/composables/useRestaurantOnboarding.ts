import { computed } from 'vue'

export type OnboardingStepStatus = 'done' | 'available' | 'restricted' | 'future'

export interface OnboardingStep {
  id: string
  labelKey: string
  status: OnboardingStepStatus
  /** Only 'available' steps carry an action — 'future'/'restricted' steps never link anywhere, per CLAUDE.md §21. */
  action?: 'open-floor-editor'
}

/**
 * Deterministic onboarding steps — no invented percentage. Each step's
 * `done`/`available`/`restricted`/`future` state comes from a real,
 * checkable signal:
 *   - basic_info: the restaurant record always has a name once created —
 *     trivially always true, not a guess.
 *   - floor_plan: done once at least one table exists anywhere in the
 *     restaurant (from the Operations Live snapshot, never a separate
 *     fetch just for this). While not done, it's 'available' (with the
 *     "Configurar" CTA) only for a user who actually holds
 *     manage_floor_plan (Passo 1.2C) — otherwise it's 'restricted': a
 *     purely informational state, never a CTA that would just 403
 *     (CLAUDE.md §21).
 *   - menu/staff/qr/settings: this app has no screen for them yet (Passo
 *     1.1 scope — Carta, Staff Admin, Customer QR, and a Settings view are
 *     all future steps per the task's own "don't build these now" list),
 *     so they are always 'future' and never link anywhere — never a route
 *     that doesn't exist yet.
 * Percentage is a plain done/total ratio over these 6 fixed steps — e.g.
 * "3 of 6 steps done = 50%", never a random/estimated number.
 */
export function useRestaurantOnboarding(totalTables: () => number, canManageFloorPlan: () => boolean) {
  const steps = computed<OnboardingStep[]>(() => {
    const hasTables = totalTables() > 0
    const floorPlanStatus: OnboardingStepStatus = hasTables ? 'done' : canManageFloorPlan() ? 'available' : 'restricted'

    return [
      { id: 'basic_info', labelKey: 'onboarding.steps.basicInfo', status: 'done' },
      {
        id: 'floor_plan',
        labelKey: 'onboarding.steps.floorPlan',
        status: floorPlanStatus,
        action: floorPlanStatus === 'available' ? 'open-floor-editor' : undefined,
      },
      { id: 'menu', labelKey: 'onboarding.steps.menu', status: 'future' },
      { id: 'staff', labelKey: 'onboarding.steps.staff', status: 'future' },
      { id: 'qr', labelKey: 'onboarding.steps.qr', status: 'future' },
      { id: 'settings', labelKey: 'onboarding.steps.settings', status: 'future' },
    ]
  })

  const completedCount = computed(() => steps.value.filter((step) => step.status === 'done').length)
  const totalCount = computed(() => steps.value.length)
  const percent = computed(() => Math.round((completedCount.value / totalCount.value) * 100))

  return { steps, completedCount, totalCount, percent }
}
