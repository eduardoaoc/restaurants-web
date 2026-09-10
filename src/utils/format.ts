/**
 * Locale-aware money/date formatting. Never hardcode a currency symbol or
 * a raw date string in a component — go through these.
 *
 * Platform defaults mirror the backend's own (RestaurantSettings::
 * DEFAULT_CURRENCY / DEFAULT_TIMEZONE) — used only when a restaurant's real
 * settings couldn't be loaded (e.g. the viewer lacks `manage_restaurants`,
 * see CLAUDE.md §9), never as a silent substitute for a value the API did
 * return.
 */
export const DEFAULT_CURRENCY = 'EUR'
export const DEFAULT_TIMEZONE = 'Europe/Madrid'

/**
 * `amount` is a decimal string from the API (e.g. "25.00"), never a number
 * — parsed here, not upstream, so the raw string stays available to callers
 * that need it for something other than display.
 */
export function formatMoney(amount: string, locale: string, currency: string = DEFAULT_CURRENCY): string {
  const value = Number(amount)

  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value)
  } catch {
    return new Intl.NumberFormat(DEFAULT_CURRENCY === currency ? 'es-ES' : locale, {
      style: 'currency',
      currency: DEFAULT_CURRENCY,
    }).format(value)
  }
}

/**
 * Formats a calendar-only date string ("YYYY-MM-DD", as returned by the
 * dashboard's report period) without going through `new Date(string)` —
 * that parses as UTC midnight and can shift a day backward once formatted
 * in a timezone behind UTC. Building the Date from its local y/m/d parts
 * instead sidesteps the bug regardless of restaurant timezone.
 */
export function formatDateOnly(dateOnly: string, locale: string): string {
  const [year, month, day] = dateOnly.split('-').map(Number)

  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(year, month - 1, day))
  } catch {
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(year, month - 1, day))
  }
}

export function formatNumber(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale).format(value)
  } catch {
    return new Intl.NumberFormat('es-ES').format(value)
  }
}

/**
 * Formats a raw seconds count (elapsed_seconds / active_seconds / age_seconds
 * — every one of these is a plain integer from the Operations Live / Analytics
 * read models, never a pre-formatted string) as `1h07m` / `42m` / `18s`.
 * Locale-independent on purpose: these are compact operational badges, not
 * localized prose — every locale in this project already reads latin digits.
 */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) return `${hours}h${String(minutes).padStart(2, '0')}m`
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
}
