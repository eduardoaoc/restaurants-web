import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const { createApp } = await import('./support/primitives-runtime.mjs')
const { h, nextTick } = await import('vue')
const { createI18n } = await import('vue-i18n')
const { createMemoryHistory, createRouter } = await import('vue-router')
const AStatStrip = (await import('../src/components/dashboard/AStatStrip.vue')).default
const AttentionQueue = (await import('../src/components/dashboard/operation/AttentionQueue.vue')).default
const { classifyOperationAge } = await import('../src/utils/operation-timing.ts')
const DashboardTableOverview = (await import('../src/components/dashboard/operation/DashboardTableOverview.vue')).default
const DashboardTabs = (await import('../src/components/dashboard/DashboardTabs.vue')).default

const messages = {
  operations: {
    tabs: { label: 'Dashboard view' },
    now: { genericAttention: 'Operational attention' },
    alerts: { age: '{age} ago', severity: { critical: 'Critical', warning: 'Attention', info: 'Info' }, types: { order_ready: 'Ready order', bill_request_pending: 'Bill requested' } },
    board: {
      queue: {
        title: 'Needs attention', filter: 'Filter', current: 'Now', previous: 'Previous', empty: 'Nothing pending', emptyPrevious: 'None previous',
        previousHint: 'Earlier days', count: 'No situations | 1 situation | {count} situations', noTable: 'No table', unassigned: 'No waiter',
        guests: 'No guests | 1 guest | {count} guests', ordersWaiting: '1 to approve | {count} to approve', ordersReady: '1 ready | {count} ready',
        showAll: 'Show all ({count})', showLess: 'Show less',
        actions: { review: 'Review order', serve: 'View ready order', attend: 'Attend', bill: 'View bill', assign: 'Assign', view: 'View table', service: 'Go to service' },
      },
      timing: { since: 'Since {date}', previousSession: 'Previous session', invalid: 'Time unavailable' },
    },
    tableStatus: { occupied: 'Occupied', free: 'Free' },
    floorMap: { title: 'Room', tableLabel: '{name} — {status}', empty: 'No tables' },
  },
  tableDrawer: { guests: 'Guests' },
}
const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: messages } })
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/service', name: 'app-service', component: { render: () => h('div', 'Service') } },
    { path: '/dashboard', name: 'app-dashboard', component: { render: () => h('div', 'Operation') } },
    { path: '/dashboard/analytics', name: 'app-dashboard-analytics', component: { render: () => h('div', 'Analytics') } },
  ],
})
await router.push('/service')
await router.isReady()

function mount(component, props = {}) {
  const app = createApp({ render: () => h(component, props) })
  app.use(i18n).use(router)
  const host = document.createElement('div')
  document.body.appendChild(host)
  app.mount(host)
  return { app, host, unmount: () => { app.unmount(); host.remove() } }
}

const stats = mount(AStatStrip, { items: [
  { id: 'tables', label: 'Occupied tables', value: '6 / 12', context: '50% occupied' },
  { id: 'orders', label: 'Active orders', value: '4' },
  { id: 'guests', label: 'Guests now', value: '18' },
  { id: 'cash', label: 'Received today', value: '€120.00' },
] })
await nextTick()
assert.deepEqual([...stats.host.querySelectorAll('dt')].map(node => node.textContent), ['Occupied tables', 'Active orders', 'Guests now', 'Received today'])
assert.equal(stats.host.querySelectorAll('dd')[0].textContent, '6 / 12')
assert.match(stats.host.querySelector('dl').className, /grid-cols-2/)
assert.match(stats.host.querySelector('dl').className, /md:grid-cols-4/)
stats.unmount()

const tabs = mount(DashboardTabs, { modelValue: 'operation', operationLabel: 'Operations', analysisLabel: 'Analytics' })
await nextTick()
assert.equal(tabs.host.querySelector('[aria-current="page"]')?.textContent.trim(), 'Operations')
assert.deepEqual([...tabs.host.querySelectorAll('a')].map(link => link.getAttribute('href')), ['/dashboard', '/dashboard/analytics'], 'Operation and Analytics are separate pages')
assert.ok([...tabs.host.querySelectorAll('a')].every(link => link.className.includes('min-h-11')), 'view switch targets remain at least 44px high for touch')
tabs.unmount()

// Timing: ages are classified against the operational day, never capped or hidden.
const generatedAt = '2026-10-27T20:00:00Z'
const openDay = { id: 'd1', status: 'open', business_date: '2026-10-27', timezone: 'Europe/Madrid', opened_at: '2026-10-27T10:00:00Z', opened_by: { name: 'M' }, closed_at: null, closed_by: null }
assert.deepEqual(classifyOperationAge(600, generatedAt, openDay), { kind: 'current', seconds: 600 })
assert.equal(classifyOperationAge(571573, generatedAt, openDay).kind, 'previous', 'a session from an earlier day is a previous session, not a 158h wait')
assert.equal(classifyOperationAge(60, generatedAt, { status: 'not_open' }).kind, 'previous', 'with no open day every live item is a leftover')
assert.equal(classifyOperationAge(-5, generatedAt, openDay).kind, 'invalid')
assert.equal(classifyOperationAge(null, generatedAt, openDay).kind, 'invalid')

const queueTables = [
  { id: 1, name: 'T1', number: 1, capacity: 4, zone_id: 1, layout: {}, primary_status: 'ready', flags: [], session: { id: 1, started_at: '', elapsed_seconds: 900, guest_count: 2, guest_count_version: 1, assigned_waiter: { id: 9, name: 'Ana', sub_id: null } }, orders: { open_count: 2, waiting_approval: 0, preparing: 0, ready: 2 }, billing: null },
  { id: 2, name: 'T2', number: 2, capacity: 4, zone_id: 1, layout: {}, primary_status: 'bill_requested', flags: [], session: { id: 2, started_at: '', elapsed_seconds: 900, guest_count: 3, guest_count_version: 1, assigned_waiter: null }, orders: { open_count: 0, waiting_approval: 0, preparing: 0, ready: 0 }, billing: null },
]
const alerts = [
  { id: 'a1', type: 'order_ready', severity: 'warning', table_id: 1, table_session_id: 1, user_id: null, age_seconds: 90 },
  { id: 'a2', type: 'bill_request_pending', severity: 'critical', table_id: 2, table_session_id: 2, user_id: null, age_seconds: 30 },
  { id: 'a3', type: 'order_ready', severity: 'warning', table_id: 1, table_session_id: 1, user_id: null, age_seconds: 571573 },
]
let selectedAlert = null
const queue = mount(AttentionQueue, { alerts, tables: queueTables, staff: [], generatedAt, dailyOperation: openDay, timezone: 'Europe/Madrid', selectedAlertId: null, canViewService: true, onSelect: value => { selectedAlert = value } })
await nextTick()
const queueItems = [...queue.host.querySelectorAll('li')]
assert.equal(queueItems.length, 2, 'previous-session alerts are kept out of the current tab')
assert.match(queueItems[0].textContent, /Bill requested[\s\S]*T2/, 'backend severity orders the queue (critical first)')
assert.match(queueItems[1].textContent, /Ready order[\s\S]*T1[\s\S]*2 ready[\s\S]*2 guests[\s\S]*Ana/, 'each item shows type, table, short summary and waiter')
queueItems[1].querySelector('button').click()
assert.equal(selectedAlert.id, 'a1', 'the contextual action selects the alert (and its table)')
const previousTab = [...queue.host.querySelectorAll('button')].find(button => /Previous/.test(button.textContent))
assert.match(previousTab.textContent, /1/)
previousTab.click()
await nextTick()
assert.match(queue.host.textContent, /Since \d{2}\/\d{2}/, 'a previous-session alert shows when it started, not an hours-long age')
queue.unmount()

const table = {
  id: 8, name: 'Terrace 8', number: 8, capacity: 4, zone_id: 2,
  layout: { x: 0.5, y: 0.5, rotation: 0, shape: 'square', width: 84, height: 64 },
  primary_status: 'occupied', flags: [],
  session: { id: 12, started_at: '2026-10-26T12:00:00Z', elapsed_seconds: 1200, guest_count: 3, guest_count_version: 1, assigned_waiter: null },
  orders: { open_count: 1, waiting_approval: 0, preparing: 1, ready: 0 }, billing: null,
}
let selectedTable = null
const overview = mount(DashboardTableOverview, { tables: [table], selectedTableId: null, onSelect: value => { selectedTable = value } })
await nextTick()
assert.match(overview.host.textContent, /Terrace 8/)
assert.match(overview.host.textContent, /Occupied/)
assert.match(overview.host.textContent, /Guests: 3/)
overview.host.querySelector('button').click()
assert.equal(selectedTable.id, table.id, 'the compact room overview selects the same source table')
assert.match(overview.host.querySelector('button').getAttribute('aria-label'), /Terrace 8 — Occupied/)
overview.unmount()

const [view, dashboard, pageHead, statsSource, floorMap, marker, kitchen, staff, analytics, revenueChart, peakChart, localeEs, localeEn, localeCa] = await Promise.all([
  readFile('src/views/operation/OperationView.vue', 'utf8'),
  readFile('src/views/DashboardView.vue', 'utf8'),
  readFile('src/components/dashboard/DashboardPageHead.vue', 'utf8'),
  readFile('src/components/dashboard/AStatStrip.vue', 'utf8'),
  readFile('src/components/dashboard/operation/RestaurantFloorMap.vue', 'utf8'),
  readFile('src/components/dashboard/operation/FloorTableMarker.vue', 'utf8'),
  readFile('src/components/dashboard/operation/KitchenLivePanel.vue', 'utf8'),
  readFile('src/components/dashboard/operation/StaffLivePanel.vue', 'utf8'),
  readFile('src/views/analytics/AnalyticsView.vue', 'utf8'),
  readFile('src/components/dashboard/analytics/RevenueChart.vue', 'utf8'),
  readFile('src/components/dashboard/analytics/PeakHoursChart.vue', 'utf8'),
  readFile('src/i18n/locales/es-ES.ts', 'utf8'),
  readFile('src/i18n/locales/en-GB.ts', 'utf8'),
  readFile('src/i18n/locales/ca-ES-valencia.ts', 'utf8'),
])

const order = [view.indexOf('<AStatStrip'), view.indexOf('<AttentionQueue'), view.indexOf('dashboard-tables-title'), view.indexOf('dashboard-kitchen-title'), view.indexOf('dashboard-staff-title'), view.indexOf('dashboard-activity-title')]
assert.ok(order.every(index => index >= 0) && order.every((index, position) => position === 0 || index > order[position - 1]), 'stats, queue, room, kitchen, staff and activity follow the board order')
assert.doesNotMatch(view, /received_today|formatMoney/, 'revenue stays in Analytics, not on the Operation board')
assert.match(view, /minmax\(15rem, 23fr\) minmax\(0, 54fr\) minmax\(15rem, 23fr\)/, 'wide boards use the 23/54/23 reference composition')
assert.match(view, /can\('view_activity'\)/, 'recent activity follows the existing activity permission')
assert.match(view, /canAny\(\['update_kitchen_status', 'serve_orders'\]\)/, 'kitchen summary follows the existing route gate')
assert.match(view, /can\('manage_users'\)/, 'team summary follows the existing staff route gate')
assert.match(view, /canAny\(SERVICE_ACCESS_PERMISSIONS\)/, 'service link uses the shared existing permission set')
assert.match(view, /RestaurantFloorMap\s+v-if="showFloorMap"[\s\S]*DashboardTableOverview v-else/, 'narrow boards use a touchable table grid; wider boards keep the real map')
assert.doesNotMatch(view, /inline-mode/, 'table details open in the shared centred modal at every width')
assert.match(view, /<TableDetailsDrawer[\s\S]*dashboard-mode/, 'Dashboard uses the modal table detail')
assert.match(await readFile('src/components/dashboard/operation/DashboardTableOverview.vue', 'utf8'), /grid-cols-2[\s\S]*sm:grid-cols-3/, 'the room overview keeps two legible columns on phones and adds a third from the sm breakpoint')
assert.doesNotMatch(view, /QuickMetrics|MetricCard|health_score/, 'no independent KPI cards or arbitrary operational score on the board')
assert.match(dashboard, /route\.name === 'app-dashboard-analytics'/, 'the route decides between Operation and Analytics')
assert.match(pageHead, /operations\.board\.title[\s\S]*<APageHeader :title="title"/, 'Dashboard renders a semantic page header')
assert.match(statsSource, /tabular-nums/, 'stat values use tabular numerals')
assert.doesNotMatch(floorMap, /radial-gradient|linear-gradient|shadow:/, 'room map no longer adds decorative gradient or inset shadow')
assert.match(marker, /Math\.max\(props\.table\.layout\.width \?\? 84, 64\)/, 'map targets have a minimum width for table labels')
assert.match(marker, /text-label-md tabular-nums/, 'map metadata meets the 12px text floor')
assert.match(kitchen, /orders\.waiting_approval[\s\S]*orders\.preparing[\s\S]*orders\.ready/, 'kitchen summary consumes live snapshot fields')
assert.match(staff, /staff\.slice\(0, props\.limit\)/, 'dashboard team summary remains deliberately small')
assert.match(analytics, /v-if="loading && !data"/, 'analytics refresh retains the prior result')
assert.match(dashboard, /else-if="!canViewReports"[\s\S]*analytics\.errors\.forbidden/, 'analytics remains permission gated at the dashboard boundary')
assert.match(revenueChart, /dataDetails[\s\S]*v-for="point in points"/, 'revenue chart provides a text data alternative')
assert.match(peakChart, /dataDetails[\s\S]*v-for="bucket in hours"/, 'peak-hours chart provides a text data alternative')

for (const [locale, source] of [['es', localeEs], ['en', localeEn], ['ca', localeCa]]) {
  assert.match(source, /activeGuests:/, `${locale} includes the active guest metric label`)
  assert.match(source, /genericAttention:/, `${locale} includes a safe fallback for a future backend alert type`)
  assert.match(source, /previousSession:/, `${locale} labels previous-session leftovers`)
  assert.match(source, /dataDetails:/, `${locale} includes chart data alternatives`)
}

console.log('PASS: Operation board composition, attention queue, timing classification, routes/perms, charts, and three locales')
