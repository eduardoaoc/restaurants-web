/**
 * Resolves the customer-facing URL a table's QR code should encode.
 *
 * REAL STATE OF THE CONTRACT (audited in Passo 2.7, do not "improve" this
 * without re-auditing):
 *   - `Table.public_token` is a real, persistent, server-generated value
 *     (`Str::random(48)`, uniqueness-checked, never derived from the id —
 *     see Table::generateUniquePublicToken). It is the ONLY identifier that
 *     may ever appear in a QR (§21: never an auth token, session cookie or
 *     internal id).
 *   - The backend already resolves it publicly at
 *     `GET /api/v1/public/tables/{publicToken}` — but that is a JSON API
 *     endpoint, not a page a customer can scan into.
 *   - The customer-facing SPA route does NOT exist yet (the router only has
 *     /login and /app/*). So there is no valid page URL to encode.
 *
 * Rather than fabricate a link that would 404 for a real diner (explicitly
 * forbidden: "NÃO criar link falso"), the public base is read from a single
 * configurable env var and, while it is unset, every QR affordance reports
 * itself as not-yet-published. No production domain is hardcoded anywhere.
 *
 * PENDÊNCIA NÃO BLOQUEANTE — CLIENT PUBLIC ROUTE.
 */
const PUBLIC_BASE_URL: string = (import.meta.env.VITE_PUBLIC_APP_URL ?? '').trim()

/** True once a public base URL is configured — i.e. the QR can encode something real. */
export function isPublicUrlConfigured(): boolean {
  return PUBLIC_BASE_URL.length > 0
}

/**
 * The URL the customer's phone would open for this table, or null while no
 * public base is configured. Callers must treat null as "cannot show a QR
 * yet" — never as "use some fallback".
 */
export function buildTablePublicUrl(publicToken: string): string | null {
  if (!isPublicUrlConfigured() || !publicToken) return null

  return `${PUBLIC_BASE_URL.replace(/\/+$/, '')}/t/${publicToken}`
}

/**
 * A shortened, human-readable form for showing the link on screen (§22) —
 * the owner should recognise the destination at a glance without reading a
 * 48-character token.
 */
export function shortenPublicUrl(url: string, maxTokenChars = 8): string {
  const marker = '/t/'
  const index = url.lastIndexOf(marker)
  if (index === -1) return url

  const base = url.slice(0, index + marker.length)
  const token = url.slice(index + marker.length)
  return token.length <= maxTokenChars ? url : `${base}${token.slice(0, maxTokenChars)}…`
}
