import axios from 'axios'
import type { AxiosInstance } from 'axios'
export function installSessionInterceptor(client: AxiosInstance, expire: () => void): void {
  client.interceptors.response.use(response => response, error => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      const path = error.config?.url?.split('?')[0]
      const loginFlow = ['/api/v1/auth/login', '/sanctum/csrf-cookie', '/api/v1/auth/logout'].includes(path ?? '')
      if (!loginFlow && (status === 401 || status === 419)) expire()
    }
    return Promise.reject(error)
  })
}
