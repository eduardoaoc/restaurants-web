import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'vite'
const exec = promisify(execFile)
const session = `aforo-realtime-${process.pid}`
const browser = async (...args) => (await exec(process.execPath, ['node_modules/agent-browser/bin/agent-browser.js', '--session', session, ...args], { timeout: 60000, maxBuffer: 2000000 })).stdout.trim()
const server = process.env.REALTIME_TEST_BASE_URL ? null : await createServer({ server: { port: 0, host: '127.0.0.1' } })
await server?.listen()
try {
  await browser('open', new URL('tests/frontend-realtime.html', process.env.REALTIME_TEST_BASE_URL ?? server.resolvedUrls.local[0]).href)
  console.log(await browser('eval', '(async () => JSON.stringify(await window.realtimeTests.runRealtimeChecks()))()'))
  console.log('Browser errors:', await browser('errors'))
} finally { await browser('close').catch(() => {}); await server?.close() }
