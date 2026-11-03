/**
 * Elapsed time since `since` (ISO-8601) as compact Spanish-neutral text:
 * "<1 min", "18 min", "1h 08m", "2h 15m". Pure — pass the current time in.
 */
export function formatElapsed(since: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(since)) / 60_000)
  if (!(minutes >= 1)) return '<1 min'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`
}
