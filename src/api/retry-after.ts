export function parseRetryAfter(value: unknown, now = Date.now()): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const text = String(value).trim()
  if (/^\d+$/.test(text)) return Number.isSafeInteger(Number(text)) ? Number(text) : undefined
  if (!/^[A-Za-z]{3}, /.test(text)) return undefined
  const date = Date.parse(text)
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - now) / 1000)) : undefined
}
