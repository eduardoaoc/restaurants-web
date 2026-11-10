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

/**
 * Team search by the technical user ID (users.id), e.g. `123` or `#123`.
 * Only a purely numeric query (optionally prefixed with `#`) is an ID query;
 * anything else is plain text. The match is EXACT — `12` never finds #123.
 * The ID is a label for finding people the API already returned to this
 * user: it never fetches anybody, so it grants no access to other teams.
 */
export function parseStaffIdQuery(query: string): number | null {
  const match = /^#?\s*(\d{1,12})$/.exec(query.trim())
  return match ? Number(match[1]) : null
}

export function staffMatchesId(query: string, id: number): boolean {
  const wanted = parseStaffIdQuery(query)
  return wanted !== null && wanted === id
}
