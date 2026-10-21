import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

const exec = promisify(execFile)
const session = `aforo-approvals-${process.pid}`
const browser = async (...args) => {
  if (args[0] === 'eval') args[1] = `(async () => { ${args[1]} })()`
  const { stdout } = await exec(process.execPath, ['node_modules/agent-browser/bin/agent-browser.js', '--session', session, ...args], { timeout: 60_000, maxBuffer: 2_000_000 })
  return stdout.trim()
}
const server = process.env.APPROVAL_TEST_BASE_URL ? null : await createServer({ server: { port: 0, strictPort: false, host: '127.0.0.1' } })
await server?.listen()
const baseUrl = process.env.APPROVAL_TEST_BASE_URL ?? server.resolvedUrls.local[0]
try {
  await browser('open', new URL('tests/frontend-approvals.html', baseUrl).href)
  await browser('set', 'viewport', '375', '812')
  if (process.argv.includes('--baseline')) {
    console.log(await browser('eval', "window.fixture = await window.approvalTests.installFixture('service'); return JSON.stringify({ pending: document.body.textContent.includes('#A101'), approveButtons: [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Aprobar').length })"))
    console.log(await browser('eval', "[...document.querySelectorAll('button')].find(b => b.textContent.includes('#A101')).click(); await new Promise(r => setTimeout(r, 300)); return JSON.stringify([...document.querySelectorAll('[role=dialog] button')].map(b => ({text:b.textContent.trim(),box:b.getBoundingClientRect().toJSON()})))"))
    await browser('eval', "await window.fixture.cleanup(); window.fixture = await window.approvalTests.installFixture('table'); [...document.querySelectorAll('button')].find(b => b.textContent.includes('#A101')).click(); await new Promise(r => setTimeout(r, 100)); return JSON.stringify({pendingDetail:document.body.textContent.includes('Pendiente de aprobación'),approveButtons:[...document.querySelectorAll('button')].filter(b => b.textContent.trim()==='Aprobar').length})").then(console.log)
  } else if (process.argv.includes('--security-browser')) {
    console.log(await browser('eval', "const m = await import('/tests/frontend-security.browser.ts'); return JSON.stringify(await m.runSecurityBrowserChecks())"))
  } else {
    const result = JSON.parse(JSON.parse(await browser('eval', 'return JSON.stringify(await window.approvalTests.runApprovalChecks())')))
    console.log(`PASS: ${result.checks} mounted approval checks (fixture HTTP and realtime transport; production components/composables/services)`)
    for (const [width, height] of [[375, 812], [768, 1024], [1024, 768], [1440, 900]]) {
      await browser('set', 'viewport', String(width), String(height))
      for (const theme of ['light', 'dark']) {
        await browser('set', 'media', theme)
        console.log(await browser('eval', `return JSON.stringify(await window.approvalTests.checkResponsive(${width}, ${height}, '${theme}'))`))
        await browser('screenshot', path.join(tmpdir(), `aforo-approvals-${width}-${theme}.png`))
        await browser('eval', 'await window.fixture.cleanup()')
      }
    }
  }
  console.log('Browser errors:', await browser('errors'))
} finally {
  await browser('close').catch(() => {})
  await server?.close()
}
