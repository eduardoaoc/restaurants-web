// A tab remains pinned to its visit across refresh. Tokens are scoped by
// QR and never attached to the authenticated client or another table.
const visits = new Map<string, string>()
const prefix = 'aforo-public-visit:'

export function readPublicVisitToken(publicToken: string): string | null {
  const inMemory = visits.get(publicToken)
  if (inMemory) return inMemory
  try {
    const token = sessionStorage.getItem(prefix + publicToken)
    if (token) visits.set(publicToken, token)
    return token || null
  } catch {
    return null
  }
}

export function storePublicVisitToken(publicToken: string, token: string): void {
  visits.set(publicToken, token)
  try { sessionStorage.setItem(prefix + publicToken, token) } catch { /* In-memory visit still works. */ }
}

export function publicVisitHeaders(publicToken: string): Record<string, string> {
  const token = readPublicVisitToken(publicToken)
  return token ? { 'X-Table-Visit': token } : {}
}

/** Only an explicit new-visit action can detach the previous visit. */
export function clearPublicVisitToken(publicToken: string): void {
  visits.delete(publicToken)
  try { sessionStorage.removeItem(prefix + publicToken) } catch { /* Storage unavailable. */ }
}
