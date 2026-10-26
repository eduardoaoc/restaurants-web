import assert from 'node:assert/strict'
import { mock } from 'node:test'
const { createApp } = await import('./support/primitives-runtime.mjs')
const { runPrimitiveChecks } = await import('./frontend-primitives.checks.ts')
const { createSnackbarQueue } = await import('../src/composables/useSnackbar.ts')
const { activateOverlay } = await import('../src/components/ui/overlay-focus.ts')

console.log('Mounted component behavior:', await runPrimitiveChecks(createApp))
// Model the native Tab result, including a disabled last element. The browser
// suite separately checks actual Tab dispatch and native radio-group behavior.
const root = document.createElement('div'), panel = document.createElement('section')
const first = document.createElement('button'), last = document.createElement('button'), disabled = document.createElement('button')
disabled.disabled = true
root.appendChild(panel); panel.appendChild(first); panel.appendChild(last); panel.appendChild(disabled); document.body.appendChild(root)
const release = activateOverlay({ root, panel, modal: true, onEscape() {} })
for (const [shiftKey, expected] of [[false, first], [true, last]]) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey }))
  document.activeElement = document.body
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(document.activeElement, expected, 'Tab correction wraps to an enabled edge')
}
release(); root.remove()
console.log('PASS: forward/backward escaped Tab correction skips disabled controls')
mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 })
try {
  const q = createSnackbarQueue()
  const firstHost = q.attachHost(), secondHost = q.attachHost()
  const first = q.showSnackbar({ message: 'First' })
  const second = q.showSnackbar({ message: 'Second', action: { label: 'Undo', onClick() {} } })
  assert.equal(q.current.value.duration, 4000)
  mock.timers.tick(1500); q.pause('hover'); q.pause('focus')
  mock.timers.tick(10000); q.resume('hover'); mock.timers.tick(5000)
  assert.equal(q.current.value.id, first, 'focus pause survives mouse leave')
  q.resume('focus'); mock.timers.tick(2499); assert.equal(q.current.value.id, first)
  mock.timers.tick(1); assert.equal(q.current.value.id, second); assert.equal(q.current.value.duration, 6000)
  firstHost.release(); assert.equal(secondHost.ownsHost.value, true)
  secondHost.release(); mock.timers.tick(20000); assert.equal(q.current.value.id, second, 'no invisible timeout without host')
  const host = q.attachHost(); mock.timers.tick(6000); assert.equal(q.current.value, null)
  const timed = q.showSnackbar({ message: 'Keep elapsed time' })
  const removed = q.showSnackbar({ message: 'Removed from queue' })
  mock.timers.tick(1000); q.dismiss(removed); mock.timers.tick(2999)
  assert.equal(q.current.value.id, timed, 'removing a queued item preserves current elapsed time')
  mock.timers.tick(1); assert.equal(q.current.value, null)
  let finish, calls = 0
  const action = q.showSnackbar({ message: 'Action', action: { label: 'Undo', onClick: () => { calls++; return new Promise(resolve => { finish = resolve }) } } })
  const pending = q.performAction(action); await q.performAction(action)
  assert.equal(calls, 1, 'action cannot run twice while pending')
  mock.timers.tick(20000); assert.equal(q.current.value.id, action, 'pending action pauses timer')
  q.dismiss(action); const next = q.showSnackbar({ message: 'New message' }); finish(); await pending
  assert.equal(q.current.value.id, next, 'late action cannot dismiss a subsequent message')
  q.dismiss(); q.showSnackbar({ message: 'Rejecting action', action: { label: 'Retry', onClick() { throw new Error('fixture') } } })
  await assert.rejects(q.performAction(), /fixture/); assert.equal(q.current.value, null)
  assert.throws(() => q.showSnackbar({ message: 'Bad duration', duration: -1 }), RangeError)
  assert.throws(() => q.showSnackbar({ message: ' ' }), TypeError)
  host.release()
  console.log('PASS: snackbar default/action durations, queue, nested pauses, dismiss, timeout, host ownership and action races')
} finally { mock.timers.reset() }
