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

const [view, dashboard, pageHead, statsSource, floorMap, marker, kitchen, staff, panelCard, analytics, revenueChart, peakChart, localeEs, localeEn, localeCa] = await Promise.all([
  readFile('src/views/operation/OperationView.vue', 'utf8'),
  readFile('src/views/DashboardView.vue', 'utf8'),
  readFile('src/components/dashboard/DashboardPageHead.vue', 'utf8'),
  readFile('src/components/dashboard/AStatStrip.vue', 'utf8'),
  readFile('src/components/dashboard/operation/RestaurantFloorMap.vue', 'utf8'),
  readFile('src/components/dashboard/operation/FloorTableMarker.vue', 'utf8'),
  readFile('src/components/dashboard/operation/KitchenLivePanel.vue', 'utf8'),
  readFile('src/components/dashboard/operation/StaffLivePanel.vue', 'utf8'),
  readFile('src/components/dashboard/operation/DashboardPanelCard.vue', 'utf8'),
  readFile('src/views/analytics/AnalyticsView.vue', 'utf8'),
  readFile('src/components/dashboard/analytics/RevenueChart.vue', 'utf8'),
  readFile('src/components/dashboard/analytics/PeakHoursChart.vue', 'utf8'),
  readFile('src/i18n/locales/es-ES.ts', 'utf8'),
  readFile('src/i18n/locales/en-GB.ts', 'utf8'),
  readFile('src/i18n/locales/ca-ES-valencia.ts', 'utf8'),
])

assert.doesNotMatch(view, /received_today|formatMoney/, 'revenue stays in Analytics, not on the Operation board')
assert.match(view, /\.operation-board \{ position: relative; display: block; height: calc\(100dvh - var\(--bar-top, 0px\)\)/, 'wide boards keep a full-height desktop room backdrop')
assert.match(view, /\.operation-board-right \{ right: 1\.25rem; width: 20rem; \}/, 'desktop right panels share a fixed aligned column')
assert.match(view, /\.operation-board-left \{ left: 1\.25rem; \}/, 'the team panel docks in the lower left column')
assert.match(view, /\.operation-board-column \{ position: absolute; z-index: 3; top: 7\.25rem; bottom: 8\.5rem; display: flex; width: 19rem; flex-direction: column; justify-content: flex-end;/, 'desktop panel columns anchor to the bottom above the centered toolbar')
assert.match(view, /\.operation-board-right \.dashboard-panel-card \{ max-height: calc\(\(100% - 0\.75rem\) \/ 2\); \}/, 'expanded right cards fit the available column and keep a uniform gap')
assert.match(view, /\.dashboard-bottom-bar \{ position: absolute; z-index: 5; right: auto; bottom: 1rem; left: 50%; display: flex;/, 'legend and quick controls share a centered bottom toolbar')
assert.match(view, /\.operation-metrics \{ top: 1\.25rem; right: auto; left: 1\.25rem; width: 28rem; \}/, 'desktop indicators stay compact in the upper left')
assert.match(view, /\.floor-controls \{ top: 1\.25rem; left: 50%; right: auto;/, 'desktop camera controls share the upper row at center')
assert.match(view, /DEFAULT_PANEL_LAYOUT:[\s\S]*left: \['staff'\], right: \['kitchen', 'activity'\]/, 'default layout puts staff left and kitchen/activity right')
assert.match(view, /saloa:dashboard-panels:v1:user-\$\{userId\}:restaurant-\$\{props\.restaurantId\}/, 'panel preferences are scoped by user and restaurant')
assert.match(view, /window\.localStorage\.setItem/, 'panel preferences persist across reloads')
assert.match(view, /restorePanelLayout/, 'the default arrangement can be restored')
assert.match(view, /activityPanel\.open\(\)/, 'Show all opens the same activity center as the notification bell')
assert.match(view, /touch-action: pan-y/, 'vertical page scrolling remains available over the 3D canvas')
assert.match(view, /\.operation-metrics :deep\(\.a-stat-strip > div > dd:nth-of-type\(2\)\) \{ display: none; \}/, 'mobile indicators remain compact over the scene')
assert.match(view, /attentionOpen = !attentionOpen/, 'the attention queue stays reachable from a compact count control')
assert.match(view, /\.floor-stage \{ position: relative; height: clamp\(28rem, 58dvh, 36rem\)/, 'the phone scene stays prominent before the flowing cards')
assert.match(view, /\.operation-board-left, \.operation-board-right \{ display: contents; \}/, 'mobile removes desktop columns from the scrolling card flow')
assert.match(view, /\.dashboard-panel-card\[data-panel='kitchen'\] \{ order: 1; \}[\s\S]*\.dashboard-panel-card\[data-panel='staff'\] \{ order: 3; \}[\s\S]*\.dashboard-panel-card\[data-panel='activity'\] \{ order: 4; \}/, 'mobile orders kitchen, selected table, staff, activity')
assert.match(view, /class="operation-board-floor min-w-0"/, 'the dining room has no external card border or header')
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
assert.match(kitchen, /waiting_approval[\s\S]*preparing[\s\S]*ready/, 'kitchen summary consumes live snapshot fields')
assert.match(kitchen, /ORDERS, never dishes/, 'kitchen summary counts orders and never invents a dish quantity')
assert.match(staff, /staff\.slice\(0, props\.limit\)/, 'dashboard team summary remains deliberately small')
assert.match(panelCard, /draggable="true"/, 'each dashboard panel exposes a drag handle')
assert.match(panelCard, /emit\('collapse'\)/, 'each dashboard panel can collapse')
assert.match(panelCard, /emit\('close'\)/, 'each dashboard panel can close')
assert.match(panelCard, /emit\('move', 'up'\)[\s\S]*emit\('move', 'down'\)[\s\S]*emit\('move', 'left'\)[\s\S]*emit\('move', 'right'\)/, 'keyboard reachable menu supports panel reordering and columns')
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
