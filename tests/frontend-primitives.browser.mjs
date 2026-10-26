import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'vite'
const exec = promisify(execFile), session = `saloa-primitives-${process.pid}`
const browser = async (...args) => (await exec(process.execPath, ['node_modules/agent-browser/bin/agent-browser.js', '--session', session, ...args], { timeout: 60000, maxBuffer: 2000000 })).stdout.trim()
const server = await createServer({ server: { port: 0, host: '127.0.0.1', strictPort: false } })
await server.listen()
try {
  await browser('open', new URL('tests/frontend-primitives.html', server.resolvedUrls.local[0]).href)
  console.log(await browser('eval', '(async () => JSON.stringify(await window.primitiveTests.runChecks()))()'))
  for (const [width, height] of [[375, 812], [768, 1024], [1024, 768], [1440, 900], [812, 375]]) {
    await browser('set', 'viewport', String(width), String(height))
    for (const theme of ['light', 'dark']) {
      await browser('eval', `document.documentElement.dataset.theme = '${theme}'`)
      for (const locale of ['pt', 'es-ES', 'en-GB']) {
        await browser('eval', `window.primitiveTests.preview('${locale}')`)
        assert.equal(await browser('eval', 'document.documentElement.scrollWidth > innerWidth'), 'false', 'No horizontal overflow')
        await browser('eval', 'document.getElementById("open-dialog").focus(); document.getElementById("open-dialog").click()')
        await browser('wait', '400')
        for (const key of [...Array(6).fill('Tab'), ...Array(6).fill('Shift+Tab')]) {
          await browser('press', key)
          assert.equal(await browser('eval', 'document.querySelector("[role=dialog]").contains(document.activeElement)'), 'true', 'Native Tab stays inside modal')
        }
        if (locale === 'es-ES') await browser('screenshot', `/tmp/saloa-dialog-${width}-${theme}.png`)
        await browser('press', 'Escape'); await browser('wait', '400')
        assert.equal(await browser('eval', 'document.activeElement.id'), '"open-dialog"', 'Trigger focus restored')
      }
      for (const id of ['open-bottom', 'open-side']) {
        await browser('eval', `document.getElementById('${id}').click()`)
        await browser('wait', '400')
        assert.equal(await browser('eval', 'document.documentElement.scrollWidth > innerWidth'), 'false', 'Sheet does not overflow horizontally')
        await browser('screenshot', `/tmp/saloa-${id}-${width}-${theme}.png`)
        await browser('press', 'Escape'); await browser('wait', '400')
      }
      await browser('eval', 'document.documentElement.style.fontSize = "200%"')
      assert.equal(await browser('eval', 'document.documentElement.scrollWidth > innerWidth'), 'false', '200% text zoom does not overflow')
      await browser('eval', 'document.documentElement.style.fontSize = ""; document.getElementById("open-snackbar").click()')
      await browser('wait', '400')
      assert.equal(await browser('eval', `(() => { const host = document.querySelector('.a-snackbar-host'); if (host.dataset.deferred) return true; const a = host.firstElementChild.getBoundingClientRect(), b = document.getElementById('fixture-cta').getBoundingClientRect(); return a.bottom <= b.top || a.top >= b.bottom; })()`), 'true', 'Snackbar does not cover bottom CTA')
      await browser('screenshot', `/tmp/saloa-primitives-${width}-${theme}.png`)
    }
  }
  await browser('set', 'media', 'light', 'reduced-motion')
  await browser('eval', 'window.primitiveTests.preview("en-GB")')
  await browser('eval', 'document.getElementById("open-dialog").click()')
  await browser('wait', '200')
  assert.equal(await browser('eval', 'getComputedStyle(document.querySelector(".a-overlay-panel")).transform'), '"none"', 'Reduced motion removes translation/scale')
  await browser('press', 'Escape'); await browser('wait', '200')
  assert.equal(await browser('eval', 'document.querySelector("[role=dialog]") === null'), 'true', 'Reduced-motion dismissal completes')
  console.log('Browser errors:', await browser('errors'))
} finally { await browser('close').catch(() => {}); await server.close() }
