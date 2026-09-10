import type { ApiError } from '@/api/errors'

/**
 * Maps a normalized ApiError to human text for a toast/inline banner.
 * `conflict`/`validation` prefer the backend's own message (409/422 bodies
 * on this API carry a real, specific business reason — "session is closed",
 * "target already has an active session", etc. — never re-derive that rule
 * client-side, see CLAUDE.md §13/§40). Every other kind uses a generic,
 * localized fallback since their raw messages are not meant for display.
 */
export function describeApiError(error: ApiError, t: (key: string) => string): string {
  if ((error.kind === 'conflict' || error.kind === 'validation') && error.message) {
    return error.message
  }

  switch (error.kind) {
    case 'forbidden':
      return t('common.errors.forbidden')
    case 'not_found':
      return t('common.errors.notFound')
    case 'conflict':
      return t('common.errors.conflict')
    case 'validation':
      return t('common.errors.validation')
    case 'rate_limited':
      return t('common.errors.rateLimited')
    case 'network':
      return t('common.errors.network')
    case 'server':
      return t('common.errors.server')
    default:
      return t('common.errors.generic')
  }
}
