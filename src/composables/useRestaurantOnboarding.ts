import { computed } from 'vue'

export type OnboardingStepStatus = 'done' | 'available' | 'restricted' | 'future'

export interface OnboardingStep {
  id: string
  labelKey: string
  status: OnboardingStepStatus
  /** Only 'available' steps carry an action — 'future'/'restricted' steps never link anywhere, per CLAUDE.md §21. */
  action?: 'open-floor-editor' | 'navigate-menu' | 'navigate-staff' | 'navigate-settings'
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
 *   - menu (Passo 2.9): /app/menu is a real route now (Passo 2.2). 'done'
 *     once GET .../menu actually returns a Menu record (never a guess —
 *     the caller passes `hasMenu` straight from useRestaurantMenu's own
 *     404-vs-200 signal); 'available' with a real navigate action while not
 *     done AND the user holds manage_menu; 'restricted' otherwise.
 *   - staff (Passo 2.9): /app/staff is a real route (Passo 2.8). 'done'
 *     once the organization roster has more than just the signed-in owner
 *     — the same "have you actually added anything yet" shape as
 *     floor_plan's `hasTables`, not an invented headcount target;
 *     'available'/'restricted' mirror menu's, gated on manage_users.
 *   - settings (Passo 2.10): /app/settings is a real route now. There is no
 *     objective "done" signal for it — unlike floor_plan/menu/staff, no
 *     single field means "settings are configured" (every field already
 *     has a real default from creation, per RestaurantSettings::
 *     DEFAULT_*). Rather than fake a completion state, this step is only
 *     ever 'available' (navigable) or 'restricted' — never 'done' — exactly
 *     per CLAUDE.md's "no fingir conclusão" rule for this Passo.
 *   - qr: still has no dedicated screen (it lives inside Mesas as a
 *     per-table feature, not its own onboarding-able flow) — always
 *     'future', never linking to a route that doesn't exist.
 * Percentage is a plain done/total ratio over these 6 fixed steps — e.g.
 * "3 of 6 steps done = 50%", never a random/estimated number.
 */
export function useRestaurantOnboarding(
  totalTables: () => number,
  canManageFloorPlan: () => boolean,
  canManageMenu: () => boolean,
  hasMenu: () => boolean,
  canManageStaff: () => boolean,
  hasStaffBeyondOwner: () => boolean,
  canManageSettings: () => boolean,
) {
  const steps = computed<OnboardingStep[]>(() => {
    const hasTables = totalTables() > 0
    const floorPlanStatus: OnboardingStepStatus = hasTables ? 'done' : canManageFloorPlan() ? 'available' : 'restricted'
    const menuStatus: OnboardingStepStatus = hasMenu() ? 'done' : canManageMenu() ? 'available' : 'restricted'
    const staffStatus: OnboardingStepStatus = hasStaffBeyondOwner() ? 'done' : canManageStaff() ? 'available' : 'restricted'
    const settingsStatus: OnboardingStepStatus = canManageSettings() ? 'available' : 'restricted'

    return [
      { id: 'basic_info', labelKey: 'onboarding.steps.basicInfo', status: 'done' },
      {
        id: 'floor_plan',
        labelKey: 'onboarding.steps.floorPlan',
        status: floorPlanStatus,
        action: floorPlanStatus === 'available' ? 'open-floor-editor' : undefined,
      },
      {
        id: 'menu',
        labelKey: 'onboarding.steps.menu',
        status: menuStatus,
        action: menuStatus === 'available' ? 'navigate-menu' : undefined,
      },
      {
        id: 'staff',
        labelKey: 'onboarding.steps.staff',
        status: staffStatus,
        action: staffStatus === 'available' ? 'navigate-staff' : undefined,
      },
      { id: 'qr', labelKey: 'onboarding.steps.qr', status: 'future' },
      {
        id: 'settings',
        labelKey: 'onboarding.steps.settings',
        status: settingsStatus,
        action: settingsStatus === 'available' ? 'navigate-settings' : undefined,
      },
    ]
  })

  const completedCount = computed(() => steps.value.filter((step) => step.status === 'done').length)
  const totalCount = computed(() => steps.value.length)
  const percent = computed(() => Math.round((completedCount.value / totalCount.value) * 100))

  return { steps, completedCount, totalCount, percent }
}
