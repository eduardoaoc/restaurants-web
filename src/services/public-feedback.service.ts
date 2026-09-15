import { publicHttp } from '@/api/public-http'
import type { CreatePublicFeedbackRequest, PublicFeedback, PublicFeedbackContext } from '@/types/public-feedback'

/**
 * Thin wrapper around the real, unauthenticated restaurants-api public
 * feedback contract (Passo 3.5, verified live):
 *   GET  /api/v1/public/feedback/{feedbackToken}  -> { data: PublicFeedbackContext }
 *   POST /api/v1/public/feedback/{feedbackToken}  -> { data: PublicFeedback } (201, or 200 on an idempotent replay)
 * Deliberately a separate service from public-table.service.ts — the
 * feedback token is a distinct credential from the table's own
 * public_token (never interchangeable, see PublicSessionState's docblock).
 */
export const publicFeedbackService = {
  async getContext(feedbackToken: string, signal?: AbortSignal): Promise<PublicFeedbackContext> {
    const { data } = await publicHttp.get<{ data: PublicFeedbackContext }>(`/api/v1/public/feedback/${feedbackToken}`, {
      signal,
    })
    return data.data
  },

  async submit(feedbackToken: string, payload: CreatePublicFeedbackRequest): Promise<PublicFeedback> {
    const { data } = await publicHttp.post<{ data: PublicFeedback }>(`/api/v1/public/feedback/${feedbackToken}`, payload)
    return data.data
  },
}
