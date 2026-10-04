/** Scheme safety only; backend remains authoritative for the Google host allowlist. */
export function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value || /[\\\u0000-\u0020\u007f]/.test(value) || !/^https?:\/\//i.test(value)) return undefined
  try {
    const url = new URL(value)
    if (!url.hostname || url.username || url.password) return undefined
    return url.href
  } catch { return undefined }
}
