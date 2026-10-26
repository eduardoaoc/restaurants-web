import { http } from '@/api/http'
import type { AuthContext } from '@/types/auth-context'
import type { AuthenticatedUser, LoginPayload } from '@/types/auth'

interface UserEnvelope {
  data: {
    user: AuthenticatedUser
  }
}

interface AuthContextEnvelope {
  data: AuthContext
}

/**
 * Thin wrapper around the real restaurants-api auth contract (verified
 * against the running backend, see FRONT BLOCO 1 report and Passo 1.2C):
 *   GET  /sanctum/csrf-cookie
 *   POST /api/v1/auth/login    { email, password, remember? } -> { data: { user } }
 *   GET  /api/v1/auth/me                                       -> { data: { user } }
 *   GET  /api/v1/auth/context                                  -> { data: AuthContext }
 *   POST /api/v1/auth/logout                                   -> 204 No Content
 *   PUT  /api/v1/auth/active-organization { organization_id }  -> { data: { active_organization_id } } | 404 | 409
 *   POST /api/v1/auth/forgot-password { email, locale? }        -> 200 generic message (never reveals the account)
 *   POST /api/v1/auth/reset-password/preview { email, token }   -> { data: { valid: true } } | 422 PASSWORD_RESET_INVALID
 *   POST /api/v1/auth/reset-password { email, token, password, password_confirmation } -> 200 | 422 (no sign-in)
 */
export const authService = {
  async csrf(): Promise<void> {
    await http.get('/sanctum/csrf-cookie')
  },

  async login(payload: LoginPayload): Promise<AuthenticatedUser> {
    const { data } = await http.post<UserEnvelope>('/api/v1/auth/login', payload)
    return data.data.user
  },

  async me(): Promise<AuthenticatedUser> {
    const { data } = await http.get<UserEnvelope>('/api/v1/auth/me')
    return data.data.user
  },

  async context(): Promise<AuthContext> {
    const { data } = await http.get<AuthContextEnvelope>('/api/v1/auth/context')
    return data.data
  },

  async selectOrganization(organizationId: number): Promise<void> {
    await http.put('/api/v1/auth/active-organization', { organization_id: organizationId })
  },

  async forgotPassword(email: string, locale: string): Promise<void> {
    await http.post('/api/v1/auth/forgot-password', { email, locale })
  },

  async previewPasswordReset(email: string, token: string): Promise<void> {
    await http.post('/api/v1/auth/reset-password/preview', { email, token })
  },

  async resetPassword(email: string, token: string, password: string, passwordConfirmation: string): Promise<void> {
    await http.post('/api/v1/auth/reset-password', { email, token, password, password_confirmation: passwordConfirmation })
  },

  async logout(): Promise<void> {
    await http.post('/api/v1/auth/logout')
  },
}
