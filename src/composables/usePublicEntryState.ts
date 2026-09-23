/**
 * Persistence for the QR entry experience (Carta Cliente 4.1) — decides
 * whether a visitor sees the cinematic intro again on reload, keyed per
 * table `publicToken` so a different QR always starts its own independent
 * experience.
 *
 * `sessionStorage` (not `localStorage`) is deliberate: the spec calls for
 * the intro to come back for "a new browser session", which `sessionStorage`
 * gives for free (cleared when the tab/browser session ends) without any
 * extra bookkeeping — and there's no PII here to persist longer than that.
 *
 * Two independent flags, both required by the spec's own state table:
 *   - `introSeen`: the cinematic intro (INTRO_RESTAURANT + INTRO_MESSAGE)
 *     has played once for this token — a reload lands on the gateway
 *     directly instead of replaying it.
 *   - `menuEntered`: the visitor already tapped "Ver la carta" — a reload
 *     goes straight to the menu, skipping the gateway too.
 * `menuEntered` implies `introSeen` in practice (you can't reach the menu
 * without passing the gateway first) but both are still read/written
 * independently — simpler than deriving one from the other, and each has
 * its own single call site.
 */

const INTRO_SEEN_PREFIX = 'aforo-public-intro-seen:'
const MENU_ENTERED_PREFIX = 'aforo-public-menu-entered:'

export interface PublicEntryState {
  introSeen: boolean
  menuEntered: boolean
}

function readFlag(prefix: string, publicToken: string): boolean {
  try {
    return sessionStorage.getItem(`${prefix}${publicToken}`) === '1'
  } catch {
    return false
  }
}

function writeFlag(prefix: string, publicToken: string): void {
  try {
    sessionStorage.setItem(`${prefix}${publicToken}`, '1')
  } catch {
    // Storage unavailable (private browsing, quota, disabled) — the intro
    // simply replays on the next reload, never a hard failure.
  }
}

/** Never throws — degrades to "nothing seen yet" when storage is unavailable. */
export function readPublicEntryState(publicToken: string): PublicEntryState {
  return {
    introSeen: readFlag(INTRO_SEEN_PREFIX, publicToken),
    menuEntered: readFlag(MENU_ENTERED_PREFIX, publicToken),
  }
}

export function markPublicIntroSeen(publicToken: string): void {
  writeFlag(INTRO_SEEN_PREFIX, publicToken)
}

export function markPublicMenuEntered(publicToken: string): void {
  writeFlag(MENU_ENTERED_PREFIX, publicToken)
}
