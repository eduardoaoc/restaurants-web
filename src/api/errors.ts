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
}

interface LaravelErrorBody {
  message?: string
  errors?: Record<string, string[]>
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

  switch (status) {
    case 401:
      return {
        kind: body?.message === 'Invalid credentials.' ? 'invalid_credentials' : 'unauthenticated',
        status,
        message: body?.message,
      }
    case 403:
      return { kind: 'forbidden', status, message: body?.message }
    case 404:
      return { kind: 'not_found', status, message: body?.message }
    case 409:
      return { kind: 'conflict', status, message: body?.message }
    case 422:
      return { kind: 'validation', status, message: body?.message, fieldErrors: body?.errors }
    case 429:
      return { kind: 'rate_limited', status, message: body?.message }
    default:
      return status >= 500
        ? { kind: 'server', status, message: body?.message }
        : { kind: 'unknown', status, message: body?.message }
  }
}
