/**
 * One-time secrets that arrive in the URL fragment of e-mail links:
 *   /invitation#token=...
 *   /reset-password#token=...&email=...
 *
 * A fragment never reaches any server, but it does sit in the address bar,
 * the history entry and anything that reads `location`. This module is the
 * FIRST import of src/main.ts, so it runs before the router, the app and
 * any other module: it moves the secret into memory and replaces the URL
 * with the bare path, then hands the value out exactly once.
 *
 * Nothing is persisted (no localStorage/sessionStorage) — a reload after
 * this point needs the e-mail link again, by design.
 */
type Captured = { path: string; params: URLSearchParams } | null

const SECRET_PATHS = ['/invitation', '/reset-password']

let captured: Captured = null

export function captureUrlSecrets(): void {
  if (typeof window === 'undefined') return
  const { pathname, hash } = window.location
  if (!SECRET_PATHS.includes(pathname) || !hash || hash === '#') return

  captured = { path: pathname, params: new URLSearchParams(hash.replace(/^#/, '')) }
  window.history.replaceState(window.history.state, '', pathname)
}

/**
 * Returns (and forgets) the secret captured for `path`. If the fragment is
 * still present (e.g. the link was opened in an already-running tab, which
 * does not re-run main.ts), it is captured and stripped now.
 */
export function takeUrlSecret(path: string): URLSearchParams | null {
  if (!captured || captured.path !== path) captureUrlSecrets()
  if (!captured || captured.path !== path) return null
  const { params } = captured
  captured = null
  return params
}

captureUrlSecrets()
