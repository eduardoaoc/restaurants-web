import type { ApiError } from '@/api/errors'
import type { DayCloseDeliveryStatus } from '@/types/day-close-whatsapp'

export const WHATSAPP_POLL_INTERVAL = 12_000
export function isDeliveryInFlight(status: DayCloseDeliveryStatus): boolean {
  return status === 'pending' || status === 'accepted' || status === 'sent'
}

export function whatsappErrorKey(error: ApiError): string {
  const codes: Record<string, string> = {
    WHATSAPP_NOT_AVAILABLE: 'unavailable', WHATSAPP_DISABLED: 'disabled',
    RECIPIENT_REQUIRED: 'recipient', CONSENT_REQUIRED: 'consent',
    DELIVERY_ALREADY_PENDING: 'pending', IDEMPOTENCY_KEY_REUSED: 'idempotency',
  }
  const code = error.code ? codes[error.code] : undefined
  return `dayClose.whatsapp.errors.${code ?? (error.kind === 'forbidden' ? 'forbidden' : error.kind === 'not_found' ? 'notFound' : error.kind === 'rate_limited' ? 'rateLimited' : 'generic')}`
}

export function whatsappFailureKey(status: DayCloseDeliveryStatus, code: string | null): string | null {
  if (status === 'failed') return 'dayClose.whatsapp.failure.failed'
  if (status !== 'skipped') return null
  const reasons: Record<string, string> = { configuration_incomplete: 'unavailable', recipient_missing: 'recipient', consent_missing: 'consent' }
  return `dayClose.whatsapp.failure.${code && reasons[code] ? reasons[code] : 'skipped'}`
}
