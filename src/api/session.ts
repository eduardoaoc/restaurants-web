import axios from 'axios'
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios'
export function installSessionInterceptor(client: AxiosInstance, expire: () => void, session?: () => { version: number; authenticated: boolean }): void {
  const versions = new WeakMap<InternalAxiosRequestConfig, number>()
  client.interceptors.request.use(config => {
    const state = session?.()
    if (state) {
      const path = config.url?.split('?')[0]
      // Invitation preview/accept are made precisely by someone without a session.
      const authFlow = ['/api/v1/auth/login', '/sanctum/csrf-cookie', '/api/v1/auth/logout', '/api/v1/auth/me', '/api/v1/invitations/preview', '/api/v1/invitations/accept', '/api/v1/invitations/accept-existing', '/api/v1/auth/forgot-password', '/api/v1/auth/reset-password/preview', '/api/v1/auth/reset-password'].includes(path ?? '')
      if (state.version > 0 && !state.authenticated && !authFlow) throw new axios.CanceledError('Session ended')
      versions.set(config, state.version)
    }
    return config
  })
  client.interceptors.response.use(response => {
    if (session && versions.get(response.config) !== session().version) throw new axios.CanceledError('Stale session response')
    return response
  }, error => {
    if (session && error.config && versions.get(error.config) !== session().version) return Promise.reject(new axios.CanceledError('Stale session response'))
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      const path = error.config?.url?.split('?')[0]
      const loginFlow = ['/api/v1/auth/login', '/sanctum/csrf-cookie', '/api/v1/auth/logout'].includes(path ?? '')
      if (!loginFlow && (status === 401 || status === 419)) expire()
    }
    return Promise.reject(error)
  })
}
