/** CARTA 9.1E: OpenAPI schemas plus resource nullability, audited 2026-10-03. */
export type DayCloseDeliveryStatus = 'pending' | 'accepted' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped'
export type DayCloseDeliveryKind = 'automatic' | 'manual_resend'

export interface DayCloseWhatsAppRecipient {
  id: number
  name: string
  phone_masked: string
  linked_user_id: number | null
  active: boolean
  consent_given_at: string | null
  consent_method: string | null
  consent_text_version: string | null
}

export interface DayCloseWhatsAppSettings {
  enabled: boolean
  available: boolean
  status: 'disabled' | 'configuration_required' | 'ready'
  consent_text: string
  consent_text_version: string
  recipient: DayCloseWhatsAppRecipient | null
}

export interface UpdateDayCloseWhatsAppSettingsPayload {
  enabled: boolean
  recipient: {
    name: string
    phone?: string | null
    user_id?: number | null
    consent_confirmed?: boolean
  } | null
}

export interface DayCloseWhatsAppSummary {
  delivery_id: number
  kind: DayCloseDeliveryKind
  status: DayCloseDeliveryStatus
  recipient_phone_masked: string | null
  failure_code: string | null
  updated_at: string
}

export interface DayCloseDelivery {
  id: number
  kind: DayCloseDeliveryKind
  channel: 'whatsapp'
  status: DayCloseDeliveryStatus
  recipient: { name: string | null; phone_masked: string | null } | null
  template: { name: string | null; language: string | null }
  attempts: number
  requested_by: { id: number | null; name: string | null } | null
  failure: { code: string; reason: string | null } | null
  queued_at: string | null
  accepted_at: string | null
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
  failed_at: string | null
  created_at: string
}
