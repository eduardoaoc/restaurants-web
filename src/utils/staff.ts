/**
 * Small shared helpers for the Equipo (Staff) module — kept out of the
 * components so the list row, the detail panel and the form all render a
 * person identically.
 */

/** Up to two initials, matching the operational StaffLivePanel's avatar treatment. */
export function staffInitials(name: string | null): string {
  if (!name) return '?'

  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

/**
 * "Is this person operational in this organization?" — the single place the
 * question is answered, so the row, the panel and the filter can never
 * disagree.
 *
 * Only the explicit `inactive` counts as deactivated. Anything else (a value
 * this release has never heard of, or a missing pivot on an edge-case
 * payload) is read as active on purpose: showing someone as "desactivado"
 * when we aren't sure would be a false statement about their access, which
 * is worse than showing no exception badge at all.
 */
export function isStaffActive(status: string | null | undefined): boolean {
  return status !== 'inactive'
}

/**
 * i18n key for a role slug. Unknown slugs fall back to a generic key rather
 * than printing a raw slug at the owner — the backend may seed a role this
 * release has never heard of (same open-union reasoning as PermissionSlug).
 */
export function staffRoleLabelKey(slug: string | null | undefined): string {
  const known = ['manager', 'waiter', 'kitchen', 'cashier', 'owner']
  return slug && known.includes(slug) ? `staff.roles.${slug}` : 'staff.roles.other'
}
