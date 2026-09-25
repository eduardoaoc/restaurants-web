import { ref } from 'vue'

import { normalizeApiError, type ApiError } from '@/api/errors'
import { publicVisitService } from '@/services/public-visit.service'
import type { PublicVisit } from '@/types/public-visit'

export type ResolveVisitOutcome = 'resolved' | 'not-paid' | 'not-found' | 'error'

/**
 * Resolves a feedback_token to its post-payment `PublicVisit` (Carta 5.1B).
 * Deliberately NOT a `usePublicMenu`-style "load on mount, watch and
 * refetch" composable — `GET /public/visits/{token}` shares its rate-limit
 * bucket with the feedback form (`throttle:public-feedback` on the backend),
 * so this must only ever be called on demand (payment just detected, a
 * closed session being resolved from its stored token, or a manual retry —
 * never on a timer, see PublicTableView's own docblock on why it polls
 * `usePublicTableResolution` instead). `resolve()` is therefore the only
 * entry point; there is no `reload()`/auto-watch here on purpose.
 */
export function usePublicVisit() {
  const visit = ref<PublicVisit | null>(null)
  const loading = ref(false)
  const error = ref<ApiError | null>(null)

  /**
   * Never called while a previous call is still in flight — the caller's
   * own trigger (a `resolution.session` watcher, see PublicTableView) can
   * fire more than once in quick succession, and this guard is what keeps
   * that from ever becoming two concurrent GETs against the shared bucket.
   */
  async function resolve(feedbackToken: string): Promise<ResolveVisitOutcome> {
    if (loading.value) return 'error'
    loading.value = true
    error.value = null
    try {
      visit.value = await publicVisitService.getVisit(feedbackToken)
      return 'resolved'
    } catch (err) {
      const normalized = normalizeApiError(err)
      if (normalized.kind === 'conflict' && normalized.code === 'TABLE_SESSION_NOT_PAID_FOR_VISIT') {
        // Legitimate, expected state — the visit exists but isn't paid yet.
        // Never surfaced as an error; the caller simply doesn't enter
        // post-visit (CLAUDE.md/Carta 5.1B §3 "nunca inferir pagamento").
        return 'not-paid'
      }
      if (normalized.kind === 'not_found') return 'not-found'
      error.value = normalized
      return 'error'
    } finally {
      loading.value = false
    }
  }

  return { visit, loading, error, resolve }
}
