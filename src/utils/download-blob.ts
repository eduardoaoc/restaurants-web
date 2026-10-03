/**
 * CARTA 9.1D — the one place an authenticated blob response becomes a real
 * browser download. Never `window.open(apiUrl)`: the endpoint needs the
 * Sanctum session cookie and a raw navigation can't surface a 401/403/404/
 * 5xx to the UI, so every download goes through an authenticated Axios
 * call first and only reaches this helper once a real PDF blob is in hand.
 * Revocation always runs (success or thrown) via `finally`, scheduled with
 * `setTimeout(0)` so the anchor's click has already started the download
 * before the object URL is released.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

/**
 * Parses a real `Content-Disposition` response header — the RFC 5987
 * `filename*=UTF-8''...` form (preferred, correctly encodes non-ASCII)
 * first, then the plain `filename="..."` form. Returns null when the
 * header is missing or unparseable (e.g. not exposed via
 * Access-Control-Expose-Headers on a cross-origin response), so callers
 * fall back to their own predictable name — never a guess.
 */
export function parseContentDispositionFilename(headerValue: string | null | undefined): string | null {
  if (!headerValue) return null

  const utf8Match = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(headerValue)
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim())
    } catch {
      // Malformed percent-encoding — fall through to the plain form below.
    }
  }

  const plainMatch = /filename\s*=\s*"?([^";]+)"?/i.exec(headerValue)
  return plainMatch ? plainMatch[1].trim() : null
}
