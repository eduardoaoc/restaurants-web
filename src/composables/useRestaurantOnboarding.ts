import { computed } from 'vue'

export type OnboardingStepStatus = 'done' | 'available' | 'future'

export interface OnboardingStep {
  id: string
  labelKey: string
  status: OnboardingStepStatus
  /** Only 'available' steps carry an action — 'future' steps never link anywhere, per CLAUDE.md §21. */
  action?: 'open-floor-editor'
}

/**
 * Deterministic onboarding steps — no invented percentage. Each step's
 * `done`/`available`/`future` state comes from a real, checkable signal:
 *   - basic_info: the restaurant record always has a name once created —
 *     trivially always true, not a guess.
 *   - floor_plan: done once at least one table exists anywhere in the
 *     restaurant (from the Operations Live snapshot, never a separate
 *     fetch just for this).
 *   - menu/staff/qr/settings: this app has no screen for them yet (Passo
 *     1.1 scope — Carta, Staff Admin, Customer QR, and a Settings view are
 *     all future steps per the task's own "don't build these now" list),
 *     so they are always 'future' and never link anywhere — never a route
 *     that doesn't exist yet.
 * Percentage is a plain done/total ratio over these 6 fixed steps — e.g.
 * "3 of 6 steps done = 50%", never a random/estimated number.
 */
export function useRestaurantOnboarding(totalTables: () => number) {
  const steps = computed<OnboardingStep[]>(() => [
    { id: 'basic_info', labelKey: 'onboarding.steps.basicInfo', status: 'done' },
    {
      id: 'floor_plan',
      labelKey: 'onboarding.steps.floorPlan',
      status: totalTables() > 0 ? 'done' : 'available',
      action: totalTables() > 0 ? undefined : 'open-floor-editor',
    },
    { id: 'menu', labelKey: 'onboarding.steps.menu', status: 'future' },
    { id: 'staff', labelKey: 'onboarding.steps.staff', status: 'future' },
    { id: 'qr', labelKey: 'onboarding.steps.qr', status: 'future' },
    { id: 'settings', labelKey: 'onboarding.steps.settings', status: 'future' },
  ])

  const completedCount = computed(() => steps.value.filter((step) => step.status === 'done').length)
  const totalCount = computed(() => steps.value.length)
  const percent = computed(() => Math.round((completedCount.value / totalCount.value) * 100))

  return { steps, completedCount, totalCount, percent }
}
