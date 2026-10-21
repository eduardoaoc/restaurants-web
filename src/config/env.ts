export type BuildEnv = Record<string, string | boolean | undefined>
function invalid(name: string): never { throw new Error(`Invalid build configuration: ${name}`) }
export function validateOrigin(value: string, name: string, secure: boolean): string {
  let url: URL
  try { url = new URL(value) } catch { return invalid(name) }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  const local = /^(?:.*[.])?localhost$/.test(host) || host === '0.0.0.0' || host.startsWith('127.') || host === '[::1]' || host === '[::]'
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/' || (secure && (url.protocol !== 'https:' || local))) invalid(name)
  return url.origin
}
export type BuildTarget = 'local' | 'staging' | 'production'
export function resolveBuildTarget(mode: string): BuildTarget {
  if (mode === 'development') return 'local'
  if (mode === 'staging' || mode === 'production') return mode
  return invalid('MODE')
}
export function validateEnv(env: BuildEnv, mode: string) {
  const target = resolveBuildTarget(mode)
  const secure = target !== 'local'
  const read = (key: string) => String(env[key] ?? '').trim()
  const api = read('VITE_API_URL'), publicApp = read('VITE_PUBLIC_APP_URL')
  if (secure && !api) invalid('VITE_API_URL')
  if (secure && !publicApp) invalid('VITE_PUBLIC_APP_URL')
  const apiUrl = api ? validateOrigin(api, 'VITE_API_URL', secure) : undefined
  const publicAppUrl = publicApp ? validateOrigin(publicApp, 'VITE_PUBLIC_APP_URL', secure) : ''
  const keys = ['VITE_REVERB_APP_KEY', 'VITE_REVERB_HOST', 'VITE_REVERB_PORT', 'VITE_REVERB_SCHEME'] as const
  const realtimeConfigured = keys.every(key => read(key))
  if (secure && keys.some(key => read(key)) && !realtimeConfigured) invalid(keys.find(key => !read(key))!)
  if (realtimeConfigured) {
    const host = read('VITE_REVERB_HOST'), scheme = read('VITE_REVERB_SCHEME'), port = read('VITE_REVERB_PORT')
    if (!['http', 'https'].includes(scheme) || (secure && scheme !== 'https')) invalid('VITE_REVERB_SCHEME')
    if (!/^([a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])$/.test(host)) invalid('VITE_REVERB_HOST')
    validateOrigin(`${scheme}://${host}`, 'VITE_REVERB_HOST', secure)
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) invalid('VITE_REVERB_PORT')
  }
  const reverb = realtimeConfigured ? {
    key: read('VITE_REVERB_APP_KEY'), host: read('VITE_REVERB_HOST'),
    port: Number(read('VITE_REVERB_PORT')), tls: read('VITE_REVERB_SCHEME') === 'https',
  } : null
  return { target, apiUrl, publicAppUrl, realtimeConfigured, reverb }
}
