import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import postcss from 'postcss'

const { createApp } = await import('./support/primitives-runtime.mjs')
const { h, nextTick } = await import('vue')
const { createI18n } = await import('vue-i18n')
const AKitchenTicket = (await import('../src/components/kitchen/AKitchenTicket.vue')).default
const { KITCHEN_ACTIONS, KITCHEN_STATUSES } = await import('../src/types/kitchen.ts')
const { KITCHEN_STATUS_PRESENTATION } = await import('../src/utils/kitchen-status-presentation.ts')
const { createKitchenRealtimeArrivals } = await import('../src/utils/kitchen-realtime-arrivals.ts')

assert.deepEqual(KITCHEN_STATUSES, ['confirmed', 'accepted', 'preparing', 'ready'])
assert.deepEqual(KITCHEN_ACTIONS, { confirmed: 'accept', accepted: 'preparing', preparing: 'ready' })
assert.deepEqual(Object.keys(KITCHEN_STATUS_PRESENTATION), [...KITCHEN_STATUSES])
assert.equal(KITCHEN_STATUS_PRESENTATION.ready.badge, 'success')
const arrivals = createKitchenRealtimeArrivals()
assert.deepEqual(arrivals.observe([31], null), [], 'initial data does not animate as newly arrived')
arrivals.noteEvent({ name: 'order.created', event_id: 'created-1' })
assert.deepEqual(arrivals.observe([31, 32], 'event'), [32], 'created event highlights only the new server-fetched order')
assert.deepEqual(arrivals.observe([31, 32, 33], 'event'), [], 'a single created event is consumed once')
arrivals.noteEvent({ name: 'order.status_changed', event_id: 'changed-1' })
assert.deepEqual(arrivals.observe([31, 32, 33, 34], 'event'), [], 'status changes do not mark arrivals')
arrivals.reset()
assert.deepEqual(arrivals.observe([99], null), [], 'restaurant reset starts a fresh non-highlighted snapshot')

const messages = {
  kitchen: { details: 'Details', detailsFor: 'Details for order {number}', note: 'Note' },
}
const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: messages } })
const order = {
  id: 31, order_number: 'A-31', status: 'confirmed', origin: 'staff',
  restaurant: { id: 1, name: 'Restaurant' }, table: { id: 1, name: 'Table 8', number: 8 },
  order_note: 'Keep the sauce separate', created_at: '2026-10-26T11:00:00Z', elapsed_seconds: 125,
  items: [{ id: 7, name: 'Long item name that can wrap', quantity: 2, note: 'No onions', modifiers: [{ group_name: 'Side', name: 'Extra salad' }] }],
}
let advanced = 0, openedDetails = 0
const app = createApp({ render: () => h(AKitchenTicket, {
  order, elapsed: '2 min', statusLabel: 'New', actionLabel: 'Accept order', waitingLabel: 'Waiting',
  onAdvance: () => advanced++, onDetails: () => openedDetails++,
}) })
app.use(i18n)
const host = document.createElement('div')
document.body.appendChild(host)
app.mount(host)
await nextTick()
assert.match(host.textContent, /2 min/)
assert.match(host.textContent, /Table 8/)
assert.match(host.textContent, /A-31/)
assert.match(host.textContent, /2× Long item name that can wrap/)
assert.match(host.textContent, /Side: Extra salad/)
assert.match(host.textContent, /No onions/)
assert.match(host.textContent, /Keep the sauce separate/)
const buttons = host.querySelectorAll('button')
assert.equal(buttons.length, 2, 'one primary action and one discreet details control')
buttons[0].click(); buttons[1].click()
assert.equal(advanced, 1)
assert.equal(openedDetails, 1)
assert.equal(buttons[1].getAttribute('aria-label'), 'Details for order A-31')
app.unmount(); host.remove()

const view = await readFile('src/views/kitchen/KitchenView.vue', 'utf8')
const ticket = await readFile('src/components/kitchen/AKitchenTicket.vue', 'utf8')
const sheet = await readFile('src/components/ui/AOverlay.vue', 'utf8')
const ticketCss = postcss.parse(ticket.split('<style scoped>')[1].split('</style>')[0])
const declarations = []
ticketCss.walkDecls(decl => declarations.push([decl.parent.selector ?? '', decl.prop, decl.value]))
assert.match(view, /ref<KitchenStatus>\('confirmed'\)/, 'queue begins at the first real operational status')
assert.match(view, /grid-template-columns: repeat\(2, minmax\(280px, 1fr\)\)/)
assert.match(view, /grid-template-columns: repeat\(3, minmax\(280px, 1fr\)\)/)
assert.match(view, /grid-template-columns: repeat\(4, minmax\(280px, 1fr\)\)/)
assert.match(view, /@media \(max-width: 767px\)/, 'compact view selects one status at a time')
assert.match(view, /@media \(prefers-reduced-motion: reduce\)/)
assert.ok(declarations.some(([, prop, value]) => prop === 'min-height' && value === '56px'), 'primary KDS action target is 56px')
assert.ok(declarations.some(([, prop, value]) => prop === 'min-height' && value === '48px'), 'secondary details target is at least 48px')
assert.ok(ticket.includes('var(--text-timer)') && ticket.includes('tabular-nums'))
assert.ok(sheet.includes('env(safe-area-inset-bottom)'), 'ticket details retain shared sheet safe-area handling')
assert.match(view, /var\(--duration-base\)/, 'status moves use the SALOA 200ms motion token')
assert.match(view, /prefers-reduced-motion: reduce/, 'status motion respects reduced motion')
console.log('PASS: KDS status/action contract, ticket content/actions, responsive breakpoints, touch targets and motion structure')
