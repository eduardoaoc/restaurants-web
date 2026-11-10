import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'vite'

const exec = promisify(execFile)
const session = `ritma-guest-count-${process.pid}`
const browser = async (...args) => (await exec(process.execPath, ['node_modules/agent-browser/bin/agent-browser.js', '--session', session, ...args], { timeout: 60000, maxBuffer: 1000000 })).stdout.trim()
const server = await createServer({ server: { port: 0, host: '127.0.0.1' } })
await server.listen()
try {
  await browser('open', new URL('tests/frontend-guest-count.html', server.resolvedUrls.local[0]).href)
  const evaluated = JSON.parse(await browser('eval', '(async () => JSON.stringify(await window.guestCountTests.runGuestCountChecks()))()'))
  const result = typeof evaluated === 'string' ? JSON.parse(evaluated) : evaluated
  if (result.result !== 'passed' || result.requestCount !== 4 || result.authoritativeCount !== '2') throw new Error(JSON.stringify(result))
  console.log('Guest-count confirmation browser checks passed:', JSON.stringify(result))
  console.log('Browser errors:', await browser('errors'))
} finally {
  await browser('close').catch(() => {})
  await server.close()
}
