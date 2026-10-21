import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'vite'
const exec = promisify(execFile)
const session = `qr-entry-${process.pid}`
const browser = async (...args) => {
  if (args[0] === 'eval') args[1] = `(async () => { ${args[1]} })()`
  return (await exec(process.execPath, ['node_modules/agent-browser/bin/agent-browser.js', '--session', session, ...args], { timeout: 60_000, maxBuffer: 1_000_000 })).stdout.trim()
}
const server = await createServer({ server: { port: 0, host: '127.0.0.1' } })
await server.listen()
try {
  await browser('open', `${server.resolvedUrls.local[0]}tests/frontend-qr-entry.html`)
  console.log(await browser('eval', 'return JSON.stringify(await window.qrEntryTests.runChecks())'))
  for (const [width, height] of [[375, 812], [768, 1024], [1440, 900]]) {
    await browser('set', 'viewport', String(width), String(height))
    for (const theme of ['light', 'dark']) {
      await browser('set', 'media', theme)
      for (const locale of ['es-ES', 'ca-ES-valencia', 'en-GB']) {
        await browser('eval', `window.qrFixture = await window.qrEntryTests.showFailure('${locale}'); return true`)
        const result = await browser('eval', `const button = document.querySelector('button'); const box = button.getBoundingClientRect(); if (box.height < 44 || document.documentElement.scrollWidth > ${width}) throw new Error('Responsive retry failure'); return {width:${width},theme:'${theme}',locale:'${locale}',height:box.height}`)
        console.log(result)
        if (locale === 'es-ES') await browser('screenshot', `/tmp/qr-entry-${width}-${theme}.png`)
        await browser('eval', 'await window.qrFixture.cleanup()')
      }
    }
  }
  console.log('Browser errors:', await browser('errors'))
} finally { await browser('close').catch(() => {}); await server.close() }
