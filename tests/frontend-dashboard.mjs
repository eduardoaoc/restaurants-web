import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const { createApp } = await import('./support/primitives-runtime.mjs')
const { h, nextTick } = await import('vue')
const { createI18n } = await import('vue-i18n')
const { createMemoryHistory, createRouter } = await import('vue-router')
const AStatStrip = (await import('../src/components/dashboard/AStatStrip.vue')).default
const DashboardNow = (await import('../src/components/dashboard/operation/DashboardNow.vue')).default
const DashboardTableOverview = (await import('../src/components/dashboard/operation/DashboardTableOverview.vue')).default
const DashboardTabs = (await import('../src/components/dashboard/DashboardTabs.vue')).default

const messages = {
  operations: {
    tabs: { label: 'Dashboard view' },
    now: { title: 'Now', clear: 'Everything is in order.', count: 'No situations | 1 situation | {count} situations', genericAttention: 'Operational attention', viewService: 'View service' },
    health: { level: { healthy: 'Good', attention: 'Needs attention', critical: 'Critical' }, scoreContext: 'Operational score: {score}/100', bottleneckPrefix: 'Main cause' },
    alerts: { types: { order_ready: 'Ready order' } },
    tableStatus: { occupied: 'Occupied', free: 'Free' },
    floorMap: { title: 'Room', tableLabel: '{name} — {status}', empty: 'No tables' },
  },
  tableDrawer: { guests: 'Guests' },
}
const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: messages } })
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/service', name: 'app-service', component: { render: () => h('div', 'Service') } }],
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
assert.equal(tabs.host.querySelector('[aria-pressed="true"]')?.textContent.trim(), 'Operations')
assert.equal(tabs.host.querySelectorAll('button').length, 2)
assert.ok([...tabs.host.querySelectorAll('button')].every(button => button.className.includes('min-h-11')), 'view switch targets remain at least 44px high for touch')
tabs.unmount()

const health = { health_score: 42, health_level: 'attention', bottleneck: { type: 'order_ready', severity: 'warning', affected_count: 2, oldest_age_seconds: 90 } }
const alerts = [
  { id: 'a1', type: 'order_ready', severity: 'warning', table_id: 1, table_session_id: 1, user_id: null, age_seconds: 90 },
  { id: 'a2', type: 'bill_request_pending', severity: 'critical', table_id: 2, table_session_id: 2, user_id: null, age_seconds: 30 },
]
const now = mount(DashboardNow, { health, alerts, canViewService: true })
await nextTick()
assert.match(now.host.textContent, /2 situations/)
assert.match(now.host.textContent, /Ready order \(2\)/)
assert.match(now.host.textContent, /42\/100/, 'the backend health score remains visible with its context label')
assert.equal(now.host.querySelector('a')?.getAttribute('href'), '/service')
now.unmount()

const table = {
  id: 8, name: 'Terrace 8', number: 8, capacity: 4, zone_id: 2,
  layout: { x: 0.5, y: 0.5, rotation: 0, shape: 'square', width: 84, height: 64 },
  primary_status: 'occupied', flags: [],
  session: { id: 12, started_at: '2026-10-26T12:00:00Z', elapsed_seconds: 1200, guest_count: 3, assigned_waiter: null },
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

const [view, dashboard, pageHead, nowSource, statsSource, floorMap, marker, kitchen, staff, analytics, revenueChart, peakChart, localeEs, localeEn, localeCa] = await Promise.all([
  readFile('src/views/operation/OperationView.vue', 'utf8'),
  readFile('src/views/DashboardView.vue', 'utf8'),
  readFile('src/components/dashboard/DashboardPageHead.vue', 'utf8'),
  readFile('src/components/dashboard/operation/DashboardNow.vue', 'utf8'),
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

const order = [view.indexOf('<DashboardNow'), view.indexOf('<AStatStrip'), view.indexOf('dashboard-tables-title'), view.indexOf('dashboard-kitchen-title'), view.indexOf('dashboard-staff-title')]
assert.ok(order.every(index => index >= 0) && order.every((index, position) => position === 0 || index > order[position - 1]), 'now, stats, room, kitchen and staff follow the dashboard hierarchy')
assert.match(view, /props\.canViewReports/, 'financial summary is gated by the existing report permission')
assert.match(view, /canAny\(\['update_kitchen_status', 'serve_orders'\]\)/, 'kitchen summary follows the existing route gate')
assert.match(view, /can\('manage_users'\)/, 'team summary follows the existing staff route gate')
assert.match(view, /canAny\(SERVICE_ACCESS_PERMISSIONS\)/, 'service link uses the shared existing permission set')
assert.match(view, /dashboard-tables-title[\s\S]*<\/section>[\s\S]*lg:grid-cols-2[\s\S]*dashboard-kitchen-title[\s\S]*dashboard-staff-title/, 'the room takes the full content width; kitchen and team share one row below it')
assert.match(view, /lg:hidden[\s\S]*DashboardTableOverview/, 'compact widths use a touchable table grid')
assert.match(view, /hidden lg:block[\s\S]*RestaurantFloorMap/, 'the complete map remains available on larger screens')
assert.match(await readFile('src/components/dashboard/operation/DashboardTableOverview.vue', 'utf8'), /grid-cols-2[\s\S]*sm:grid-cols-3/, 'the room overview keeps two legible columns on phones and adds a third from the sm breakpoint')
assert.doesNotMatch(view, /AttentionPanel|QuickMetrics|MetricCard/, 'the dashboard no longer duplicates the service alert queue or uses independent KPI cards')
assert.match(dashboard, /:can-view-reports="canViewReports"/, 'the reports permission reaches the operational summary')
assert.match(pageHead, /<APageHeader[\s\S]*operations\.pageTitle/, 'Dashboard renders a semantic page header')
assert.match(nowSource, /health\.bottleneck[\s\S]*operationsAlertTypeLabelKey/, 'Now summary uses the existing backend bottleneck mapping')
assert.doesNotMatch(nowSource, /role|permission slug/i, 'Now presentation does not infer roles')
assert.match(statsSource, /tabular-nums/, 'stat values use tabular numerals')
assert.doesNotMatch(floorMap, /radial-gradient|linear-gradient|shadow:/, 'room map no longer adds decorative gradient or inset shadow')
assert.match(marker, /Math\.max\(props\.table\.layout\.width \?\? 84, 64\)/, 'map targets have a minimum width for table labels')
assert.match(marker, /text-label-md tabular-nums/, 'map metadata meets the 12px text floor')
assert.match(kitchen, /counts_by_status[\s\S]*active_orders/, 'kitchen summary consumes live snapshot fields')
assert.match(staff, /staff\.slice\(0, 4\)/, 'dashboard team summary remains deliberately small')
assert.match(analytics, /v-if="loading && !data"/, 'analytics refresh retains the prior result')
assert.match(dashboard, /else-if="!canViewReports"[\s\S]*analytics\.errors\.forbidden/, 'analytics remains permission gated at the dashboard boundary')
assert.match(revenueChart, /dataDetails[\s\S]*v-for="point in points"/, 'revenue chart provides a text data alternative')
assert.match(peakChart, /dataDetails[\s\S]*v-for="bucket in hours"/, 'peak-hours chart provides a text data alternative')

for (const [locale, source] of [['es', localeEs], ['en', localeEn], ['ca', localeCa]]) {
  assert.match(source, /activeGuests:/, `${locale} includes the active guest metric label`)
  assert.match(source, /receivedToday:/, `${locale} includes the gated money metric label`)
  assert.match(source, /genericAttention:/, `${locale} includes a safe fallback for a future backend alert type`)
  assert.match(source, /scoreContext:/, `${locale} labels the existing backend health score`)
  assert.match(source, /dataDetails:/, `${locale} includes chart data alternatives`)
}

console.log('PASS: Dashboard hierarchy, real data/perms, table viewports, financial privacy, charts, and three locales')
