import axios from 'axios'

/**
 * Verified against the live backend (restaurants-api):
 * - 401 on POST /auth/login body is exactly {"message":"Invalid credentials."}
 * - 401 on any other protected endpoint (expired/missing session) is
 *   Laravel's default {"message":"Unauthenticated."} — distinguished below
 *   by message so a login form and a route guard can react differently to
 *   the same status code.
 * - 422 is Laravel's default validation shape: {"message","errors":{field:[...]}}
 */
export type ApiErrorKind =
  | 'validation'
  | 'invalid_credentials'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'server'
  | 'network'
  | 'unknown'

export interface ApiError {
  kind: ApiErrorKind
  status?: number
  message?: string
  fieldErrors?: Record<string, string[]>
  /**
   * The backend's stable machine-readable error code when it sends the
   * structured {error:{code,message}} shape (e.g.
   * TABLE_SESSION_HAS_NO_BILLABLE_ORDERS, ZONE_HAS_TABLES,
   * FLOOR_HAS_ZONES) — a safe thing to build a localized-text lookup on
   * top of (see src/utils/error-message.ts), unlike `message` itself,
   * which this backend does not localize.
   */
  code?: string
}

interface LaravelErrorBody {
  message?: string
  errors?: Record<string, string[]>
  /**
   * The shape this API actually uses for its own domain-rule conflicts —
   * confirmed live via POST /api/v1/tables/{table}/close returning
   * {"error":{"code":"TABLE_SESSION_HAS_NO_BILLABLE_ORDERS","message":"..."}}
   * (real end-to-end test, Passo 1.1 audit) — distinct from Laravel's own
   * flat {"message": "..."} used for framework-level failures (401
   * Unauthenticated, 422 validation). Both shapes have to be checked; a
   * previous version here only read the flat one, so every domain 409 (this
   * one, ZONE_HAS_TABLES, FLOOR_HAS_ZONES, transfer/waiter-call conflicts,
   * ...) silently fell back to a generic translated message instead of the
   * real, specific one the backend went out of its way to send.
   */
  error?: { code?: string; message?: string }
}

function extractMessage(body: LaravelErrorBody | undefined): string | undefined {
  return body?.message ?? body?.error?.message
}

export function normalizeApiError(error: unknown): ApiError {
  if (!axios.isAxiosError(error)) {
    return { kind: 'unknown' }
  }

  if (!error.response) {
    return { kind: 'network' }
  }

  const status = error.response.status
  const body = error.response.data as LaravelErrorBody | undefined
  const message = extractMessage(body)
  const code = body?.error?.code

  switch (status) {
    case 401:
      return {
        kind: message === 'Invalid credentials.' ? 'invalid_credentials' : 'unauthenticated',
        status,
        message,
        code,
      }
    case 403:
      return { kind: 'forbidden', status, message, code }
    case 404:
      return { kind: 'not_found', status, message, code }
    case 409:
      return { kind: 'conflict', status, message, code }
    case 422:
      return { kind: 'validation', status, message, fieldErrors: body?.errors, code }
    case 429:
      return { kind: 'rate_limited', status, message, code }
    default:
      return status >= 500
        ? { kind: 'server', status, message, code }
        : { kind: 'unknown', status, message, code }
  }
}
