import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const { createApp } = await import('./support/primitives-runtime.mjs')
const { h, nextTick } = await import('vue')
const { createI18n } = await import('vue-i18n')
const ServiceTableTile = (await import('../src/components/service/ServiceTableTile.vue')).default
const { serviceTableStatus } = await import('../src/utils/service-table-status.ts')

const statuses = {
  free: ['normal', 'operations.tableStatus.free'],
  occupied: ['normal', 'operations.tableStatus.occupied'],
  waiting_approval: ['attention', 'operations.tableStatus.waiting_approval'],
  preparing: ['normal', 'operations.tableStatus.preparing'],
  ready: ['attention', 'operations.tableStatus.ready'],
  waiter_requested: ['attention', 'operations.tableStatus.waiter_requested'],
  bill_requested: ['attention', 'operations.tableStatus.bill_requested'],
}
for (const [status, [state, labelKey]] of Object.entries(statuses)) {
  assert.equal(serviceTableStatus(status).state, state, `${status} maps to the documented visual state`)
  assert.equal(serviceTableStatus(status).labelKey, labelKey)
}

const messages = {
  operations: { tableStatus: { occupied: 'Occupied', free: 'Free' } },
  tableDrawer: { guests: 'Guests' },
}
const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: messages } })
const table = {
  id: 11, name: 'Terrace 12 with a long translated name', number: 12, capacity: 4, zone_id: 3,
  layout: { x: null, y: null, rotation: null, shape: null, width: null, height: null },
  primary_status: 'occupied', flags: [],
  session: { id: 2, started_at: '2026-10-26T11:00:00Z', elapsed_seconds: 1850, guest_count: 3,
    assigned_waiter: { id: 9, name: 'A very long waiter name' } },
  orders: { open_count: 0, waiting_approval: 0, preparing: 0, ready: 0 }, billing: null,
}
let selected = null
const app = createApp({ render: () => h(ServiceTableTile, { table, onSelect: id => { selected = id } }) })
app.use(i18n)
const host = document.createElement('div')
document.body.appendChild(host)
app.mount(host)
await nextTick()
assert.match(host.textContent, /Terrace 12 with a long translated name/)
assert.match(host.textContent, /Occupied/)
assert.match(host.textContent, /Guests: 3/)
assert.match(host.textContent, /A very long waiter name/)
host.querySelector('button').click()
assert.equal(selected, 11, 'whole tile opens the selected table')
assert.equal(host.querySelector('button').getAttribute('aria-label'), null, 'the accessible name includes the full tile content')
app.unmount(); host.remove()

const [view, drawer, transfer, realtime, operations, requests, localeEs, localeEn, localeCa] = await Promise.all([
  readFile('src/views/service/ServiceView.vue', 'utf8'),
  readFile('src/components/dashboard/table/TableDetailsDrawer.vue', 'utf8'),
  readFile('src/components/dashboard/table/TransferTableDialog.vue', 'utf8'),
  readFile('src/composables/useRestaurantRealtime.ts', 'utf8'),
  readFile('src/types/operations.ts', 'utf8'),
  readFile('src/types/table-requests.ts', 'utf8'),
  readFile('src/i18n/locales/es-ES.ts', 'utf8'),
  readFile('src/i18n/locales/en-GB.ts', 'utf8'),
  readFile('src/i18n/locales/ca-ES-valencia.ts', 'utf8'),
])
assert.match(view, /service\.now\.title/)
assert.match(view, /approvals\.canAct\(order\)/, 'approval uses its existing permission-aware domain method')
assert.match(view, /:service-mode="|service-mode/, 'the Service page opts into its sheet presentation')
assert.match(view, /grid-cols-2[^\n]*min-\[414px\]:grid-cols-3/, 'mobile starts at two columns and adds a third at 414px')
assert.match(view, /md:grid-cols-4[^\n]*xl:grid-cols-5/, 'tablet and desktop add density without horizontal page scrolling')
assert.match(view, /serviceZones\.length > 1/, 'zone filtering appears only when existing zones exist')
assert.match(view, /canFilterMine/, 'my-table filter is permission/data-context conditional')
assert.match(drawer, /modalMode[\s\S]*props\.serviceMode \|\| props\.dashboardMode/, 'Service and Dashboard opt into the shared sheet presentation')
assert.match(drawer, /variant="side"/)
assert.match(drawer, /servicePrimaryAction/)
assert.match(drawer, /record_payments|close_bill/)
assert.match(transfer, /<ADialog/)
assert.doesNotMatch(transfer, /z-\[|fixed inset-0/)
assert.match(realtime, /EVENTS_REQUIRING_OPERATIONS_REFRESH/)
assert.match(operations, /waiting_approval[\s\S]*preparing[\s\S]*ready/)
assert.match(requests, /'pending' \| 'acknowledged' \| 'completed' \| 'cancelled'/)
for (const [locale, source] of [['es', localeEs], ['en', localeEn], ['ca', localeCa]]) {
  assert.match(source, /tableAction:/, `${locale} has localized primary table action labels`)
  assert.match(source, /allZones:/, `${locale} has localized existing-zone filtering`)
  assert.match(source, /orderApproved:/, `${locale} has localized success feedback`)
}
console.log('PASS: Service status mapping, touch table tile, now-first page, permission-aware actions, sheet/transfer modal compatibility, realtime contract and locales')
