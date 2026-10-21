import { appConfig } from '@/config/runtime'

// Existing /t/:publicToken route; origin validated at build and bootstrap.
const PUBLIC_BASE_URL = appConfig.publicAppUrl

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

  return `${PUBLIC_BASE_URL.replace(/\/+$/, '')}/t/${encodeURIComponent(publicToken)}`
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
