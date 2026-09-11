import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
import type { ChannelAuthorizerGenerator } from 'pusher-js'

import { http } from '@/api/http'

/**
 * The single Laravel Echo (Reverb) client for this app session (Passo
 * 1.3 §8) — never created per-component. Auth for private channels reuses
 * the existing `http` axios instance (same withCredentials/XSRF-token
 * handling as every other request — CLAUDE.md §9: never a second HTTP
 * client, never a hardcoded token) against the real backend's
 * `POST /broadcasting/auth` (verified against restaurants-api's
 * bootstrap.php/routes/channels.php — see docs/realtime.md).
 */
let echoInstance: Echo<'reverb'> | null = null

/**
 * False when any VITE_REVERB_* var is missing — lets the rest of the app
 * fail closed to "realtime unavailable" instead of throwing when a
 * dev/test environment simply hasn't configured Reverb (Passo 1.3 §31).
 */
export function isRealtimeConfigured(): boolean {
  const env = import.meta.env
  return Boolean(env.VITE_REVERB_APP_KEY && env.VITE_REVERB_HOST && env.VITE_REVERB_PORT && env.VITE_REVERB_SCHEME)
}

export function getEcho(): Echo<'reverb'> | null {
  if (!isRealtimeConfigured()) return null
  if (echoInstance) return echoInstance

  const env = import.meta.env

  echoInstance = new Echo({
    broadcaster: 'reverb',
    key: env.VITE_REVERB_APP_KEY,
    wsHost: env.VITE_REVERB_HOST,
    wsPort: Number(env.VITE_REVERB_PORT),
    wssPort: Number(env.VITE_REVERB_PORT),
    forceTLS: env.VITE_REVERB_SCHEME === 'https',
    enabledTransports: ['ws', 'wss'],
    // Passed directly rather than assigned to `window.Pusher` — laravel-echo
    // accepts a Pusher constructor via `options.Pusher` (see its own
    // connector: `options.Pusher ? new options.Pusher(...) : window.Pusher
    // ...`), so the client stays fully module-scoped with no global leak.
    Pusher,
    // Never laravel-echo's default XHR-based channel auth (which doesn't
    // know about this app's XSRF-cookie handling) — reuse the same `http`
    // instance every other request already goes through.
    authorizer: ((channel) => ({
      authorize(socketId, callback) {
        http
          .post('/broadcasting/auth', { socket_id: socketId, channel_name: channel.name })
          .then((response) => callback(null, response.data))
          .catch((error: Error) => callback(error, null))
      },
    })) satisfies ChannelAuthorizerGenerator,
    // laravel-echo auto-registers a global axios request interceptor when
    // it detects `axios` in scope (to tag outgoing requests with the
    // socket id, for Laravel's `toOthers()` — unused by this backend, see
    // docs/realtime.md's event catalog). Opting out explicitly rather than
    // relying on the detection happening to miss our bundled axios.
    withoutInterceptors: true,
  })

  return echoInstance
}

/**
 * Full teardown — closes the underlying WebSocket and drops the singleton
 * so the next getEcho() call builds a fresh client. Called on logout
 * (Passo 1.3 §14): no lingering authenticated socket, and the next
 * session's first subscribe always starts from a clean connection.
 */
export function disconnectEcho(): void {
  echoInstance?.disconnect()
  echoInstance = null
}
