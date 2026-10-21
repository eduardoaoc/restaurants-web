import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'vite'
const exec = promisify(execFile), session = `aforo-assignment-${process.pid}`
const browser = async (...args) => (await exec(process.execPath, ['node_modules/agent-browser/bin/agent-browser.js', '--session', session, ...args], { timeout: 60000, maxBuffer: 2000000 })).stdout.trim()
const server = await createServer({ server: { port: 0, host: '127.0.0.1' } }); await server.listen()
try {
  await browser('open', new URL('tests/frontend-assignment.html', server.resolvedUrls.local[0]).href)
  console.log(await browser('eval', '(async () => JSON.stringify(await window.assignmentTests.runAssignmentChecks()))()'))
  for (const [width, height] of [[375, 812], [768, 1024], [1440, 900]]) {
    await browser('set', 'viewport', String(width), String(height))
    for (const theme of ['light', 'dark']) {
      await browser('eval', `document.documentElement.dataset.theme = '${theme}'`)
      for (const locale of ['es-ES', 'ca-ES-valencia', 'en-GB']) {
        for (const pending of [false, true]) {
          const result = JSON.parse(await browser('eval', `(async () => JSON.stringify(await window.assignmentTests.renderAssignmentPreview('${locale}', ${pending})))()`))
          if (result.overflow || result.buttonHeight < 44) throw Error(JSON.stringify({ width, theme, locale, pending, result }))
        }
      }
      await browser('screenshot', `/tmp/waiter-assignment-${width}-${theme}.png`)
    }
  }
  console.log('36 responsive/theme/language/state combinations passed')
  console.log('Browser errors:', await browser('errors'))
} finally { await browser('close').catch(() => {}); await server.close() }
