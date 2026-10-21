import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
import type { ChannelAuthorizerGenerator } from 'pusher-js'

import { http } from '@/api/http'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { appConfig } from '@/config/runtime'

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
const authorizationAttempts = new Map<string, symbol>()
const authorizationFailures = new Map<string, ApiError>()

// Pusher's custom-authorizer path strips AxiosError.status from its
// subscription_error event. Preserve the normalized result out of band so
// consumers can distinguish a denied channel from a temporary auth outage.
export function getChannelAuthorizationFailure(name: string): ApiError | undefined {
  return authorizationFailures.get(name)
}

/** Optional locally; partial realtime configuration fails protected builds. */
export function isRealtimeConfigured(): boolean {
  return appConfig.realtimeConfigured
}

export function getEcho(): Echo<'reverb'> | null {
  const reverb = appConfig.reverb
  if (!reverb) return null
  if (echoInstance) return echoInstance

  echoInstance = new Echo({
    broadcaster: 'reverb',
    key: reverb.key,
    wsHost: reverb.host,
    wsPort: reverb.port,
    wssPort: reverb.port,
    forceTLS: reverb.tls,
    enabledTransports: reverb.tls ? ['wss'] : ['ws', 'wss'],
    enableStats: false,
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
        const attempt = Symbol()
        authorizationAttempts.set(channel.name, attempt)
        authorizationFailures.delete(channel.name)
        http
          .post('/broadcasting/auth', { socket_id: socketId, channel_name: channel.name })
          .then((response) => {
            if (authorizationAttempts.get(channel.name) !== attempt) return
            authorizationFailures.delete(channel.name)
            callback(null, response.data)
          })
          .catch((error: unknown) => {
            if (authorizationAttempts.get(channel.name) !== attempt) return
            authorizationFailures.set(channel.name, normalizeApiError(error))
            callback(new Error('Private channel authorization failed'), null)
          })
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
  privateChannelReferences.clear()
  echoInstance?.disconnect()
  echoInstance = null
  authorizationAttempts.clear()
  authorizationFailures.clear()
}

// Consumers remove only their own listeners; the final consumer leaves.
const privateChannelReferences = new Map<string, number>()
export function retainPrivateChannel(name: string) {
  const echo = getEcho()
  if (!echo) return null
  privateChannelReferences.set(name, (privateChannelReferences.get(name) ?? 0) + 1)
  let released = false
  return {
    channel: echo.private(name),
    release() {
      if (released) return
      released = true
      if (echoInstance !== echo) return
      const remaining = (privateChannelReferences.get(name) ?? 1) - 1
      if (remaining > 0) privateChannelReferences.set(name, remaining)
      else { privateChannelReferences.delete(name); echo.leave(name) }
    },
  }
}
