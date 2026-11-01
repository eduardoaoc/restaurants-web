import type { OperationsDailyOperation } from '@/types/daily-operation'

/**
 * Every age on GET /operations/live (session elapsed_seconds, alert
 * age_seconds, staff active_seconds, kitchen oldest age) is a real backend
 * value measured up to `generated_at`. When a session, call or shift is
 * left open across days those values are still correct but no longer mean
 * "waiting time in this service" — the "158h39m"/"1003h00m" readings come
 * from exactly that (verified against the live snapshot: day not open,
 * a session from a previous day, shifts never ended).
 *
 * This classifies an age against the current operational day so the UI can
 * say "previous session, since 21/10 09:31" instead of a misleading wait.
 * Presentation only: nothing is hidden, capped or re-ordered by an invented
 * threshold — the only boundary used is the day's own `opened_at`.
 */
export type OperationTiming =
  | { kind: 'current'; seconds: number }
  | { kind: 'previous'; since: Date }
  | { kind: 'invalid' }

export function classifyOperationAge(
  ageSeconds: number | null | undefined,
  generatedAt: string,
  dailyOperation: OperationsDailyOperation,
): OperationTiming {
  const now = Date.parse(generatedAt)
  if (ageSeconds == null || !Number.isFinite(ageSeconds) || ageSeconds < 0 || !Number.isFinite(now)) return { kind: 'invalid' }
  const startedAt = now - ageSeconds * 1000
  if (dailyOperation.status !== 'open') return { kind: 'previous', since: new Date(startedAt) }
  const dayStart = Date.parse(dailyOperation.opened_at)
  if (Number.isFinite(dayStart) && startedAt < dayStart) return { kind: 'previous', since: new Date(startedAt) }
  return { kind: 'current', seconds: ageSeconds }
}

/** "21/10 09:31" in the restaurant's own timezone, never the browser's. */
export function formatOperationInstant(date: Date, locale: string, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone }
  try {
    return new Intl.DateTimeFormat(locale, options).format(date)
  } catch {
    return new Intl.DateTimeFormat('es-ES', { ...options, timeZone: 'Europe/Madrid' }).format(date)
  }
}
