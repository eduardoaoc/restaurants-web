import type { ApiError } from '@/api/errors'
import { describeApiError } from './error-message'

export function kitchenError(error: ApiError, t: (key: string) => string): string {
  if (error.code === 'KITCHEN_TICKET_PRINTING_DISABLED') return t('kitchen.printDisabled')
  if (error.code === 'ORDER_NOT_PRINTABLE') return t('kitchen.notPrintable')
  if (error.kind === 'conflict' || error.kind === 'validation') return t('kitchen.conflict')
  if (error.kind === 'unauthenticated') return t('kitchen.sessionExpired')
  return describeApiError(error, t)
}
