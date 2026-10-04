import axios from 'axios'
import { appConfig } from '@/config/runtime'
import { HTTP_TIMEOUT_MS } from './timeouts'

/**
 * A SEPARATE axios instance from `src/api/http.ts` (Passo 3.1) — the public
 * QR surface has no session, no CSRF concern, and no reason to ever carry
 * the Sanctum session cookie: `withCredentials` is deliberately left at its
 * axios default of `false`. Reusing the authenticated `http` client here
 * would send the admin session cookie (if any happened to exist on the same
 * device/browser) to endpoints that neither need nor check it — never do
 * that (CLAUDE.md Passo 3.1 §5/§29).
 */
export const publicHttp = axios.create({
  baseURL: appConfig.apiUrl,
  timeout: HTTP_TIMEOUT_MS,
  headers: {
    Accept: 'application/json',
  },
})
