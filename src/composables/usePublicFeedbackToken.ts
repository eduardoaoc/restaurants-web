/**
 * Persistence strategy for the post-visit feedback token (Passo 3.5 §3 —
 * this is the exact, documented design, not an implementation detail left
 * to infer).
 *
 * WHY this is needed at all: `session.feedback.token` (see
 * PublicSessionState in types/public-menu.ts) is only present in the
 * response while the table's session is ACTIVE. The backend confirmed live
 * (Passo 3.5 audit) that once a session closes, `GET .../menu` and
 * `GET .../tables/{token}` stop returning it entirely — the response
 * collapses to `feedback: { eligible: false }`, no token. Since staff can
 * (and, in the fastest real flow, do) close the table within seconds of
 * payment, the ONLY way the customer can still leave feedback after that
 * point is if the frontend captured the token earlier and kept it,
 * independent of the live session response.
 *
 * WHERE it lives: `localStorage`, one key per table (keyed by the table's
 * own `publicToken` from the route, e.g. `aforo-feedback:AbC123...`) —
 * consistent with this app's existing local-only persistence (theme/locale
 * already use localStorage; CLAUDE.md §5 "never auth tokens" doesn't apply
 * here, this is a single-use, anonymous, table-scoped feedback credential,
 * not an auth token). Scoping by table (not a global key) means switching
 * between tables/QR codes on the same device never confuses one visit's
 * context with another's.
 *
 * WHAT is stored: `{ token: string, submitted: boolean }` — deliberately
 * the bare minimum. Never first_name/last_name/comments/contact (§10/§26 —
 * those only ever live in the form's own in-memory state and the backend,
 * never localStorage). `submitted` exists purely so a reload after a
 * successful submission can show the "ya enviaste tu valoración" state
 * immediately, without a network round trip — GET .../feedback/{token}
 * remains the authoritative check whenever it's actually called.
 *
 * WHEN it's written:
 *   - Whenever a LIVE `session.feedback.token` is observed (session still
 *     active) and it differs from whatever is currently stored for this
 *     table — the entire entry is replaced (token + submitted reset to the
 *     live `already_submitted`), never merged. This is what guarantees a
 *     new TableSession at the same table (a new visit) can never inherit a
 *     previous visit's stored context: a new token always wins outright.
 *   - Whenever a submission succeeds, `submitted` is flipped to `true` in
 *     place (same token, only the flag changes) via markSubmitted().
 *
 * WHEN it's read: only as a fallback, when the live menu response has no
 * active session (closed, or not loaded yet) — see PublicTableView's own
 * `feedbackToken`/`feedbackEligible` computation. While the session is
 * live, the live response is always preferred over the stored copy.
 */

const STORAGE_PREFIX = 'aforo-feedback:'

export interface StoredFeedbackContext {
  token: string
  submitted: boolean
}

function storageKey(tablePublicToken: string): string {
  return `${STORAGE_PREFIX}${tablePublicToken}`
}

/** Never throws — localStorage can be unavailable (private browsing, quota, disabled) and this must degrade to "no stored context" rather than break the page. */
export function readStoredFeedback(tablePublicToken: string): StoredFeedbackContext | null {
  try {
    const raw = localStorage.getItem(storageKey(tablePublicToken))
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && typeof (parsed as { token?: unknown }).token === 'string') {
      return { token: (parsed as { token: string }).token, submitted: Boolean((parsed as { submitted?: unknown }).submitted) }
    }
    return null
  } catch {
    return null
  }
}

function writeStoredFeedback(tablePublicToken: string, context: StoredFeedbackContext): void {
  try {
    localStorage.setItem(storageKey(tablePublicToken), JSON.stringify(context))
  } catch {
    // Storage unavailable — feedback still works for this page load from the live session response, it just won't survive a reload/close.
  }
}

/**
 * Reconciles the live session's feedback info into storage for this table.
 * A new/different token always fully replaces whatever was stored (new
 * visit); the same token only ever has its `submitted` flag advanced from
 * false to true (a live `already_submitted: true` is authoritative and
 * wins over a stale local `false`), never regressed back to false.
 */
export function syncStoredFeedback(tablePublicToken: string, token: string, alreadySubmitted: boolean): void {
  const existing = readStoredFeedback(tablePublicToken)
  if (existing?.token === token) {
    if (alreadySubmitted && !existing.submitted) {
      writeStoredFeedback(tablePublicToken, { token, submitted: true })
    }
    return
  }
  writeStoredFeedback(tablePublicToken, { token, submitted: alreadySubmitted })
}

/** Called right after a successful POST — marks this visit as done without waiting for any further GET. */
export function markStoredFeedbackSubmitted(tablePublicToken: string): void {
  const existing = readStoredFeedback(tablePublicToken)
  if (existing) writeStoredFeedback(tablePublicToken, { ...existing, submitted: true })
}

/** A 404 FEEDBACK_TOKEN_NOT_FOUND means the stored token is dead (expired/invalidated server-side) — drop it so the CTA never resurfaces a broken context. */
export function clearStoredFeedback(tablePublicToken: string): void {
  try {
    localStorage.removeItem(storageKey(tablePublicToken))
  } catch {
    // Nothing to clean up if storage was never reachable in the first place.
  }
}
