// Dashboard overview round: live notification queue, overlay crowding, table spacing, walking speed and the static wiring of
// the reorganised table modal. Pure logic through Vite's SSR loader (no browser); browser flows are validated separately.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
let checks = 0
const check = (name, fn) => { try { fn(); ++checks } catch (e) { console.error('FAIL', name); throw e } }

/** Deterministic clock + timers. */
function fakeTimers() {
  let now = 0, id = 0
  const pending = new Map()
  return {
    timers: {
      now: () => now,
      setTimeout: (fn, ms) => { pending.set(++id, { at: now + ms, fn }); return id },
      clearTimeout: handle => { pending.delete(handle) },
    },
    advance(ms) {
      const target = now + ms
      for (;;) {
        const next = [...pending.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
        if (!next) break
        now = next[1].at; pending.delete(next[0]); next[1].fn()
      }
      now = target
    },
  }
}
const toast = (id, tone = 'warning', extra = {}) => ({ id, tone, title: `T ${id}`, table: 'Mesa 06', time: '21:30', ...extra })

try {
  const q = await server.ssrLoadModule('/src/utils/operational-toast-queue.ts')
  const mkQueue = (max = 3) => {
    const clock = fakeTimers()
    let state = { visible: [], waiting: 0 }
    const queue = q.createToastQueue({ maxVisible: () => max, timers: clock.timers, onChange: s => { state = s } })
    return { queue, clock, get ids() { return state.visible.map(t => t.id) }, get waiting() { return state.waiting } }
  }

  check('a toast lasts 4 seconds by default', () => {
    assert.equal(q.TOAST_DURATION_MS, 4000)
    const h = mkQueue(); h.queue.offer(toast('a'))
    h.clock.advance(3999); assert.deepEqual(h.ids, ['a'])
    h.clock.advance(2); assert.deepEqual(h.ids, [])
  })
  check('hover/focus pauses the countdown and resumes with the time that was left', () => {
    const h = mkQueue(); h.queue.offer(toast('a'))
    h.clock.advance(3000); h.queue.pause('hover')
    h.clock.advance(60_000); assert.deepEqual(h.ids, ['a'], 'paused toasts stay')
    h.queue.pause('focus'); h.queue.resume('hover')
    h.clock.advance(60_000); assert.deepEqual(h.ids, ['a'], 'still paused by focus')
    h.queue.resume('focus')
    h.clock.advance(999); assert.deepEqual(h.ids, ['a'])
    h.clock.advance(2); assert.deepEqual(h.ids, [])
  })
  check('the same alert is never announced twice while it lasts, even after it was closed or timed out', () => {
    const h = mkQueue()
    assert.equal(h.queue.offer(toast('a')), true)
    assert.equal(h.queue.offer(toast('a')), false, 'duplicate while visible')
    h.queue.dismiss('a')
    assert.equal(h.queue.offer(toast('a')), false, 'closed, situation still pending')
    h.queue.offer(toast('b')); h.clock.advance(5000)
    assert.equal(h.queue.offer(toast('b')), false, 'timed out, situation still pending')
  })
  check('a resolved situation is forgotten: a new occurrence is announced again', () => {
    const h = mkQueue(); h.queue.offer(toast('a')); h.queue.dismiss('a')
    h.queue.retainOnly(new Set())
    assert.equal(h.queue.offer(toast('a')), true)
    h.queue.retainOnly(new Set()); assert.deepEqual(h.ids, [], 'resolution also removes the visible toast')
  })
  check('at most maxVisible at once; the rest wait, most urgent first, never overlapping', () => {
    const h = mkQueue(2)
    h.queue.offer(toast('w1', 'warning')); h.queue.offer(toast('w2', 'warning')); h.queue.offer(toast('i1', 'info')); h.queue.offer(toast('w3', 'warning'))
    assert.deepEqual(h.ids, ['w1', 'w2']); assert.equal(h.waiting, 2)
    h.queue.dismiss('w1'); assert.deepEqual(h.ids, ['w2', 'w3'], 'warning waits ahead of info'); assert.equal(h.waiting, 1)
    h.clock.advance(4001); assert.deepEqual(h.ids, ['i1'])
  })
  check('a critical alert replaces the oldest routine toast instead of waiting behind it', () => {
    const h = mkQueue(2)
    h.queue.offer(toast('w1', 'warning')); h.queue.offer(toast('w2', 'warning'))
    h.queue.offer(toast('c1', 'critical'))
    assert.deepEqual(h.ids, ['w2', 'c1'])
    h.queue.offer(toast('c2', 'critical')); assert.deepEqual(h.ids, ['c1', 'c2'])
    h.queue.offer(toast('c3', 'critical')); assert.deepEqual(h.ids, ['c1', 'c2'], 'criticals never evict each other'); assert.equal(h.waiting, 1)
  })
  check('the phone limit can change at run time and shows what now fits', () => {
    let max = 1
    const clock = fakeTimers(); let ids = []
    const queue = q.createToastQueue({ maxVisible: () => max, timers: clock.timers, onChange: s => { ids = s.visible.map(t => t.id) } })
    queue.offer(toast('a')); queue.offer(toast('b')); assert.deepEqual(ids, ['a'])
    max = 3; queue.refill(); assert.deepEqual(ids, ['a', 'b'])
  })
  check('only alerts that appeared since the previous snapshot are new; the first snapshot just seeds', () => {
    assert.deepEqual(q.selectNewAlertIds(null, ['a', 'b']), [])
    assert.deepEqual(q.selectNewAlertIds(new Set(['a']), ['a', 'b', 'c']), ['b', 'c'])
    assert.deepEqual(q.selectNewAlertIds(new Set(['a', 'b']), ['a']), [])
  })

  // ---- overlay crowding -----------------------------------------------------------------------------------------------
  const collision = await server.ssrLoadModule('/src/components/restaurant-3d/overlay-collision.ts')
  const point = (id, x, y, rank = 5, kind = 'label') => ({ id, kind, rank, position: { x, y }, size: { width: 40, height: 24 } })
  check('overlays that can be separated are moved and not flagged', () => {
    const { positions, crowded } = collision.resolveOverlayLayout([point('a', 100, 100), point('b', 104, 100)], 5, 96, { width: 400, height: 300 })
    assert.equal(crowded.size, 0)
    assert.notDeepEqual(positions.get('a'), positions.get('b'))
  })
  check('with no room left the lower-ranked overlay is flagged to go compact and the selected one wins', () => {
    // Canvas just big enough for one pill: the second cannot be placed anywhere.
    const tiny = { width: 56, height: 40 }
    const { positions, crowded } = collision.resolveOverlayLayout([point('other', 28, 20, 5), point('selected', 28, 20, 0)], 5, 96, tiny)
    assert.deepEqual([...crowded], ['other'])
    assert.deepEqual(positions.get('selected'), { x: 28, y: 20 })
  })
  check('the legacy resolver keeps its signature', () => {
    assert.ok(collision.resolveOverlayCollisions([point('a', 10, 10)]).get('a'))
  })

  // ---- spacing --------------------------------------------------------------------------------------------------------
  const fp = await server.ssrLoadModule('/src/components/restaurant-3d/table-footprint.ts')
  const table = (id, x, z) => ({ id, number: 1, shape: 'square', seats: 4, rotation: 0, position: { x, z } })
  check('new placements need the comfortable spacing; a layout saved under the old rule is flagged, never moved', () => {
    assert.ok(fp.COMFORT_MARGIN > fp.CIRCULATION_MARGIN)
    // Find a distance that clears the old hard minimum but not the comfortable spacing.
    let tight = null
    for (let d = 1; d < 8 && !tight; d += 0.05) {
      const a = table('a', 0, 0), b = table('b', d, 0)
      if (fp.findCollisions(a, [b], fp.CIRCULATION_MARGIN).length === 0 && fp.findCollisions(a, [b]).length > 0) tight = d
    }
    assert.ok(tight, 'there is a band between the two rules')
    const saved = [table('a', 0, 0), table('b', tight, 0)]
    assert.equal(fp.findTightPairs(saved).length, 1)
    assert.deepEqual(saved.map(t => t.position.x), [0, tight], 'reporting does not touch positions')
    assert.equal(fp.findTightPairs([table('a', 0, 0), table('b', 12, 0)]).length, 0)
  })

  // ---- walking speed --------------------------------------------------------------------------------------------------
  check('walking is about 30% faster, applied to path speed and step playback together', () => {
    const src = readFileSync('src/components/restaurant-3d/characters/customer-animation-controller.ts', 'utf8')
    const mod = src.match(/export const WALK_SPEED_MULTIPLIER = ([\d.]+)/)
    assert.equal(Number(mod?.[1]), 1.3)
    assert.match(src, /return this\.naturalWalkSpeed \* WALK_SPEED_MULTIPLIER/)
    assert.match(src, /setEffectiveTimeScale\(scale \* WALK_SPEED_MULTIPLIER\)/)
    for (const file of ['customer-actor.ts', 'guest-actor.ts']) {
      const actor = readFileSync(`src/components/restaurant-3d/characters/${file}`, 'utf8')
      assert.match(actor, /this\.distance \+= c\.walkSpeed \* factor \* dt/, `${file} advances along the path with the controller's speed`)
    }
  })

  // ---- table modal + notifications wiring ------------------------------------------------------------------------------
  const drawer = readFileSync('src/components/dashboard/table/TableDetailsDrawer.vue', 'utf8')
  check('the table modal lists the summary, then the orders, then the actions, then access', () => {
    const order = ['data-table-summary', 'data-section="orders"', 'data-section="actions"', 'TableAccessPanel :key']
    const at = order.map(n => drawer.indexOf(n)); assert.ok(at.every(i => i >= 0), String(at))
    assert.ok(at.every((i, k) => k === 0 || i > at[k - 1]), 'order: ' + at.join(','))
    assert.ok(drawer.indexOf('<TableRequestsPanel') < drawer.indexOf('data-section="orders"'), 'requests stay above the orders')
    assert.match(drawer, /v-if="canCreateOrders[\s\S]{0,320}newOrder/, 'New order sits in the orders section')
    assert.ok(drawer.indexOf("t('tableDrawer.actions.newOrder')") < drawer.indexOf('data-section="actions"'))
    for (const needle of ['canTransferTables', 'canViewReceipt', 'canAssignWaiters', 'canUpdateGuestCount', 'requestClose', 'AConfirmDialog']) assert.ok(drawer.includes(needle), needle)
    assert.match(drawer, /:disabled="transferBlocked"[\s\S]{0,120}aria-describedby/, 'a blocked action explains itself next to the control')
    assert.match(drawer, /closeDisabled \? 'table-close-hint'/)
    assert.doesNotMatch(drawer, /grid-cols-1 min-\[25rem\]:grid-cols-2'\">\s*<AButton v-if="canViewOrders/, 'the old wall of buttons before the orders is gone')
  })
  check('notifications: window-level host above modals, exempt from the modal inertness, assertive vs polite, never steals focus', () => {
    const host = readFileSync('src/components/dashboard/operation/OperationalToastHost.vue', 'utf8')
    for (const needle of ['Teleport to="body"', 'INERT_EXEMPT_ATTRIBUTE', "'assertive'", "'polite'", 'env(safe-area-inset-top)', 'calc(var(--z-snackbar) + 5)', "emit('pause', 'hover')", "emit('pause', 'focus')"]) assert.ok(host.includes(needle), needle)
    assert.doesNotMatch(host, /\.focus\(/, 'it never calls focus()')
    const focus = readFileSync('src/components/ui/overlay-focus.ts', 'utf8')
    assert.ok(focus.includes('child.hasAttribute(INERT_EXEMPT_ATTRIBUTE)') && focus.includes('event.target.closest('))
    const composable = readFileSync('src/composables/useOperationalToasts.ts', 'utf8')
    assert.ok(composable.includes('MAX_VISIBLE_PHONE = 2') && composable.includes('MAX_VISIBLE_DESKTOP = 3'))
  })

  console.log(`frontend-dashboard-overview: ${checks} checks passed`)
} finally {
  await server.close()
}
