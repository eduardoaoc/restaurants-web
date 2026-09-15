import { http } from '@/api/http'
import type {
  CustomerFeedback,
  CustomerFeedbackListItem,
  CustomerFeedbackPaginationMeta,
  CustomerFeedbackSummary,
} from '@/types/customer-feedback'

export interface CustomerFeedbackPage {
  feedback: CustomerFeedbackListItem[]
  meta: CustomerFeedbackPaginationMeta
}

export interface CustomerFeedbackQuery {
  page?: number
  per_page?: number
}

interface ListEnvelope {
  data: { feedback: CustomerFeedbackListItem[] }
  meta: CustomerFeedbackPaginationMeta
}
interface DetailEnvelope {
  data: CustomerFeedback
}
interface SummaryEnvelope {
  data: CustomerFeedbackSummary
}

/**
 * Thin wrapper around the real restaurants-api Customer Feedback contract
 * (Passo 3.5):
 *   GET /api/v1/restaurants/{restaurant}/feedback                        (list, gated on view_customer_feedback)
 *   GET /api/v1/feedback/{customerFeedback}                               (full detail, gated on view_customer_feedback)
 *   GET /api/v1/me/feedback-summary                                      (own aggregate — any authenticated user)
 *   GET /api/v1/restaurants/{restaurant}/staff/{staff}/feedback-summary  (one staff member's aggregate, gated on view_customer_feedback)
 * Never conflated with staff.service.ts's getPerformance() — that is the
 * unrelated internal StaffReview system (manage_staff_reviews/view_reports).
 */
export const customerFeedbackService = {
  async list(restaurantId: number, query: CustomerFeedbackQuery = {}, signal?: AbortSignal): Promise<CustomerFeedbackPage> {
    const { data } = await http.get<ListEnvelope>(`/api/v1/restaurants/${restaurantId}/feedback`, {
      params: query,
      signal,
    })
    return { feedback: data.data.feedback, meta: data.meta }
  },

  async get(customerFeedbackId: number): Promise<CustomerFeedback> {
    const { data } = await http.get<DetailEnvelope>(`/api/v1/feedback/${customerFeedbackId}`)
    return data.data
  },

  async meSummary(signal?: AbortSignal): Promise<CustomerFeedbackSummary> {
    const { data } = await http.get<SummaryEnvelope>('/api/v1/me/feedback-summary', { signal })
    return data.data
  },

  async staffSummary(restaurantId: number, staffId: number, signal?: AbortSignal): Promise<CustomerFeedbackSummary> {
    const { data } = await http.get<SummaryEnvelope>(`/api/v1/restaurants/${restaurantId}/staff/${staffId}/feedback-summary`, {
      signal,
    })
    return data.data
  },
}
