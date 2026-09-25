import { publicHttp } from '@/api/public-http'
import type { PublicVisit } from '@/types/public-visit'

/**
 * Thin wrapper around the real, unauthenticated restaurants-api post-visit
 * contract (Carta 5.1A, commit 97e8713):
 *   GET /api/v1/public/visits/{feedbackToken} -> { data: PublicVisit }
 * Keyed ONLY by the opaque feedback_token — never table id/restaurant id/
 * session id, and never a cookie (same `publicHttp` instance as every other
 * public service, `withCredentials` stays at its default `false`). A
 * separate service from public-feedback.service.ts on purpose: same
 * credential and rate-limit bucket (`throttle:public-feedback` on the
 * backend — see routes/api.php), but a distinct contract/purpose, same
 * reasoning public-table.service.ts already documents for keeping the
 * table/feedback services apart.
 */
export const publicVisitService = {
  async getVisit(feedbackToken: string, signal?: AbortSignal): Promise<PublicVisit> {
    const { data } = await publicHttp.get<{ data: PublicVisit }>(`/api/v1/public/visits/${feedbackToken}`, { signal })
    return data.data
  },
}
