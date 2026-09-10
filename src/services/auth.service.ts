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

  async logout(): Promise<void> {
    await http.post('/api/v1/auth/logout')
  },
}
