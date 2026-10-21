import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { createServer, loadEnv } from 'vite'

const safe = { ...process.env, VITE_API_URL: 'https://api.staging.example', VITE_PUBLIC_APP_URL: 'https://app.staging.example', VITE_REVERB_APP_KEY: 'public-example-key', VITE_REVERB_HOST: 'ws.staging.example', VITE_REVERB_PORT: '443', VITE_REVERB_SCHEME: 'https' }
const negativeCases = [
  ['VITE_API_URL', 'http://localhost:8080'],
  ['VITE_PUBLIC_APP_URL', 'https://localhost:5174'],
  ['VITE_API_URL', 'http://api.example'],
  ['VITE_PUBLIC_APP_URL', 'http://app.example'],
  ['VITE_REVERB_HOST', 'localhost'],
  ['VITE_REVERB_SCHEME', 'http'],
  ['VITE_REVERB_APP_KEY', ''],
]
for (const mode of ['staging', 'production']) {
  for (const [key, value] of negativeCases) {
    const outDir = path.join('node_modules', '.tmp', `hardening-invalid-${randomUUID()}`)
    const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--mode', mode, '--outDir', outDir], { env: { ...safe, [key]: value }, encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, new RegExp(`Invalid build configuration: ${key}`))
    assert.ok(!existsSync(path.join(outDir, 'index.html')), 'Invalid config must not generate an artifact')
  }
}

const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)])
const localEnv = loadEnv('development', process.cwd(), 'VITE_')
// Scan actual AFORO local values, not a generic inert vendor fallback.
const knownLocalValues = [localEnv.VITE_API_URL, localEnv.VITE_PUBLIC_APP_URL,
  localEnv.VITE_REVERB_HOST && `ws://${localEnv.VITE_REVERB_HOST}:${localEnv.VITE_REVERB_PORT}`,
  localEnv.VITE_REVERB_HOST && `wss://${localEnv.VITE_REVERB_HOST}:${localEnv.VITE_REVERB_PORT}`,
].filter(value => value && /localhost|127\.|0\.0\.0\.0|\[::1\]/i.test(value))
  // A generic URL can also be an inert vendor fallback. Resolved runtime
  // assertions verify actual API/public/Reverb consumers without this ambiguity.
  .filter(value => !/^http:\/\/localhost\/?$/.test(value))
const forbidden = [...new Set([
  'http://localhost:8080', 'http://localhost:5173', 'http://localhost:5174',
  'http://127.0.0.1', 'https://localhost', ...knownLocalValues,
  'day-close-whatsapp.browser', 'agent-browser',
  'frontend-security.browser', 'runSecurityBrowserChecks', 'aforo-floor-layout',
  'fonts.googleapis.com', 'images.unsplash.com',
])]
// Regression fixtures: reject application origins while tolerating vendor text.
const scan = bytes => forbidden.find(value => bytes.includes(Buffer.from(value)))
assert.equal(scan(Buffer.from("const inertVendorFallback = 'http://localhost'")), undefined)
for (const value of forbidden) assert.equal(scan(Buffer.from(value)), value)

for (const mode of ['production', 'staging']) {
  const env = { ...safe, VITE_API_URL: mode === 'production' ? 'https://api.example' : 'https://api.staging.example', VITE_PUBLIC_APP_URL: mode === 'production' ? 'https://app.example' : 'https://app.staging.example', VITE_REVERB_HOST: mode === 'production' ? 'ws.example' : 'ws.staging.example' }
  const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--mode', mode], { env, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  for (const file of files('dist')) {
    assert.ok(!file.endsWith('.map'), `Source map in ${file}`)
    assert.equal(scan(readFileSync(file)), undefined, `Local application config or tooling in ${file}`)
  }
  const bundleText = files('dist').filter(file => file.endsWith('.js')).map(file => readFileSync(file, 'utf8')).join('\n')
  assert.doesNotMatch(bundleText, /\bnew Function\b|\beval\s*\(/, 'No production eval sinks')
  assert.doesNotMatch(bundleText, /\b(?:APP_KEY|DB_PASSWORD|SUPABASE|SERVICE_ROLE|META_APP_SECRET|WHATSAPP_ACCESS_TOKEN|REVERB_APP_SECRET|PRIVATE_KEY)\b|Bearer ey/, 'No private secret identifiers/tokens')
  assert.ok(bundleText.includes(env.VITE_API_URL), `${mode}: API origin embedded`)
  assert.ok(bundleText.includes(env.VITE_PUBLIC_APP_URL), `${mode}: QR origin embedded`)
  assert.ok(bundleText.includes(env.VITE_REVERB_HOST), `${mode}: Reverb host embedded`)

  // Inspect the actual shared runtime config and QR consumer for this target.
  const previous = Object.fromEntries(Object.keys(safe).filter(key => key.startsWith('VITE_')).map(key => [key, process.env[key]]))
  for (const [key, value] of Object.entries(env)) if (key.startsWith('VITE_')) process.env[key] = value
  let server
  try {
    server = await createServer({ mode, server: { middlewareMode: true }, appType: 'custom' })
    const { appConfig } = await server.ssrLoadModule('/src/config/runtime.ts')
    const { buildTablePublicUrl } = await server.ssrLoadModule('/src/utils/table-public-url.ts')
    assert.equal(appConfig.target, mode)
    assert.equal(appConfig.apiUrl, env.VITE_API_URL)
    assert.equal(appConfig.publicAppUrl, env.VITE_PUBLIC_APP_URL)
    assert.equal(appConfig.reverb.host, env.VITE_REVERB_HOST)
    assert.equal(appConfig.reverb.tls, true)
    assert.equal(buildTablePublicUrl('fixture/token'), `${env.VITE_PUBLIC_APP_URL}/t/fixture%2Ftoken`)
  } finally {
    if (server) await server.close()
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}
console.log('PASS: 14 fail-fast builds + 2 safe HTTPS/WSS builds; resolved runtime/QR targets and artifact origins verified; inert vendor localhost allowed')
